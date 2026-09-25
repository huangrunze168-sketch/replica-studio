import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ports } from '../../app/useAppData';
import { navigate, projectHref } from '../../app/router';
import type { ProjectSettings, ProjectSummary } from '../../ports';

type SortMode = 'updated' | 'name' | 'progress';

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

  return (
    <div className="app-shell workbench-scope project-list-page">
      <header className="workbench-topbar">
        <div className="workbench-breadcrumb"><a href="/">小QTV</a><span>/</span><strong>项目</strong></div>
        <div className="workbench-actions">
          <a className="chrome-link" href="/create">继续四步创作</a>
          <button className="chrome-button" type="button" onClick={() => setCreating(true)}>＋ 新建项目</button>
        </div>
      </header>

      <main className="project-list-main">
        <section className="project-list-head">
          <div>
            <p className="overline">PRODUCTION WORKBENCH</p>
            <h1>你的创作项目</h1>
            <p>从参考片到成片，项目、分镜、素材、生成与局部重做保持同一条链路。</p>
          </div>
          <div className="project-list-metrics">
            <span><b>{projects.length}</b>进行中</span>
            <span><b>{archived.length}</b>回收站</span>
            <span><b>{projects.reduce((sum, item) => sum + item.shots, 0)}</b>个镜头</span>
          </div>
        </section>

        <section className="project-toolbar" aria-label="项目筛选">
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索项目名称或描述…" />
          <label><span>排序</span><select value={sort} onChange={event => setSort(event.target.value as SortMode)}><option value="updated">最近更新</option><option value="name">项目名称</option><option value="progress">完成进度</option></select></label>
        </section>

        {notice && <div className="project-notice" role="status">{notice}</div>}

        <section className="project-grid" aria-label="进行中的项目">
          {loading && <div className="project-loading">正在读取项目…</div>}
          {!loading && visibleProjects.map(project => (
            <article className="project-card" key={project.id}>
              <div className="project-card-top">
                <div>
                  <p className="overline">{project.state}</p>
                  <h2>{project.name}</h2>
                  <p>{project.description}</p>
                </div>
                <span className="badge badge-green">{project.progress}%</span>
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
