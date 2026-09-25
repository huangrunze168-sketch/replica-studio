import { useEffect, useRef, useState, type ReactNode } from 'react';

const capabilities = [
  ['01', '参考片进来，结构看得见', '提取镜头节奏、景别结构、构图与情绪曲线，把参考变成一张可理解的制作地图。', '看看风格分析'],
  ['02', '音乐与节奏就是脚本', '从一句话创意开始，让主体、动作与声音在分镜里先对齐，再进入生成。', '浏览四步动线'],
  ['03', '每一镜都能局部修复', '锁定已经满意的镜头，只重做不满意的部分，不必整条视频推倒重来。', '查看修复方式'],
  ['04', '人工闸门在前，钱花在哪你看得见', '每一步都由你确认；涉及付费生成或覆盖结果时，系统会先停下来征求同意。', '了解生成闸门'],
];

/** 首屏主视觉里风格分析卡片的静态示例数据（四行 = 落地页承诺的四项分析）。 */
const heroAnalysis: Array<[string, number]> = [
  ['镜头节奏', 68],
  ['景别结构', 52],
  ['构图倾向', 74],
  ['情绪曲线', 41],
];

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { node.classList.add('is-visible'); observer.disconnect(); }
    }, { threshold: 0.12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`}>{children}</div>;
}


function WorkflowVisual({ index }: { index: number }) {
  const labels = ['参考片分析', '风格与主体', '分镜与镜头', '精修导出'];
  return (
    <div className={`workflow-visual workflow-visual-${index}`} role="img" aria-label={`${labels[index]}界面缩略图`}>
      {index === 0 && (
        <>
          <div className="mini-window">
            <div className="mini-window-bar"><i /><i /><i /><span>reference.mp4</span></div>
            <div className="mini-upload"><span>◌</span><b>拖入参考视频</b><small>自动分析镜头节奏</small></div>
          </div>
          <div className="mini-analysis"><span>镜头节奏</span><b>2.4s / 镜</b><i style={{ width: '68%' }} /></div>
        </>
      )}
      {index === 1 && (
        <>
          <div className="mini-window">
            <div className="mini-window-bar"><i /><i /><i /><span>direction</span></div>
            <div className="mini-swatches"><span /><span /><span /><span /></div>
            <div className="mini-subject"><b>主角 · 林</b><small>保持主体一致</small></div>
          </div>
          <div className="mini-tag-list"><span>电影纪实</span><span>知识感</span><span>情绪胶片</span></div>
        </>
      )}
      {index === 2 && (
        <>
          <div className="mini-window">
            <div className="mini-window-bar"><i /><i /><i /><span>storyboard</span></div>
            <div className="mini-storyboard">
              {[0, 1, 2, 3].map(frame => <div key={frame} className={frame < 2 ? 'is-locked' : ''}><span>0{frame + 1}</span><b>{frame < 2 ? '✓' : '✦'}</b></div>)}
            </div>
          </div>
          <div className="mini-progress"><i style={{ width: '74%' }} /><small>低清预览 74%</small></div>
        </>
      )}
      {index === 3 && (
        <>
          <div className="mini-window">
            <div className="mini-window-bar"><i /><i /><i /><span>export</span></div>
            <div className="mini-export"><span>9:16 · 低清预览</span><b>带小QTV水印</b><button type="button">导出 MP4 ↗</button></div>
          </div>
          <div className="mini-export-status"><span>✓</span> 合成完成 · 可进入工作台</div>
        </>
      )}
    </div>
  );
}
function CompareVisual({ tag }: { tag: string }) {
  return (
    <div className="compare-visual" role="img" aria-label={`${tag}参考视频与新作品对比`}>
      <div className="compare-pane">
        <span className="compare-label">参考视频</span>
        <div className="compare-frame ref-frame"><i /><i /><i /><b>REF · 00:15</b></div>
        <small>{tag} · 镜头语言提取</small>
      </div>
      <div className="compare-analysis">
        <span>STYLE MAP</span>
        <b>{tag}</b>
        <div><i style={{ width: '68%' }} /><small>镜头节奏</small></div>
        <div><i style={{ width: '54%' }} /><small>构图倾向</small></div>
        <div><i style={{ width: '43%' }} /><small>情绪曲线</small></div>
      </div>
      <div className="compare-pane">
        <span className="compare-label">你的新作品</span>
        <div className="compare-frame result-frame"><i /><i /><i /><b>NEW · 00:15</b></div>
        <small>低清预览 · 不复制参考内容</small>
      </div>
      <span className="compare-handle" aria-hidden="true">↔</span>
    </div>
  );
}

function WorkspacePreview() {
  return (
    <div className="workspace-preview" role="img" aria-label="专业工作台缩略图">
      <div className="preview-rail"><b>Q</b><span>⌂</span><span>▦</span><span>◇</span><span>✦</span></div>
      <div className="preview-main">
        <div className="preview-top"><span>小QTV / 项目工作台</span><em>生成队列 2</em></div>
        <div className="preview-body">
          <div className="preview-card"><b>分镜</b><strong>12</strong><small>已确认 8</small></div>
          <div className="preview-card"><b>素材</b><strong>28</strong><small>主体一致</small></div>
          <div className="preview-card"><b>生成任务</b><strong>2</strong><small>运行中</small></div>
          <div className="preview-list"><span>镜头 01 · 霓虹下的脚步</span><span>镜头 02 · 橱窗倒影</span><span>镜头 03 · 楼梯间</span></div>
        </div>
      </div>
    </div>
  );
}
function SplitText({ text, accent = false }: { text: string; accent?: boolean }) {
  return <span className={accent ? 'split-text split-text-accent' : 'split-text'} aria-label={text}>{Array.from(text).map((character, index) => <span className="split-char" aria-hidden="true" style={{ '--char-index': index } as React.CSSProperties} key={`${character}-${index}`}>{character === ' ' ? '\u00a0' : character}</span>)}</span>;
}

export function LandingPage() {
  const [activeTag, setActiveTag] = useState('知识类口播');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [demoOpen, setDemoOpen] = useState(false);
  const tags = ['知识类口播', '产品广告', '情绪化剧情片', '系列内容'];
  return <div className="marketing-page">
    <header className="marketing-nav">
      <a className="marketing-brand" href="/" aria-label="小QTV 首页"><span className="brand-symbol">Q</span><span>小QTV</span></a>
      <a className="nav-cta" href="/signup">开始创作 <span>↗</span></a>
    </header>

    <main>
      <section className="marketing-hero section-shell">
        <div className="shape-grid" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i style={{ '--shape-index': index } as React.CSSProperties} key={index} />)}</div>
        <div className="hero-text">
          <p className="overline">小QTV / VIDEO PRODUCTION WORKSTATION</p>
          <h1><SplitText text="参考一条视频，" /><SplitText text="快速做出" accent /><br /><SplitText text="属于你的新作品。" /></h1>
          <p className="hero-lede">不用学复杂节点，也能做出有风格的短视频。小QTV 提取镜头语言与制作方法，不复制参考作品的具体内容。</p>
          <button className="button button-secondary" type="button" onClick={() => setDemoOpen(true)}>观看 60 秒演示 <span>▶</span></button>
          <p className="hero-note">注册即获少量生成额度 · 免费版带水印 · 每一步由你确认</p>
        </div>
        <div className="hero-visual" id="demo" role="img" aria-label="参考片与新作品并排示意，中间浮出风格分析卡片">
          <div className="hero-stage">
            <div className="hero-frame is-ref">
              <div className="hero-frame-bar"><i /><i /><i /></div>
              <div className="hero-frame-body">
                <span className="hero-shot is-wide" /><span className="hero-shot" /><span className="hero-shot" /><span className="hero-shot is-wide" />
              </div>
            </div>
            <div className="hero-frame is-new">
              <div className="hero-frame-bar"><i /><i /><i /></div>
              <div className="hero-frame-body">
                <span className="hero-shot is-wide" /><span className="hero-shot" /><span className="hero-shot" /><span className="hero-shot is-wide" />
              </div>
            </div>
            <div className="hero-analysis">
              <p className="overline">STYLE ANALYSIS</p>
              <h3>风格分析</h3>
              <ul className="hero-analysis-list">{heroAnalysis.map(([label, width]) => <li key={label}><span className="hero-analysis-label">{label}</span><div className="hero-analysis-track"><i style={{ width: `${width}%` }} /></div></li>)}</ul>
            </div>
          </div>
          <span className="hero-chip chip-top">原创结果</span>
          <span className="hero-chip chip-bottom">参考方法</span>
        </div>
      </section>

      <section className="trust-strip"><div className="section-shell trust-inner"><span>为独立创作者而做</span><span>参考 → 分析 → 分镜 → 局部修复</span><span>纯云端 · 桌面优先</span></div></section>

      <section className="section-shell section-block" id="method"><Reveal><div className="section-intro"><p className="overline">A METHOD YOU CAN SEE</p><h2>把参考变成方法，<br /><em>把方法变成镜头。</em></h2><p>四段能力，围绕同一个创作闭环：先理解，再生成；先确认，再花费。</p></div></Reveal>
        <div className="capability-grid">{capabilities.map(([number, title, copy, cta]) => <Reveal key={number} className="capability-card"><span className="card-number">{number}</span><h3>{title}</h3><p>{copy}</p><a href="#workflow">{cta} <span>↗</span></a></Reveal>)}</div>
      </section>

      <section className="section-shell classifier-block"><Reveal><div className="section-intro compact"><p className="overline">MAKE IT YOURS</p><h2>从你正在做的内容开始。</h2><p>先选一个方向，进入对应的示例项目；也可以直接上传自己的参考片。</p></div><div className="tag-list" role="tablist" aria-label="创作类型">{tags.map(tag => <button key={tag} role="tab" aria-selected={activeTag === tag} className={activeTag === tag ? 'tag active' : 'tag'} onClick={() => setActiveTag(tag)}>{tag}</button>)}</div><div className="classifier-result"><div><p className="overline">CURRENT EXAMPLE</p><h3>{activeTag}</h3><p>先看参考视频与新作品的并排对比，再决定是否开始创作。</p><a href="/create" className="text-link">打开示例项目 ↗</a></div><CompareVisual tag={activeTag} /></div></Reveal></section>

      <section className="section-shell section-block value-block"><Reveal><div className="section-intro"><p className="overline">THE CONTROL IS YOURS</p><h2>不是把整条片交给黑盒，<br /><em>而是把每一镜握在手里。</em></h2></div><div className="value-grid"><article><strong>锁定满意镜头</strong><p>满意的画面不会被下一次生成覆盖。</p></article><article><strong>局部重做</strong><p>只改人物、动作、构图或情绪，不推翻整片。</p></article><article><strong>每一步确认</strong><p>涉及付费生成或覆盖结果时，先由你确认。</p></article><article><strong>方法可解释</strong><p>风格分析卡片让参考片的结构看得见。</p></article></div></Reveal></section>


      <section className="section-shell section-block" id="workflow"><Reveal><div className="section-intro"><p className="overline">FROM REFERENCE TO FINAL CUT</p><h2>四步出一支片。</h2><p>全流程自动化，零经验也能快速产出专业级成片。</p></div><div className="workflow-grid">{['上传参考片或音乐并分析', '定风格与角色 / 主体', '生成并调整分镜', '精修与导出'].map((step, index) => <article className="workflow-step" key={step}><span>0{index + 1}</span><div className="step-visual"><WorkflowVisual index={index} /></div><h3>{step}</h3><p>{['输入一句话也能开始，系统先读懂参考。', '用预设、文字或参考素材组合你的视觉方向。', '先看低清结果，再锁定满意镜头。', '只重做局部，选择画幅与分辨率后导出。'][index]}</p></article>)}</div></Reveal></section>

      <section className="section-shell section-block proof-block"><Reveal><div className="proof-layout"><div className="proof-copy"><p className="overline">A WORKSPACE THAT GROWS WITH YOU</p><h2>从一条示例片，<br /><em>走进你的工作台。</em></h2><p>消费级入口先让你完成一支片；复杂需求再升级到专业工作台。项目、分镜、素材和生成任务保持同一条链路。</p><a className="text-link" href="/create">进入示例项目 ↗</a></div><WorkspacePreview /></div></Reveal></section>

      <section className="section-shell pricing-block"><Reveal><div className="section-intro compact"><p className="overline">START SMALL, KEEP GOING</p><h2>免费开始，按你的方式继续。</h2><p>主推订阅，生成额度与单项目付费作为补充；价格会在注册后清楚展示。</p></div><div className="pricing-table"><div className="pricing-row pricing-head"><span>能力</span><b>免费体验</b><b>订阅方案</b><b>按量 / 单项目</b></div>{['生成额度', '视频规格', '局部重做', '导出'].map((item, index) => <div className="pricing-row" key={item}><span>{item}</span><span>{['少量赠送', '低清 · 最长 15 秒', '体验 1 次', '带小QTV水印'][index]}</span><span>{['按方案提供', '更高规格', '持续创作', '按方案导出'][index]}</span><span>{['按实际生成量', '按需选择', '按项目计费', '按项目交付'][index]}</span></div>)}</div></Reveal></section>

      <section className="section-shell section-block faq-block"><Reveal><div className="section-intro compact"><p className="overline">FAQ</p><h2>开始之前，先回答几个问题。</h2></div><div className="faq-list">{[['会复制参考视频吗？', '不会。小QTV提取的是镜头语言与制作方法，不复制参考作品的具体内容。请确保你拥有上传素材的使用权。'], ['我需要会用专业节点吗？', '不需要。你可以从一句话创意开始，每一步确认后继续。复杂项目再进入专业工作台。'], ['可以只改一个镜头吗？', '可以。锁定满意镜头后，只对不满意的镜头发起局部重做。'], ['什么时候会产生费用？', '涉及付费生成或覆盖已有结果时，系统会先提示并等待你的确认。']].map(([question, answer], index) => <div className={`faq-item ${openFaq === index ? 'open' : ''}`} key={question}><button onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}><span>{question}</span><b>{openFaq === index ? '−' : '+'}</b></button>{openFaq === index && <p>{answer}</p>}</div>)}</div></Reveal></section>
    </main>
      {demoOpen && (
        <div className="demo-backdrop" role="presentation" onClick={() => setDemoOpen(false)}>
          <div className="demo-modal" role="dialog" aria-modal="true" aria-labelledby="demo-title" onClick={event => event.stopPropagation()}>
            <button className="demo-close" type="button" aria-label="关闭演示" onClick={() => setDemoOpen(false)}>×</button>
            <p className="overline">60 SECOND DEMO · PLACEHOLDER CUT</p>
            <h2 id="demo-title">从参考到成片，四步看清方法。</h2>
            <p className="demo-lede">首版使用分镜脚本与占位视频；真实录屏接入后，这条演示会替换成完整操作过程。</p>
            <div className="demo-progress" aria-label="演示流程">
              {['分析参考', '生成分镜', '生成镜头', '合成视频'].map((step, index) => (
                <span key={step}><b>0{index + 1}</b>{step}</span>
              ))}
            </div>
            <div className="demo-screen">
              <div className="demo-screen-main">
                <div className="demo-screen-label">参考视频</div>
                <div className="demo-screen-placeholder">占位视频：雨夜街道参考片</div>
              </div>
              <div className="demo-screen-arrow" aria-hidden="true">→</div>
              <div className="demo-screen-main is-result">
                <div className="demo-screen-label">新作品</div>
                <div className="demo-screen-placeholder">占位视频：15 秒原创口播</div>
              </div>
            </div>
            <div className="demo-analysis">
              <span>镜头节奏 <b>68</b></span>
              <span>景别结构 <b>52</b></span>
              <span>情绪曲线 <b>41</b></span>
            </div>
            <div className="demo-actions">
              <button className="button button-secondary" type="button" onClick={() => setDemoOpen(false)}>稍后再看</button>
              <a className="button button-primary" href="/create" onClick={() => setDemoOpen(false)}>开始四步创作 <span>↗</span></a>
            </div>
          </div>
        </div>
      )}
    <footer className="marketing-footer"><div className="section-shell footer-inner"><span>小QTV · 懂镜头语言的创作搭档</span><a href="/signup">开始创作 ↗</a></div></footer>
  </div>;
}
