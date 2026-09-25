import type {
  AgentMessage,
  AppPorts,
  Asset,
  GenerationJob,
  ProjectPort,
  ProjectSettings,
  ProjectSummary,
  ReferenceSource,
  Shot,
} from '../../ports';
import { memoryAdapter } from './memoryAdapter';

const API_BASE = '/api/v1';

type ApiProjectRow = {
  id: string;
  name: string;
  revision: number;
  state: string;
  max_budget_cents: number;
  reserved_budget_cents?: number;
  rights_confirmed?: boolean | number;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

type ApiProjectDetail = ApiProjectRow & {
  shot_fields?: { shots?: Array<Record<string, unknown>> } | null;
  sources?: Array<Record<string, unknown>>;
  derived_artifacts?: Array<Record<string, unknown>>;
  image_generations?: Array<Record<string, unknown>>;
  video_generations?: Array<Record<string, unknown>>;
  gate_status?: Record<string, string | null>;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Local API ${response.status}: ${body}`);
  }
  return response.json() as Promise<T>;
}

function fallback<T>(request: Promise<T>, demo: () => Promise<T>): Promise<T> {
  return request.catch(() => demo());
}

function uuid(): string {
  return crypto.randomUUID();
}

function relativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function projectSummary(row: ApiProjectRow, detail?: ApiProjectDetail): ProjectSummary {
  const shots = detail?.shot_fields?.shots?.length ?? 0;
  const assets = (detail?.sources?.length ?? 0) + (detail?.derived_artifacts?.length ?? 0);
  const gateValues = Object.values(detail?.gate_status ?? {});
  const approvedGates = gateValues.filter(value => value === 'APPROVED').length;
  return {
    id: row.id,
    name: row.name,
    description: detail?.state === 'EMPTY' ? '新项目 · 等待读入参考素材' : '项目数据已由本地能力后端管理',
    updatedAt: relativeTime(row.updated_at),
    status: row.deleted_at ? 'archived' : 'active',
    shots,
    assets,
    progress: gateValues.length ? Math.round((approvedGates / Math.max(6, gateValues.length)) * 100) : 0,
    revision: row.revision,
    state: row.state,
    maxBudgetCents: row.max_budget_cents,
    rightsConfirmed: Boolean(row.rights_confirmed),
  };
}

async function getDetail(projectId: string): Promise<ApiProjectDetail> {
  return apiFetch<ApiProjectDetail>(`/projects/${encodeURIComponent(projectId)}`);
}

async function sendCommand(type: string, payload: Record<string, unknown>, projectId?: string, expectedRevision?: number) {
  return apiFetch<{ project_id: string; revision: number }>('/commands', {
    method: 'POST',
    body: JSON.stringify({
      command_id: uuid(),
      type,
      payload,
      ...(projectId ? { project_id: projectId } : {}),
      ...(expectedRevision !== undefined ? { expected_revision: expectedRevision } : {}),
    }),
  });
}

const demoProject = (id: string) => memoryAdapter.projects.get(id);

function mapShot(row: Record<string, unknown>): Shot {
  const durationMs = Number(row.duration_ms ?? 0);
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return {
    id: String(row.shot_id ?? crypto.randomUUID()),
    title: `镜头 · ${String(row.shot_size ?? '中景')}`,
    scene: `${String(row.camera_position ?? '机位待定')} / ${String(row.lighting ?? '光线待定')}`,
    status: 'draft',
    duration: `00:${String(seconds).padStart(2, '0')}`,
    prompt: String(row.replacement ?? row.sound ?? '待补充镜头描述'),
  };
}

function mapAsset(row: Record<string, unknown>): Asset {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const mediaType = String(row.media_type ?? '');
  const kind: Asset['kind'] = mediaType.startsWith('video') ? 'video' : mediaType.startsWith('audio') ? 'audio' : 'image';
  return {
    id: String(row.artifact_id ?? crypto.randomUUID()),
    name: String(metadata.name ?? metadata.filename ?? '项目产物'),
    kind,
    meta: `${String(row.bytes ?? 0)} bytes · ${mediaType || 'unknown'}`,
    color: kind === 'video' ? '#325d42' : kind === 'audio' ? '#53439a' : '#245c70',
  };
}

function mapSource(row: Record<string, unknown>): ReferenceSource {
  return {
    id: String(row.asset_id ?? crypto.randomUUID()),
    name: String(row.relative_path ?? '参考素材'),
    kind: String(row.media_type ?? '').startsWith('audio') ? 'audio' : 'video',
    meta: `${String(row.bytes ?? 0)} bytes · ${String(row.media_type ?? 'unknown')}`,
    genre: '知识类口播',
    status: 'analyzed',
    accent: '#2f5d6b',
    rhythm: [],
    findings: [],
  };
}

function mapJob(row: Record<string, unknown>, kind: 'image' | 'video'): GenerationJob {
  const rawStatus = String(row.status ?? 'queued').toUpperCase();
  const status: GenerationJob['status'] = rawStatus === 'COMPLETED' ? 'succeeded' : rawStatus === 'FAILED' ? 'failed' : rawStatus === 'ADMITTED' ? 'running' : 'queued';
  return {
    id: String(row.intent_id ?? crypto.randomUUID()),
    title: String(row.prompt ?? `${kind === 'video' ? '视频' : '图像'}生成任务`),
    type: kind === 'video' ? '图生视频' : '图像生成',
    status,
    progress: status === 'succeeded' ? 100 : status === 'running' ? 68 : 0,
    createdAt: relativeTime(String(row.created_at ?? new Date().toISOString())),
  };
}

async function ensureAgentSession(projectId: string): Promise<{ id: string; session_revision: number; messages: Array<Record<string, unknown>> }> {
  const sessions = await apiFetch<Array<{ id: string }>>(`/agent/sessions?project_id=${encodeURIComponent(projectId)}`);
  const sessionId = sessions[0]?.id;
  if (sessionId) return apiFetch(`/agent/sessions/${encodeURIComponent(sessionId)}?project_id=${encodeURIComponent(projectId)}`);
  return apiFetch('/agent/sessions', { method: 'POST', body: JSON.stringify({ project_id: projectId, title: '小QTV 项目会话' }) });
}

export function createApiAdapter(fallbackAdapter: AppPorts = memoryAdapter): AppPorts {
  const projects: ProjectPort = {
    list: () => fallback(apiFetch<ApiProjectRow[]>('/projects').then(rows => Promise.all(rows.map(async row => projectSummary(row, await getDetail(row.id))))), fallbackAdapter.projects.list),
    listArchived: () => fallback(apiFetch<ApiProjectRow[]>('/projects/trash').then(rows => rows.map(row => projectSummary(row))), fallbackAdapter.projects.listArchived),
    get: id => fallback(getDetail(id).then(detail => projectSummary(detail, detail)), () => demoProject(id)),
    create: input => fallback(sendCommand('project.create', {
      name: input.name,
      max_budget_cents: 0,
      rights_confirmed: false,
    }).then(async result => {
      const detail = await getDetail(result.project_id);
      return projectSummary(detail, detail);
    }), () => fallbackAdapter.projects.create(input)),
    rename: (id, name) => fallback((async () => {
      const detail = await getDetail(id);
      await sendCommand('project.rename', { name }, id, detail.revision);
      const updated = await getDetail(id);
      return projectSummary(updated, updated);
    })(), () => fallbackAdapter.projects.rename(id, name)),
    trash: id => fallback((async () => {
      const detail = await getDetail(id);
      await sendCommand('project.trash', {}, id, detail.revision);
      const updated = await getDetail(id);
      return projectSummary(updated, updated);
    })(), () => fallbackAdapter.projects.trash(id)),
    restore: id => fallback((async () => {
      const detail = await getDetail(id);
      await sendCommand('project.restore', {}, id, detail.revision);
      const updated = await getDetail(id);
      return projectSummary(updated, updated);
    })(), () => fallbackAdapter.projects.restore(id)),
    purge: (id, confirmName) => fallback((async () => {
      const detail = await getDetail(id);
      await sendCommand('project.purge', { confirm_name: confirmName }, id, detail.revision);
    })(), () => fallbackAdapter.projects.purge(id, confirmName)),
    duplicate: id => fallback((async () => {
      const source = await getDetail(id);
      const created = await projects.create({ name: `${source.name} · 副本`, description: '项目副本' });
      return created;
    })(), () => fallbackAdapter.projects.duplicate(id)),
    updateSettings: (id, settings: ProjectSettings) => fallback((async () => {
      const detail = await getDetail(id);
      await sendCommand('film.settings.set', { ...settings }, id, detail.revision);
      const updated = await getDetail(id);
      return projectSummary(updated, updated);
    })(), () => fallbackAdapter.projects.updateSettings(id, settings)),
  };

  return {
    projects,
    shots: {
      list: projectId => fallback(getDetail(projectId).then(detail => (detail.shot_fields?.shots ?? []).map(mapShot)), () => fallbackAdapter.shots.list(projectId)),
    },
    media: {
      listAssets: projectId => fallback(getDetail(projectId).then(detail => (detail.derived_artifacts ?? []).map(mapAsset)), () => fallbackAdapter.media.listAssets(projectId)),
    },
    source: {
      list: projectId => fallback(getDetail(projectId).then(detail => (detail.sources ?? []).map(mapSource)), () => fallbackAdapter.source.list(projectId)),
      create: (...args) => fallbackAdapter.source.create(...args),
    },
    generation: {
      listJobs: projectId => fallback(getDetail(projectId).then(detail => [
        ...(detail.image_generations ?? []).map(row => mapJob(row, 'image')),
        ...(detail.video_generations ?? []).map(row => mapJob(row, 'video')),
      ]), () => fallbackAdapter.generation.listJobs(projectId)),
      create: (...args) => fallbackAdapter.generation.create(...args),
    },
    agent: {
      listMessages: projectId => fallback(ensureAgentSession(projectId).then(session => (session.messages ?? []).map(message => ({
        id: String(message.id ?? crypto.randomUUID()),
        role: String(message.role) === 'user' ? 'user' : 'agent',
        content: String(message.text ?? ''),
        createdAt: '刚刚',
      }))), () => fallbackAdapter.agent.listMessages(projectId)),
      send: (projectId, content) => fallback((async () => {
        const session = await ensureAgentSession(projectId);
        await apiFetch(`/agent/sessions/${encodeURIComponent(session.id)}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            project_id: projectId,
            message_id: uuid(),
            text: content,
            expected_session_revision: session.session_revision,
            agent_id: 'builtin',
          }),
        });
        return { id: uuid(), role: 'user', content, createdAt: '刚刚' };
      })(), () => fallbackAdapter.agent.send(projectId, content)),
    },
  };
}

export const apiAdapter = createApiAdapter();



