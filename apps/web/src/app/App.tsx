import { FormEvent, useEffect, useState } from 'react';
import { ports, useAppData } from './useAppData';
import { uiStore, useUiStore } from '../state/uiStore';
import type { Asset, GenerationJob, ReferenceSource, Shot } from '../ports';
import { rhythmShares, summarizeRhythm } from '../domain/sourceAnalysis';
import { requiresAgentConfirmation } from '../domain/agentActions';
import { Canvas } from '../features/canvas/Canvas';
import { CreateFlow } from '../features/create/CreateFlow';
import { LandingPage } from '../features/marketing/LandingPage';
import { NotFoundPage } from '../features/marketing/NotFoundPage';
import { SignupPage } from '../features/marketing/SignupPage';
import { ProjectListPage } from '../features/workbench/ProjectListPage';
import { navigate, useRoute } from './router';
import { hasSession } from '../features/auth/session';

const sections = [['overview','总览','⌂'],['source','参考片','◌'],['shots','分镜','▦'],['canvas','画布','◇'],['assets','素材库','▧'],['generate','生成工作台','✦'],['director','导演台','◉'],['timeline','剪辑与成片','▤'],['agent','Agent 工作台','✳']];
const statusText = { draft: '草稿', ready: '待审核', approved: '已通过' };
function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: string }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
function Sidebar({ projectName }: { projectName: string }) { const ui = useUiStore(); return <aside className="workbench-rail"><a className="rail-brand" href="/" aria-label="返回小QTV首页" title="返回首页">Q</a><nav className="rail-nav" aria-label="工作台工具">{sections.map(([id, label, icon]) => <button key={id} className={ui.selectedSection === id ? 'rail-item active' : 'rail-item'} title={label} aria-label={label} onClick={() => uiStore.set({ selectedSection: id })}><span aria-hidden="true">{icon}</span></button>)}</nav><button className="rail-help" aria-label="打开工具说明" title="工具说明" onClick={() => uiStore.set({ rightPanel: true })}>?</button></aside>; }
function Topbar({ projectName }: { projectName: string }) { const ui = useUiStore(); return <header className="workbench-topbar"><div className="workbench-breadcrumb"><a href="/">小QTV</a><span>/</span><b>{projectName}</b><span>/</span><span>{sections.find(s => s[0] === ui.selectedSection)?.[1]}</span></div><div className="workbench-actions"><a className="chrome-link" href="/create">创作流程</a><button className="chrome-button" aria-label="打开命令面板" onClick={() => uiStore.set({ commandPaletteOpen: true })}>Ctrl K</button><button className="chrome-button chrome-avatar" aria-label="打开工具说明" onClick={() => uiStore.set({ rightPanel: true })}>Q</button></div></header>; }
function ToolDrawer({ projectName }: { projectName: string }) { const ui = useUiStore(); if (!ui.rightPanel || ui.selectedSection === 'overview' || ui.selectedSection === 'canvas') return null; const item = sections.find(section => section[0] === ui.selectedSection); return <aside className="workbench-drawer" aria-label={`${item?.[1] ?? '工具'}面板`}><div className="drawer-head"><h2>{item?.[1] ?? '工具'}</h2><button className="drawer-close" aria-label="关闭面板" onClick={() => uiStore.set({ rightPanel: false })}>×</button></div><div className="drawer-body"><p>{projectName} 的{item?.[1] ?? '工具'}。</p><div className="drawer-card"><b>当前视图</b><span>选择画布中的对象后，这里会显示相关操作。</span></div><div className="drawer-card"><b>快速提示</b><span>使用底部控制条管理画布、网格与缩放。</span></div></div></aside>; }
function WorkbenchBottomBar() { const [grid, setGrid] = useState(true); const [edges, setEdges] = useState(true); const [miniMap, setMiniMap] = useState(true); const [zoom, setZoom] = useState(100); return <div className="workbench-bottom-bar" aria-label="画布控制条"><button className="bottom-control" onClick={() => uiStore.set({ selectedSection: 'assets', rightPanel: true })}>资产管理</button><button className="bottom-control" onClick={() => uiStore.set({ selectedSection: 'canvas' })}>整理画布</button><button className={miniMap ? 'bottom-control active' : 'bottom-control'} onClick={() => setMiniMap(value => !value)} aria-pressed={miniMap}>小地图</button><button className={edges ? 'bottom-control active' : 'bottom-control'} onClick={() => setEdges(value => !value)} aria-pressed={edges}>连线</button><button className={grid ? 'bottom-control active' : 'bottom-control'} onClick={() => setGrid(value => !value)} aria-pressed={grid}>网格吸附</button><div className="zoom-control"><button aria-label="缩小" onClick={() => setZoom(value => Math.max(12, value - 10))}>−</button><span className="zoom-value">{zoom}%</span><button aria-label="放大" onClick={() => setZoom(value => Math.min(200, value + 10))}>＋</button></div></div>; }
function Overview({ projectId, project, shots, jobs, assets }: { projectId: string; project?: ReturnType<typeof useAppData>['project']; shots: Shot[]; jobs: GenerationJob[]; assets: Asset[] }) { const [creating, setCreating] = useState(false); const [title, setTitle] = useState(''); const create = async () => { if (!title.trim()) return; await ports.generation.create(projectId, title, '图像生成'); setTitle(''); setCreating(false); }; const runningJobs = jobs.filter(job => job.status === 'running' || job.status === 'queued').length; return <div className="page"><section className="creative-hero"><div className="hero-copy"><div className="hero-kicker"><span className="pulse-dot" /> 项目进行中</div><p className="eyebrow">项目总览 · 最近同步于 {project?.updatedAt}</p><h1>{project?.name}</h1><p className="subheading">{project?.description}</p><div className="hero-actions"><button className="primary" onClick={() => setCreating(true)}>＋ 发起生成</button><button className="ghost-button" onClick={() => uiStore.set({ selectedSection: 'canvas' })}>进入画布 <span>↗</span></button></div></div></section><div className="stat-grid"><Stat label="项目进度" value={`${project?.progress ?? 0}%`} detail="按当前项目数据" tone="blue" /><Stat label="分镜" value={`${project?.shots ?? shots.length}`} detail="项目内镜头" tone="purple" /><Stat label="素材" value={`${project?.assets ?? assets.length}`} detail="项目内素材" tone="orange" /><Stat label="运行中任务" value={String(runningJobs)} detail="当前队列" tone="green" /></div><div className="content-grid"><section className="panel wide"><div className="panel-head"><div><h2>项目进度</h2><p>从参考片到成片的工作流</p></div><button className="text-button" onClick={() => uiStore.set({ selectedSection: 'shots' })}>查看分镜 →</button></div><div className="progress-track"><div style={{ width: `${project?.progress ?? 0}%` }} /></div><div className="milestones"><Milestone label="参考片分析" done /><Milestone label="分镜设计" done /><Milestone label="素材准备" active /><Milestone label="生成与审核" /><Milestone label="剪辑交付" /></div></section><section className="panel"><div className="panel-head"><div><h2>生成队列</h2><p>实时任务状态</p></div><Badge tone="green">{jobs.length} 个任务</Badge></div>{jobs.slice(0, 3).map(job => <JobRow key={job.id} job={job} />)}<button className="full-button" onClick={() => uiStore.set({ selectedSection: 'generate' })}>打开生成工作台</button></section></div>{creating && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setCreating(false)}>×</button><p className="eyebrow">新建任务</p><h2>发起一次生成</h2><input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && void create()} placeholder="例如：03 · 楼梯间 · 候选首帧" /><button className="primary full" onClick={() => void create()}>加入队列</button></div></div>}</div>; }
function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}>◒</div><div><span>{label}</span><strong>{value}</strong><small className={tone === 'green' ? 'positive' : ''}>{detail}</small></div></div>; }
function Milestone({ label, done, active }: { label: string; done?: boolean; active?: boolean }) { return <div className={`milestone ${done ? 'done' : ''} ${active ? 'active' : ''}`}><span>{done ? '✓' : active ? '•' : '○'}</span><small>{label}</small></div>; }
function JobRow({ job, onRetry }: { job: GenerationJob; onRetry?: (job: GenerationJob) => void }) {
  const running = job.status === 'running' || job.status === 'queued';
  const failed = job.status === 'failed';
  return (
    <div className="job-row">
      <div className={`job-thumb ${running ? 'loading' : 'done-thumb'}`}>{running ? '✦' : failed ? '!' : '✓'}</div>
      <div className="job-info">
        <b>{job.title}</b>
        <small>{job.type} · {job.createdAt}</small>
        {running && <div className="mini-progress"><span style={{ width: `${job.progress}%` }} /></div>}
        {failed && <small className="job-failure">任务失败，可从断点重新提交</small>}
      </div>
      <Badge tone={running ? 'blue' : failed ? 'muted' : 'green'}>{running ? `${job.progress}%` : failed ? '失败' : '完成'}</Badge>
      {failed && onRetry && <button className="text-button job-retry" type="button" onClick={() => onRetry(job)}>重试</button>}
    </div>
  );
}
function Workspace({ projectId, data }: { projectId: string; data: ReturnType<typeof useAppData> }) {
  const section = useUiStore().selectedSection;
  if (section === 'overview') return <Overview projectId={projectId} {...data} />;
  if (section === 'source') return <Sources projectId={projectId} sources={data.sources} refresh={data.refreshSources} />;
  if (section === 'shots') return <Shots shots={data.shots} />;
  if (section === 'assets') return <Assets assets={data.assets} />;
  if (section === 'generate') return <Generation projectId={projectId} jobs={data.jobs} refresh={data.refreshJobs} />;
  if (section === 'director') return <Director shots={data.shots} assets={data.assets} />;
  if (section === 'timeline') return <Timeline shots={data.shots} jobs={data.jobs} />;
  if (section === 'agent') return <Agent projectId={projectId} />;
  if (section === 'canvas') return <div className="page canvas-page"><Canvas projectId={projectId} /></div>;
  return <Placeholder section={sections.find(s => s[0] === section)?.[1] ?? '工作台'} />;
}
function ModuleToolbar({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) { return <div className="module-toolbar"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{children && <div className="module-actions">{children}</div>}</div>; }
function Sources({ projectId, sources, refresh }: { projectId: string; sources: ReferenceSource[]; refresh: () => Promise<void> }) { const [name, setName] = useState(''); const [genre, setGenre] = useState('知识类口播'); const [busy, setBusy] = useState(false); const submit = async (event: FormEvent) => { event.preventDefault(); if (!name.trim() || busy) return; setBusy(true); await ports.source.create(projectId, name.trim(), genre); await refresh(); setName(''); setBusy(false); }; return <div className="page source-page"><ModuleToolbar eyebrow="参考片" title="建立你的制作参考"><form className="source-import-form" onSubmit={submit}><label><span>名称</span><input value={name} onChange={event => setName(event.target.value)} placeholder="例如：知识口播 · 开场节奏" required /></label><label><span>创作类型</span><select value={genre} onChange={event => setGenre(event.target.value)}><option>知识类口播</option><option>产品广告</option><option>情绪化剧情片</option><option>系列内容</option></select></label><button className="primary" type="submit" disabled={busy}>{busy ? '分析中…' : '导入参考片'}</button></form></ModuleToolbar>{sources.length === 0 ? <div className="empty-state source-empty"><div className="empty-icon">◌</div><h2>还没有参考片</h2><p>导入一条你拥有使用权的视频或音频，先从镜头语言开始建立制作方案。</p></div> : <div className="source-list">{sources.map(source => <SourceCard key={source.id} source={source} />)}</div>}</div>; }
function SourceCard({ source }: { source: ReferenceSource }) { const summary = summarizeRhythm(source.rhythm); const shares = rhythmShares(source.rhythm); return <article className="source-card panel"><div className="source-card-head"><div className="source-thumb" style={{ '--source-accent': source.accent } as React.CSSProperties} aria-hidden="true"><span>{source.kind === 'video' ? '▶' : '♫'}</span></div><div className="source-meta"><h2>{source.name}</h2><p>{source.meta} · {source.genre}</p></div><Badge tone={source.status === 'analyzed' ? 'green' : 'blue'}>{source.status === 'analyzed' ? '已分析' : '分析中'}</Badge></div><div className="source-analysis-grid"><section className="source-rhythm"><div className="source-section-head"><div><h3>镜头节奏</h3><p>{summary.label}</p></div><span className="source-score">紧凑度 {summary.paceScore}</span></div><div className={`rhythm-bar ${shares.length === 0 ? 'is-empty' : ''}`} aria-label={`镜头节奏：${summary.label}`}>{shares.map((share, index) => <span key={`${source.id}-rhythm-${index}`} style={{ width: `${share}%` }} />)}</div></section><section className="source-findings"><div className="source-section-head"><h3>风格分析结论</h3><span>三项观察</span></div><div className="finding-list">{source.findings.slice(0, 3).map(finding => <div className="finding-row" key={finding.key}><div><b>{finding.label}</b><span>{finding.value}</span></div><div className="finding-scale" aria-label={`${finding.label}：刻度 ${finding.score}`}><i style={{ width: `${Math.min(100, Math.max(0, finding.score))}%` }} /></div><small>{finding.score}</small></div>)}</div></section></div></article>; }
function Shots({ shots }: { shots: Shot[] }) { return <div className="page"><ModuleToolbar eyebrow="分镜设计" title="镜头列表"><button className="primary" type="button" onClick={() => uiStore.set({ rightPanel: true })}>＋ 新建镜头</button></ModuleToolbar><div className="shot-list">{shots.map((s, i) => <div className="shot-row" key={s.id}><div className="shot-number">{String(i + 1).padStart(2,'0')}</div><div className={`shot-preview shot-preview-${i % 3}`}><span>▶</span></div><div className="shot-copy"><b>{s.title}</b><small>{s.scene} · {s.duration}</small><p>{s.prompt}</p></div><Badge tone={s.status === 'approved' ? 'green' : s.status === 'ready' ? 'blue' : 'muted'}>{statusText[s.status]}</Badge></div>)}</div></div>; }
function Assets({ assets }: { assets: Asset[] }) { return <div className="page"><ModuleToolbar eyebrow="素材库" title="项目素材"><button className="primary" type="button" onClick={() => uiStore.set({ rightPanel: true })}>＋ 上传素材</button></ModuleToolbar><div className="asset-grid">{assets.map(a => <div className="asset-card" key={a.id}><div className={`asset-cover asset-cover-${a.kind}`}><span>{a.kind === 'video' ? '▶' : a.kind === 'audio' ? '♫' : '✦'}</span></div><b>{a.name}</b><small>{a.meta}</small></div>)}</div></div>; }
function Director({ shots, assets }: { shots: Shot[]; assets: Asset[] }) {
  const approved = shots.filter(shot => shot.status === 'approved').length;
  const referenceAssets = assets.filter(asset => asset.kind === 'image').slice(0, 3);
  return (
    <div className="page director-page">
      <ModuleToolbar eyebrow="导演台" title="镜头语言与主体一致性">
        <button className="primary" type="button" onClick={() => uiStore.set({ rightPanel: true })}>查看导演建议</button>
      </ModuleToolbar>
      <div className="director-grid">
        <section className="panel director-rhythm">
          <div className="panel-head"><div><h2>节奏诊断</h2><p>根据当前分镜读取镜头结构</p></div><Badge tone="blue">{shots.length} 镜</Badge></div>
          <div className="director-bars">{shots.map((shot, index) => <div className="director-bar-row" key={shot.id}><span>0{index + 1}</span><i style={{ width: `${Math.max(34, Math.min(100, Number(shot.duration.split(':')[1] ?? 4) * 18))}%` }} /><small>{shot.duration}</small></div>)}</div>
          <div className="director-summary"><span>已确认镜头 <b>{approved}</b></span><span>待导演复核 <b>{Math.max(0, shots.length - approved)}</b></span></div>
        </section>
        <section className="panel subject-board">
          <div className="panel-head"><div><h2>主体一致性</h2><p>参考图与角色档案</p></div><Badge tone="green">稳定</Badge></div>
          <div className="subject-grid">{referenceAssets.map(asset => <div className="subject-card" key={asset.id}><div className={`asset-cover asset-cover-${asset.kind}`}>✦</div><b>{asset.name}</b><small>{asset.meta}</small></div>)}{referenceAssets.length === 0 && <div className="subject-empty">暂无主体参考图</div>}</div>
        </section>
        <section className="panel director-suggestions">
          <div className="panel-head"><div><h2>导演建议</h2><p>先看建议，再决定是否执行</p></div><Badge tone="muted">待确认</Badge></div>
          <div className="suggestion-list"><article><b>提高开场镜节奏</b><p>把第一镜缩短 0.4 秒，保留结尾留白。</p><button type="button" onClick={() => uiStore.set({ selectedSection: 'shots' })}>查看镜头 →</button></article><article><b>统一主体参考</b><p>把主角参考图应用到后续三个镜头。</p><button type="button" onClick={() => uiStore.set({ selectedSection: 'assets' })}>打开素材库 →</button></article></div>
        </section>
      </div>
    </div>
  );
}

function Timeline({ shots, jobs }: { shots: Shot[]; jobs: GenerationJob[] }) {
  const completedJobs = jobs.filter(job => job.status === 'succeeded').length;
  return (
    <div className="page timeline-page">
      <ModuleToolbar eyebrow="剪辑与成片" title="时间线与导出">
        <button className="primary" type="button" onClick={() => uiStore.set({ selectedSection: 'generate' })}>查看生成队列</button>
      </ModuleToolbar>
      <div className="timeline-layout">
        <section className="panel timeline-editor">
          <div className="panel-head"><div><h2>主时间线</h2><p>按镜头排列当前版本</p></div><Badge tone="blue">{shots.length} 段</Badge></div>
          <div className="timeline-track">{shots.map((shot, index) => <div className={`timeline-clip clip-${index % 4}`} key={shot.id}><span>0{index + 1}</span><b>{shot.title}</b><small>{shot.duration}</small></div>)}</div>
          <div className="timeline-audio"><span>♫</span><div><b>参考节奏轨</b><small>已对齐 {shots.length} 个镜头</small></div></div>
        </section>
        <section className="panel export-panel">
          <div className="panel-head"><div><h2>成片状态</h2><p>从分镜到导出的当前进度</p></div><Badge tone={completedJobs > 0 ? 'green' : 'muted'}>{completedJobs > 0 ? '可预览' : '待生成'}</Badge></div>
          <div className="export-stat"><strong>{Math.round((shots.filter(shot => shot.status === 'approved').length / Math.max(1, shots.length)) * 100)}%</strong><span>镜头确认进度</span></div>
          <div className="progress-track"><div style={{ width: `${Math.round((completedJobs / Math.max(1, jobs.length)) * 100)}%` }} /></div>
          <div className="export-options-summary"><span>画幅 9:16</span><span>低清预览</span><span>小QTV水印</span></div>
          <button className="button button-primary" type="button" onClick={() => navigate('/create')}>进入四步导出流程 <span>↗</span></button>
        </section>
      </div>
    </div>
  );
}

function Generation({ projectId, jobs, refresh }: { projectId: string; jobs: GenerationJob[]; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<GenerationJob | null>(null);
  const start = async () => {
    setBusy(true);
    try {
      await ports.generation.create(projectId, '新建候选首帧', '图像生成');
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const confirmRetry = async () => {
    if (!pendingRetry) return;
    const job = pendingRetry;
    setPendingRetry(null);
    setBusy(true);
    try {
      await ports.generation.create(projectId, `${job.title} · 断点续作`, job.type);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const running = jobs.filter(job => job.status === 'running' || job.status === 'queued').length;
  const failed = jobs.filter(job => job.status === 'failed').length;

  return (
    <div className="page">
      <ModuleToolbar eyebrow="生成工作台" title="生成任务">
        <button className="primary" type="button" onClick={() => void start()} disabled={busy}>{busy ? '创建中…' : '＋ 新建任务'}</button>
      </ModuleToolbar>
      <div className="generation-layout">
        <div className="panel">
          <div className="panel-head">
            <div><h2>全部任务</h2><p>服务端队列每 3 秒自动轮询，失败任务可从断点重试</p></div>
            <div className="queue-badges">
              <Badge tone="blue">{running ? `${running} 个进行中` : '暂无进行中任务'}</Badge>
              <Badge tone="muted">{failed ? `${failed} 个失败` : '无失败任务'}</Badge>
            </div>
          </div>
          {jobs.map(job => <JobRow key={job.id} job={job} onRetry={item => setPendingRetry(item)} />)}
        </div>
        <div className="panel cost-card">
          <p className="eyebrow">队列概览</p>
          <strong>{jobs.length}</strong>
          <p>当前项目任务总数</p>
          <div className="progress-track"><div style={{ width: `${jobs.length ? Math.round((jobs.filter(job => job.status === 'succeeded').length / jobs.length) * 100) : 0}%` }} /></div>
          <button className="text-button" onClick={() => uiStore.set({ rightPanel: true })}>查看任务说明 →</button>
        </div>
      </div>

      {pendingRetry && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPendingRetry(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <p className="eyebrow">RESUME FROM CHECKPOINT</p>
            <h2>从断点重新提交？</h2>
            <p>「{pendingRetry.title}」将创建一条新的续作任务；失败的历史记录会保留，便于审计与排查。</p>
            <div className="modal-actions">
              <button className="button button-secondary" type="button" onClick={() => setPendingRetry(null)}>取消</button>
              <button className="button button-primary" type="button" onClick={() => void confirmRetry()}>确认断点续作</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Agent({ projectId }: { projectId: string }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([{ role: 'agent', content: '你好，我是项目助手。告诉我你想检查什么，或直接让我发起一个生成任务。' }]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const appendMessage = (role: 'agent' | 'user', content: string) => {
    setMessages(current => [...current, { role, content }]);
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    appendMessage('user', text);

    if (requiresAgentConfirmation(text)) {
      setPendingAction(text);
      appendMessage('agent', '这个动作会涉及生成额度或覆盖已有结果。我已准备好执行，但需要你先确认。');
      return;
    }

    await ports.agent.send(projectId, text);
    window.setTimeout(() => appendMessage('agent', '收到。我会检查当前项目并把结果同步到工作台。'), 350);
  };

  const cancelAction = () => {
    setPendingAction(null);
    appendMessage('agent', '已取消这次执行，原始结果保持不变。');
  };

  const confirmAction = async () => {
    if (!pendingAction || executing) return;
    const action = pendingAction;
    setPendingAction(null);
    setExecuting(true);
    try {
      if (/生成|重做|覆盖/.test(action)) {
        const type = /视频|片段/.test(action) ? '视频生成' : '图像生成';
        await ports.generation.create(projectId, `Agent 确认任务 · ${action.slice(0, 40)}`, type);
        appendMessage('agent', '已按你的确认把任务加入生成队列；队列状态会在生成工作台自动刷新。');
      } else {
        await ports.agent.send(projectId, action);
        appendMessage('agent', '已按你的确认执行；如需撤销，请在对应镜头卡片上选择恢复上一版。');
      }
    } catch (error) {
      appendMessage('agent', error instanceof Error ? `执行失败：${error.message}` : '执行失败，请稍后重试。');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="page agent-page">
      <ModuleToolbar eyebrow="Agent 工作台" title="项目助手">
        <button className="primary" type="button" onClick={() => { setPendingAction(null); setMessages([{ role: 'agent', content: '新的项目会话已准备好。' }]); }}>＋ 新会话</button>
      </ModuleToolbar>
      <div className="agent-panel panel">
        <div className="agent-header">
          <div className="agent-orb">✳</div>
          <div><b>小Q 助手</b><small>可调用项目、分镜、素材和生成任务</small></div>
          <Badge tone="green">在线</Badge>
        </div>
        <div className="chat-feed">
          {messages.map((message, index) => (
            <div className={`chat-message ${message.role}`} key={index}>
              <div className="chat-avatar">{message.role === 'agent' ? 'Q' : '你'}</div>
              <div><p>{message.content}</p><small>刚刚</small></div>
            </div>
          ))}
          {pendingAction && (
            <div className="agent-confirm" role="alertdialog" aria-label="确认高风险动作">
              <div><b>确认后才会执行</b><p>「{pendingAction}」可能消耗生成额度或覆盖已有结果。</p></div>
              <div className="agent-confirm-actions">
                <button type="button" onClick={cancelAction}>取消</button>
                <button className="primary" type="button" disabled={executing} onClick={() => void confirmAction()}>{executing ? "执行中…" : "确认执行"}</button>
              </div>
            </div>
          )}
        </div>
        <form className="composer" onSubmit={send}>
          <input value={input} onChange={event => setInput(event.target.value)} placeholder="描述你要完成的工作…" />
          <button className="primary" type="submit">发送 ↑</button>
        </form>
      </div>
    </div>
  );
}
function Placeholder({ section }: { section: string }) { const copy = section === '导演台' ? { title: '导演台还没开工', body: '这里会承载镜头节奏、角色连续性与生成决策。下一步先在参考片和分镜中确认制作方向。' } : section === '剪辑与成片' ? { title: '剪辑与成片还没开工', body: '这里会承载镜头排序、局部修复结果与最终导出。下一步先完成分镜和生成任务。' } : { title: '这个模块还没开工', body: `${section} 的界面会在后续版本中加入，当前可以先使用其他工作台工具。` }; return <div className="page"><ModuleToolbar eyebrow="工作区" title={section} /><div className="empty-state"><div className="empty-icon">◇</div><h2>{copy.title}</h2><p>{copy.body}</p></div></div>; }
function CommandPalette() { const ui = useUiStore(); if (!ui.commandPaletteOpen) return null; return <div className="modal-backdrop" onClick={() => uiStore.set({ commandPaletteOpen: false })}><div className="modal command-modal" onClick={e => e.stopPropagation()}><input autoFocus placeholder="搜索页面、镜头或命令…" onKeyDown={e => { if (e.key === 'Escape') uiStore.set({ commandPaletteOpen: false }); }} /><div className="command-list">{sections.slice(0,6).map(s => <button key={s[0]} onClick={() => { uiStore.set({ selectedSection: s[0], commandPaletteOpen: false }); }}>{s[2]}　{s[1]}<span>⌘ ↵</span></button>)}</div></div></div>; }
export function App() {
  const route = useRoute();
  const needsSession = ['workbenchHome', 'workbench'].includes(route.name) && !hasSession();

  useEffect(() => {
    if (!needsSession) return;
    const next = window.location.pathname + window.location.search;
    navigate(`/signup?next=${encodeURIComponent(next)}`, { replace: true });
  }, [needsSession]);

  if (route.name === 'landing') return <LandingPage />;
  if (route.name === 'not-found') return <NotFoundPage />;
  if (route.name === 'signup' || needsSession) return <SignupPage />;
  if (route.name === 'create') return <CreateFlow />;
  if (route.name === 'workbenchHome') return <ProjectListPage />;
  return <WorkbenchApp projectId={route.projectId} />;
}

/**
 * 工作台面（/workbench/:projectId）。
 *
 * 必须抽成独立组件：原来的两态硬编码把 useState/useEffect 写在提前 return 之后，
 * 违反 Hooks 规则 —— 路径一旦切换触发重渲染，React 会直接报
 * "Rendered more hooks than during the previous render"。
 * 路由化之后路径一定会变，所以这个坑必须在这里填掉。
 *
 * 项目切换改为写路由（replace，不留历史），useAppData 依赖 [projectId] 会自动重取。
 */
function WorkbenchApp({ projectId }: { projectId: string }) {
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof ports.projects.list>>>([]); const data = useAppData(projectId); useEffect(() => { void ports.projects.list().then(setProjects); }, []); const project = data.project; const projectName = project?.name ?? projects.find(p => p.id === projectId)?.name ?? '当前项目'; return <div className="app-shell workbench-scope"><Sidebar projectName={projectName} /><main className="workbench-main"><Topbar projectName={projectName} /><div className="workbench-stage"><Workspace projectId={projectId} data={data} /></div><WorkbenchBottomBar /></main><ToolDrawer projectName={projectName} /><CommandPalette /></div>;
}
