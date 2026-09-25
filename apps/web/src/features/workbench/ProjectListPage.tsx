import { FormEvent, useEffect, useState } from 'react';
import { ports } from '../../app/useAppData';
import { navigate, projectHref } from '../../app/router';
import type { ProjectSummary } from '../../ports';

export function ProjectListPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    void ports.projects.list().then(items => {
      setProjects(items);
      setLoading(false);
    });
  }, []);

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    const title = name.trim();
    if (!title) return;
    const project = await ports.projects.create({
      name: title,
      description: description.trim() || '尚未填写项目描述',
    });
    setProjects(current => [project, ...current]);
    setCreating(false);
    setName('');
    setDescription('');
    navigate(projectHref(project.id));
  };

  const activeProjects = projects.filter(project => project.status === 'active');
  const archivedProjects = projects.filter(project => project.status === 'archived');

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
            <span><b>{activeProjects.length}</b>进行中</span>
            <span><b>{archivedProjects.length}</b>已归档</span>
            <span><b>{projects.reduce((sum, item) => sum + item.shots, 0)}</b>个镜头</span>
          </div>
        </section>

        <section className="project-grid" aria-label="进行中的项目">
          {loading && <div className="project-loading">正在读取项目…</div>}
          {!loading && activeProjects.map(project => (
            <article className="project-card" key={project.id}>
              <div className="project-card-top">
                <div>
                  <p className="overline">{project.status === 'active' ? 'IN PRODUCTION' : 'ARCHIVED'}</p>
                  <h2>{project.name}</h2>
                  <p>{project.description}</p>
                </div>
                <span className="badge badge-green">{project.progress}%</span>
              </div>
              <div className="project-progress"><i style={{ width: `${project.progress}%` }} /></div>
              <div className="project-card-meta">
                <span>{project.shots} 个镜头</span>
                <span>{project.assets} 个素材</span>
                <span>更新于 {project.updatedAt}</span>
              </div>
              <button className="project-open" type="button" onClick={() => navigate(projectHref(project.id))}>打开工作台 <span>↗</span></button>
            </article>
          ))}
        </section>

        {archivedProjects.length > 0 && (
          <section className="project-archive">
            <div className="project-section-title"><h2>已归档</h2><p>保留历史结果，不参与当前生成队列。</p></div>
            <div className="archive-list">
              {archivedProjects.map(project => (
                <button type="button" key={project.id} onClick={() => navigate(projectHref(project.id))}>
                  <div><b>{project.name}</b><small>{project.description}</small></div>
                  <span>{project.updatedAt}</span>
                  <span className="badge">查看</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      {creating && (
        <div className="modal-backdrop" role="presentation" onClick={() => setCreating(false)}>
          <form className="modal project-create-modal" onSubmit={createProject} onClick={event => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="关闭" onClick={() => setCreating(false)}>×</button>
            <p className="overline">NEW PROJECT</p>
            <h2>新建创作项目</h2>
            <label><span>项目名称</span><input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="例如：城市夜跑 · 产品短片" /></label>
            <label><span>一句话描述</span><textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} placeholder="说明你想做的内容与风格方向" /></label>
            <button className="primary full" type="submit" disabled={!name.trim()}>创建并进入工作台</button>
          </form>
        </div>
      )}
    </div>
  );
}
