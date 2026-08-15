"use client";

import { useMemo, useState } from "react";

const indexes = [
  ["上证指数", "3,927.18", "+0.01%", "48,70 32,50 28,58 41,45 55,44 63,40 76,48 91,43 100,47"],
  ["深证成指", "14,354.31", "+0.45%", "48,62 34,55 28,64 43,48 58,45 72,38 88,48 101,42"],
  ["创业板指", "3,626.30", "+1.12%", "48,66 35,57 30,61 42,50 56,53 70,43 84,40 101,31"],
  ["科创50", "1,717.68", "0.00%", "48,39 36,45 26,44 42,49 58,47 74,54 89,51 101,55"],
  ["沪深300", "4,665.88", "+0.04%", "48,60 35,62 26,58 42,48 55,51 70,43 84,39 101,35"],
  ["中证红利", "6,291.45", "+0.31%", "48,53 35,47 26,50 42,43 55,38 70,42 84,33 101,31"],
];

const courses = [
  { level: "基础", title: "收益、风险与复利", desc: "先弄懂收益率、年化、波动率和回撤，再谈投资。", lessons: 8, color: "mint" },
  { level: "基础", title: "股票与市场规则", desc: "股价、市值、分红、除权除息与 A 股交易制度。", lessons: 10, color: "cyan" },
  { level: "进阶", title: "读懂财务报表", desc: "利润表、资产负债表、现金流量表的勾稽关系。", lessons: 12, color: "orange" },
  { level: "进阶", title: "估值方法与陷阱", desc: "PE、PB、PEG、DCF：适用场景比公式更重要。", lessons: 11, color: "pink" },
  { level: "高阶", title: "组合与风险管理", desc: "相关性、仓位、再平衡、凯利公式与压力测试。", lessons: 9, color: "violet" },
  { level: "高阶", title: "宏观与资产定价", desc: "利率、通胀、信用周期如何传导到资产价格。", lessons: 10, color: "blue" },
];

function Spark({ points, down = false }: { points: string; down?: boolean }) {
  return <svg className="spark" viewBox="0 0 110 80" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={down ? "#20c7b0" : "#f25f82"} strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg>;
}

export default function Home() {
  const [tab, setTab] = useState<"dashboard" | "strategy" | "learn">("dashboard");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("全部");
  const [principal, setPrincipal] = useState(100000);
  const [rate, setRate] = useState(8);
  const [years, setYears] = useState(10);
  const [menu, setMenu] = useState(false);
  const [updated, setUpdated] = useState("11:21");
  const total = useMemo(() => principal * Math.pow(1 + rate / 100, years), [principal, rate, years]);
  const filtered = courses.filter(c => (level === "全部" || c.level === level) && (c.title + c.desc).includes(query));

  return (
    <main>
      <header>
        <button className="menu" onClick={() => setMenu(!menu)} aria-label="展开导航">☰</button>
        <div className="brand"><span>↗</span><b>WEALTH OS</b><small>投资决策与学习系统</small></div>
        <nav className={menu ? "show" : ""}>
          <button className={tab === "dashboard" ? "active" : ""} onClick={() => {setTab("dashboard");setMenu(false)}}>决策台</button>
          <button className={tab === "strategy" ? "active" : ""} onClick={() => {setTab("strategy");setMenu(false)}}>策略室</button>
          <button className={tab === "learn" ? "active" : ""} onClick={() => {setTab("learn");setMenu(false)}}>学习中心</button>
        </nav>
        <div className="head-actions"><span className="status">A股已收盘 · 演示数据</span><span className="sync">同步 {updated}</span><button onClick={() => setUpdated(new Date().toLocaleTimeString("zh-CN", {hour:"2-digit",minute:"2-digit"}))}>↻ 刷新</button></div>
      </header>

      {tab === "dashboard" && <section className="page dashboard">
        <div className="action-strip"><span className="pulse"/><b>今日行动</b><strong>保持仓位，等待确认</strong><p>市场强度震荡，上涨占比 44.1%；执行纪律优先于短期波动。</p><div><small>趋势</small> 中期 · 偏强　<small>风险</small> 58 / 100</div></div>
        <div className="hero-grid">
          <article className="breadth panel"><div><small>今日盘面强弱 · 沪深两市</small><h2>震荡</h2><p>上涨 2,400 / 下跌 2,942</p></div><div className="gauge"><b>44.1%</b><span>上涨占比</span></div><div className="turnover"><small>两市成交额</small><b>2.14<em>万亿</em></b><span>较昨日放量</span></div></article>
          <article className="positions panel"><div className="section-head"><span><small>我的持仓</small><h3>仓位与当日表现</h3></span><button>持仓明细 →</button></div><div className="metrics"><div><small>账户估算</small><b>670.00万</b></div><div><small>已赚当日盈亏</small><b className="up">+25.95万 / +3.87%</b></div><div><small>涨跌分布</small><b>涨 10　跌 2</b></div><div><small>最大涨幅</small><b className="up">亨通光电 +10.01%</b></div></div></article>
        </div>
        <div className="section-title"><span><small>MARKET PULSE</small><h2>首屏分时框</h2></span><button>自定义</button></div>
        <div className="index-grid">{indexes.map((x,i)=><article className="index-card" key={x[0]}><div><span>{x[0]}</span><b className={i===3?"flat":"up"}>{x[2]}</b></div><strong>{x[1]}</strong><Spark points={x[3]} down={i===3}/></article>)}</div>
        <div className="lower-grid"><article className="chart panel"><div className="section-head"><div><small>上证指数 · 分时</small><h3>3,927.18 <em>+0.01%</em></h3></div><span className="tag">分时　日K　周K</span></div><svg viewBox="0 0 900 230" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f25f82" stopOpacity=".22"/><stop offset="1" stopColor="#f25f82" stopOpacity="0"/></linearGradient></defs><path d="M0 145 C55 120 80 170 135 132 S210 86 260 115 S345 155 405 121 S480 147 530 104 S620 62 680 91 S750 120 810 77 S870 56 900 72 L900 230 L0 230Z" fill="url(#fill)"/><path d="M0 145 C55 120 80 170 135 132 S210 86 260 115 S345 155 405 121 S480 147 530 104 S620 62 680 91 S750 120 810 77 S870 56 900 72" fill="none" stroke="#f25f82" strokeWidth="3"/></svg></article>
          <article className="news panel"><div className="section-head"><h3>盘中异动</h3><button>更多</button></div><div className="news-item"><time>11:20</time><b>算力板块走强，成交活跃度提升</b><p>关注持续性与午后量能，不追逐单一脉冲。</p></div><div className="news-item"><time>10:46</time><b>红利资产表现分化</b><p>长端利率变化仍是估值锚的重要变量。</p></div></article></div>
      </section>}

      {tab === "strategy" && <section className="page strategy">
        <div className="eyebrow">STRATEGY ENGINE / 06</div><div className="strategy-title"><div><h1>十年成长止盈系统</h1><p>把估值、趋势和情绪拆开看，让“什么都不做”也成为明确动作。</p></div><span className="cached">缓存 · 08/15 11:21</span></div>
        <article className="decision panel"><small>现在该做什么</small><h2>什么都不用做</h2><p>创业板 PE（TTM）历史分位 55.2%，策略阶段为「止盈未启动」。估值偏高不等于卖出信号，本阶段不产生减仓动作。</p><div className="decision-metrics"><div><b>55.2%</b><span>创业板 PE 分位</span></div><div><b>止盈未启动</b><span>当前策略阶段</span></div><div><b>1<em>/3</em></b><span>估值 + 情绪 + 趋势</span></div><div><b>4.8<em>pp</em></b><span>距 60% 阈门</span></div></div></article>
        <article className="peg panel"><b>PEG 校验 <strong>0.77</strong></b><p>PE 44.15 ÷ 预期增速 57.6% = <span>贵得有道理（PEG＜1）</span></p></article>
        <article className="position-map panel"><h3>我在止盈系统的哪个位置</h3><p>横轴 = 创业板指 PE-TTM 近 10 年历史分位；60 / 80 / 90% 是三道纪律阈门</p><div className="bar"><i style={{width:"55.2%"}}/><mark style={{left:"55.2%"}}>当前 55.2%</mark></div><div className="bar-labels"><span>0%</span><span>60% 小幅止盈</span><span>80% 移动止盈</span><span>90% 系统风控</span></div></article>
      </section>}

      {tab === "learn" && <section className="page learn">
        <div className="learn-hero"><div><span className="eyebrow">WEALTH ACADEMY</span><h1>把投资学明白，<br/><em>再把钱投出去。</em></h1><p>从第一笔投资到资产配置：每个知识点都有白话解释、真实情境、计算案例与练习。</p></div><div className="progress-card"><div className="ring"><b>18%</b></div><div><small>你的学习进度</small><h3>基础篇 · 第 5 课</h3><p>连续学习 4 天　🔥</p><button>继续学习 →</button></div></div></div>
        <div className="learn-toolbar"><input aria-label="搜索知识点" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索：PE、复利、回撤、现金流…"/><div>{["全部","基础","进阶","高阶"].map(x=><button key={x} onClick={()=>setLevel(x)} className={level===x?"active":""}>{x}</button>)}</div></div>
        <div className="course-grid">{filtered.map((c,i)=><article className={`course ${c.color}`} key={c.title}><div><span>{String(i+1).padStart(2,"0")}</span><small>{c.level} · {c.lessons} 课</small></div><h3>{c.title}</h3><p>{c.desc}</p><button onClick={()=>document.getElementById("lesson")?.scrollIntoView({behavior:"smooth"})}>查看章节 →</button></article>)}</div>
        <div id="lesson" className="lesson-grid"><article className="lesson panel"><span className="eyebrow">精选知识点 01</span><h2>复利：收益也会产生收益</h2><p className="lead">复利不是“每年多赚一点”，而是把上一期收益加入本金，让下一期的收益基数变大。时间越长，曲线越陡。</p><div className="formula">终值 = 本金 ×（1 + 年收益率）<sup>年数</sup></div><h3>计算案例</h3><p>投入 10 万元，年化收益率 8%，持有 10 年且收益持续再投资：</p><div className="math"><span>100,000 × (1 + 8%)<sup>10</sup></span><b>= 215,892 元</b></div><div className="tip"><b>容易忽略：</b>现实收益不会匀速增长，费用、税收和回撤都会降低最终结果。年化收益率是比较工具，不是收益承诺。</div></article>
          <aside className="calculator panel"><span className="eyebrow">互动计算器</span><h2>我的复利结果</h2><label>初始本金（元）<input type="number" value={principal} onChange={e=>setPrincipal(Number(e.target.value))}/></label><label>预期年化收益率 <input type="range" min="0" max="20" value={rate} onChange={e=>setRate(Number(e.target.value))}/><b>{rate}%</b></label><label>投资年限 <input type="range" min="1" max="40" value={years} onChange={e=>setYears(Number(e.target.value))}/><b>{years} 年</b></label><div className="result"><small>预计终值</small><strong>¥ {Math.round(total).toLocaleString("zh-CN")}</strong><span>其中收益 ¥ {Math.round(total-principal).toLocaleString("zh-CN")}</span></div><p className="disclaimer">仅作教学演算，不构成收益预测或投资建议。</p></aside></div>
      </section>}
      <footer><span>WEALTH OS · 决策有纪律，学习有路径</span><span>原型演示数据 · 不构成投资建议</span></footer>
    </main>
  );
}
