import type { MouseEvent } from 'react';
import { navigate } from '../../app/router';
import { endSession, readSession } from '../auth/session';

/**
 * 应用左栏（对标站 的 shadcn sidebar）。
 *
 * ★ 为什么要抽出来：对标站 的 **`/` 也有这一栏** —— 它是 app shell 的一部分，
 *   不是工作台专属。我们此前只在 `/workbench` 渲染它，于是落地页的 hero 变成全宽 1412，
 *   而线上是「视口 − 256」的 1156 内嵌。这就是「布局不一样」的最大来源。
 *   现在两个页面共用同一份标记，宽度/排版由 `.project-rail` 的权威度量统一决定。
 *
 * ★ 度量依据（对标站线上实测，细节见 components.css 的 `.project-rail` 注释）：
 *   栏宽固定 256px、条目标高 36px、圆角 10px、字号 14px、内距 8px、条目间距 1px、
 *   选中态 `bg-sidebar-accent` + `.5px` inset 细边。
 */

export type RailKey = 'home' | 'projects' | 'create' | 'canvas' | 'assets';

const NAV: Array<[RailKey, string, string, string]> = [
  // [key, 文字, 图标字形, 图标配色类]
  ['home', '首页', '◆', 'dot-1'],
  ['projects', '项目', '▦', 'dot-2'],
  ['create', '四步创作', '✎', 'dot-3'],
  ['canvas', '分镜画布', '◫', 'dot-4'],
  ['assets', '素材库', '▤', 'dot-5'],
];

const TOOLS: Array<[string, string, string]> = [
  // [文字, 图标字形, 图标配色类] —— 配色复用 components.css 里既有的 .rail-dot.dot-N
  ['图像生成', '◐', 'dot-3'],
  ['视频生成', '▶', 'dot-4'],
  ['高清放大', '⤢', 'dot-5'],
  ['局部重做', '✂', 'dot-6'],
];

export function ProjectRail({ active }: { active?: RailKey }) {
  const session = readSession();

  const signOut = (event: MouseEvent<HTMLButtonElement>) => {
    if (!session) return;                       // 未登录时按钮是 <a>，不会走到这里
    event.preventDefault();
    endSession();
    navigate('/');
  };

  const isActive = (key: RailKey) => active === key;

  return (
    <aside className="project-rail" aria-label="主导航">
      <a className="rail-brand" href="/" aria-label="返回小QTV首页" title="返回首页">
        <span className="rail-mark" aria-hidden="true">Q</span>
        <span className="rail-brand-name">小QTV</span>
        <span className="rail-chev" aria-hidden="true">▾</span>
      </a>

      <nav className="rail-nav" aria-label="工作区">
        {NAV.map(([key, label, glyph, dot]) => (
          <a
            key={key}
            className={'rail-item' + (isActive(key) ? ' active' : '')}
            href={key === 'home' ? '/' : '/workbench'}
            aria-current={isActive(key) ? 'page' : undefined}
          >
            <span className={`rail-dot ${dot}`} aria-hidden="true">{glyph}</span>
            <span className="rail-label">{label}</span>
          </a>
        ))}
      </nav>

      <nav className="rail-nav" aria-label="生成工具">
        <p className="rail-group">工具</p>
        {TOOLS.map(([label, glyph, dot]) => (
          <a className="rail-item" key={label} href="/create">
            <span className={`rail-dot ${dot}`} aria-hidden="true">{glyph}</span>
            <span className="rail-label">{label}</span>
          </a>
        ))}
        <a className="rail-item rail-more" href="/create">
          <span className="rail-dot dot-ghost" aria-hidden="true">…</span>
          <span className="rail-label">更多</span>
        </a>
      </nav>

      <div className="rail-foot">
        <div className="rail-foot-group">
          <a className="rail-item rail-promo" href="/create">
            <span className="rail-label">定价</span>
            <b className="rail-off">40% off</b>
          </a>
          <a className="rail-item rail-plain" href="/">
            <span className="rail-label">企业版</span>
          </a>
        </div>
        <a className="rail-item" href="/create">
          <span className="rail-dot dot-agent" aria-hidden="true">＋</span>
          <span className="rail-label">小QTV Agent</span>
        </a>
        {session ? (
          <button
            className="rail-signin"
            type="button"
            onClick={signOut}
            title={`退出登录 · ${session.email || '体验模式'}`}
          >
            退出登录
          </button>
        ) : (
          <a className="rail-signin" href="/signup">登录</a>
        )}
      </div>
    </aside>
  );
}
