import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { openDatabase, ProjectService, toPublicError } from '@qiyin/domain';
import { createFrontkernelAdapter } from '@qiyin/frontkernel-adapter';
import { KernelService } from '@qiyin/kernel-service';
import { listSessions, readSession, saveSession, type StoredMessage } from './agent/agent-sessions.js';
import { detectAgents, startAgentRun, type AgentEvent, type AgentId, type AgentRunHandle } from './agent/agent-runner.js';

export interface KernelBinding {
  service: KernelService;
  /** 项目在磁盘上的根目录；内核以它为 workspace 边界。 */
  workspaceRoot: string;
}

export interface LocalApiOptions {
  /** 上传与项目上下文使用的工作区根；省略时回退到 kernel.workspaceRoot。 */
  workspaceRoot?: string;
  uploadMaxBytes?: number;
  /** 测试或宿主可注入 Agent 运行器；省略时使用本机已安装的 Codex/Claude/Hermes CLI。 */
  startAgent?: (options: { projectId: string; workspaceDir: string; prompt: string; onEvent: (event: AgentEvent) => void }) => AgentRunHandle;
}

interface ProjectBindingContext {
  id: string;
  project_id: string;
  binding_revision: number;
  updated_at: string;
}

export function buildServer(service: ProjectService, kernel?: KernelBinding, options: LocalApiOptions = {}) {
  const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
  void app.register(sensible);
  const workspaceRoot = options.workspaceRoot ?? kernel?.workspaceRoot;
  const uploadMaxBytes = Math.max(1, options.uploadMaxBytes ?? 512 * 1024 * 1024);
  const contexts = new Map<string, ProjectBindingContext>();
  const activeRuns = new Map<string, { sessionKey: string; handle: AgentRunHandle }>();
  const completedRuns = new Set<string>();
  const messageRuns = new Map<string, string>();
  app.addContentTypeParser(
    /^(?:application\/octet-stream|image\/[^;]+|video\/[^;]+|audio\/[^;]+)(?:;.*)?$/i,
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  app.get('/health', async () => ({ status: 'ok', service: 'qiyin-local-api', protocol: '@1' }));
  app.post('/api/v1/commands', async (request, reply) => {
    try {
      return service.execute(request.body);
    } catch (error) {
      const publicError = toPublicError(error);
      return reply.code(publicError.statusCode).send(publicError.body);
    }
  });
  app.get('/api/v1/projects', async () => service.listProjects());
  app.get<{ Params: { projectId: string } }>('/api/v1/projects/:projectId', async (request, reply) => {
    try { return service.getProject(request.params.projectId); }
    catch (error) { const result = toPublicError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get<{ Params: { projectId: string }; Querystring: { after?: string } }>('/api/v1/projects/:projectId/events', async (request, reply) => {
    try {
      const events = service.listEvents(request.params.projectId, Number(request.query.after ?? 0));
      if (request.headers.accept === 'text/event-stream') {
        reply.header('content-type', 'text/event-stream; charset=utf-8');
        return events.map((event) => `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
      }
      return events;
    } catch (error) { const result = toPublicError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get('/api/v1/providers', async () => service.listProviders());

  /** 每个客户端独立的项目绑定；不使用危险的进程级 currentProject。 */
  app.post<{ Body: { project_id?: string } }>('/api/v1/contexts', async (request, reply) => {
    const projectId = request.body?.project_id;
    if (!projectId) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id' } });
    try {
      service.getProject(projectId);
      const now = new Date().toISOString();
      const context: ProjectBindingContext = { id: randomUUID(), project_id: projectId, binding_revision: 1, updated_at: now };
      contexts.set(context.id, context);
      return reply.code(201).send(context);
    } catch (error) {
      const result = toPublicError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get<{ Params: { contextId: string } }>('/api/v1/contexts/:contextId', async (request, reply) => {
    const context = contexts.get(request.params.contextId);
    return context ?? reply.code(404).send({ error: { code: 'CONTEXT_NOT_FOUND', message: '项目上下文不存在' } });
  });

  app.put<{ Params: { contextId: string }; Body: { project_id?: string; expected_binding_revision?: number } }>(
    '/api/v1/contexts/:contextId/project',
    async (request, reply) => {
      const context = contexts.get(request.params.contextId);
      if (!context) return reply.code(404).send({ error: { code: 'CONTEXT_NOT_FOUND', message: '项目上下文不存在' } });
      const { project_id: projectId, expected_binding_revision: expectedRevision } = request.body ?? {};
      if (!projectId || !Number.isInteger(expectedRevision)) {
        return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id 与 expected_binding_revision' } });
      }
      if (expectedRevision !== context.binding_revision) {
        return reply.code(409).send({ error: { code: 'BINDING_REVISION_CONFLICT', message: '项目上下文已被其他请求切换，请刷新后重试' } });
      }
      try {
        service.getProject(projectId);
        const next: ProjectBindingContext = {
          ...context,
          project_id: projectId,
          binding_revision: context.binding_revision + 1,
          updated_at: new Date().toISOString(),
        };
        contexts.set(next.id, next);
        return next;
      } catch (error) {
        const result = toPublicError(error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );

  /** 会话列表和消息历史直接复用桌面端的项目内会话库。 */
  app.post<{ Body: { project_id?: string; title?: string } }>('/api/v1/agent/sessions', async (request, reply) => {
    if (!workspaceRoot) return reply.code(501).send({ error: { code: 'AGENT_UNAVAILABLE', message: '本实例未配置项目工作区' } });
    const projectId = request.body?.project_id;
    if (!projectId) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id' } });
    try {
      service.getProject(projectId);
      const workspaceDir = ensureWorkspace(workspaceRoot, projectId);
      const session = saveSession(workspaceDir, {
        id: randomUUID(), messages: [],
        ...(typeof request.body?.title === 'string' ? { title: request.body.title } : {}),
      });
      return reply.code(201).send({ ...session, project_id: projectId, session_revision: 0 });
    } catch (error) {
      const result = toPublicError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get<{ Querystring: { project_id?: string } }>('/api/v1/agent/sessions', async (request, reply) => {
    if (!workspaceRoot || !request.query.project_id) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id' } });
    try {
      service.getProject(request.query.project_id);
      return listSessions(ensureWorkspace(workspaceRoot, request.query.project_id));
    } catch (error) {
      const result = toPublicError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get<{ Params: { sessionId: string }; Querystring: { project_id?: string } }>(
    '/api/v1/agent/sessions/:sessionId',
    async (request, reply) => {
      if (!workspaceRoot || !request.query.project_id) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id' } });
      const session = readSession(ensureWorkspace(workspaceRoot, request.query.project_id), request.params.sessionId);
      return session === null
        ? reply.code(404).send({ error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' } })
        : { ...session, project_id: request.query.project_id, session_revision: session.trimmed + session.messages.length };
    },
  );

  app.post<{ Params: { sessionId: string }; Body: {
    project_id?: string; message_id?: string; text?: string; expected_session_revision?: number; agent_id?: AgentId;
  } }>(
    '/api/v1/agent/sessions/:sessionId/messages',
    async (request, reply) => {
      if (!workspaceRoot) return reply.code(501).send({ error: { code: 'AGENT_UNAVAILABLE', message: '本实例未配置项目工作区' } });
      const { project_id: projectId, message_id: messageId, text, expected_session_revision: expectedRevision } = request.body ?? {};
      if (!projectId || !messageId || !text?.trim() || !Number.isInteger(expectedRevision)) {
        return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id、message_id、text 与 expected_session_revision' } });
      }
      const workspaceDir = ensureWorkspace(workspaceRoot, projectId);
      const session = readSession(workspaceDir, request.params.sessionId);
      if (!session) return reply.code(404).send({ error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' } });
      const sessionRevision = session.trimmed + session.messages.length;
      const sessionKey = `${projectId}:${session.id}`;
      const idempotencyKey = `${sessionKey}:${messageId}`;
      if (session.messages.some((message) => message.id === messageId)) {
        return reply.code(202).send({ run_id: messageRuns.get(idempotencyKey) ?? null, session_revision: sessionRevision, duplicate: true });
      }
      if (expectedRevision !== sessionRevision) {
        return reply.code(409).send({ error: { code: 'SESSION_REVISION_CONFLICT', message: '会话已有新消息，请拉取增量后重试' } });
      }
      if ([...activeRuns.values()].some((active) => active.sessionKey === sessionKey)) {
        return reply.code(409).send({ error: { code: 'SESSION_BUSY', message: '该会话仍有一轮 Agent 在运行' } });
      }
      const requestedAgent = request.body.agent_id ?? 'codex';
      const descriptor = options.startAgent ? undefined : detectAgents().find((item) => item.id === requestedAgent);
      if (!options.startAgent && (!descriptor?.command || requestedAgent === 'builtin')) {
        return reply.code(503).send({ error: { code: 'AGENT_NOT_AVAILABLE', message: `${requestedAgent} Agent 当前不可用` } });
      }
      const userMessage: StoredMessage = { id: messageId.slice(0, 120), role: 'user', text: text.trim().slice(0, 8000) };
      saveSession(workspaceDir, { id: session.id, title: session.title, messages: [...session.messages, userMessage] });

      const appendEvent = (event: AgentEvent): void => {
        if (event.kind === 'reasoning') return; // 外部 API 不暴露原始推理
        const current = readSession(workspaceDir, session.id);
        if (!current) return;
        const role: StoredMessage['role'] = event.kind === 'message' ? 'agent'
          : event.kind === 'tool' ? 'tool'
            : event.kind === 'error' ? 'error' : 'note';
        const textOut = event.kind === 'tool'
          ? `工具${event.phase === 'done' ? '执行完成' : '开始执行'}${event.toolKind ? `：${event.toolKind}` : ''}`
          : event.text;
        saveSession(workspaceDir, {
          id: current.id,
          title: current.title,
          messages: [...current.messages, { id: `${event.runId}-${event.at}-${event.kind}-${event.itemId ?? ''}`.slice(0, 120), role, text: textOut.slice(0, 8000), ...(event.itemId ? { itemId: event.itemId } : {}) }],
        });
        if (event.kind === 'done') {
          completedRuns.add(event.runId);
          activeRuns.delete(event.runId);
        }
      };

      let handle: AgentRunHandle;
      if (options.startAgent) {
        handle = options.startAgent({ projectId, workspaceDir, prompt: text.trim(), onEvent: appendEvent });
      } else {
        handle = startAgentRun({ agentId: requestedAgent, command: descriptor!.command!, prompt: text.trim(), cwd: workspaceDir, onEvent: appendEvent });
      }
      if (!completedRuns.has(handle.runId)) activeRuns.set(handle.runId, { sessionKey, handle });
      messageRuns.set(idempotencyKey, handle.runId);
      return reply.code(202).send({ run_id: handle.runId, session_revision: sessionRevision + 1, duplicate: false });
    },
  );

  app.get<{ Params: { sessionId: string }; Querystring: { project_id?: string; after?: string; limit?: string } }>(
    '/api/v1/agent/sessions/:sessionId/events',
    async (request, reply) => {
      if (!workspaceRoot || !request.query.project_id) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id' } });
      const session = readSession(ensureWorkspace(workspaceRoot, request.query.project_id), request.params.sessionId);
      if (!session) return reply.code(404).send({ error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' } });
      const after = Math.max(0, Number(request.query.after) || 0);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
      const events = session.messages
        .map((message, index) => ({ cursor: session.trimmed + index + 1, ...message }))
        .filter((event) => event.cursor > after)
        .slice(0, limit);
      const nextCursor = events.at(-1)?.cursor ?? after;
      const sessionKey = `${request.query.project_id}:${session.id}`;
      return {
        events,
        next_cursor: nextCursor,
        done: ![...activeRuns.values()].some((active) => active.sessionKey === sessionKey),
        session_revision: session.trimmed + session.messages.length,
      };
    },
  );

  app.post<{ Params: { sessionId: string; runId: string }; Body: { project_id?: string } }>(
    '/api/v1/agent/sessions/:sessionId/runs/:runId/cancel',
    async (request, reply) => {
      const projectId = request.body?.project_id;
      const active = activeRuns.get(request.params.runId);
      if (!projectId || !active || active.sessionKey !== `${projectId}:${request.params.sessionId}`) {
        return reply.code(404).send({ error: { code: 'RUN_NOT_FOUND', message: '该会话下没有这个运行' } });
      }
      active.handle.cancel();
      activeRuns.delete(request.params.runId);
      return { canceled: true, run_id: request.params.runId };
    },
  );

  /**
   * 单文件上传：请求体就是媒体字节，文件名放 `x-file-name`。
   * 类型同时核对 Content-Type、扩展名和 magic bytes；失败不会留下半文件或 Artifact。
   */
  app.post<{ Params: { projectId: string }; Body: Buffer }>(
    '/api/v1/projects/:projectId/uploads',
    { bodyLimit: uploadMaxBytes },
    async (request, reply) => {
      if (!workspaceRoot) {
        return reply.code(501).send({ error: { code: 'UPLOAD_UNAVAILABLE', message: '本实例未配置项目工作区' } });
      }
      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({ error: { code: 'UPLOAD_EMPTY', message: '上传内容为空' } });
      }
      if (body.length > uploadMaxBytes) {
        return reply.code(413).send({ error: { code: 'UPLOAD_TOO_LARGE', message: `单文件不能超过 ${uploadMaxBytes} 字节` } });
      }
      const declaredType = String(request.headers['content-type'] ?? '').split(';')[0]!.toLowerCase();
      const rawName = String(request.headers['x-file-name'] ?? 'upload.bin');
      const fileName = basename(rawName).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180) || 'upload.bin';
      const detected = detectMediaType(body);
      if (!detected || !mediaTypeMatches(declaredType, detected) || !extensionMatches(fileName, detected)) {
        return reply.code(415).send({
          error: { code: 'UPLOAD_TYPE_MISMATCH', message: '文件扩展名、Content-Type 与实际媒体内容不一致' },
        });
      }
      try {
        service.getProject(request.params.projectId);
        const workspaceDir = ensureWorkspace(workspaceRoot, request.params.projectId);
        const uploadDir = resolve(workspaceDir, 'uploads');
        mkdirSync(uploadDir, { recursive: true });
        const hash = createHash('sha256').update(body).digest('hex');
        const extension = canonicalExtension(detected);
        const relativePath = `uploads/${hash.slice(0, 16)}${extension}`;
        const target = resolve(workspaceDir, relativePath);
        if (!existsSync(target)) {
          const partial = `${target}.${randomUUID()}.part`;
          writeFileSync(partial, body, { flag: 'wx' });
          try { renameSync(partial, target); } catch (error) { rmSync(partial, { force: true }); throw error; }
        }
        const artifactId = `sha256:${hash}`;
        service.execute({
          command_id: randomUUID(), actor: 'user:api', type: 'artifact.publish',
          payload: {
            artifact_id: artifactId,
            media_type: detected,
            bytes: body.length,
            metadata: { source: 'local-api-upload', project_id: request.params.projectId, artifact_path_relative: relativePath, file_name: fileName },
          },
        });
        return reply.code(201).send({ artifact_id: artifactId, media_type: detected, bytes: body.length, file_name: fileName, relative_path: relativePath });
      } catch (error) {
        const result = toPublicError(error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );

  /**
   * 触发一次 前置内核校验（前置 agent）。
   *
   * 领域意图与结果都会落库：即使内核不可用，这次请求也会留下 FAILED 记录，
   * 而不是让调用方拿到一个「什么都没发生」的空响应。
   */
  app.post<{ Body: { project_id?: string; expected_revision?: number; source_path?: string; purpose?: string; actor?: string } }>(
    '/api/v1/kernel/check',
    async (request, reply) => {
      if (!kernel) {
        return reply.code(501).send({ error: { code: 'KERNEL_UNAVAILABLE', message: '本实例未接入 前置内核服务' } });
      }
      const { project_id, expected_revision, source_path, purpose, actor } = request.body ?? {};
      const missing = requireFields(project_id, expected_revision, source_path);
      if (missing) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: missing } });
      try {
        const workspaceDir = ensureWorkspace(kernel.workspaceRoot, project_id!);
        const outcome = await kernel.service.checkSource({
          projectId: project_id!,
          expectedRevision: expected_revision!,
          sourcePath: source_path!,
          workspaceDir,
          ...(purpose === undefined ? {} : { purpose }),
          ...(actor === undefined ? {} : { actor }),
        });
        return outcome;
      } catch (error) {
        const result = toPublicError(error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );

  /** 规划一个 Run：解析目标与能力需求，不提交执行。 */
  app.post<{ Body: { project_id?: string; expected_revision?: number; source_path?: string; purpose?: string; package_root?: string } }>(
    '/api/v1/kernel/plan',
    async (request, reply) => {
      if (!kernel) {
        return reply.code(501).send({ error: { code: 'KERNEL_UNAVAILABLE', message: '本实例未接入 前置内核服务' } });
      }
      const { project_id, expected_revision, source_path, purpose, package_root } = request.body ?? {};
      const missing = requireFields(project_id, expected_revision, source_path);
      if (missing) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: missing } });
      try {
        const workspaceDir = ensureWorkspace(kernel.workspaceRoot, project_id!);
        return await kernel.service.planRun({
          projectId: project_id!, expectedRevision: expected_revision!, sourcePath: source_path!, workspaceDir,
          actor: 'user:api',
          ...(purpose === undefined ? {} : { purpose }),
          ...(package_root === undefined ? {} : { packageRoot: package_root }),
        });
      } catch (error) {
        const result = toPublicError(error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );

  /**
   * 提交一次构建。
   *
   * 默认提交后即返回，由后台 Worker 继续——调用方拿 build_id 之后用 status 查询，
   * 不必挂在一个可能几分钟的同步请求上。
   */
  app.post<{ Body: { project_id?: string; expected_revision?: number; source_path?: string; purpose?: string; package_root?: string; runtime_profile?: string; follow?: boolean } }>(
    '/api/v1/kernel/build',
    async (request, reply) => {
      if (!kernel) {
        return reply.code(501).send({ error: { code: 'KERNEL_UNAVAILABLE', message: '本实例未接入 前置内核服务' } });
      }
      const { project_id, expected_revision, source_path, purpose, package_root, runtime_profile, follow } = request.body ?? {};
      const missing = requireFields(project_id, expected_revision, source_path);
      if (missing) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: missing } });
      try {
        const workspaceDir = ensureWorkspace(kernel.workspaceRoot, project_id!);
        return await kernel.service.submitBuild({
          projectId: project_id!, expectedRevision: expected_revision!, sourcePath: source_path!, workspaceDir,
          actor: 'user:api',
          ...(purpose === undefined ? {} : { purpose }),
          ...(package_root === undefined ? {} : { packageRoot: package_root }),
          ...(runtime_profile === undefined ? {} : { runtimeProfile: runtime_profile }),
          ...(follow === undefined ? {} : { follow }),
        });
      } catch (error) {
        const result = toPublicError(error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );

  /**
   * 分析参考视频并生成拆解草稿。
   *
   * `media_path` 是项目 workspace 内的相对路径：与其它端点一致，
   * 调用方给不出磁盘位置，磁盘位置由服务端拼。
   */
  app.post<{ Body: { project_id?: string; expected_revision?: number; media_path?: string; purpose?: string; seed?: boolean } }>(
    '/api/v1/kernel/analyze',
    async (request, reply) => {
      if (!kernel) {
        return reply.code(501).send({ error: { code: 'KERNEL_UNAVAILABLE', message: '本实例未接入 前置内核服务' } });
      }
      const { project_id, expected_revision, media_path, purpose, seed } = request.body ?? {};
      if (!project_id || expected_revision === undefined || !media_path) {
        return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id、expected_revision 与 media_path' } });
      }
      try {
        const workspaceDir = ensureWorkspace(kernel.workspaceRoot, project_id);
        const base = {
          projectId: project_id, expectedRevision: expected_revision, mediaPath: media_path,
          workspaceDir, actor: 'user:api',
          ...(purpose === undefined ? {} : { purpose }),
        };
        // 默认连拆解草稿一起生成；`seed: false` 只做分析
        return seed === false
          ? await kernel.service.analyzeSource(base)
          : await kernel.service.analyzeAndSeed(base);
      } catch (error) {
        const result = toPublicError(error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );

  /** 逐词转录：直接使用 前置内核 官方 transcribe，Provider/费用由 Runtime Profile 决定。 */
  app.post<{ Body: { project_id?: string; expected_revision?: number; media_path?: string; language?: string; runtime_profile?: string; purpose?: string; execution_confirmed?: boolean } }>(
    '/api/v1/kernel/transcribe',
    async (request, reply) => {
      if (!kernel) {
        return reply.code(501).send({ error: { code: 'KERNEL_UNAVAILABLE', message: '本实例未接入 前置内核服务' } });
      }
      const { project_id, expected_revision, media_path, language, runtime_profile, purpose, execution_confirmed } = request.body ?? {};
      if (execution_confirmed !== true) {
        return reply.code(403).send({ error: { code: 'EXECUTION_CONFIRMATION_REQUIRED', message: '请先核对转录服务及费用，再显式提供 execution_confirmed: true' } });
      }
      if (!project_id || expected_revision === undefined || !media_path || !language) {
        return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id、expected_revision、media_path 与 language' } });
      }
      try {
        const workspaceDir = ensureWorkspace(kernel.workspaceRoot, project_id);
        return await kernel.service.transcribeSource({
          projectId: project_id,
          expectedRevision: expected_revision,
          mediaPath: media_path,
          language,
          executionConfirmed: execution_confirmed,
          workspaceDir,
          actor: 'user:api',
          ...(runtime_profile === undefined ? {} : { runtimeProfile: runtime_profile }),
          ...(purpose === undefined ? {} : { purpose }),
        });
      } catch (error) {
        const result = toPublicError(error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );

  /** 查询构建状态（只读，不写项目事实）。 */
  app.get<{ Params: { buildId: string }; Querystring: { project_id?: string; runtime_profile?: string } }>(
    '/api/v1/kernel/status/:buildId',
    async (request, reply) => {
      if (!kernel) {
        return reply.code(501).send({ error: { code: 'KERNEL_UNAVAILABLE', message: '本实例未接入 前置内核服务' } });
      }
      const projectId = request.query.project_id;
      if (!projectId) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id' } });
      try {
        const workspaceDir = ensureWorkspace(kernel.workspaceRoot, projectId);
        const status = await kernel.service.buildStatus(request.params.buildId, workspaceDir, request.query.runtime_profile);
        if (status === null) return reply.code(404).send({ error: { code: 'BUILD_NOT_FOUND', message: '该 build id 在此项目下不存在' } });
        return status;
      } catch (error) {
        const result = toPublicError(error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );

  /** 读取构建结果清单。 */
  app.get<{ Params: { buildId: string }; Querystring: { project_id?: string; output?: string } }>(
    '/api/v1/kernel/inspect/:buildId',
    async (request, reply) => {
      if (!kernel) {
        return reply.code(501).send({ error: { code: 'KERNEL_UNAVAILABLE', message: '本实例未接入 前置内核服务' } });
      }
      const projectId = request.query.project_id;
      if (!projectId) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id' } });
      try {
        const workspaceDir = ensureWorkspace(kernel.workspaceRoot, projectId);
        return await kernel.service.inspectBuild(request.params.buildId, workspaceDir, request.query.output);
      } catch (error) {
        const result = toPublicError(error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );

  /**
   * 取件。
   *
   * 目标路径被限制在项目 workspace 之内：本地面板写的是本机文件，
   * 不能让一个 HTTP 请求把任意输出落到磁盘任意位置。
   */
  app.post<{ Body: { project_id?: string; build_id?: string; output?: string; to?: string } }>(
    '/api/v1/kernel/get',
    async (request, reply) => {
      if (!kernel) {
        return reply.code(501).send({ error: { code: 'KERNEL_UNAVAILABLE', message: '本实例未接入 前置内核服务' } });
      }
      const { project_id, build_id, output, to } = request.body ?? {};
      if (!project_id || !build_id || !output || !to) {
        return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: '需要 project_id、build_id、output 与 to' } });
      }
      try {
        const workspaceDir = ensureWorkspace(kernel.workspaceRoot, project_id);
        const target = resolve(to);
        if (!isPathInside(workspaceDir, target)) {
          return reply.code(422).send({ error: { code: 'PATH_OUTSIDE_WORKSPACE', message: '导出目标必须位于该项目的 workspace 之内' } });
        }
        return await kernel.service.exportOutput(build_id, output, target, workspaceDir);
      } catch (error) {
        const result = toPublicError(error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );
  return app;
}

type DetectedMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  | 'video/mp4' | 'video/webm' | 'audio/wav' | 'audio/mpeg' | 'audio/ogg';

function startsWithBytes(body: Buffer, bytes: readonly number[], offset = 0): boolean {
  return bytes.every((value, index) => body[offset + index] === value);
}

/** 只信文件头，不信扩展名。这里覆盖桌面端允许上传的主流图片/视频/音频格式。 */
function detectMediaType(body: Buffer): DetectedMediaType | null {
  if (startsWithBytes(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWithBytes(body, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (body.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  if (body.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (body.subarray(0, 3).toString('ascii') === 'ID3' || (body[0] === 0xff && body[1] !== undefined && (body[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (startsWithBytes(body, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (body.length >= 12 && body.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  return null;
}

function canonicalExtension(type: DetectedMediaType): string {
  return ({
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/wav': '.wav', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg',
  } satisfies Record<DetectedMediaType, string>)[type];
}

function mediaTypeMatches(declared: string, detected: DetectedMediaType): boolean {
  if (declared === 'application/octet-stream') return true;
  if (detected === 'video/mp4' && declared === 'audio/mp4') return true;
  return declared === detected;
}

function extensionMatches(fileName: string, detected: DetectedMediaType): boolean {
  const extension = extname(fileName).toLowerCase();
  if (detected === 'image/jpeg') return extension === '.jpg' || extension === '.jpeg';
  if (detected === 'audio/mpeg') return extension === '.mp3';
  if (detected === 'video/mp4') return extension === '.mp4' || extension === '.m4v' || extension === '.mov';
  return extension === canonicalExtension(detected);
}

/** 校验必填字段，返回缺失说明或 null。 */
function requireFields(...values: Array<string | number | undefined>): string | null {
  const missing = values.some((value) => value === undefined || value === '');
  return missing ? '需要 project_id、expected_revision 与 source_path' : null;
}

function isPathInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** 确保项目 workspace 目录存在，并拒绝 projectId 形成路径逃逸。 */
function ensureWorkspace(workspaceRoot: string, projectId: string): string {
  const root = resolve(workspaceRoot);
  const dir = resolve(root, projectId);
  if (!isPathInside(root, dir) || relative(root, dir) === '') throw new Error('非法 projectId：项目工作区越界');
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function main(): Promise<void> {
  const dbPath = process.env.QIYIN_DB_PATH ?? resolve('.data/qiyin.db');
  const db = openDatabase(dbPath);
  /**
   * 内核服务按需接入：找不到 前置内核 发行版时不让整个 API 起不来——
   * 项目与画布功能不依赖内核，只有调用内核端点时才会得到明确失败。
   */
  let kernel: KernelBinding | undefined;
  const workspaceRoot = process.env.QIYIN_WORKSPACE_ROOT ?? resolve('.data/workspaces');
  mkdirSync(workspaceRoot, { recursive: true });
  try {
    kernel = {
      service: new KernelService(new ProjectService(db), createFrontkernelAdapter()),
      workspaceRoot,
    };
  } catch (error) {
    console.warn(`[qiyin] 前置内核未接入：${error instanceof Error ? error.message : String(error)}`);
  }
  const app = buildServer(new ProjectService(db), kernel, { workspaceRoot });
  const port = Number(process.env.QIYIN_API_PORT ?? 43121);
  await app.listen({ host: '127.0.0.1', port });
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
