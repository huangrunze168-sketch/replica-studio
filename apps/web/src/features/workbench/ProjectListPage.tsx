import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { ports } from '../../app/useAppData';
import { navigate, projectHref } from '../../app/router';
import { usePrefersReducedMotion } from '../../app/usePrefersReducedMotion';
import { AgentLensCanvas } from '../marketing/AgentLensCanvas';
import { AGENT_MODES, LUCIDE_PLUS_PATHS, LUCIDE_SPARKLE_PATH } from '../marketing/agentConsole';
import type { ProjectSettings, ProjectSummary } from '../../ports';

gsap.registerPlugin(useGSAP, ScrollTrigger);

type SortMode = 'updated' | 'name' | 'progress';
/** 状态筛选：ProjectStatus 是 active/archived 生命周期，这里按 progress 判定完成度。 */
type StatusFilter = 'all' | 'active' | 'done';

import { CountUp } from './CountUp';
import { CoverThumb } from './CoverThumb';
import { ProjectRail } from './ProjectRail';

const statusFilters: Array<[StatusFilter, string]> = [
  ['all', '全部'],
  ['active', '进行中'],
  ['done', '已完成'],
];

/** Agent 会话消息：steps 是 Agent 给出的、可一键填入的下一步。 */
type AgentMessage = { id: string; role: 'user' | 'agent'; text: string; steps?: string[] };

export function ProjectListPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [archived, setArchived] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [maxBudgetCents, setMaxBudgetCents] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('updated');
  const [settingsProject, setSettingsProject] = useState<ProjectSummary | null>(null);
  const [settingsName, setSettingsName] = useState('');
  const [settings, setSettings] = useState<ProjectSettings>({ playback: 'hold', transition: 'cut', direction: 'left' });
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [renamingId, setRenamingId] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Agent 对话：对标站 的中间是会话而非单行输入，空态才显示「A new era」。 */
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentModel, setAgentModel] = useState('auto-medium');
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);

  /** 首屏入场（对标 hero 组件：`b=z(()=>l(d)||xt.current)` / `data-animate=!xt.current`）。
      data-animate 从首帧就为 true（transition 先挂好），data-ready 等透镜动画到位（f>=1.5）才翻。 */
  const reducedMotion = usePrefersReducedMotion();
  const [arrived, setArrived] = useState(false);
  const introReady = arrived || reducedMotion;
  const handleLensArrival = useCallback(() => setArrived(true), []);

  /** 引力透镜 canvas：输入台元素 + 首屏是否在视口内（离开就停渲染，见 AgentLensCanvas）。 */
  const consoleRef = useRef<HTMLFormElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [heroActive, setHeroActive] = useState(true);
  useEffect(() => {
    const node = heroRef.current;
    if (!node) return;
    const io = new IntersectionObserver(([entry]) => setHeroActive(entry.isIntersecting));
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const refresh = async () => {
    const [activeItems, archivedItems] = await Promise.all([ports.projects.list(), ports.projects.listArchived()]);
    setProjects(activeItems);
    setArchived(archivedItems);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const visibleProjects = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = projects.filter(project => `${project.name} ${project.description}`.toLowerCase().includes(keyword));
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sort === 'progress') return b.progress - a.progress;
      return b.revision - a.revision;
    });
  }, [projects, search, sort]);

  const filteredProjects = useMemo(() => (
    statusFilter === 'all'
      ? visibleProjects
      : visibleProjects.filter(project => statusFilter === 'done' ? project.progress >= 100 : project.progress < 100)
  ), [visibleProjects, statusFilter]);

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    const title = name.trim();
    if (!title || !rightsConfirmed) return;
    const project = await ports.projects.create({
      name: title,
      description: description.trim() || '尚未填写项目描述',
      rightsConfirmed,
      maxBudgetCents: Math.max(0, maxBudgetCents),
    });
    setCreating(false);
    setName('');
    setDescription('');
    setRightsConfirmed(false);
    setMaxBudgetCents(0);
    await refresh();
    navigate(projectHref(project.id));
  };

  const runProjectAction = async (id: string, action: () => Promise<unknown>, message: string) => {
    setBusyId(id);
    try {
      await action();
      await refresh();
      setNotice(message);
    } finally {
      setBusyId('');
    }
  };

  const openSettings = (project: ProjectSummary) => {
    setSettingsProject(project);
    setSettingsName(project.name);
    setSettings({ playback: 'hold', transition: 'cut', direction: 'left' });
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!settingsProject || !settingsName.trim()) return;
    await runProjectAction(settingsProject.id, async () => {
      await ports.projects.rename(settingsProject.id, settingsName.trim());
      await ports.projects.updateSettings(settingsProject.id, settings);
    }, '项目设置已保存。');
    setSettingsProject(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleteConfirmName.trim() !== pendingDelete.name) return;
    await runProjectAction(pendingDelete.id, () => ports.projects.purge(pendingDelete.id, pendingDelete.name), '项目已彻底删除。');
    setPendingDelete(null);
    setDeleteConfirmName('');
  };

  const confirmRename = async () => {
    if (!renamingId) return;
    const title = renameValue.trim();
    if (!title) {
      setRenamingId('');
      return;
    }
    await runProjectAction(renamingId, () => ports.projects.rename(renamingId, title), '项目已重命名。');
    setRenamingId('');
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));
  };

  const archiveSelected = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    setBusyId('bulk');
    try {
      await Promise.all(selectedIds.map(id => ports.projects.trash(id)));
      await refresh();
      setNotice('已归档 ' + count + ' 个项目。');
      setSelectedIds([]);
      setSelectMode(false);
    } finally {
      setBusyId('');
    }
  };

  /** Card Spotlight：指针位置写入 --mx/--my，供卡片辉光径向渐变定位。 */
  const handleSpotlight = (event: ReactPointerEvent<HTMLElement>) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.tool-card, .project-cover, .feature-tile, .rail-promo');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    card.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  /** 发送到 Agent 会话：追加用户消息 + 一条带「下一步」建议的 Agent 回复（原型态）。 */
  /** 发送到 Agent 会话（与落地页同款）。⚠ 提交动作与「表单 onSubmit」「textarea 的 Enter」共用。 */
  const submitAgentPrompt = useCallback(() => {
    const text = agentPrompt.trim();
    if (!text) return;
    setAgentMessages(list => {
      const stamp = `${list.length}-${Date.now()}`;
      return [
        ...list,
        { id: `u-${stamp}`, role: 'user' as const, text },
        {
          id: `a-${stamp}`,
          role: 'agent' as const,
          text: `收到。我会先把「${text}」拆成 3 个镜头，并摆出每一步的花费，你确认后再执行。`,
          steps: ['先分析参考片节奏', '直接生成 3 个镜头', '先看预算'],
        },
      ];
    });
    setAgentPrompt('');
  }, [agentPrompt]);

  const sendAgentPrompt = (event: FormEvent) => {
    event.preventDefault();
    submitAgentPrompt();
  };

  /** Enter 直发（Shift+Enter 换行）；放过 IME 组合中的 Enter，否则中文选字会直接发出。
      说明见 LandingPage.tsx 的同名注释 —— 之前这里也只有点 ✦ 钮才能出对话。 */
  const handlePromptKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submitAgentPrompt();
  };

  /** GSAP 动效层：只驱动「少量、独立」的层（gsap-performance）。
      ⚠ 首屏星野已换成对标那张预渲染照片、光带改成纯 CSS 的 conic-gradient + feTurbulence，
        所以这里不再有 .starfield* 的视差/漂移 tween，也不再给光带建 canvas
        （对标压根没做这两件事，程序化撒点 + 漩涡环是自造的，越调越不像）。 */
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add({ live: '(prefers-reduced-motion: no-preference)' }, ctx => {
        if (!ctx.conditions?.live) return;
        const targets = pageRef.current?.querySelectorAll<HTMLElement>('.feature-tile, .project-card') ?? [];
        Array.from(targets).forEach((el, index) => {
          gsap.from(el, {
            autoAlpha: 0,
            y: 26,
            duration: 0.8,
            ease: 'power2.out',
            delay: (index % 3) * 0.06,
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          });
        });
      });

      return () => mm.revert();
    },
    { scope: pageRef },
  );

  return (
    <div className="app-shell workbench-scope project-list-page" ref={pageRef}>
      {/* 与落地页同一套：星野是预渲染照片、光带是 conic-gradient + feTurbulence，
          滤镜定义必须挂在根上（祖先带 transform/filter 会改 url(#…) 的解析基准）。 */}
      <svg className="agent-streak-defs" aria-hidden="true">
        <filter id="agent-streak-texture" x="-10%" y="-30%" width="120%" height="160%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.045 0.5" numOctaves="2" seed="8" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" result="distorted" />
          <feColorMatrix in="noise" type="saturate" values="0" result="grain" />
          <feComposite in="distorted" in2="grain" operator="arithmetic" k1="1.5" k2="0.35" k3="0" k4="0" />
        </filter>
      </svg>
      <ProjectRail active="projects" />
      <div className="project-list-body">
      <main className="project-list-main" onPointerMove={handleSpotlight}>
        <section
          className={'agent-hero' + (agentMessages.length > 0 ? ' has-thread' : '')}
          ref={heroRef}
        >
          <img
            className="agent-hero-backdrop"
            src="/covers/agent-starfield-backdrop.webp"
            alt=""
            fetchPriority="high"
          />
          <AgentLensCanvas
            promptRef={consoleRef}
            active={heroActive}
            engaged={agentMessages.length > 0}
            onArrival={handleLensArrival}
          />
          {/* data-ready / data-animate / inert 三件套在 copy 容器上（对标 `te` = div.hero-copy） */}
          <div
            className="agent-hero-copy"
            data-ready={introReady}
            data-animate={!reducedMotion}
            inert={!introReady}
          >
            <div className="agent-hero-heading">
              <h1 className="agent-hero-title hero-enter">{agentMessages.length > 0 ? '小QTV Agent' : 'A new era'}</h1>
              {agentMessages.length === 0 && (
                <p className="agent-hero-sub hero-enter" style={{ '--intro-delay': '150ms' } as CSSProperties}>介绍全新小QTV Agent —— 生成式媒体的下一种创作方式。</p>
              )}
            </div>
            {agentMessages.length > 0 && (
              <div className="agent-thread" aria-live="polite">
                {agentMessages.map(message => (
                  <article className={'agent-msg ' + message.role} key={message.id}>
                    <span className="agent-msg-avatar" aria-hidden="true">{message.role === 'user' ? '我' : '✦'}</span>
                    <div className="agent-msg-body">
                      <p>{message.text}</p>
                      {message.steps && (
                        <div className="agent-msg-steps">
                          {message.steps.map(step => (
                            <button key={step} type="button" className="agent-step" onClick={() => setAgentPrompt(step)}>{step}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div
              className="agent-prompt hero-enter"
              style={{
                '--intro-delay': '225ms',
                animationPlayState: !introReady || !heroActive ? 'paused' : 'running',
              } as CSSProperties}
            >
              <div className="agent-streaks" aria-hidden="true" />
              <form
                className="agent-console"
                ref={consoleRef}
                onSubmit={sendAgentPrompt}
              >
                <textarea
                  className="agent-console-input"
                  value={agentPrompt}
                  onChange={event => setAgentPrompt(event.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  placeholder="Ask me to do anything..."
                  rows={1}
                  aria-label="创作描述"
                />
                {/* 底栏结构/图标与落地页同源：左 `gap-1` 簇（Lucide plus）+ 右 `ml-auto gap-1` 簇
                    （Model settings 触发钮 + Lucide sparkle 发送钮）。权威依据见 LandingPage.tsx。 */}
                <div className="agent-console-bar">
                  <div className="agent-console-left">
                    <button className="agent-plus" type="button" aria-label="添加参考素材" onClick={() => setCreating(true)}>
                      <svg
                        className="agent-plus-icon"
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {LUCIDE_PLUS_PATHS.map(d => <path key={d} d={d} />)}
                      </svg>
                    </button>
                  </div>
                  <div className="agent-console-right">
                    <span className="agent-mode">
                      <span className="agent-mode-text" aria-hidden="true">
                        <span className="agent-mode-model">Auto</span>
                        <span className="agent-mode-effort">{AGENT_MODES[agentModel] ?? 'Medium'}</span>
                        <svg
                          className="agent-mode-chev"
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                      <select value={agentModel} onChange={event => setAgentModel(event.target.value)} aria-label="生成质量">
                        <option value="auto-low">Auto Low</option>
                        <option value="auto-medium">Auto Medium</option>
                        <option value="auto-high">Auto High</option>
                      </select>
                    </span>
                    <button className="agent-send" type="submit" aria-label="开始创作" disabled={agentPrompt.trim().length === 0}>
                      <svg
                        className="agent-send-icon"
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={LUCIDE_SPARKLE_PATH} />
                      </svg>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>

        <a className="feature-tile" href="/create">
          <img className="feature-tile-img" src="/covers/cover-2.webp" alt="" loading="lazy" />
          <span className="feature-tile-veil" aria-hidden="true" />
          <span className="feature-tile-title">小QTV<i className="feature-tile-mark" aria-hidden="true">＋</i>Agent</span>
        </a>

        <section className="project-list-head">
          <div>
            <p className="overline">PRODUCTION WORKBENCH</p>
            <h2>你的创作项目</h2>
            <p>从参考片到成片，项目、分镜、素材、生成与局部重做保持同一条链路。</p>
          </div>
          <div className="project-list-metrics">
            <span><b><CountUp value={projects.length} /></b>进行中</span>
            <span><b><CountUp value={archived.length} /></b>回收站</span>
            <span><b><CountUp value={projects.reduce((sum, item) => sum + item.shots, 0)} /></b>个镜头</span>
          </div>
        </section>

        <div className="chip-row" role="group" aria-label="按状态筛选项目">
          {statusFilters.map(([value, label]) => (
            <button key={value} type="button" className={statusFilter === value ? 'chip active' : 'chip'} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{label}</button>
          ))}
          <button type="button" className={selectMode ? 'chip active' : 'chip'} aria-pressed={selectMode} onClick={() => { setSelectMode(current => !current); setSelectedIds([]); }}>批量管理</button>
          {selectMode && (
            <>
              <button type="button" className="chip" disabled={selectedIds.length === filteredProjects.length} onClick={() => setSelectedIds(filteredProjects.map(project => project.id))}>全选</button>
              <button type="button" className="chip chip-danger" disabled={selectedIds.length === 0 || busyId === 'bulk'} onClick={() => void archiveSelected()}>归档所选（{selectedIds.length}）</button>
            </>
          )}
        </div>

        <section className="project-toolbar" aria-label="项目筛选">
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索项目名称或描述…" />
          <label><span>排序</span><select value={sort} onChange={event => setSort(event.target.value as SortMode)}><option value="updated">最近更新</option><option value="name">项目名称</option><option value="progress">完成进度</option></select></label>
        </section>

        {notice && <div className="project-notice" role="status">{notice}</div>}

        <section className="project-grid" aria-label="进行中的项目">
          {loading && <div className="project-loading">正在读取项目…</div>}
          {!loading && filteredProjects.map((project, index) => (
            <article className="project-card" key={project.id}>
              <button type="button" className={'project-cover cover-tone-' + (index % 4) + (selectMode && selectedIds.includes(project.id) ? ' selected' : '')} onClick={() => (selectMode ? toggleSelected(project.id) : navigate(projectHref(project.id)))} aria-label={'打开项目 ' + project.name}>
                {selectMode && <span className={selectedIds.includes(project.id) ? 'cover-check on' : 'cover-check'} aria-hidden="true">✓</span>}
                <CoverThumb seed={project.id} shots={project.shots} progress={project.progress} tone={index % 4} />
                <img
                  className="cover-thumb-img"
                  src={`/covers/cover-${index % 4}.webp`}
                  alt=""
                  loading="lazy"
                  onError={event => { event.currentTarget.style.display = 'none'; }}
                />
                <span className="cover-veil" aria-hidden="true" />
                <span className="cover-badge">{project.progress}%</span>
                <span className="cover-play" aria-hidden="true">▶</span>
                <b>{project.name}</b>
              </button>
              <div className="project-card-top">
                <div>
                  <p className="overline">{project.state}</p>
                  {renamingId === project.id ? (
                    <form className="inline-rename" onSubmit={event => { event.preventDefault(); void confirmRename(); }}>
                      <input autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} aria-label="项目名称" />
                      <button type="submit" disabled={busyId === project.id || !renameValue.trim()}>确定</button>
                      <button type="button" onClick={() => setRenamingId('')}>取消</button>
                    </form>
                  ) : (
                    <p>{project.description}</p>
                  )}
                </div>
              </div>
              <div className="project-progress"><i style={{ width: `${project.progress}%` }} /></div>
              <div className="project-card-meta">
                <span>{project.shots} 个镜头</span>
                <span>{project.assets} 个素材</span>
                <span>预算 {(project.maxBudgetCents / 100).toFixed(2)} 元</span>
                <span>{project.rightsConfirmed ? '权利已确认' : '权利待确认'}</span>
                <span>更新于 {project.updatedAt}</span>
              </div>
              <div className="project-card-actions">
                <button className="project-open" type="button" onClick={() => navigate(projectHref(project.id))}>打开工作台 <span>↗</span></button>
                <button type="button" onClick={() => openSettings(project)}>项目设置</button>
                <button type="button" onClick={() => { setRenamingId(project.id); setRenameValue(project.name); }}>重命名</button>
                <button type="button" disabled={busyId === project.id} onClick={() => void runProjectAction(project.id, () => ports.projects.duplicate(project.id), '项目副本已创建。')}>复制</button>
                <button type="button" disabled={busyId === project.id} onClick={() => void runProjectAction(project.id, () => ports.projects.trash(project.id), '项目已移入回收站。')}>归档</button>
              </div>
            </article>
          ))}
          {!loading && visibleProjects.length === 0 && <div className="project-empty">没有匹配的项目。</div>}
        </section>

        {archived.length > 0 && (
          <section className="project-archive">
            <div className="project-section-title"><h2>回收站</h2><p>项目可恢复；彻底删除需要逐字输入项目名。</p></div>
            <div className="archive-list">
              {archived.map(project => (
                <div className="archive-row" key={project.id}>
                  <button type="button" onClick={() => navigate(projectHref(project.id))}><div><b>{project.name}</b><small>{project.description}</small></div><span>{project.updatedAt}</span><span className="badge">查看</span></button>
                  <div className="archive-actions">
                    <button type="button" disabled={busyId === project.id} onClick={() => void runProjectAction(project.id, () => ports.projects.restore(project.id), '项目已恢复。')}>恢复</button>
                    <button className="danger" type="button" onClick={() => { setPendingDelete(project); setDeleteConfirmName(''); }}>彻底删除</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      </div>

      {creating && (
        <div className="modal-backdrop" role="presentation" onClick={() => setCreating(false)}>
          <form className="modal project-create-modal" onSubmit={createProject} onClick={event => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="关闭" onClick={() => setCreating(false)}>×</button>
            <p className="overline">NEW PROJECT</p><h2>新建创作项目</h2>
            <label><span>项目名称</span><input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="例如：城市夜跑 · 产品短片" /></label>
            <label><span>一句话描述</span><textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} placeholder="说明你想做的内容与风格方向" /></label>
            <label><span>预算上限（元）</span><input type="number" min="0" step="1" value={maxBudgetCents / 100} onChange={event => setMaxBudgetCents(Math.round(Number(event.target.value) * 100))} /></label>
            <label className="project-check"><input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} /><span>我确认拥有上传素材和参考内容的使用权。</span></label>
            <button className="primary full" type="submit" disabled={!name.trim() || !rightsConfirmed}>创建并进入工作台</button>
          </form>
        </div>
      )}

      {settingsProject && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSettingsProject(null)}>
          <form className="modal project-settings-modal" onSubmit={saveSettings} onClick={event => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="关闭" onClick={() => setSettingsProject(null)}>×</button>
            <p className="overline">PROJECT SETTINGS</p><h2>项目设置</h2>
            <label><span>项目名称</span><input value={settingsName} onChange={event => setSettingsName(event.target.value)} /></label>
            <div className="settings-grid">
              <label><span>片段与镜头不等长</span><select value={settings.playback} onChange={event => setSettings({ ...settings, playback: event.target.value as ProjectSettings['playback'] })}><option value="hold">停格</option><option value="stretch">拉伸</option></select></label>
              <label><span>默认转场</span><select value={settings.transition} onChange={event => setSettings({ ...settings, transition: event.target.value as ProjectSettings['transition'] })}><option value="cut">硬切</option><option value="crossfade">交叉溶解</option><option value="push">推镜</option><option value="wipe">划像</option><option value="cover">覆盖</option><option value="page-turn">翻页</option></select></label>
              <label><span>转场方向</span><select value={settings.direction} onChange={event => setSettings({ ...settings, direction: event.target.value as ProjectSettings['direction'] })}><option value="left">向左</option><option value="right">向右</option><option value="up">向上</option><option value="down">向下</option></select></label>
            </div>
            <div className="settings-facts"><span>预算上限：{(settingsProject.maxBudgetCents / 100).toFixed(2)} 元</span><span>素材权利：{settingsProject.rightsConfirmed ? '已确认' : '待确认'}</span></div>
            <button className="primary full" type="submit">保存项目设置</button>
          </form>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPendingDelete(null)}>
          <div className="modal project-delete-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <p className="overline">PERMANENT DELETE</p><h2>彻底删除项目</h2>
            <p>这会永久删除项目及其本地数据，无法恢复。请输入项目名 <b>{pendingDelete.name}</b> 确认。</p>
            <input value={deleteConfirmName} onChange={event => setDeleteConfirmName(event.target.value)} placeholder={pendingDelete.name} />
            <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setPendingDelete(null)}>取消</button><button className="button danger" type="button" disabled={deleteConfirmName.trim() !== pendingDelete.name} onClick={() => void confirmDelete()}>彻底删除</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
