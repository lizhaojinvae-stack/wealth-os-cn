"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { economicsBookLessons } from "./economics-book-lessons";

type Quote = {
  code: string;
  market: number;
  name: string;
  price: number;
  changePct: number;
  change: number;
  volume: number;
  amount: number;
  turnover: number;
  pe: number;
  pb: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  marketCap: number;
  floatMarketCap: number;
  mainNetInflow: number;
  volumeRatio: number;
};
type AlertLevel = "critical" | "warning" | "info";
type MarketAlert = {
  id: string;
  code: string;
  name: string;
  level: AlertLevel;
  rule: string;
  title: string;
  detail: string;
  value: number;
  threshold: number;
  direction: "bull" | "bear" | "neutral";
  createdAt: string;
  read: boolean;
};
type AlertSettings = {
  enabled: boolean;
  desktopNotifications: boolean;
  changePct: number;
  instantMovePct: number;
  volumeRatio: number;
  turnover: number;
  mainFlowYi: number;
  holdingReturnPct: number;
  cooldownMinutes: number;
};
type RadarBoard = { kind: "industry" | "concept"; code: string; name: string; changePct: number; turnover: number; marketCap: number; mainNetInflow: number; upCount: number; downCount: number; leaderName: string; leaderCode: string; leaderChangePct: number; heatScore: number; components: { momentum: number; breadth: number; flow: number; activity: number } };
type LimitUpStock = { code: string; market: number; name: string; price: number; changePct: number; amount: number; floatMarketCap: number; marketCap: number; turnover: number; streak: number; firstSealTime: string; lastSealTime: string; sealedAmount: number; openCount: number; industry: string; streakDays: number };
type RadarData = { source: string; fetchedAt: string; tradingDate: string; methodology: { formula: string; note: string }; boards: { industry: RadarBoard[]; concept: RadarBoard[] }; limitUp: { total: number; stocks: LimitUpStock[]; ladder: { level: number; stocks: LimitUpStock[] }[]; industries: { name: string; count: number; maxStreak: number; sealedAmount: number }[] } };
type ScreenerRow = { code: string; market: number; name: string; price: number; changePct: number; change: number; amount: number; turnover: number; pe: number; volumeRatio: number; marketCap: number; floatMarketCap: number; pb: number; mainNetInflow: number };
type ScreenerFilters = { minChange: number; maxChange: number; minTurnover: number; minAmountYi: number; minCapYi: number; maxPe: number; maxPb: number; minVolumeRatio: number; minMainFlowYi: number; sort: "changePct" | "amount" | "turnover" | "marketCap" | "mainNetInflow" | "volumeRatio"; direction: "asc" | "desc" };
type SavedScreener = { id: string; name: string; filters: ScreenerFilters; createdAt: string };
type TradePlan = { code: string; name: string; price?: number; changePct?: number; turnover?: number; amount?: number; status: "confirmed" | "watch" | "neutral" | "invalid" | "insufficient"; statusLabel: string; score: number | null; asOf?: string; adjustment?: string; sampleSize?: number; marketChange?: number; dataHealth?: "ok" | "stale" | "insufficient"; structureBroken?: boolean; trendWeak?: boolean; components?: { market: number; midTrend: number; shortStructure: number; volumePrice: number; momentum: number; riskLiquidity: number }; indicators?: { ma5: number; ma10: number; ma20: number; ma60: number; ma120: number; volumeRatio: number; atr14: number }; levels?: { entryTrigger: number; pullbackLow: number; pullbackHigh: number; invalidPrice: number; pressure: number; riskReward: number | null }; rules?: { confirm: string; pullback: string; invalid: string }; reasons: string[] };
type PlanEvent = { id: string; code: string; name: string; from: string; to: string; createdAt: string; price?: number };
type BacktestResult = { source: string; fetchedAt: string; code: string; name: string; range: { start: string; end: string; samples: number }; parameters: { initial: number; feeRate: number; slippage: number; entry: string; exit: string; lotSize: number }; metrics: { finalEquity: number; totalReturn: number; annualized: number; maxDrawdown: number; trades: number; winRate: number; profitFactor: number | null; benchmarkReturn: number }; curve: { date: string; equity: number; benchmark: number; drawdown: number }[]; trades: { entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; shares: number; pnl: number; returnPct: number; holdingDays: number; reason: string }[] };
type SimPosition = { code: string; name: string; shares: number; available: number; cost: number; buyDate: string };
type SimOrder = { id: string; code: string; name: string; side: "buy" | "sell"; orderType: "market" | "limit"; price: number; quantity: number; status: "pending" | "filled" | "cancelled" | "rejected"; createdAt: string; filledAt?: string; filledPrice?: number; fee?: number; note?: string };
type AuthUser = { id: string; email: string; displayName: string };
type UserProfile = { displayName: string; avatar: string; avatarColor: string; defaultTab: string; refreshSeconds: number; colorMode: "cn" | "global" };
const DEFAULT_PROFILE: UserProfile = { displayName: "", avatar: "财", avatarColor: "#e85378", defaultTab: "market", refreshSeconds: 5, colorMode: "cn" };
const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  enabled: true,
  desktopNotifications: false,
  changePct: 3,
  instantMovePct: 0.8,
  volumeRatio: 2,
  turnover: 10,
  mainFlowYi: 1,
  holdingReturnPct: 8,
  cooldownMinutes: 30,
};
const ONCE_PER_TRADING_DAY_RULES = new Set(["day-change", "volume-ratio", "turnover", "main-flow", "holding-return"]);
const getShanghaiMarketClock = (date = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = !["Sat", "Sun"].includes(parts.weekday);
  const isTradingSession = weekday && ((minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes < 900));
  const phase = !weekday ? "休市" : minutes < 570 ? "盘前" : minutes < 690 ? "上午交易" : minutes < 780 ? "午间休市" : minutes < 900 ? "下午交易" : "已收盘";
  return { tradeDate: `${parts.year}-${parts.month}-${parts.day}`, isTradingSession, phase };
};
const compactAlertHistory = (items: MarketAlert[]) => {
  const seen = new Set<string>();
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).filter((item) => {
    const date = new Date(item.createdAt);
    const day = Number.isNaN(date.getTime()) ? item.createdAt.slice(0, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
    const bucket = item.rule === "instant-move" ? `${day}:${date.getHours()}:${Math.floor(date.getMinutes() / 30)}` : day;
    const key = `${bucket}:${item.code}:${item.rule}:${item.direction}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 200);
};
type Bar = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  changePct: number;
};
const INDEX_CODES = [
  "1.000001",
  "0.399001",
  "0.399006",
  "1.000688",
  "1.000300",
];
const DEFAULT_WATCH = ["600519", "300750", "000858", "601318"];
const chapters = [
  [
    "基础",
    "收益率与年化",
    "总收益率 =（期末价值－本金＋现金分红）÷ 本金。例：10万元变为10.8万元，总收益率8%。年化收益率用于统一比较不同持有期。",
  ],
  [
    "基础",
    "复利与72法则",
    "复利终值 = 本金×(1+收益率)^年数。年化8%时，72÷8≈9年翻倍；这是近似估算，不是承诺。",
  ],
  [
    "基础",
    "波动率与最大回撤",
    "回撤衡量从历史高点下跌的幅度。净值从1.20跌到0.90，回撤=(0.90/1.20)-1=-25%。",
  ],
  [
    "基础",
    "市价、限价与成交",
    "市价单优先成交但价格不确定；限价买单只会在限定价格或更低成交。流动性差时滑点会放大。",
  ],
  [
    "进阶",
    "PE、PB 与 PEG",
    "PE=股价÷每股收益；PEG=PE÷预期增长率。PE 30倍、增速20%，PEG=1.5。增长预测失真时PEG也会失真。",
  ],
  [
    "进阶",
    "三张财务报表",
    "利润不等于现金。净利润增长但经营现金流持续为负，需要检查应收账款、存货和收入确认。",
  ],
  [
    "进阶",
    "自由现金流与 DCF",
    "自由现金流≈经营现金流－资本开支。DCF把未来现金流按要求回报率折现，结果对增速和折现率极敏感。",
  ],
  [
    "进阶",
    "均线、MACD 与 RSI",
    "指标用于验证价格结构，不单独构成买卖理由。RSI高表示近期涨势强，不必然意味着立刻下跌。",
  ],
  [
    "高阶",
    "相关性与资产配置",
    "相关性越低，组合分散效果通常越好。两项资产各50%，风险并非两者风险的简单平均。",
  ],
  [
    "高阶",
    "仓位与凯利公式",
    "凯利比例 f=(bp-q)/b。胜率55%、盈亏比1:1时，f=10%；实务常用半凯利降低估计误差风险。",
  ],
  [
    "高阶",
    "利率与估值传导",
    "无风险利率上升会提高折现率，压低远期现金流现值，因此久期更长的成长资产通常更敏感。",
  ],
  [
    "高阶",
    "行为金融与交易纪律",
    "损失厌恶、锚定和确认偏误会破坏纪律。预先写下触发、失效条件，比盘中临时决定更可靠。",
  ],
];
type CourseLesson = {
  stage: string;
  title: string;
  summary: string;
  theory: string[];
  example: string;
  pitfalls: string[];
  formula?: string;
  calculation?: string;
  interactive?: "compound";
  source?: string;
  topics?: string[];
  investmentLink?: string[];
  questions?: string[];
};
const investmentLessons: CourseLesson[] = [
  {stage:"零基础",title:"投资到底是什么",summary:"投资是把今天可支配的资源交给能够创造未来现金流的资产，并承担不确定性；它不是猜明天涨跌。",theory:["储蓄强调保管和流动性，投资强调承担风险换取潜在回报。","投机关注价格变化，投资关注资产未来能创造多少价值；两者可能同时存在，但决策依据不同。","任何回报都来自某种风险暴露：经营、信用、利率、流动性或市场情绪。"],example:"买入一家持续盈利企业的股份，是分享企业未来利润；仅因热门消息追涨，则更接近价格投机。",pitfalls:["把投资等同于稳赚","只看收益、不问风险来自哪里","使用短期要花的钱投资高波动资产"]},
  {stage:"零基础",title:"先建立个人财务地基",summary:"投资之前先处理现金流、应急金、保险与高息负债，否则市场波动会迫使你在最差时点卖出。",theory:["应急资金解决意外支出，投资资金解决长期目标，两者用途不同。","高息债务的确定性成本通常高于投资的非确定性收益。","风险承受能力取决于收入稳定性、资金期限和家庭责任，不等于心理胆量。"],example:"未来半年要付首付的钱不适合进入股票市场；十年后退休所需资金才有更长时间消化波动。",pitfalls:["满仓后才考虑应急金","把信用卡分期成本忽略掉","照搬别人的风险等级"]},
  {stage:"零基础",title:"资产、负债与净资产",summary:"资产能带来未来经济利益，负债意味着未来需要偿付；个人净资产是资产减负债。",theory:["现金、股票、债券、房产是资产，但流动性和风险完全不同。","消费品可能有使用价值，却不一定具有投资回报。","净资产增长来自储蓄、资产增值和负债下降。"],example:"一套自住房既提供居住服务，也有价格波动；按揭贷款则是必须持续偿付的负债。",pitfalls:["把所有昂贵物品当投资","忽略负债利率","只看资产总额不看净资产"]},
  {stage:"零基础",title:"风险与收益的真实关系",summary:"高风险不保证高收益，只意味着结果范围更宽；合理目标是获得与承担风险相匹配的预期回报。",theory:["波动是风险的一部分，永久性亏损、信用违约和流动性枯竭更重要。","预期收益是多种结果的概率加权，不是承诺。","期限越短，股票结果越容易受情绪和事件支配。"],example:"一只股票可能上涨50%，也可能下跌60%；“潜在涨幅大”并不能自动说明值得买。",pitfalls:["把波动大理解成机会一定大","用历史最高收益代表未来","忽略极端亏损后的回本难度"]},
  {stage:"零基础",title:"收益率、复利与通胀",summary:"名义金额增长不等于购买力增长；长期投资需要同时理解收益率、复利和通胀。",theory:["单期收益率用于衡量一段时间内资产价值变化。","复利是收益继续参与下一期增长，时间越长影响越明显。","实际收益约等于名义收益减通胀，真正反映购买力。"],example:"10万元年化8%，10年理论终值约21.59万元；若同期通胀3%，实际购买力增长明显低于账面增长。",pitfalls:["把短期高收益直接年化","忽略税费和交易成本","把复利演算当收益承诺"],formula:"终值 = 本金 × (1 + 年收益率)^年数；实际收益率 ≈ 名义收益率 − 通胀率",calculation:"100,000 × (1 + 8%)^10 ≈ 215,892元。",interactive:"compound"},
  {stage:"基础",title:"股票、债券、基金与现金",summary:"不同资产代表不同法律关系和收益来源，选择前先理解自己究竟买到了什么。",theory:["股票代表剩余所有权，收益来自企业增长、分红与估值变化。","债券代表债权，核心是按约定收息和还本，同时承担信用与利率风险。","基金是资产组合工具，不是独立资产类别；风险由底层持仓决定。","现金类资产波动低、流动性高，但长期有通胀侵蚀。"],example:"股票基金和债券基金都叫基金，但前者主要承受股价波动，后者主要承受利率和信用变化。",pitfalls:["看到基金就认为低风险","只比较收益率不比较底层资产","把现金无波动误认为无风险"]},
  {stage:"基础",title:"指数与ETF",summary:"指数是一套选样和加权规则，ETF是跟踪指数或资产的交易工具。",theory:["宽基指数反映较广市场，行业指数集中暴露于某一产业。","市值加权会让大公司占比更高，等权指数则更强调中小成分。","跟踪误差、费率、流动性和指数规则共同决定ETF体验。"],example:"沪深300ETF并不是买入一个数字，而是通过基金间接持有一篮子大型上市公司。",pitfalls:["只看指数名称不看编制规则","把行业ETF当分散投资","忽略折溢价和成交活跃度"]},
  {stage:"基础",title:"A股市场与板块",summary:"主板、创业板、科创板和北交所服务的企业类型、交易门槛与涨跌幅制度不同。",theory:["沪深主板以成熟企业为主，创业板和科创板更强调成长与创新。","不同板块的准入、涨跌幅、盘后交易和投资者适当性存在差异。","股票代码只是识别线索，最终应以交易所证券信息为准。"],example:"688开头通常为科创板，300/301开头通常为创业板，920等新代码体系用于北交所。",pitfalls:["忽略板块交易权限","认为同一行业股票风险相同","仅凭代码判断公司质量"]},
  {stage:"基础",title:"交易时间、竞价与成交",summary:"价格由买卖订单在规则下撮合形成；开盘价、收盘价和盘中价格的形成方式并不完全相同。",theory:["集合竞价用一段时间内订单集中确定成交价，连续竞价按价格优先、时间优先撮合。","限价单控制最差成交价格，市价类指令强调成交速度。","停牌、涨跌停和流动性不足都会影响订单能否成交。"],example:"你看到最新价10元，不代表下单100万元都能以10元成交，盘口深度决定实际成交均价。",pitfalls:["把最新价当可无限成交价格","不理解撤单和未成交","临近涨跌停使用激进委托"]},
  {stage:"基础",title:"K线、成交量与复权",summary:"K线压缩展示开高低收，成交量反映交易活跃度；复权用于让历史价格更可比。",theory:["一根K线描述某周期的开盘、最高、最低、收盘，不解释背后原因。","成交量要结合价格位置和市场环境理解，放量本身不等于利好。","前复权适合观察连续走势，除权价适合核对当时真实成交价格。"],example:"公司10送10后股价机械减半并不等于持有人财富瞬间减半，复权曲线会处理这种断点。",pitfalls:["根据单根K线下结论","把任何放量上涨都当突破","混用复权与不复权价格"]},
  {stage:"基础",title:"盘口、换手率与资金流",summary:"盘口和资金流指标是交易行为的加工视图，不等于能够识别每个参与者的真实意图。",theory:["五档盘口只展示有限价位的挂单，挂单可以撤销。","换手率衡量流通股份被交易的活跃程度，需要与历史和同业比较。","主力净流入通常按大单口径估算，不是交易所披露的真实账户身份。"],example:"主力净流入为正但股价下跌并不矛盾，统计口径、成交位置和其他订单都可能造成差异。",pitfalls:["把挂单当必然成交","把资金流当内幕线索","跨平台比较不同口径数值"]},
  {stage:"进阶",title:"读懂商业模式",summary:"分析公司先问它为谁解决什么问题、如何收费、成本由什么驱动、优势能否持续。",theory:["收入增长要区分销量、价格、并购和会计口径变化。","毛利高不一定生意好，还要看获客成本、资本开支和周转效率。","护城河可能来自品牌、网络效应、成本、转换成本、专利或监管许可。"],example:"同为软件公司，订阅制与项目制的收入可预测性、回款周期和人力成本结构可能完全不同。",pitfalls:["用行业热门代替公司研究","只听管理层叙事不核对报表","把短期高增长当永久趋势"]},
  {stage:"进阶",title:"利润表：收入到净利润",summary:"利润表解释一段时期赚了多少，但利润质量需要结合现金流和会计政策判断。",theory:["营业收入减营业成本得到毛利润，再扣费用、税费等形成净利润。","毛利率反映产品与成本结构，净利率还受费用、资产减值和非经常项目影响。","同比改善可能来自低基数，不能脱离多个周期。"],example:"公司净利润增长50%，若主要来自出售资产而非主营业务，持续性通常较弱。",pitfalls:["只看净利润不看来源","混淆收入与回款","用单季度代表完整周期"]},
  {stage:"进阶",title:"资产负债表：家底与压力",summary:"资产负债表展示某一时点公司拥有的资源、承担的义务以及股东权益。",theory:["会计恒等式是资产＝负债＋所有者权益。","应收、存货和商誉的质量可能比账面金额更重要。","债务期限结构决定短期偿债压力，现金多也要看是否受限。"],example:"企业账面利润不错，但应收账款持续快于收入增长，可能意味着回款质量恶化。",pitfalls:["把资产多等同于价值高","忽略表外义务和担保","只看资产负债率一个指标"]},
  {stage:"进阶",title:"现金流量表：钱去了哪里",summary:"现金流量表把现金变化分成经营、投资和融资活动，帮助核对利润是否真正转化为现金。",theory:["经营现金流反映主营经营收付，长期应与利润相互印证。","投资现金流为负可能来自扩张，也可能来自低效投入。","融资现金流反映借款、还债、增发、回购和分红。"],example:"净利润连续增长但经营现金流长期为负，需要检查应收、存货、预付款或收入确认。",pitfalls:["经营现金流为负就一律判坏","忽略企业所处发展阶段","不看多年趋势"]},
  {stage:"进阶",title:"ROE、ROA与杜邦分析",summary:"回报率衡量公司使用资本创造利润的效率，但高ROE可能来自优秀经营，也可能来自高杠杆。",theory:["ROE关注股东权益回报，ROA关注全部资产效率。","杜邦分析把ROE拆为净利率、资产周转率和权益乘数。","回购、减值和周期顶部都可能扭曲单期数值。"],example:"两家公司ROE同为20%，一家靠高利润率，另一家靠高负债，风险结构完全不同。",pitfalls:["ROE越高越好","忽略负权益或一次性利润","跨行业直接比较"],formula:"ROE ≈ 净利率 × 总资产周转率 × 权益乘数",calculation:"净利率10% × 周转率1.2 × 权益乘数1.5 ≈ ROE 18%。"},
  {stage:"进阶",title:"估值不是判断贵贱的标签",summary:"估值是在增长、现金流、风险和资金成本假设下，对未来价值进行比较，而不是只看一个倍数。",theory:["价格是市场成交结果，价值是基于假设的估计，两者都可能变化。","相对估值比较同业和历史，绝对估值折现未来现金流。","低估值可能包含衰退风险，高估值可能反映增长预期。"],example:"一家PE 10倍的周期公司未必比PE 30倍的稳定公司便宜，因为利润所处周期和持续性不同。",pitfalls:["PE低就买、PE高就卖","忽略负利润时PE失效","估值脱离增长质量"]},
  {stage:"进阶",title:"PE、PB、PS与股息率",summary:"不同估值指标适用于不同盈利阶段和商业模式，必须理解分子分母及失效条件。",theory:["PE适合盈利相对稳定企业；PB常用于重资产和金融企业；PS可辅助观察尚未盈利但有收入的企业。","TTM使用最近四个季度，静态和预测口径不同。","股息率衡量现金分红相对价格，但高股息可能不可持续。"],example:"股价20元、每股收益1元，PE为20倍；每股净资产5元，PB为4倍。",pitfalls:["混用TTM和预测PE","忽略周期利润高点","把高股息当无风险"],formula:"PE＝股价÷每股收益；PB＝股价÷每股净资产；股息率＝每股股息÷股价",calculation:"股价20元、EPS 1元，则PE=20倍；每股股息0.6元，则股息率=3%。"},
  {stage:"进阶",title:"DCF与安全边际",summary:"现金流折现把未来可分配现金换算为今天的价值；结果高度依赖假设，因此应使用区间而非单点。",theory:["现金流越晚、风险越高，今天的价值越低。","折现率体现时间价值和风险补偿。","安全边际用于应对预测错误，而不是保证不会亏损。"],example:"同样未来收到100元，若折现率更高，其现值更低；成长股对远期假设尤其敏感。",pitfalls:["用精确小数掩盖不确定性","终值占比过高","把模型输出当事实"],formula:"现值＝未来现金流÷(1＋折现率)^期数",calculation:"3年后100元、折现率8%，现值约为100÷1.08³＝79.38元。"},
  {stage:"进阶",title:"债券价格、收益率与久期",summary:"债券价格与市场利率通常反向变化；期限越长、票息越低，对利率越敏感。",theory:["票息是合约现金流，收益率是当前价格隐含的回报水平。","发行人信用恶化会提高要求收益率并压低价格。","久期可近似衡量利率变化对债券价格的影响。"],example:"市场新债利率升至4%时，原有票息2%的债券吸引力下降，价格通常需要下调。",pitfalls:["债券一定保本","只看票息不看买入价格","忽略信用和流动性风险"],formula:"价格变动约 ≈ −修正久期 × 利率变动",calculation:"修正久期5，利率上升0.5个百分点，价格约下降2.5%，仅为小幅变化近似。"},
  {stage:"高阶",title:"资产配置与相关性",summary:"组合风险不仅取决于每项资产多危险，还取决于它们是否在同一时间以相同方向波动。",theory:["分散化的核心是配置不同风险来源，而不是简单增加持仓数量。","相关性会随危机环境上升，历史关系不是常数。","资产配置应服务于资金目标、期限和最大可承受损失。"],example:"持有十只同一行业股票看似分散，实质仍集中暴露于同一政策和景气周期。",pitfalls:["股票数量多就是分散","根据短期收益追逐配置","忽略再平衡纪律"]},
  {stage:"高阶",title:"仓位、回撤与风险预算",summary:"仓位决定判断错误时会损失多少；先定义可承受损失，再反推投入规模。",theory:["最大回撤描述资产从阶段高点到低点的跌幅。","风险预算把总可承受风险分配给不同策略或资产。","相关持仓应合并看待，不能逐只独立计算后误以为风险可控。"],example:"账户10万元，单笔最多承受1000元损失，买入价20元、失效位18元，则理论上限约500股。",pitfalls:["满仓后再找止损位","用摊低成本代替风控","忽略跳空导致实际损失更大"],formula:"仓位股数≈单笔可承受损失÷(买入价−失效价)",calculation:"1,000÷(20−18)=500股；还需考虑手续费、滑点和跳空。"},
  {stage:"高阶",title:"再平衡与投资纪律",summary:"再平衡是把偏离目标的组合恢复到预定风险结构，不是预测短期涨跌。",theory:["可按时间、偏离阈值或二者结合触发。","卖出上涨较多资产、补充相对较少资产，本质是纪律化控制集中度。","税费、流动性和交易成本决定再平衡频率。"],example:"目标股债60/40，股票上涨后变成72/28，可逐步恢复目标，而不是因为上涨就无限提高股票比例。",pitfalls:["过度频繁调整","把目标比例当永久不变","不考虑新增现金流"]},
  {stage:"高阶",title:"有效市场与行为偏差",summary:"市场并非永远正确，但竞争使明显错误难以长期免费存在；投资者自身偏差往往比模型误差更危险。",theory:["确认偏误让人只寻找支持原观点的信息。","损失厌恶让人过早止盈、长期拖延止损。","锚定使买入价、历史高点等无关数字影响判断。","羊群效应在趋势中自我强化，也可能在预期反转时迅速瓦解。"],example:"股价跌破买入价后只搜索利好新闻，是确认偏误；“回到成本就卖”则是被成本价锚定。",pitfalls:["认为只有别人会情绪化","用更多信息代替决策规则","把运气当能力"]},
  {stage:"高阶",title:"宏观变量如何传导到资产",summary:"利率、通胀、汇率、财政与信用周期通过折现率、需求、成本和风险偏好影响资产。",theory:["利率上升通常提高折现率，对远期现金流占比高的资产压力更大。","通胀对企业的影响取决于定价权、成本结构和资本强度。","汇率变化影响出口收入、进口成本、外币负债和资金流。","宏观判断正确也不等于交易时点正确，市场可能提前定价。"],example:"原材料涨价对有定价权企业可能可转嫁，对价格受管制企业则可能压缩利润。",pitfalls:["一个宏观变量解释所有行情","忽略市场预期差","宏观观点直接等于个股结论"]},
  {stage:"高阶",title:"衍生品、杠杆与尾部风险",summary:"期货和期权可用于套期保值，也能放大风险；杠杆会让小幅不利变化转化为大额亏损甚至强制平仓。",theory:["期货是双向合约并采用保证金制度。","期权买方拥有权利，卖方承担履约义务；价格受标的、时间、波动率和利率影响。","杠杆改变损益速度，不创造投资优势。"],example:"10倍杠杆下，标的不利变动5%可能造成约50%的权益损失，实际还受保证金和强平规则影响。",pitfalls:["只看最大收益图","忽略时间价值损耗","把卖期权小额稳定收益当低风险"]},
  {stage:"高阶",title:"建立自己的研究与复盘系统",summary:"稳定流程比临场感觉更可靠：先定义问题、记录证据和反证，再形成可检验的决策与复盘。",theory:["投资备忘录应记录买入逻辑、关键变量、估值区间、风险和失效条件。","区分过程质量与短期结果：好过程也可能暂时亏损，坏过程也可能偶然赚钱。","复盘应检查信息、推理、执行和仓位，而不只是看盈亏。"],example:"买入前写下“若核心产品价格连续两个季度下降则重新评估”，比下跌后临时解释更有约束力。",pitfalls:["只复盘亏损交易","不断修改原始理由","用结果证明当时决策正确"]}
];
const courseLessons: CourseLesson[] = [...investmentLessons, ...economicsBookLessons];
const money = (n: number) =>
  !Number.isFinite(n)
    ? "-"
    : n >= 1e8
      ? `${(n / 1e8).toFixed(2)}亿`
      : n >= 1e4
        ? `${(n / 1e4).toFixed(2)}万`
        : n.toLocaleString("zh-CN");
const pct = (n: number) =>
  Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "-";

function PriceChart({ bars, mode }: { bars: Bar[]; mode: string }) {
  const windowSize = Math.min(70, bars.length),
    maxOffset = Math.max(0, bars.length - windowSize);
  const [offset, setOffset] = useState(0),
    [cursor, setCursor] = useState<number | null>(null),
    [cursorPrice, setCursorPrice] = useState<number | null>(null),
    [locked, setLocked] = useState(false),
    [dragging, setDragging] = useState(false);
  const drag = useRef({ x: 0, offset: 0, moved: false });
  useEffect(() => {
    setOffset(0);
    setCursor(null);
    setLocked(false);
  }, [bars]);
  const end = bars.length - offset,
    start = Math.max(0, end - windowSize),
    data = bars.slice(start, end);
  if (!data.length)
    return (
      <div className="chart-empty">
        <b>K线数据暂不可用</b>
        <span>未取得有效行情样本，系统不会生成趋势判断。</span>
      </div>
    );
  const lo = Math.min(...data.map((x) => x.low)),
    hi = Math.max(...data.map((x) => x.high)),
    pad = (hi - lo) * 0.04,
    low = lo - pad,
    high = hi + pad,
    y = (v: number) => 6 + ((high - v) / (high - low || 1)) * 74,
    w = 100 / data.length,
    active = cursor === null ? null : data[cursor],
    cx = cursor === null ? 0 : cursor * w + w / 2,
    cy = cursorPrice === null ? 0 : y(cursorPrice);
  const locate = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked && !dragging) return;
    const r = e.currentTarget.getBoundingClientRect(),
      chartW = Math.max(1, r.width - 58),
      chartH = Math.min(360, r.height - 28),
      px = Math.max(0, Math.min(chartW, e.clientX - r.left)),
      py = Math.max(0, Math.min(chartH, e.clientY - r.top));
    setCursor(
      Math.min(data.length - 1, Math.floor((px / chartW) * data.length)),
    );
    setCursorPrice(
      high -
        ((Math.max(6, Math.min(80, (py / chartH) * 88)) - 6) / 74) *
          (high - low),
    );
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      const r = e.currentTarget.getBoundingClientRect(),
        step = Math.round(
          (e.clientX - drag.current.x) /
            (Math.max(1, r.width - 58) / windowSize),
        );
      if (Math.abs(e.clientX - drag.current.x) > 4) drag.current.moved = true;
      setOffset(Math.max(0, Math.min(maxOffset, drag.current.offset + step)));
    }
    locate(e);
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, offset, moved: false };
    setDragging(true);
  };
  const onUp = () => {
    setDragging(false);
    if (!drag.current.moved && cursor !== null) setLocked((v) => !v);
  };
  return (
    <div
      className={`chart-shell ${dragging ? "dragging" : ""}`}
      onPointerMove={onMove}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={() => setDragging(false)}
      onPointerLeave={() =>
        !locked && !dragging && (setCursor(null), setCursorPrice(null))
      }
      onWheel={(e) => {
        e.preventDefault();
        setOffset((v) =>
          Math.max(0, Math.min(maxOffset, v + Math.sign(e.deltaY) * 8)),
        );
      }}
    >
      <div className="chart-status">
        <span>
          {data[0]?.date.slice(0, 10)} — {data.at(-1)?.date.slice(0, 10)}
        </span>
        <span>
          共 {bars.length} 条 ·{" "}
          {offset === 0 ? "最新区间" : `向前 ${offset} 条`}
        </span>
        {offset > 0 && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setOffset(0)}
          >
            回到最新
          </button>
        )}
      </div>
      <div className="price-axis">
        {[
          high,
          high - (high - low) * 0.25,
          high - (high - low) * 0.5,
          high - (high - low) * 0.75,
          low,
        ].map((v, i) => (
          <span key={i}>{v.toFixed(2)}</span>
        ))}
      </div>
      <svg
        className="price-svg"
        viewBox="0 0 100 88"
        preserveAspectRatio="none"
      >
        {mode === "line" ? (
          <polyline
            points={data
              .map((b, i) => `${i * w + w / 2},${y(b.close)}`)
              .join(" ")}
            fill="none"
            stroke="#e84d72"
            strokeWidth=".8"
          />
        ) : (
          data.map((b, i) => {
            const up = b.close >= b.open,
              x = i * w + w / 2,
              top = y(Math.max(b.open, b.close)),
              bottom = y(Math.min(b.open, b.close));
            return (
              <g key={b.date} className={up ? "candle-up" : "candle-down"}>
                <line x1={x} y1={y(b.high)} x2={x} y2={y(b.low)} />
                <rect
                  x={i * w + w * 0.18}
                  y={top}
                  width={w * 0.64}
                  height={Math.max(0.6, bottom - top)}
                />
                {mode === "volume" && (
                  <rect
                    className="vol"
                    x={i * w + w * 0.18}
                    y={
                      82 -
                      Math.min(
                        12,
                        (b.volume / Math.max(...data.map((x) => x.volume))) *
                          12,
                      )
                    }
                    width={w * 0.64}
                    height={Math.min(
                      12,
                      (b.volume / Math.max(...data.map((x) => x.volume))) * 12,
                    )}
                  />
                )}
              </g>
            );
          })
        )}
        {active && cursorPrice !== null && (
          <g className="crosshair">
            <line x1={cx} y1="0" x2={cx} y2="88" />
            <line x1="0" y1={cy} x2="100" y2={cy} />
          </g>
        )}
      </svg>
      <div className="date-axis">
        {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => (
          <span key={i}>{data[i]?.date.slice(0, 10)}</span>
        ))}
      </div>
      {cursorPrice !== null && (
        <div
          className="cursor-price"
          style={{ top: `${Math.max(2, Math.min(92, (cy / 88) * 100))}%` }}
        >
          {cursorPrice.toFixed(2)}
        </div>
      )}
      {active && (
        <div className={`chart-tooltip ${cx > 65 ? "left" : "right"}`}>
          <div>
            <b>{active.date}</b>
            <span>
              {locked
                ? "已锁定 · 点击解除"
                : dragging
                  ? "拖拽查看历史"
                  : "点击锁定"}
            </span>
          </div>
          <div>
            光标价 <strong>{cursorPrice?.toFixed(2)}</strong>
          </div>
          <div>
            开 <em>{active.open.toFixed(2)}</em>　高{" "}
            <em>{active.high.toFixed(2)}</em>
          </div>
          <div>
            低 <em>{active.low.toFixed(2)}</em>　收{" "}
            <em>{active.close.toFixed(2)}</em>
          </div>
          <div>
            涨跌{" "}
            <em className={active.changePct >= 0 ? "up" : "down"}>
              {pct(active.changePct)}
            </em>
            　量 <em>{money(active.volume)}</em>
          </div>
        </div>
      )}
    </div>
  );
}

function EquityChart({ data }: { data: BacktestResult["curve"] }) {
  if (!data.length) return <div className="empty"><b>暂无净值数据</b></div>;
  const sampled = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 180)) === 0 || i === data.length - 1);
  const values = sampled.flatMap((x) => [x.equity, x.benchmark]), low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  const points = (key: "equity" | "benchmark") => sampled.map((x, i) => `${i / Math.max(1, sampled.length - 1) * 100},${90 - (x[key] - low) / span * 80}`).join(" ");
  return <div className="equity-chart"><div><span><i className="strategy-line" />策略净值</span><span><i className="benchmark-line" />同期持有</span><small>{data[0].date} — {data.at(-1)?.date}</small></div><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="90" x2="100" y2="90"/><polyline className="benchmark" points={points("benchmark")} /><polyline className="strategy-equity" points={points("equity")} /></svg><footer><span>{money(low)}</span><span>{money(high)}</span></footer></div>;
}

export default function Home() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null),
    [authChecked, setAuthChecked] = useState(false),
    [authMode, setAuthMode] = useState<"login" | "register">("login"),
    [authEmail, setAuthEmail] = useState(""),
    [authPassword, setAuthPassword] = useState(""),
    [authDisplayName, setAuthDisplayName] = useState(""),
    [authError, setAuthError] = useState(""),
    [authLoading, setAuthLoading] = useState(false),
    [userDataReady, setUserDataReady] = useState(false),
    [cloudSaveState, setCloudSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle"),
    [profileOpen, setProfileOpen] = useState(false),
    [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE),
    [tab, setTab] = useState("market"),
    [quotes, setQuotes] = useState<Quote[]>([]),
    [bars, setBars] = useState<Bar[]>([]),
    [klineMeta, setKlineMeta] = useState({
      source: "",
      savedAt: "",
      fromCache: false,
    }),
    [selected, setSelected] = useState("600519"),
    [klt, setKlt] = useState("101"),
    [chartMode, setChartMode] = useState("candle"),
    [detail, setDetail] = useState<{
      name?: string;
      code?: string;
      quote?: Partial<Quote>;
      bids: { price: number | null; volume: number | null }[];
      asks: { price: number | null; volume: number | null }[];
    } | null>(null),
    [stockNews, setStockNews] = useState<{
      id: string; title: string; summary: string; publishedAt: string; source: string; url: string;
    }[]>([]),
    [newsUpdatedAt, setNewsUpdatedAt] = useState(""),
    [aiAnalysis, setAiAnalysis] = useState<Record<string, any> | null>(null),
    [aiAnalyses, setAiAnalyses] = useState<Record<string, { analysis: Record<string, any>; model: string; generatedAt: string }>>({}),
    [aiLoading, setAiLoading] = useState(false),
    [aiError, setAiError] = useState(""),
    [aiMeta, setAiMeta] = useState({ model: "", generatedAt: "" }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [stamp, setStamp] = useState(""),
    [watch, setWatch] = useState<string[]>(DEFAULT_WATCH),
    [newCode, setNewCode] = useState(""),
    [suggestions, setSuggestions] = useState<
      {
        exchange: string;
        code: string;
        name: string;
        pinyin: string;
        type: string;
      }[]
    >([]),
    [searching, setSearching] = useState(false),
    [watchPage, setWatchPage] = useState(0),
    [watchFocused, setWatchFocused] = useState(false),
    [watchGroups, setWatchGroups] = useState<
      { id: string; name: string; codes: string[] }[]
    >([{ id: "default", name: "默认分组", codes: DEFAULT_WATCH }]),
    [activeWatchGroup, setActiveWatchGroup] = useState("default"),
    [newGroupName, setNewGroupName] = useState(""),
    [watchListPage, setWatchListPage] = useState(0),
    [watchPerformance, setWatchPerformance] = useState<Record<string, {
      month: number | null; ytd: number | null; rollingMonth: number | null; rollingYear: number | null; asOf: string | null;
    }>>({}),
    [watchMeta, setWatchMeta] = useState<Record<string, { addedAt: string; addedPrice: number | null }>>({}),
    [watchSort, setWatchSort] = useState<{
      key: "price" | "changePct" | "change" | "marketCap" | "floatMarketCap" | "turnover" | "mainNetInflow" | "month" | "ytd" | "rollingMonth" | "rollingYear" | "addedAt" | "addedPrice" | "watchReturn";
      direction: "asc" | "desc";
    }>({ key: "changePct", direction: "desc" }),
    [holdingInput, setHoldingInput] = useState(""),
    [holdingSuggestions, setHoldingSuggestions] = useState<
      {
        exchange: string;
        code: string;
        name: string;
        pinyin: string;
        type: string;
      }[]
    >([]),
    [holdingSearching, setHoldingSearching] = useState(false),
    [holdingPage, setHoldingPage] = useState(0),
    [holdingFocused, setHoldingFocused] = useState(false),
    [holdingListPage, setHoldingListPage] = useState(0),
    [holdings, setHoldings] = useState<
      { code: string; shares: number; cost: number }[]
    >([]),
    [alerts, setAlerts] = useState<MarketAlert[]>([]),
    [alertSettings, setAlertSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS),
    [alertFilter, setAlertFilter] = useState<"all" | AlertLevel>("all"),
    [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default"),
    [screenerFilters, setScreenerFilters] = useState<ScreenerFilters>({ minChange: -20, maxChange: 20, minTurnover: 0, minAmountYi: 1, minCapYi: 0, maxPe: 0, maxPb: 0, minVolumeRatio: 0, minMainFlowYi: -99999, sort: "changePct", direction: "desc" }),
    [savedScreeners, setSavedScreeners] = useState<SavedScreener[]>([]),
    [screenerName, setScreenerName] = useState(""),
    [screenerRows, setScreenerRows] = useState<ScreenerRow[]>([]),
    [screenerAllRows, setScreenerAllRows] = useState<ScreenerRow[]>([]),
    [screenerPage, setScreenerPage] = useState(1),
    [screenerTotal, setScreenerTotal] = useState(0),
    [screenerUniverse, setScreenerUniverse] = useState(0),
    [screenerLoading, setScreenerLoading] = useState(false),
    [screenerError, setScreenerError] = useState(""),
    [screenerUpdatedAt, setScreenerUpdatedAt] = useState(""),
    [radar, setRadar] = useState<RadarData | null>(null),
    [radarLoading, setRadarLoading] = useState(false),
    [radarError, setRadarError] = useState(""),
    [radarBoardKind, setRadarBoardKind] = useState<"industry" | "concept">("concept"),
    [radarView, setRadarView] = useState<"boards" | "ladder">("boards"),
    [tradePlans, setTradePlans] = useState<TradePlan[]>([]),
    [planEvents, setPlanEvents] = useState<PlanEvent[]>([]),
    [plansLoading, setPlansLoading] = useState(false),
    [plansError, setPlansError] = useState(""),
    [plansUpdatedAt, setPlansUpdatedAt] = useState(""),
    [planFilter, setPlanFilter] = useState<"all" | TradePlan["status"]>("all"),
    [backtestCode, setBacktestCode] = useState("600519"),
    [backtestInitial, setBacktestInitial] = useState(100000),
    [backtestFee, setBacktestFee] = useState(0.03),
    [backtestSlippage, setBacktestSlippage] = useState(0.1),
    [backtest, setBacktest] = useState<BacktestResult | null>(null),
    [backtestLoading, setBacktestLoading] = useState(false),
    [backtestError, setBacktestError] = useState(""),
    [simCash, setSimCash] = useState(1000000),
    [simPositions, setSimPositions] = useState<SimPosition[]>([]),
    [simOrders, setSimOrders] = useState<SimOrder[]>([]),
    [simCode, setSimCode] = useState("600519"),
    [simSide, setSimSide] = useState<"buy" | "sell">("buy"),
    [simOrderType, setSimOrderType] = useState<"market" | "limit">("limit"),
    [simPrice, setSimPrice] = useState(0),
    [simQuantity, setSimQuantity] = useState(100),
    [simMessage, setSimMessage] = useState(""),
    [simView, setSimView] = useState<"positions" | "orders" | "fills">("positions"),
    [simSuggestions, setSimSuggestions] = useState<{ code: string; name: string; market: string; type: string }[]>([]),
    [learnQ, setLearnQ] = useState(""),
    [lesson, setLesson] = useState(0),
    [principal, setPrincipal] = useState(100000),
    [rate, setRate] = useState(8),
    [years, setYears] = useState(10);
  const quoteHistoryRef = useRef<Record<string, { price: number; at: number }>>({});
  const tradePlansRef = useRef<TradePlan[]>([]);
  const planStatusRef = useRef<Record<string, string>>({});
  const planBreakCountRef = useRef<Record<string, number>>({});
  const planFailureCountRef = useRef<Record<string, number>>({});
  const simCashRef = useRef(simCash);
  const simPositionsRef = useRef(simPositions);
  const simProcessingRef = useRef(new Set<string>());
  const simPriceCodeRef = useRef("");
  const getLocalUserSnapshot = () => {
    const read = (key: string, fallback: unknown) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
    const legacyWatch = read("wealth-watch", DEFAULT_WATCH) as string[];
    const aiAnalyses: Record<string, unknown> = {};
    for (let index = 0; index < localStorage.length; index += 1) { const key = localStorage.key(index); if (key?.startsWith("wealth-ai-analysis:")) { try { aiAnalyses[key.slice("wealth-ai-analysis:".length)] = JSON.parse(localStorage.getItem(key) || "null"); } catch {} } }
    return {
      watchGroups: read("wealth-watch-groups-v1", [{ id: "default", name: "默认分组", codes: legacyWatch }]),
      watchMeta: read("wealth-watch-meta-v1", {}), holdings: read("wealth-holdings", []),
      alerts: read("wealth-alerts-v1", []), alertSettings: read("wealth-alert-settings-v1", DEFAULT_ALERT_SETTINGS),
      savedScreeners: read("wealth-saved-screeners-v1", []),
      planEvents: read("wealth-plan-events-v2", []), planStatuses: read("wealth-plan-status-v2", {}),
      simulator: read("wealth-simulator-v1", { cash: 1000000, positions: [], orders: [] }),
      aiAnalyses,
      profile: { ...DEFAULT_PROFILE, displayName: authUser?.displayName || "" }, preferences: { selected, klt, chartMode, lesson },
    };
  };
  const applyUserData = (data: Record<string, any>) => {
    const groups = Array.isArray(data.watchGroups) && data.watchGroups.length ? data.watchGroups : [{ id: "default", name: "默认分组", codes: [] }];
    setWatchGroups(groups); setWatch(Array.from(new Set(groups.flatMap((group: { codes?: string[] }) => group.codes || []))));
    setWatchMeta(data.watchMeta || {}); setHoldings(Array.isArray(data.holdings) ? data.holdings : []);
    setAlerts(compactAlertHistory(Array.isArray(data.alerts) ? data.alerts : [])); setAlertSettings({ ...DEFAULT_ALERT_SETTINGS, ...(data.alertSettings || {}) });
    setSavedScreeners(Array.isArray(data.savedScreeners) ? data.savedScreeners : []);
    setPlanEvents(Array.isArray(data.planEvents) ? data.planEvents : []); planStatusRef.current = data.planStatuses || {};
    setAiAnalyses(data.aiAnalyses || {});
    const nextProfile = { ...DEFAULT_PROFILE, ...(data.profile || {}) }; setProfile(nextProfile);
    const simulator = data.simulator || {}; setSimCash(Number(simulator.cash) || 0); setSimPositions(Array.isArray(simulator.positions) ? simulator.positions : []); setSimOrders(Array.isArray(simulator.orders) ? simulator.orders : []);
    if (data.preferences) { if (data.preferences.selected) setSelected(data.preferences.selected); if (data.preferences.klt) setKlt(data.preferences.klt); if (data.preferences.chartMode) setChartMode(data.preferences.chartMode); if (Number.isInteger(data.preferences.lesson)) setLesson(data.preferences.lesson); }
    if (nextProfile.defaultTab) setTab(nextProfile.defaultTab);
  };
  const loadUserData = async () => {
    setUserDataReady(false);
    const response = await fetch("/api/user-data", { cache: "no-store" }), json = await response.json();
    if (!json.ok) throw new Error(json.error || "读取用户数据失败");
    if (json.data) applyUserData(json.data);
    else {
      const local = getLocalUserSnapshot(); applyUserData(local);
      await fetch("/api/user-data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: local }) });
    }
    setUserDataReady(true);
  };
  const submitAuth = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: authMode, email: authEmail, password: authPassword, displayName: authDisplayName }) });
      const json = await response.json(); if (!json.ok) throw new Error(json.error || "认证失败");
      setAuthUser(json.user); setAuthPassword(""); await loadUserData();
    } catch (failure) { setAuthError(failure instanceof Error ? failure.message : "认证失败"); }
    finally { setAuthLoading(false); }
  };
  const logout = async () => {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    setAuthUser(null); setUserDataReady(false); setAuthPassword("");
  };
  useEffect(() => {
    try {
      const oldWatch =
        JSON.parse(localStorage.getItem("wealth-watch") || "null") ||
        DEFAULT_WATCH;
      const savedGroups = JSON.parse(
        localStorage.getItem("wealth-watch-groups-v1") || "null",
      );
      const groups =
        Array.isArray(savedGroups) && savedGroups.length
          ? savedGroups
          : [{ id: "default", name: "默认分组", codes: oldWatch }];
      setWatchGroups(groups);
      setWatch(Array.from(new Set(groups.flatMap((g: { codes: string[] }) => g.codes))));
      setWatchMeta(JSON.parse(localStorage.getItem("wealth-watch-meta-v1") || "{}"));
      setHoldings(JSON.parse(localStorage.getItem("wealth-holdings") || "[]"));
      const compactedAlerts = compactAlertHistory(JSON.parse(localStorage.getItem("wealth-alerts-v1") || "[]"));
      setAlerts(compactedAlerts);
      localStorage.setItem("wealth-alerts-v1", JSON.stringify(compactedAlerts));
      setAlertSettings({
        ...DEFAULT_ALERT_SETTINGS,
        ...JSON.parse(localStorage.getItem("wealth-alert-settings-v1") || "{}"),
      });
      setSavedScreeners(JSON.parse(localStorage.getItem("wealth-saved-screeners-v1") || "[]"));
      if ("Notification" in window) setNotificationPermission(Notification.permission);
      // v2 starts with the corrected lifecycle model; old “数据不足/误判失效” logs are intentionally not migrated.
      setPlanEvents(JSON.parse(localStorage.getItem("wealth-plan-events-v2") || "[]"));
      planStatusRef.current = JSON.parse(localStorage.getItem("wealth-plan-status-v2") || "{}");
      const sim = JSON.parse(localStorage.getItem("wealth-simulator-v1") || "null");
      if (sim) { setSimCash(Number(sim.cash) || 0); setSimPositions(Array.isArray(sim.positions) ? sim.positions : []); setSimOrders(Array.isArray(sim.orders) ? sim.orders : []); }
    } catch {}
  }, []);
  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" }).then((response) => response.json()).then(async (json) => {
      if (json.ok && json.user) { setAuthUser(json.user); await loadUserData(); }
    }).catch(() => {}).finally(() => setAuthChecked(true));
  }, []);
  const codes = useMemo(
    () =>
      Array.from(
        new Set([
          ...INDEX_CODES,
          ...watch,
          ...holdings.map((h) => h.code),
          ...simPositions.map((position) => position.code),
          ...(/^\d{6}$/.test(simCode) ? [simCode] : []),
          selected,
        ]),
      ),
    [watch, holdings, simPositions, simCode, selected],
  );
  const planCodes = useMemo(() => Array.from(new Set([...watch, ...holdings.map((holding) => holding.code)])).slice(0, 20), [watch, holdings]);
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/market?codes=${codes.join(",")}`, {
          cache: "no-store",
        }),
        j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setQuotes(j.quotes);
      setStamp(new Date(j.fetchedAt).toLocaleString("zh-CN"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "行情请求失败");
    } finally {
      setLoading(false);
    }
  };
  const refreshRadar = async () => {
    setRadarLoading(true); setRadarError("");
    try {
      const response = await fetch("/api/market?type=radar", { cache: "no-store" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || "市场雷达请求失败");
      setRadar(json);
      localStorage.setItem("wealth-radar-cache-v1", JSON.stringify(json));
    } catch (radarFailure) {
      setRadarError(radarFailure instanceof Error ? radarFailure.message : "市场雷达请求失败");
      try { const cached = JSON.parse(localStorage.getItem("wealth-radar-cache-v1") || "null"); if (cached) setRadar(cached); } catch {}
    } finally { setRadarLoading(false); }
  };
  const refreshScreener = async (page = screenerPage, filters = screenerFilters) => {
    setScreenerLoading(true); setScreenerError("");
    try {
      const base = Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, String(value)]));
      const payloads: any[] = [];
      for (let index = 0; index < 6; index += 1) { const response = await fetch(`/api/market?${new URLSearchParams({ type:"screener", segment:String(index + 1), ...base })}`, { cache:"no-store" }); const json = await response.json(); if (!json.ok) throw new Error(json.error || `第${index + 1}段筛选失败`); payloads.push(json); }
      const merged = payloads.flatMap((payload) => payload.results || []) as ScreenerRow[];
      const key = filters.sort; merged.sort((a,b) => (Number(a[key]) - Number(b[key])) * (filters.direction === "asc" ? 1 : -1));
      setScreenerAllRows(merged); setScreenerRows(merged.slice((page - 1) * 30, page * 30)); setScreenerTotal(merged.length); setScreenerUniverse(payloads[0]?.universeTotal || 0); setScreenerPage(page); setScreenerUpdatedAt(payloads[0]?.fetchedAt || "");
    } catch (failure) { setScreenerError(failure instanceof Error ? failure.message : "全市场筛选失败"); }
    finally { setScreenerLoading(false); }
  };
  const showScreenerPage = (page: number) => { setScreenerPage(page); setScreenerRows(screenerAllRows.slice((page - 1) * 30, page * 30)); };
  const screenerPresets: { name: string; note: string; filters: ScreenerFilters }[] = [
    { name: "放量强势", note: "量比≥1.5、换手≥3%、资金净流入", filters: { minChange: 1, maxChange: 9.8, minTurnover: 3, minAmountYi: 3, minCapYi: 30, maxPe: 0, maxPb: 0, minVolumeRatio: 1.5, minMainFlowYi: .2, sort: "volumeRatio", direction: "desc" } },
    { name: "稳健低估", note: "PE≤25、PB≤3、市值≥100亿", filters: { minChange: -3, maxChange: 5, minTurnover: .3, minAmountYi: 1, minCapYi: 100, maxPe: 25, maxPb: 3, minVolumeRatio: 0, minMainFlowYi: -99999, sort: "marketCap", direction: "desc" } },
    { name: "资金关注", note: "主力净流入≥1亿、成交额≥5亿", filters: { minChange: -5, maxChange: 9.8, minTurnover: 1, minAmountYi: 5, minCapYi: 30, maxPe: 0, maxPb: 0, minVolumeRatio: 0, minMainFlowYi: 1, sort: "mainNetInflow", direction: "desc" } },
    { name: "活跃中小盘", note: "市值≥30亿、换手≥5%", filters: { minChange: -3, maxChange: 9.8, minTurnover: 5, minAmountYi: 1, minCapYi: 30, maxPe: 80, maxPb: 0, minVolumeRatio: 1, minMainFlowYi: -99999, sort: "turnover", direction: "desc" } },
  ];
  const saveScreener = () => { const name = screenerName.trim(); if (!name) return; const next = [{ id: `screen-${Date.now()}`, name, filters: { ...screenerFilters }, createdAt: new Date().toISOString() }, ...savedScreeners.filter((item) => item.name !== name)].slice(0, 20); setSavedScreeners(next); localStorage.setItem("wealth-saved-screeners-v1", JSON.stringify(next)); setScreenerName(""); };
  const removeScreener = (id: string) => { const next = savedScreeners.filter((item) => item.id !== id); setSavedScreeners(next); localStorage.setItem("wealth-saved-screeners-v1", JSON.stringify(next)); };
  const refreshTradePlans = async () => {
    if (!planCodes.length) { setTradePlans([]); return; }
    setPlansLoading(true); setPlansError("");
    try {
      const response = await fetch(`/api/market?type=plans&codes=${planCodes.join(",")}`, { cache: "no-store" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || "交易计划请求失败");
      const receivedPlans = (json.plans || []) as TradePlan[];
      const cachedPlans = new Map(tradePlansRef.current.map((plan) => [plan.code, plan]));
      const nextPlans = receivedPlans.map((incoming) => {
        if (incoming.status === "insufficient") {
          const failures = (planFailureCountRef.current[incoming.code] || 0) + 1;
          planFailureCountRef.current[incoming.code] = failures;
          const cached = cachedPlans.get(incoming.code);
          if (cached && failures < 3) return { ...cached, dataHealth: "stale" as const, reasons: [...cached.reasons.filter((reason) => !reason.startsWith("本轮数据获取失败")), `本轮数据获取失败（连续${failures}次），暂时沿用上次有效结果。`] };
          return { ...incoming, dataHealth: "insufficient" as const };
        }
        planFailureCountRef.current[incoming.code] = 0;
        const previous = planStatusRef.current[incoming.code];
        const hadActivePlan = previous === "watch" || previous === "confirmed" || previous === "invalid";
        const breaks = incoming.structureBroken && hadActivePlan ? (planBreakCountRef.current[incoming.code] || 0) + 1 : 0;
        planBreakCountRef.current[incoming.code] = breaks;
        if (breaks >= 2) return { ...incoming, status: "invalid" as const, statusLabel: "结构失效" };
        if (incoming.structureBroken && hadActivePlan) return { ...incoming, status: previous as TradePlan["status"], statusLabel: previous === "confirmed" ? "条件确认（待复核）" : previous === "invalid" ? "结构失效" : "重点观察（待复核）" };
        return incoming;
      });
      const nextStatuses = { ...planStatusRef.current };
      const events: PlanEvent[] = [];
      nextPlans.forEach((plan) => {
        const previous = planStatusRef.current[plan.code];
        const meaningful = plan.status !== "insufficient" && previous !== "insufficient";
        if (meaningful && previous && previous !== plan.status) events.push({ id: `${Date.now()}-${plan.code}-${plan.status}`, code: plan.code, name: plan.name, from: previous, to: plan.status, createdAt: new Date().toISOString(), price: plan.price });
        if (plan.status !== "insufficient") nextStatuses[plan.code] = plan.status;
      });
      planStatusRef.current = nextStatuses;
      localStorage.setItem("wealth-plan-status-v2", JSON.stringify(nextStatuses));
      if (events.length) setPlanEvents((current) => { const next = [...events, ...current].slice(0, 100); localStorage.setItem("wealth-plan-events-v2", JSON.stringify(next)); return next; });
      tradePlansRef.current = nextPlans;
      setTradePlans(nextPlans); setPlansUpdatedAt(json.fetchedAt || new Date().toISOString());
      localStorage.setItem("wealth-plans-cache-v1", JSON.stringify({ plans: nextPlans, fetchedAt: json.fetchedAt }));
    } catch (planFailure) {
      setPlansError(planFailure instanceof Error ? planFailure.message : "交易计划请求失败");
      try { const cached = JSON.parse(localStorage.getItem("wealth-plans-cache-v1") || "null"); if (cached?.plans) { tradePlansRef.current = cached.plans; setTradePlans(cached.plans); setPlansUpdatedAt(cached.fetchedAt || ""); } } catch {}
    } finally { setPlansLoading(false); }
  };
  const runBacktest = async () => {
    const code = backtestCode.replace(/\D/g, "").slice(-6);
    if (!/^\d{6}$/.test(code)) { setBacktestError("请输入6位股票代码"); return; }
    setBacktestLoading(true); setBacktestError("");
    try {
      const response = await fetch(`/api/market?type=backtest&code=${code}&initial=${backtestInitial}&fee=${backtestFee / 100}&slippage=${backtestSlippage / 100}`, { cache: "no-store" });
      const json = await response.json(); if (!json.ok) throw new Error(json.error || "回测失败");
      setBacktest(json); localStorage.setItem(`wealth-backtest-v1:${code}`, JSON.stringify(json));
    } catch (failure) { setBacktestError(failure instanceof Error ? failure.message : "回测失败"); }
    finally { setBacktestLoading(false); }
  };
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, Math.max(3, profile.refreshSeconds || 5) * 1000);
    return () => clearInterval(t);
  }, [codes.join(","), profile.refreshSeconds]);
  useEffect(() => {
    refreshRadar();
    const timer = setInterval(refreshRadar, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    refreshTradePlans();
    const timer = setInterval(refreshTradePlans, 30000);
    return () => clearInterval(timer);
  }, [planCodes.join(",")]);
  useEffect(() => {
    let active = true;
    const cacheKey = `${selected}:${klt}:qfq`;
    let hasCache = false;
    try {
      const all = JSON.parse(
        localStorage.getItem("wealth-kline-cache-v1") || "{}",
      ) as Record<
        string,
        { bars: Bar[]; savedAt: string; source: string }
      >;
      const hit = all[cacheKey];
      if (hit?.bars?.length) {
        hasCache = true;
        setBars(hit.bars);
        setKlineMeta({
          source: hit.source,
          savedAt: hit.savedAt,
          fromCache: true,
        });
      }
    } catch {}
    if (!hasCache) {
      setBars([]);
      setKlineMeta({ source: "", savedAt: "", fromCache: false });
    }
    fetch(`/api/market?type=kline&code=${selected}&klt=${klt}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active || !j.ok || !j.bars?.length) return;
        const savedAt = j.fetchedAt || new Date().toISOString();
        setBars(j.bars);
        setKlineMeta({ source: j.source, savedAt, fromCache: false });
        try {
          const storageKey = "wealth-kline-cache-v1";
          const all = JSON.parse(localStorage.getItem(storageKey) || "{}") as Record<
            string,
            { bars: Bar[]; savedAt: string; source: string }
          >;
          all[cacheKey] = { bars: j.bars, savedAt, source: j.source };
          const trimmed = Object.fromEntries(
            Object.entries(all)
              .sort(
                (a, b) =>
                  new Date(b[1].savedAt).getTime() -
                  new Date(a[1].savedAt).getTime(),
              )
              .slice(0, 24),
          );
          localStorage.setItem(storageKey, JSON.stringify(trimmed));
        } catch {}
      })
      .catch(() => {
        // Keep the last successful local copy visible when the upstream fails.
      });
    fetch(`/api/market?type=detail&code=${selected}`)
      .then((r) => r.json())
      .then((j) => { if(active) setDetail(j.ok ? j : null) })
      .catch(() => { if(active) setDetail(null) });
    return () => { active = false };
  }, [selected, klt]);
  useEffect(() => {
    let active = true;
    setDetail(null);
    const updateDepth = () =>
      fetch(`/api/market?type=detail&code=${selected}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if(active && String(j.code||"") === selected.replace(/\D/g, "").slice(-6)) setDetail(j.ok ? j : null) })
        .catch(() => {});
    updateDepth();
    const timer = setInterval(updateDepth, Math.max(3, profile.refreshSeconds || 5) * 1000);
    return () => { active = false; clearInterval(timer) };
  }, [selected, profile.refreshSeconds]);
  useEffect(() => {
    if (!watch.length) return;
    const storageKey="wealth-watch-performance-v1";
    try{
      const cached=JSON.parse(localStorage.getItem(storageKey)||"{}");
      if(cached.results)setWatchPerformance(cached.results);
    }catch{}
    fetch(`/api/market?type=performance&codes=${watch.join(",")}`)
      .then(r=>r.json()).then(j=>{
        if(!j.ok)return;
        setWatchPerformance(j.results||{});
        localStorage.setItem(storageKey,JSON.stringify({savedAt:j.fetchedAt,results:j.results||{}}));
      }).catch(()=>{});
  }, [watch.join(",")]);
  useEffect(() => {
    const text = newCode.trim();
    setWatchPage(0);
    if (!text) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(
      () =>
        fetch(`/api/market?type=search&q=${encodeURIComponent(text)}`)
          .then((r) => r.json())
          .then((j) => setSuggestions(j.results || []))
          .catch(() => setSuggestions([]))
          .finally(() => setSearching(false)),
      260,
    );
    return () => clearTimeout(t);
  }, [newCode]);
  useEffect(() => {
    const text = holdingInput.trim();
    setHoldingPage(0);
    if (!text) {
      setHoldingSuggestions([]);
      return;
    }
    setHoldingSearching(true);
    const t = setTimeout(
      () =>
        fetch(`/api/market?type=search&q=${encodeURIComponent(text)}`)
          .then((r) => r.json())
          .then((j) => setHoldingSuggestions(j.results || []))
          .catch(() => setHoldingSuggestions([]))
          .finally(() => setHoldingSearching(false)),
      260,
    );
    return () => clearTimeout(t);
  }, [holdingInput]);
  const map = useMemo(() => {
    const m: Record<string, Quote> = {};
    quotes.forEach((q) => {
      m[`${q.market}.${q.code}`] = q;
      if (!INDEX_CODES.includes(`${q.market}.${q.code}`)) m[q.code] = q;
    });
    return m;
  }, [quotes]);
  const simToday = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const simFee = (amount: number, side: "buy" | "sell") => Math.max(5, amount * .0003) + amount * .00001 + (side === "sell" ? amount * .0005 : 0);
  const fillSimOrder = (order: SimOrder, fillPrice: number) => {
    if (simProcessingRef.current.has(order.id)) return;
    simProcessingRef.current.add(order.id);
    const amount = fillPrice * order.quantity, fee = simFee(amount, order.side);
    if (order.side === "buy") {
      if (simCashRef.current < amount + fee) { setSimOrders((items) => items.map((x) => x.id === order.id ? { ...x, status: "rejected", note: "可用资金不足" } : x)); return; }
      setSimCash((cash) => cash - amount - fee);
      setSimPositions((items) => { const old = items.find((x) => x.code === order.code); if (!old) return [...items, { code: order.code, name: order.name, shares: order.quantity, available: 0, cost: (amount + fee) / order.quantity, buyDate: simToday }]; const total = old.shares + order.quantity; return items.map((x) => x.code === order.code ? { ...x, shares: total, cost: (old.cost * old.shares + amount + fee) / total, buyDate: simToday } : x); });
    } else {
      const position = simPositionsRef.current.find((x) => x.code === order.code);
      if (!position || position.available < order.quantity) { setSimOrders((items) => items.map((x) => x.id === order.id ? { ...x, status: "rejected", note: "可用股份不足（模拟账户执行T+1）" } : x)); return; }
      setSimCash((cash) => cash + amount - fee);
      setSimPositions((items) => items.map((x) => x.code === order.code ? { ...x, shares: x.shares - order.quantity, available: x.available - order.quantity } : x).filter((x) => x.shares > 0));
    }
    setSimOrders((items) => items.map((x) => x.id === order.id ? { ...x, status: "filled", filledAt: new Date().toISOString(), filledPrice: +fillPrice.toFixed(2), fee: +fee.toFixed(2) } : x));
  };
  const placeSimOrder = () => {
    const code = simCode.replace(/\D/g, "").slice(-6), quote = map[code];
    if (!quote || !Number.isFinite(quote.price)) { setSimMessage("未取得该证券实时行情，请输入已上市的6位股票或ETF代码"); return; }
    const quantity = Math.floor(simQuantity / 100) * 100, price = simOrderType === "market" ? quote.price : simPrice;
    if (quantity <= 0 || price <= 0) { setSimMessage("委托数量必须为100股整数倍，价格必须大于0"); return; }
    const frozenBuy = simOrders.filter((x) => x.status === "pending" && x.side === "buy").reduce((sum, x) => sum + x.price * x.quantity, 0);
    const frozenSell = simOrders.filter((x) => x.status === "pending" && x.side === "sell" && x.code === code).reduce((sum, x) => sum + x.quantity, 0);
    if (simSide === "buy" && simCash - frozenBuy < price * quantity + simFee(price * quantity, "buy")) { setSimMessage("可用资金不足"); return; }
    if (simSide === "sell" && (simPositions.find((x) => x.code === code)?.available || 0) - frozenSell < quantity) { setSimMessage("可卖数量不足；当日买入股份需下一交易日才能卖出"); return; }
    const order: SimOrder = { id: `${Date.now()}-${code}`, code, name: quote.name, side: simSide, orderType: simOrderType, price: +price.toFixed(2), quantity, status: "pending", createdAt: new Date().toISOString() };
    setSimOrders((items) => [order, ...items]); setSimMessage("委托已提交");
    const crosses = simOrderType === "market" || (simSide === "buy" ? price >= quote.price : price <= quote.price);
    if (crosses) setTimeout(() => fillSimOrder(order, quote.price), 0);
  };
  useEffect(() => { simCashRef.current = simCash; simPositionsRef.current = simPositions; }, [simCash, simPositions]);
  useEffect(() => {
    const text = simCode.trim();
    if (!text) { setSimSuggestions([]); return; }
    const timer = setTimeout(() => fetch(`/api/market?type=search&q=${encodeURIComponent(text)}`).then((response) => response.json()).then((json) => setSimSuggestions(json.results || [])).catch(() => setSimSuggestions([])), 220);
    return () => clearTimeout(timer);
  }, [simCode]);
  useEffect(() => { const code = simCode.replace(/\D/g, "").slice(-6), quote = map[code]; if (quote?.price && simPriceCodeRef.current !== code) { simPriceCodeRef.current = code; setSimPrice(quote.price); } }, [simCode, quotes]);
  useEffect(() => { setSimPositions((items) => { let changed = false; const next = items.map((position) => { if (position.buyDate !== simToday && position.available !== position.shares) { changed = true; return { ...position, available: position.shares }; } return position; }); return changed ? next : items; }); }, [simToday, simPositions.length]);
  useEffect(() => { localStorage.setItem("wealth-simulator-v1", JSON.stringify({ cash: simCash, positions: simPositions, orders: simOrders })); }, [simCash, simPositions, simOrders]);
  useEffect(() => {
    if (!authUser || !userDataReady) return;
    setCloudSaveState("saving");
    const timer = setTimeout(() => {
      const data = { watchGroups, watchMeta, holdings, alerts, alertSettings, savedScreeners, planEvents, planStatuses: planStatusRef.current, simulator: { cash: simCash, positions: simPositions, orders: simOrders }, aiAnalyses, profile, preferences: { selected, klt, chartMode, lesson } };
      fetch("/api/user-data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) }).then((response) => { if (!response.ok) throw new Error("保存失败"); setCloudSaveState("saved"); }).catch(() => setCloudSaveState("error"));
    }, 650);
    return () => clearTimeout(timer);
  }, [authUser, userDataReady, watchGroups, watchMeta, holdings, alerts, alertSettings, savedScreeners, planEvents, simCash, simPositions, simOrders, aiAnalyses, profile, selected, klt, chartMode, lesson]);
  useEffect(() => {
    simOrders.filter((order) => order.status === "pending").forEach((order) => { const quote = map[order.code]; if (!quote) return; const crosses = order.side === "buy" ? order.price >= quote.price : order.price <= quote.price; if (crosses) fillSimOrder(order, quote.price); });
  }, [quotes]);
  useEffect(() => {
    if (!alertSettings.enabled || !quotes.length) return;
    const now = Date.now();
    const marketClock = getShanghaiMarketClock(new Date(now));
    if (!marketClock.isTradingSession) {
      quoteHistoryRef.current = {};
      return;
    }
    const tracked = new Set([...watch, ...holdings.map((h) => h.code)]);
    const cooldownKey = "wealth-alert-cooldowns-v2";
    let cooldowns: Record<string, number> = {};
    try { cooldowns = JSON.parse(localStorage.getItem(cooldownKey) || "{}"); } catch {}
    const candidates: Omit<MarketAlert, "id" | "createdAt" | "read">[] = [];
    const add = (quote: Quote, rule: string, level: AlertLevel, title: string, detail: string, value: number, threshold: number, direction: MarketAlert["direction"]) => {
      const key = `${marketClock.tradeDate}:${quote.code}:${rule}:${direction}`;
      if (ONCE_PER_TRADING_DAY_RULES.has(rule) ? Boolean(cooldowns[key]) : now - (cooldowns[key] || 0) < alertSettings.cooldownMinutes * 60000) return;
      cooldowns[key] = now;
      candidates.push({ code: quote.code, name: quote.name, rule, level, title, detail, value, threshold, direction });
    };
    quotes.filter((quote) => tracked.has(quote.code)).forEach((quote) => {
      if (Math.abs(quote.changePct) >= alertSettings.changePct) {
        add(quote, "day-change", Math.abs(quote.changePct) >= 7 ? "critical" : "warning", `${quote.changePct >= 0 ? "快速上涨" : "快速下跌"} ${Math.abs(quote.changePct).toFixed(2)}%`, `当日涨跌幅越过 ±${alertSettings.changePct}% 阈值，需结合公告、板块和量能核验。`, quote.changePct, alertSettings.changePct, quote.changePct >= 0 ? "bull" : "bear");
      }
      const previous = quoteHistoryRef.current[quote.code];
      if (previous?.price > 0 && now - previous.at <= 20000) {
        const move = ((quote.price - previous.price) / previous.price) * 100;
        if (Math.abs(move) >= alertSettings.instantMovePct) {
          add(quote, "instant-move", "critical", `短时异动 ${move >= 0 ? "+" : ""}${move.toFixed(2)}%`, `相邻行情快照出现明显位移；可能来自快速成交、复牌或数据跳变，需查看盘口确认。`, move, alertSettings.instantMovePct, move >= 0 ? "bull" : "bear");
        }
      }
      if (Number.isFinite(quote.volumeRatio) && quote.volumeRatio >= alertSettings.volumeRatio) {
        add(quote, "volume-ratio", "warning", `量比放大至 ${quote.volumeRatio.toFixed(2)}`, `当前量比超过 ${alertSettings.volumeRatio}，表示成交节奏显著高于近期同期水平。`, quote.volumeRatio, alertSettings.volumeRatio, quote.changePct >= 0 ? "bull" : "bear");
      }
      if (Number.isFinite(quote.turnover) && quote.turnover >= alertSettings.turnover) {
        add(quote, "turnover", "warning", `异常换手 ${quote.turnover.toFixed(2)}%`, `换手率超过 ${alertSettings.turnover}%，筹码交换活跃，方向需结合价格位置判断。`, quote.turnover, alertSettings.turnover, quote.changePct >= 0 ? "bull" : "bear");
      }
      const flowYi = quote.mainNetInflow / 100000000;
      if (Number.isFinite(flowYi) && Math.abs(flowYi) >= alertSettings.mainFlowYi) {
        add(quote, "main-flow", Math.abs(flowYi) >= alertSettings.mainFlowYi * 3 ? "critical" : "warning", `${flowYi >= 0 ? "主力资金净流入" : "主力资金净流出"} ${Math.abs(flowYi).toFixed(2)}亿`, `主力净流额越过 ±${alertSettings.mainFlowYi}亿元；资金口径仅作线索，不等于真实机构买卖。`, flowYi, alertSettings.mainFlowYi, flowYi >= 0 ? "bull" : "bear");
      }
      const holding = holdings.find((item) => item.code === quote.code);
      if (holding && holding.cost > 0) {
        const holdingReturn = ((quote.price - holding.cost) / holding.cost) * 100;
        if (Math.abs(holdingReturn) >= alertSettings.holdingReturnPct) {
          add(quote, "holding-return", holdingReturn <= -alertSettings.holdingReturnPct ? "critical" : "info", `持仓浮动${holdingReturn >= 0 ? "盈利" : "亏损"} ${Math.abs(holdingReturn).toFixed(2)}%`, `相对录入成本 ${holding.cost.toFixed(2)} 元已越过 ±${alertSettings.holdingReturnPct}% 提醒线。`, holdingReturn, alertSettings.holdingReturnPct, holdingReturn >= 0 ? "bull" : "bear");
        }
      }
      quoteHistoryRef.current[quote.code] = { price: quote.price, at: now };
    });
    if (!candidates.length) return;
    const created = candidates.map((item, index) => ({ ...item, id: `${now}-${index}-${item.code}-${item.rule}`, createdAt: new Date(now).toISOString(), read: false }));
    setAlerts((current) => {
      const next = compactAlertHistory([...created, ...current]);
      localStorage.setItem("wealth-alerts-v1", JSON.stringify(next));
      return next;
    });
    localStorage.setItem(cooldownKey, JSON.stringify(cooldowns));
    const urgent = created.find((item) => item.level === "critical");
    if (urgent && alertSettings.desktopNotifications && "Notification" in window && Notification.permission === "granted") {
      new Notification(`WEALTH OS · ${urgent.name}`, { body: `${urgent.title}：${urgent.detail}` });
    }
  }, [quotes, watch, holdings, alertSettings]);
  const saveAlertSettings = (next: AlertSettings) => {
    setAlertSettings(next);
    localStorage.setItem("wealth-alert-settings-v1", JSON.stringify(next));
  };
  const markAllAlertsRead = () => setAlerts((current) => {
    const next = current.map((item) => ({ ...item, read: true }));
    localStorage.setItem("wealth-alerts-v1", JSON.stringify(next));
    return next;
  });
  const clearAlerts = () => {
    setAlerts([]);
    localStorage.removeItem("wealth-alerts-v1");
  };
  const toggleNotifications = async () => {
    if (alertSettings.desktopNotifications) {
      saveAlertSettings({ ...alertSettings, desktopNotifications: false });
      return;
    }
    if (!("Notification" in window)) return;
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") saveAlertSettings({ ...alertSettings, desktopNotifications: true });
  };
  const unreadAlerts = alerts.filter((item) => !item.read).length;
  const visibleAlerts = alerts.filter((item) => alertFilter === "all" || item.level === alertFilter);
  const alertMarketClock = getShanghaiMarketClock();
  useEffect(() => {
    if (!watch.length) return;
    let changed=false;
    const next={...watchMeta};
    watch.forEach(code=>{
      const current=next[code];
      if(!current){next[code]={addedAt:new Date().toISOString(),addedPrice:map[code]?.price??null};changed=true}
      else if(current.addedPrice==null&&Number.isFinite(map[code]?.price)){next[code]={...current,addedPrice:map[code].price};changed=true}
    });
    if(changed){setWatchMeta(next);localStorage.setItem("wealth-watch-meta-v1",JSON.stringify(next))}
  }, [watch.join(","), map]);
  const selectedDigits=selected.replace(/\D/g, "").slice(-6);
  const q = detail?.code === selectedDigits && detail.quote
    ? ({...(map[selected]||{}),...detail.quote,name:detail.name||map[selected]?.name||selectedDigits,code:selectedDigits} as Quote)
    : map[selected];
  useEffect(() => {
    const keyword=q?.name;
    setStockNews([]);setNewsUpdatedAt("");
    if(!keyword)return;
    let active=true;
    const updateNews=()=>fetch(`/api/market?type=news&q=${encodeURIComponent(keyword)}`,{cache:"no-store"})
      .then(r=>r.json()).then(j=>{if(active&&j.ok){setStockNews(j.items||[]);setNewsUpdatedAt(j.fetchedAt||"")}}).catch(()=>{});
    updateNews();
    const timer=setInterval(updateNews,300000);
    return()=>{active=false;clearInterval(timer)};
  }, [selected, q?.name]);
  const closes = bars.map((b) => b.close),
    ma = (n: number) =>
      closes.length >= n
        ? closes.slice(-n).reduce((a, b) => a + b, 0) / n
        : NaN;
  const signal =
    bars.length < 60
      ? "数据不足，暂停分析"
      : !q
        ? "行情快照不可用"
        : q.price > ma(20) && ma(20) > ma(60)
          ? "趋势偏强，等待回踩确认"
          : q.price < ma(20) && ma(20) < ma(60)
            ? "趋势偏弱，优先控制风险"
            : "区间震荡，等待方向确认";
  const tone =
    bars.length < 60
      ? "neutral"
      : q && q.price > ma(20) && ma(20) > ma(60)
        ? "bull"
        : q && q.price < ma(20) && ma(20) < ma(60)
          ? "bear"
          : "neutral";
  const holdingValue = holdings.reduce(
      (s, h) => s + (map[h.code]?.price || 0) * h.shares,
      0,
    ),
    holdingCost = holdings.reduce((s, h) => s + h.cost * h.shares, 0);
  const holdingTotalPnl = holdings.reduce((s, h) => {
      const p = map[h.code]?.price;
      return s + (typeof p === "number" && Number.isFinite(p) ? (p - h.cost) * h.shares : 0);
    }, 0),
    holdingTotalPnlCost = holdings.reduce((s, h) => {
      const p = map[h.code]?.price;
      return s + (typeof p === "number" && Number.isFinite(p) ? h.cost * h.shares : 0);
    }, 0),
    holdingTotalRate = holdingTotalPnlCost > 0 ? (holdingTotalPnl / holdingTotalPnlCost) * 100 : NaN;
  const holdingPrevClose = (code: string) => {
    const quote = map[code];
    return quote
      ? quote.prevClose || (typeof quote.change === "number" && Number.isFinite(quote.change) ? quote.price - quote.change : 0)
      : 0;
  };
  const holdingDayPnl = holdings.reduce((s, h) => {
      const p = map[h.code]?.price, prev = holdingPrevClose(h.code);
      return s + (typeof p === "number" && Number.isFinite(p) && prev > 0 ? (p - prev) * h.shares : 0);
    }, 0),
    holdingDayStart = holdings.reduce((s, h) => {
      const p = map[h.code]?.price, prev = holdingPrevClose(h.code);
      return s + (typeof p === "number" && Number.isFinite(p) && prev > 0 ? prev * h.shares : 0);
    }, 0),
    holdingDayRate = holdingDayStart > 0 ? (holdingDayPnl / holdingDayStart) * 100 : NaN;
  const saveWatch = (w: string[]) => {
    setWatch(w);
    localStorage.setItem("wealth-watch", JSON.stringify(w));
  };
  const saveWatchGroups = (groups: typeof watchGroups) => {
    setWatchGroups(groups);
    localStorage.setItem("wealth-watch-groups-v1", JSON.stringify(groups));
    saveWatch(Array.from(new Set(groups.flatMap((g) => g.codes))));
  };
  const activeWatchCodes =
    watchGroups.find((g) => g.id === activeWatchGroup)?.codes || [];
  const addWatchGroup = () => {
    const name = newGroupName.trim();
    if (!name || watchGroups.some((g) => g.name === name)) return;
    const id = `group-${Date.now()}`;
    saveWatchGroups([...watchGroups, { id, name, codes: [] }]);
    setActiveWatchGroup(id);
    setNewGroupName("");
    setWatchListPage(0);
  };
  const removeWatchCode = (code: string) =>
    saveWatchGroups(
      watchGroups.map((g) =>
        g.id === activeWatchGroup
          ? { ...g, codes: g.codes.filter((c) => c !== code) }
          : g,
      ),
    );
  const moveWatchCode = (code: string, targetId: string) => {
    if (!targetId || targetId === activeWatchGroup) return;
    saveWatchGroups(
      watchGroups.map((g) => {
        if (g.id === activeWatchGroup)
          return { ...g, codes: g.codes.filter((c) => c !== code) };
        if (g.id === targetId)
          return { ...g, codes: g.codes.includes(code) ? g.codes : [...g.codes, code] };
        return g;
      }),
    );
  };
  const saveHold = (h: typeof holdings) => {
    setHoldings(h);
    localStorage.setItem("wealth-holdings", JSON.stringify(h));
  };
  const addCode = (value?: string) => {
    const c = (value || newCode).replace(/\D/g, "").slice(0, 6);
    if (c.length === 6 && !activeWatchCodes.includes(c)) {
      if(!watchMeta[c]){
        const next={...watchMeta,[c]:{addedAt:new Date().toISOString(),addedPrice:map[c]?.price??null}};
        setWatchMeta(next);localStorage.setItem("wealth-watch-meta-v1",JSON.stringify(next));
      }
      saveWatchGroups(
        watchGroups.map((g) =>
          g.id === activeWatchGroup ? { ...g, codes: [...g.codes, c] } : g,
        ),
      );
    }
    setNewCode("");
    setSuggestions([]);
  };
  const addHolding = (code?: string) => {
    const c = (code || holdingInput).replace(/\D/g, "").slice(0, 6);
    if (c.length !== 6) return;
    saveHold([...holdings, { code: c, shares: 100, cost: 0 }]);
    setHoldingInput("");
    setHoldingSuggestions([]);
  };
  const pageSize = 6,
    watchPages = Math.max(1, Math.ceil(suggestions.length / pageSize)),
    holdingPages = Math.max(1, Math.ceil(holdingSuggestions.length / pageSize));
  const listPageSize = 8,
    watchListPages = Math.max(1, Math.ceil(activeWatchCodes.length / listPageSize)),
    holdingListPages = Math.max(1, Math.ceil(holdings.length / listPageSize));
  const sortedWatchCodes = useMemo(
    () =>
      [...activeWatchCodes].sort((a, b) => {
        const metric=(code:string)=>{
          if(watchSort.key==="addedAt")return new Date(watchMeta[code]?.addedAt||0).getTime();
          if(watchSort.key==="addedPrice")return watchMeta[code]?.addedPrice==null?NaN:Number(watchMeta[code].addedPrice);
          if(watchSort.key==="watchReturn"){const p=watchMeta[code]?.addedPrice;return p?((Number(map[code]?.price)-p)/p)*100:NaN}
          if(["month","ytd","rollingMonth","rollingYear"].includes(watchSort.key)){const value=watchPerformance[code]?.[watchSort.key as "month"|"ytd"|"rollingMonth"|"rollingYear"];return value==null?NaN:Number(value)}
          return Number(map[code]?.[watchSort.key as "price"|"changePct"|"change"|"marketCap"|"floatMarketCap"|"turnover"|"mainNetInflow"]);
        };
        const av = metric(a);
        const bv = metric(b);
        const aok = Number.isFinite(av), bok = Number.isFinite(bv);
        if (!aok && !bok) return 0;
        if (!aok) return 1;
        if (!bok) return -1;
        return watchSort.direction === "asc" ? av - bv : bv - av;
      }),
    [activeWatchCodes.join(","), map, watchSort, watchPerformance, watchMeta],
  );
  const chooseWatchSort = (key: typeof watchSort.key, direction?: "asc" | "desc") => {
    setWatchSort((current) => ({
      key,
      direction: direction || (current.key === key && current.direction === "desc" ? "asc" : "desc"),
    }));
    setWatchListPage(0);
  };
  const sortHead = (label: string, key: typeof watchSort.key) => (
    <span
      className={`sortable-head ${watchSort.key === key ? "active" : ""}`}
      onClick={() => chooseWatchSort(key)}
      title={`按${label}排序`}
    >
      {label}
      <i aria-hidden="true">
        {watchSort.key === key ? (watchSort.direction === "desc" ? "↓" : "↑") : "↕"}
      </i>
    </span>
  );
  useEffect(() => {
    setWatchListPage((p) => Math.min(p, watchListPages - 1));
  }, [watchListPages, activeWatchGroup]);
  useEffect(() => {
    setHoldingListPage((p) => Math.min(p, holdingListPages - 1));
  }, [holdingListPages]);
  const path = bars
    .slice(-60)
    .map((b, i, a) => {
      const vals = a.map((x) => x.close),
        mn = Math.min(...vals),
        mx = Math.max(...vals);
      return `${(i / (a.length - 1 || 1)) * 100},${85 - ((b.close - mn) / (mx - mn || 1)) * 70}`;
    })
    .join(" ");
  const recent = bars.slice(-60),
    support = recent.length ? Math.min(...recent.map((b) => b.low)) : NaN,
    resistance = recent.length ? Math.max(...recent.map((b) => b.high)) : NaN,
    avgVolume = recent.length
      ? recent.reduce((s, b) => s + b.volume, 0) / recent.length
      : NaN;
  useEffect(() => {
    setAiError("");
    try {
      const cached=aiAnalyses[selected] || JSON.parse(localStorage.getItem(`wealth-ai-analysis:${selected}`)||"null");
      if(cached&&Date.now()-new Date(cached.generatedAt).getTime()<30*60*1000){setAiAnalysis(cached.analysis);setAiMeta({model:cached.model||"DeepSeek",generatedAt:cached.generatedAt})}
      else {setAiAnalysis(null);setAiMeta({model:"",generatedAt:""})}
    } catch { setAiAnalysis(null) }
  }, [selected, aiAnalyses]);
  const runAiAnalysis = async () => {
    if(!q||bars.length<20)return;
    setAiLoading(true);setAiError("");
    try{
      const response=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        code:selectedDigits,name:q.name,
        quote:{price:q.price,change:q.change,changePct:q.changePct,turnover:q.turnover,pe:q.pe,pb:q.pb,marketCap:q.marketCap,floatMarketCap:q.floatMarketCap,mainNetInflow:q.mainNetInflow},
        technical:{klineAdjustment:"前复权",sampleCount:bars.length,asOf:bars.at(-1)?.date,ma20:Number.isFinite(ma(20))?+ma(20).toFixed(2):null,ma60:Number.isFinite(ma(60))?+ma(60).toFixed(2):null,support:Number.isFinite(support)?support:null,resistance:Number.isFinite(resistance)?resistance:null,averageVolume:Number.isFinite(avgVolume)?avgVolume:null,ruleSignal:signal},
        news:stockNews.slice(0,8).map(n=>({title:n.title,summary:n.summary,publishedAt:n.publishedAt,source:n.source}))
      })});
      const json=await response.json();if(!json.ok)throw new Error(json.error||"AI分析失败");
      setAiAnalysis(json.analysis);setAiMeta({model:json.model,generatedAt:json.generatedAt});
      setAiAnalyses((items) => ({ ...items, [selected]: { analysis: json.analysis, model: json.model, generatedAt: json.generatedAt } }));
      localStorage.setItem(`wealth-ai-analysis:${selected}`,JSON.stringify({analysis:json.analysis,model:json.model,generatedAt:json.generatedAt}));
    }catch(error){setAiError(error instanceof Error?error.message:"AI分析失败")}finally{setAiLoading(false)}
  };
  const filtered = courseLessons
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => JSON.stringify(x).toLowerCase().includes(learnQ.toLowerCase()));
  const total = principal * Math.pow(1 + rate / 100, years);
  const simMarketValue = simPositions.reduce((sum, position) => sum + (map[position.code]?.price || position.cost) * position.shares, 0);
  const simFrozenCash = simOrders.filter((order) => order.status === "pending" && order.side === "buy").reduce((sum, order) => sum + order.price * order.quantity + simFee(order.price * order.quantity, "buy"), 0);
  const simTotalAssets = simCash + simMarketValue;
  const simProfit = simTotalAssets - 1000000;
  const simQuote = map[simCode.replace(/\D/g, "").slice(-6)];
  if (!authChecked) return <main className="auth-shell"><section className="auth-card loading"><span className="auth-mark">↗</span><h1>WEALTH OS</h1><p>正在检查登录状态…</p></section></main>;
  if (!authUser) return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="auth-mark">↗</span><div><b>WEALTH OS</b><small>你的私人投资工作台</small></div></div><h1>{authMode === "login" ? "欢迎回来" : "创建账户"}</h1><p>登录后，自选、持仓、预警、模拟交易和学习进度都会按账户保存。</p>{authMode === "register" && <label>昵称<input value={authDisplayName} onChange={(event) => setAuthDisplayName(event.target.value)} placeholder="怎么称呼你" autoComplete="name" /></label>}<label>邮箱<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" /></label><label>密码<input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitAuth(); }} placeholder="至少8位" autoComplete={authMode === "login" ? "current-password" : "new-password"} /></label>{authError && <div className="auth-error">{authError}</div>}<button className="auth-submit" onClick={submitAuth} disabled={authLoading}>{authLoading ? "处理中…" : authMode === "login" ? "登录" : "注册并登录"}</button><button className="auth-switch" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}>{authMode === "login" ? "没有账户？立即注册" : "已有账户？返回登录"}</button><small className="auth-note">密码经过高强度哈希后保存，服务端使用 HttpOnly 会话 Cookie。</small></section></main>;
  return (
    <main className={`terminal color-${profile.colorMode}`}>
      <header>
        <div className="brand">
          <span>↗</span>
          <b>WEALTH OS</b>
          <small>真实数据投资工作台</small>
        </div>
        <nav>
          {[
            ["market", "市场"],
            ["screener", "选股"],
            ["radar", "雷达"],
            ["plans", "计划"],
            ["backtest", "模拟"],
            ["watch", "自选"],
            ["portfolio", "持仓"],
            ["alerts", `预警${unreadAlerts ? ` ${unreadAlerts}` : ""}`],
            ["strategy", "策略"],
            ["learn", "学习"],
          ].map((x) => (
            <button
              key={x[0]}
              className={tab === x[0] ? "active" : ""}
              onClick={() => setTab(x[0])}
            >
              {x[1]}
            </button>
          ))}
        </nav>
        <div className="head-actions">
          <button className="profile-trigger" onClick={() => setProfileOpen(true)}><i style={{background:profile.avatarColor}}>{profile.avatar || (profile.displayName || authUser.displayName).slice(0,1)}</i><span>{profile.displayName || authUser.displayName}<small>{cloudSaveState === "saving" ? "保存中" : cloudSaveState === "error" ? "保存失败" : userDataReady ? "已同步" : "加载中"}</small></span></button>
          <span className="status">
            {error ? `数据异常：${error}` : `真实行情 · ${stamp || "连接中"}`}
          </span>
          <button onClick={refresh}>{loading ? "同步中" : "↻ 刷新"}</button>
          <button className="logout-button" onClick={logout}>退出</button>
        </div>
      </header>
      {profileOpen && <div className="profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}><section className="profile-panel"><header><div><small>ACCOUNT CENTER</small><h2>个人中心</h2></div><button onClick={() => setProfileOpen(false)}>×</button></header><div className="profile-identity"><i style={{background:profile.avatarColor}}>{profile.avatar || "财"}</i><div><b>{profile.displayName || authUser.displayName}</b><span>{authUser.email}</span></div></div><div className="profile-grid"><label>显示昵称<input value={profile.displayName} maxLength={30} onChange={(event) => setProfile((item) => ({...item,displayName:event.target.value}))} /></label><label>头像文字 / Emoji<input value={profile.avatar} maxLength={2} onChange={(event) => setProfile((item) => ({...item,avatar:event.target.value}))} /></label><label>头像颜色<input type="color" value={profile.avatarColor} onChange={(event) => setProfile((item) => ({...item,avatarColor:event.target.value}))} /></label><label>默认首页<select value={profile.defaultTab} onChange={(event) => setProfile((item) => ({...item,defaultTab:event.target.value}))}><option value="market">市场</option><option value="screener">选股</option><option value="radar">雷达</option><option value="plans">计划</option><option value="backtest">模拟</option><option value="watch">自选</option><option value="portfolio">持仓</option><option value="alerts">预警</option><option value="strategy">策略</option><option value="learn">学习</option></select></label><label>行情刷新<select value={profile.refreshSeconds} onChange={(event) => setProfile((item) => ({...item,refreshSeconds:+event.target.value}))}><option value={3}>3秒</option><option value={5}>5秒</option><option value={10}>10秒</option><option value={30}>30秒</option></select></label><label>涨跌配色<select value={profile.colorMode} onChange={(event) => setProfile((item) => ({...item,colorMode:event.target.value as UserProfile["colorMode"]}))}><option value="cn">中国：红涨绿跌</option><option value="global">国际：绿涨红跌</option></select></label></div><div className="profile-security"><b>账户与数据</b><p>账号数据已存入D1数据库；密码不会传到页面状态或用户数据文件。</p><span>{cloudSaveState === "error" ? "最近同步失败，请检查网络" : "修改设置后自动保存"}</span></div><footer><button onClick={logout}>退出登录</button><button className="primary" onClick={() => setProfileOpen(false)}>完成</button></footer></section></div>}
      <section className="page realapp">
        {tab !== "learn" && (
          <div className="sourcebar">
            <b>数据口径</b> 东方财富 push2 / push2his · 行情与盘口约{Math.max(3, profile.refreshSeconds || 5)}秒刷新 ·
            K线前复权 · <span>最后成功 {stamp || "-"}</span>
          </div>
        )}
        {tab === "screener" && (
          <>
            <div className="screener-head"><div><span className="eyebrow">QUANT SCREENING</span><h1>全市场指标筛选</h1><p>从沪深京A股真实行情中组合筛选候选，不使用演示数据；结果是研究线索，不构成买入建议。</p></div><button onClick={() => refreshScreener(1)}>{screenerLoading ? "筛选中" : "运行筛选"}</button></div>
            <section className="screener-presets"><div>{screenerPresets.map((preset) => <button key={preset.name} onClick={() => { setScreenerFilters(preset.filters); refreshScreener(1, preset.filters); }}><b>{preset.name}</b><small>{preset.note}</small></button>)}</div><aside><div><input value={screenerName} onChange={(event) => setScreenerName(event.target.value)} placeholder="命名当前方案" onKeyDown={(event) => { if (event.key === 'Enter') saveScreener(); }}/><button onClick={saveScreener}>保存方案</button></div>{savedScreeners.length ? <ul>{savedScreeners.map((item) => <li key={item.id}><button onClick={() => { setScreenerFilters(item.filters); refreshScreener(1, item.filters); }}>{item.name}</button><span onClick={() => removeScreener(item.id)} role="button" tabIndex={0}>×</span></li>)}</ul> : <small>最多保存20个个人方案，并随账号同步。</small>}</aside></section>
            <section className="panel screener-filters">
              {([['minChange','最小涨幅','%'],['maxChange','最大涨幅','%'],['minTurnover','最低换手','%'],['minAmountYi','最低成交额','亿元'],['minCapYi','最低总市值','亿元'],['maxPe','最高PE','0=不限'],['maxPb','最高PB','0=不限'],['minVolumeRatio','最低量比','倍'],['minMainFlowYi','最低主力净流','亿元']] as const).map(([key,label,unit]) => <label key={key}><span>{label}</span><div><input type="number" step="0.1" value={screenerFilters[key]} onChange={(event) => setScreenerFilters((current) => ({...current,[key]:Number(event.target.value)}))}/><em>{unit}</em></div></label>)}
              <label><span>排序指标</span><select value={screenerFilters.sort} onChange={(event) => setScreenerFilters((current) => ({...current,sort:event.target.value as ScreenerFilters['sort']}))}><option value="changePct">涨跌幅</option><option value="amount">成交额</option><option value="turnover">换手率</option><option value="marketCap">总市值</option><option value="mainNetInflow">主力净流入</option><option value="volumeRatio">量比</option></select></label>
              <label><span>排序方向</span><select value={screenerFilters.direction} onChange={(event) => setScreenerFilters((current) => ({...current,direction:event.target.value as ScreenerFilters['direction']}))}><option value="desc">从高到低</option><option value="asc">从低到高</option></select></label>
              <button className="primary" onClick={() => refreshScreener(1)} disabled={screenerLoading}>{screenerLoading ? "正在读取全市场" : "应用条件"}</button>
            </section>
            {screenerError && <div className="ai-error">{screenerError}</div>}
            <div className="screener-meta"><span>全市场样本 {screenerUniverse || '—'} 只 · 命中 {screenerTotal} 只</span><small>东方财富实时行情 · {screenerUpdatedAt ? new Date(screenerUpdatedAt).toLocaleString('zh-CN') : '尚未运行'}</small></div>
            <section className="panel screener-table"><div className="screener-row header"><span>股票</span><span>最新价</span><span>涨跌幅</span><span>量比</span><span>换手率</span><span>成交额</span><span>总市值</span><span>PE / PB</span><span>主力净流</span><span>操作</span></div>{screenerRows.map((row) => <div className="screener-row" key={`${row.market}.${row.code}`}><span><b>{row.name}</b><small>{row.code}</small></span><span>{row.price.toFixed(2)}</span><span className={row.changePct >= 0 ? 'up' : 'down'}>{pct(row.changePct)}</span><span>{row.volumeRatio.toFixed(2)}</span><span>{row.turnover.toFixed(2)}%</span><span>{money(row.amount)}</span><span>{money(row.marketCap)}</span><span>{row.pe > 0 ? row.pe.toFixed(1) : '—'} / {row.pb > 0 ? row.pb.toFixed(1) : '—'}</span><span className={row.mainNetInflow >= 0 ? 'up' : 'down'}>{money(row.mainNetInflow)}</span><span><button onClick={() => addCode(row.code)}>加自选</button><button onClick={() => {setSelected(row.code);setTab('market')}}>详情</button><button onClick={() => {setSimCode(row.code);setSimPrice(row.price);setTab('backtest')}}>模拟</button></span></div>)}{!screenerRows.length && !screenerLoading && <div className="empty"><b>设置条件后运行筛选</b><span>默认最低成交额1亿元，避免低流动性样本干扰。</span></div>}</section>
            {screenerTotal > 30 && <div className="list-pager"><button disabled={screenerPage <= 1 || screenerLoading} onClick={() => showScreenerPage(screenerPage - 1)}>上一页</button><span>第 {screenerPage} / {Math.ceil(screenerTotal / 30)} 页</span><button disabled={screenerPage >= Math.ceil(screenerTotal / 30) || screenerLoading} onClick={() => showScreenerPage(screenerPage + 1)}>下一页</button></div>}
          </>
        )}
        {tab === "radar" && (
          <>
            <div className="radar-head">
              <div><span className="eyebrow">MARKET RADAR</span><h1>市场情绪与主线雷达</h1><p>板块强弱与涨停梯队来自最近交易日公开行情；热度分数只用于横向比较，不预测涨跌。</p></div>
              <div><small>交易日</small><b>{radar?.tradingDate ? `${radar.tradingDate.slice(0,4)}-${radar.tradingDate.slice(4,6)}-${radar.tradingDate.slice(6,8)}` : "-"}</b><button onClick={refreshRadar}>{radarLoading ? "更新中" : "↻ 更新雷达"}</button></div>
            </div>
            {radarError && <div className="ai-error">{radarError}{radar ? " · 当前显示上次成功缓存" : ""}</div>}
            <div className="radar-summary">
              <article><small>涨停家数</small><b className="up">{radar?.limitUp.total ?? "-"}</b><span>最近交易日涨停池</span></article>
              <article><small>最高连板</small><b>{radar?.limitUp.ladder[0]?.level ? `${radar.limitUp.ladder[0].level}板` : "-"}</b><span>{radar?.limitUp.ladder[0]?.stocks.length || 0}只并列</span></article>
              <article><small>炸板次数</small><b className="warn-number">{radar ? radar.limitUp.stocks.reduce((sum, stock) => sum + stock.openCount, 0) : "-"}</b><span>涨停池样本累计</span></article>
              <article><small>封单金额</small><b>{radar ? money(radar.limitUp.stocks.reduce((sum, stock) => sum + stock.sealedAmount, 0)) : "-"}</b><span>当前/收盘封单口径</span></article>
            </div>
            <div className="radar-tabs"><div><button className={radarView === "boards" ? "active" : ""} onClick={() => setRadarView("boards")}>板块热度</button><button className={radarView === "ladder" ? "active" : ""} onClick={() => setRadarView("ladder")}>涨停梯队</button></div><small>{radar?.source || "等待真实数据"} · {radar?.fetchedAt ? new Date(radar.fetchedAt).toLocaleString("zh-CN") : "-"}</small></div>
            {radarView === "boards" && <>
              <section className="panel radar-method"><div><b>公开评分公式</b><span>{radar?.methodology.formula || "加载中"}</span></div><small>{radar?.methodology.note}</small></section>
              <div className="radar-kind"><button className={radarBoardKind === "concept" ? "active" : ""} onClick={() => setRadarBoardKind("concept")}>热点概念</button><button className={radarBoardKind === "industry" ? "active" : ""} onClick={() => setRadarBoardKind("industry")}>行业板块</button></div>
              <section className="radar-board-list">
                {(radar?.boards[radarBoardKind] || []).slice(0, 20).map((board, index) => <article key={`${board.kind}-${board.code}`}>
                  <div className="radar-rank">{String(index + 1).padStart(2, "0")}</div><div className="radar-board-name"><b>{board.name}</b><small>{board.code} · 领涨 {board.leaderName || "-"}</small></div>
                  <div><small>热度</small><b>{board.heatScore}</b></div><div><small>涨跌</small><b className={board.changePct >= 0 ? "up" : "down"}>{pct(board.changePct)}</b></div><div><small>上涨宽度</small><b>{board.upCount}/{board.upCount + board.downCount}</b></div><div><small>主力净流</small><b className={board.mainNetInflow >= 0 ? "up" : "down"}>{money(board.mainNetInflow)}</b></div><div><small>换手</small><b>{board.turnover.toFixed(2)}%</b></div>
                  <div className="score-strip" title={`动量 ${board.components.momentum.toFixed(0)} · 宽度 ${board.components.breadth.toFixed(0)} · 资金 ${board.components.flow.toFixed(0)} · 活跃 ${board.components.activity.toFixed(0)}`}><i style={{width:`${board.heatScore}%`}} /></div>
                </article>)}
              </section>
            </>}
            {radarView === "ladder" && <>
              <section className="limit-industry-strip">{(radar?.limitUp.industries || []).slice(0, 10).map((industry) => <article key={industry.name}><b>{industry.name}</b><span>{industry.count}只涨停 · 最高{industry.maxStreak}板</span></article>)}</section>
              <section className="limit-ladder">{(radar?.limitUp.ladder || []).map((group) => <div className={`ladder-row level-${Math.min(group.level,4)}`} key={group.level}><header><b>{group.level}板</b><small>{group.stocks.length}只</small></header><div>{group.stocks.map((stock) => <button key={stock.code} onClick={() => { setSelected(stock.code); setTab("market"); }}><span><b>{stock.name}</b><em>{stock.code} · {stock.industry}</em></span><strong>{pct(stock.changePct)}</strong><small>首封 {stock.firstSealTime} · 炸板 {stock.openCount}次 · 换手 {stock.turnover.toFixed(1)}%</small></button>)}</div></div>)}</section>
            </>}
            {!radar && radarLoading && <div className="empty"><b>正在读取最近交易日板块与涨停数据…</b></div>}
          </>
        )}
        {tab === "plans" && (
          <>
            <div className="plans-head"><div><span className="eyebrow">DISCIPLINED EXECUTION</span><h1>交易计划与实时确认</h1><p>从自选和持仓生成条件计划。盘中越过触发位仅标记“条件确认”，不等于收盘突破或买入建议。</p></div><button onClick={refreshTradePlans}>{plansLoading ? "计算中" : "↻ 重新计算"}</button></div>
            {plansError && <div className="ai-error">{plansError}{tradePlans.length ? " · 当前显示上次成功缓存" : ""}</div>}
            <div className="plan-summary"><article><small>计划总数</small><b>{tradePlans.length}</b></article><article><small>条件确认</small><b className="up">{tradePlans.filter((plan) => plan.status === "confirmed").length}</b></article><article><small>重点观察</small><b className="warn-number">{tradePlans.filter((plan) => plan.status === "watch").length}</b></article><article><small>结构失效</small><b className="down">{tradePlans.filter((plan) => plan.status === "invalid").length}</b></article></div>
            <section className="panel plan-method"><div><b>评分口径</b><span>市场15 + 中期趋势20 + 短期结构15 + 量价20 + 动量15 + 风险收益与流动性15</span></div><small>前复权日线 · 最少120日 · 每30秒用实时价格重新核对 · 最后更新 {plansUpdatedAt ? new Date(plansUpdatedAt).toLocaleString("zh-CN") : "-"}</small></section>
            <div className="plan-filter">{(["all","confirmed","watch","neutral","invalid","insufficient"] as const).map((status) => <button key={status} className={planFilter === status ? "active" : ""} onClick={() => setPlanFilter(status)}>{status === "all" ? "全部" : status === "confirmed" ? "条件确认" : status === "watch" ? "重点观察" : status === "neutral" ? "普通观察" : status === "invalid" ? "结构失效" : "数据不足"}</button>)}</div>
            <section className="trade-plan-grid">
              {tradePlans.filter((plan) => planFilter === "all" || plan.status === planFilter).map((plan, index) => <article className={`trade-plan-card ${plan.status}`} key={plan.code}>
                <header><div><small>优先级 {index + 1}</small><h2>{plan.name} <em>{plan.code}</em></h2></div><div className="plan-score"><b>{plan.score ?? "—"}</b><small>综合分</small></div><span>{plan.statusLabel}</span></header>
                <div className="plan-live"><div><small>实时价</small><b>{plan.price?.toFixed(2) ?? "—"}</b></div><div><small>当日涨跌</small><b className={(plan.changePct || 0) >= 0 ? "up" : "down"}>{plan.changePct == null ? "—" : pct(plan.changePct)}</b></div><div><small>量比(20日)</small><b>{plan.indicators?.volumeRatio?.toFixed(2) ?? "—"}</b></div><div><small>风险收益比</small><b>{plan.levels?.riskReward ?? "—"}</b></div></div>
                {plan.levels && <div className="plan-levels"><div><small>突破触发</small><b>{plan.levels.entryTrigger}</b></div><div><small>回踩观察区</small><b>{plan.levels.pullbackLow}—{plan.levels.pullbackHigh}</b></div><div><small>结构失效</small><b className="down">{plan.levels.invalidPrice}</b></div><div><small>第一压力</small><b>{plan.levels.pressure}</b></div></div>}
                {plan.components && <div className="plan-components">{([['市场',plan.components.market,15],['中期趋势',plan.components.midTrend,20],['短期结构',plan.components.shortStructure,15],['量价',plan.components.volumePrice,20],['动量',plan.components.momentum,15],['风控流动性',plan.components.riskLiquidity,15]] as [string,number,number][]).map(([label,value,max]) => <div key={label}><span>{label}<em>{value}/{max}</em></span><i><b style={{width:`${value/max*100}%`}} /></i></div>)}</div>}
                {plan.rules ? <div className="plan-rules"><p><b>确认条件</b>{plan.rules.confirm}</p><p><b>回踩情景</b>{plan.rules.pullback}</p><p><b>失效条件</b>{plan.rules.invalid}</p></div> : <div className="plan-rules"><p>{plan.reasons.join("；")}</p></div>}
                <footer><small>{plan.dataHealth === "stale" ? "⚠ 临时沿用缓存 · " : plan.dataHealth === "insufficient" ? "⚠ 连续取数失败 · " : ""}{plan.adjustment || "—"} · {plan.sampleSize || 0}个样本 · 数据日 {plan.asOf || "—"}</small><div><button onClick={() => { setSimCode(plan.code); setSimPrice(plan.price || 0); setSimSide("buy"); setTab("backtest"); }}>模拟买入</button><button onClick={() => { setSelected(plan.code); setTab("market"); }}>查看K线与盘口</button></div></footer>
              </article>)}
              {!tradePlans.length && !plansLoading && <div className="empty"><b>暂无计划</b><span>请先在自选或持仓中添加股票。</span></div>}
            </section>
            <section className="panel plan-events"><div className="section-head"><div><small>状态留痕</small><h2>实时确认日志</h2></div><button onClick={() => { setPlanEvents([]); localStorage.removeItem("wealth-plan-events-v2"); }}>清空日志</button></div>{planEvents.length ? planEvents.slice(0,20).map((event) => <div key={event.id}><time>{new Date(event.createdAt).toLocaleString("zh-CN")}</time><b>{event.name} {event.code}</b><span>{({confirmed:"条件确认",watch:"重点观察",neutral:"普通观察",invalid:"结构失效",insufficient:"数据不足"} as Record<string,string>)[event.from] || event.from} → {({confirmed:"条件确认",watch:"重点观察",neutral:"普通观察",invalid:"结构失效",insufficient:"数据不足"} as Record<string,string>)[event.to] || event.to}</span><em>{event.price?.toFixed(2) || "—"}</em></div>) : <p className="news-note">仅记录有效策略状态变化；接口闪断和数据不足不会制造事件。</p>}</section>
          </>
        )}
        {tab === "backtest" && (
          <>
            <div className="sim-head"><div><span className="eyebrow">PAPER TRADING</span><h1>模拟交易中心</h1><p>使用真实行情练习下单、撤单与仓位管理。账户、委托和成交保存在当前浏览器，本功能不会连接券商或产生真实交易。</p></div><button onClick={() => { if (window.confirm("确定重置模拟账户？持仓、委托和成交记录都会清空。")) { setSimCash(1000000); setSimPositions([]); setSimOrders([]); simProcessingRef.current.clear(); } }}>重置账户</button></div>
            <section className="sim-summary">
              <article><small>总资产</small><b>{money(simTotalAssets)}</b><span>初始资金 100万元</span></article>
              <article><small>持仓市值</small><b>{money(simMarketValue)}</b><span>{simPositions.length}只证券</span></article>
              <article><small>可用资金</small><b>{money(Math.max(0, simCash - simFrozenCash))}</b><span>冻结 {money(simFrozenCash)}</span></article>
              <article><small>总盈亏</small><b className={simProfit >= 0 ? "up" : "down"}>{money(simProfit)}</b><span>{pct(simProfit / 1000000 * 100)}</span></article>
            </section>
            <div className="sim-layout">
              <section className="panel sim-ticket">
                <div className="sim-side"><button className={simSide === "buy" ? "buy active" : "buy"} onClick={() => setSimSide("buy")}>买入</button><button className={simSide === "sell" ? "sell active" : "sell"} onClick={() => setSimSide("sell")}>卖出</button></div>
                <label>证券代码 / 名称<input list="sim-security-list" value={simCode} onChange={(event) => setSimCode(event.target.value)} placeholder="输入公司名、简称、拼音或6位代码" /><datalist id="sim-security-list">{simSuggestions.filter((item) => item?.code).map((item) => <option key={`${item.market || "cn"}-${item.code}`} value={item.code}>{item.name || item.code}{item.market ? ` · ${String(item.market).toUpperCase()}` : ""}</option>)}</datalist></label>
                <div className="sim-order-types"><button className={simOrderType === "limit" ? "active" : ""} onClick={() => setSimOrderType("limit")}>限价委托</button><button className={simOrderType === "market" ? "active" : ""} onClick={() => setSimOrderType("market")}>市价模拟</button></div>
                <label>委托价格<input type="number" min="0.01" step="0.01" disabled={simOrderType === "market"} value={simOrderType === "market" ? (simQuote?.price || 0) : simPrice} onChange={(event) => setSimPrice(+event.target.value)} /></label>
                <label>委托数量<input type="number" min="100" step="100" value={simQuantity} onChange={(event) => setSimQuantity(+event.target.value)} /></label>
                <div className="sim-quick">{[100,500,1000,5000].map((quantity) => <button key={quantity} onClick={() => setSimQuantity(quantity)}>{quantity}股</button>)}</div>
                <button className={simSide === "buy" ? "sim-submit buy" : "sim-submit sell"} onClick={placeSimOrder}>{simSide === "buy" ? "提交买入委托" : "提交卖出委托"}</button>
                {simMessage && <p className="sim-message">{simMessage}</p>}
              </section>
              <section className="panel sim-quote">
                <small>实时行情 · 约{Math.max(3, profile.refreshSeconds || 5)}秒刷新</small><h2>{simQuote?.name || "请选择证券"} <em>{simQuote?.code || ""}</em></h2>
                <div className="sim-last"><b>{simQuote?.price?.toFixed(2) || "—"}</b><span className={(simQuote?.changePct || 0) >= 0 ? "up" : "down"}>{simQuote ? pct(simQuote.changePct) : "—"}</span></div>
                <div className="sim-quote-grid"><div><small>今开</small><b>{Number.isFinite(simQuote?.open) ? Number(simQuote?.open).toFixed(2) : "—"}</b></div><div><small>最高</small><b>{Number.isFinite(simQuote?.high) ? Number(simQuote?.high).toFixed(2) : "—"}</b></div><div><small>最低</small><b>{Number.isFinite(simQuote?.low) ? Number(simQuote?.low).toFixed(2) : "—"}</b></div><div><small>换手率</small><b>{Number.isFinite(simQuote?.turnover) ? `${Number(simQuote?.turnover).toFixed(2)}%` : "—"}</b></div></div>
                <div className="sim-rules"><b>模拟撮合规则</b><p>市价委托按当前最新价模拟成交；限价买单在最新价不高于委托价时成交，限价卖单反之。买入100股整数手，卖出执行T+1可用数量约束。</p><small>这是学习型近似撮合，不模拟排队、部分成交、涨跌停封单、停牌及真实券商延迟。</small></div>
              </section>
            </div>
            <section className="panel sim-ledger">
              <div className="sim-tabs"><div><button className={simView === "positions" ? "active" : ""} onClick={() => setSimView("positions")}>持仓</button><button className={simView === "orders" ? "active" : ""} onClick={() => setSimView("orders")}>当日委托</button><button className={simView === "fills" ? "active" : ""} onClick={() => setSimView("fills")}>成交记录</button></div><small>佣金万3（最低5元）· 过户费估算 · 卖出印花税万5</small></div>
              <div className="table-wrap"><table><thead>{simView === "positions" ? <tr><th>证券</th><th>持仓 / 可用</th><th>成本</th><th>最新</th><th>市值</th><th>持仓盈亏</th><th>操作</th></tr> : <tr><th>时间</th><th>证券</th><th>方向</th><th>类型</th><th>委托价 / 成交价</th><th>数量</th><th>费用</th><th>状态 / 操作</th></tr>}</thead><tbody>
                {simView === "positions" && simPositions.map((position) => { const latest = map[position.code]?.price || position.cost, pnl = (latest-position.cost)*position.shares; return <tr key={position.code}><td><b>{position.name}</b><small>{position.code}</small></td><td>{position.shares} / {position.available}</td><td>{position.cost.toFixed(3)}</td><td>{latest.toFixed(2)}</td><td>{money(latest*position.shares)}</td><td className={pnl >= 0 ? "up" : "down"}>{money(pnl)}<small>{pct((latest/position.cost-1)*100)}</small></td><td><button onClick={() => { setSimCode(position.code); setSimSide("sell"); setSimQuantity(Math.max(100, position.available)); window.scrollTo({top:0,behavior:"smooth"}); }}>卖出</button></td></tr> })}
                {simView !== "positions" && simOrders.filter((order) => simView === "orders" ? true : order.status === "filled").map((order) => <tr key={order.id}><td>{new Date(order.createdAt).toLocaleString("zh-CN")}</td><td><b>{order.name}</b><small>{order.code}</small></td><td className={order.side === "buy" ? "up" : "down"}>{order.side === "buy" ? "买入" : "卖出"}</td><td>{order.orderType === "market" ? "市价" : "限价"}</td><td>{order.price.toFixed(2)} / {order.filledPrice?.toFixed(2) || "—"}</td><td>{order.quantity}</td><td>{order.fee?.toFixed(2) || "—"}</td><td><span>{({pending:"已报",filled:"已成",cancelled:"已撤",rejected:"废单"} as Record<string,string>)[order.status]}{order.note ? ` · ${order.note}` : ""}</span>{order.status === "pending" && <button onClick={() => setSimOrders((items) => items.map((item) => item.id === order.id ? {...item,status:"cancelled"} : item))}>撤单</button>}</td></tr>)}
              </tbody></table></div>
              {((simView === "positions" && !simPositions.length) || (simView === "orders" && !simOrders.length) || (simView === "fills" && !simOrders.some((order) => order.status === "filled"))) && <div className="empty"><b>{simView === "positions" ? "暂无模拟持仓" : simView === "orders" ? "暂无委托" : "暂无成交"}</b><span>先在上方交易面板提交一笔模拟委托。</span></div>}
            </section>
          </>
        )}
        {tab === "backtest-history" && (
          <>
            <div className="backtest-head"><div><span className="eyebrow">HISTORICAL VERIFICATION</span><h1>策略回测实验室</h1><p>使用真实前复权日线，严格按下一交易日开盘成交，计入手续费和滑点；用于验证规则，不代表未来表现。</p></div><button onClick={runBacktest} disabled={backtestLoading}>{backtestLoading ? "计算中…" : "运行回测"}</button></div>
            <section className="panel backtest-controls">
              <label>股票代码<input value={backtestCode} onChange={(e) => setBacktestCode(e.target.value)} placeholder="例如 600519" /></label>
              <label>初始资金<input type="number" min="10000" value={backtestInitial} onChange={(e) => setBacktestInitial(+e.target.value)} /></label>
              <label>单边手续费（%）<input type="number" min="0" step="0.01" value={backtestFee} onChange={(e) => setBacktestFee(+e.target.value)} /></label>
              <label>滑点（%）<input type="number" min="0" step="0.05" value={backtestSlippage} onChange={(e) => setBacktestSlippage(+e.target.value)} /></label>
            </section>
            {backtestError && <div className="ai-error">{backtestError} · 数据不足时不会生成模拟结果</div>}
            {!backtest && !backtestLoading && <section className="panel backtest-intro"><h2>固定规则 v1</h2><div><article><b>入场</b><p>收盘突破此前20日最高价、MA20高于MA60且当日量比不低于1.2，下一交易日开盘买入。</p></article><article><b>退出</b><p>收盘跌破MA20、相对成本下跌8%或持有满20个交易日，下一交易日开盘卖出。</p></article><article><b>约束</b><p>A股100股整数手，满仓单标的；手续费与滑点按设置双边计算，不使用未来数据。</p></article></div></section>}
            {backtest && <>
              <div className="backtest-title"><div><small>{backtest.source}</small><h2>{backtest.name} · {backtest.code}</h2><p>{backtest.range.start} 至 {backtest.range.end} · {backtest.range.samples}个交易日样本</p></div><span>更新 {new Date(backtest.fetchedAt).toLocaleString("zh-CN")}</span></div>
              <section className="backtest-metrics">
                <article><small>总收益</small><b className={backtest.metrics.totalReturn >= 0 ? "up" : "down"}>{pct(backtest.metrics.totalReturn)}</b><span>同期持有 {pct(backtest.metrics.benchmarkReturn)}</span></article>
                <article><small>年化收益</small><b>{pct(backtest.metrics.annualized)}</b><span>期末 {money(backtest.metrics.finalEquity)}</span></article>
                <article><small>最大回撤</small><b className="down">{pct(backtest.metrics.maxDrawdown)}</b><span>峰值至谷底</span></article>
                <article><small>胜率</small><b>{backtest.metrics.winRate.toFixed(2)}%</b><span>{backtest.metrics.trades}笔完整交易</span></article>
                <article><small>盈亏因子</small><b>{backtest.metrics.profitFactor ?? "∞"}</b><span>总盈利 ÷ 总亏损</span></article>
              </section>
              <section className="panel backtest-curve"><div className="section-head"><div><small>净值对照</small><h2>策略与同期持有</h2></div></div><EquityChart data={backtest.curve} /></section>
              <section className="panel backtest-rules"><h2>本次参数与可复核口径</h2><div><p><b>入场：</b>{backtest.parameters.entry}</p><p><b>退出：</b>{backtest.parameters.exit}</p><p><b>成本：</b>单边手续费 {(backtest.parameters.feeRate*100).toFixed(3)}%，滑点 {(backtest.parameters.slippage*100).toFixed(3)}%，100股整数手。</p></div><small>回测只检验这套固定规则在该历史区间的表现，不包含涨跌停无法成交、停牌、印花税历史变化和容量冲击，存在幸存者偏差与参数过拟合风险。</small></section>
              <section className="panel backtest-trades"><div className="section-head"><div><small>逐笔审计</small><h2>交易明细</h2></div><span>最近优先 · 共{backtest.trades.length}笔</span></div><div className="table-wrap"><table><thead><tr><th>入场</th><th>退出</th><th>买入价</th><th>卖出价</th><th>股数</th><th>持有</th><th>收益</th><th>盈亏</th><th>退出原因</th></tr></thead><tbody>{backtest.trades.map((trade,i)=><tr key={`${trade.entryDate}-${i}`}><td>{trade.entryDate}</td><td>{trade.exitDate}</td><td>{trade.entryPrice}</td><td>{trade.exitPrice}</td><td>{trade.shares}</td><td>{trade.holdingDays}日</td><td className={trade.returnPct >= 0 ? "up" : "down"}>{pct(trade.returnPct)}</td><td>{money(trade.pnl)}</td><td>{trade.reason}</td></tr>)}</tbody></table></div>{!backtest.trades.length && <div className="empty"><b>区间内没有满足条件的交易</b><span>这是有效回测结果，不会为了展示而补造交易。</span></div>}</section>
            </>}
          </>
        )}
        {tab === "market" && (
          <>
            <div className="section-title">
              <span>
                <small>REAL MARKET</small>
                <h2>市场总览</h2>
              </span>
              <span className="click-hint">点击指数查看K线详情</span>
            </div>
            <div className="index-grid">
              {INDEX_CODES.map((c) => {
                const x = map[c];
                return (
                  <article
                    className={`index-card clickable ${(x?.changePct || 0) >= 0 ? "is-up" : "is-down"}`}
                    key={c}
                    onClick={() => {
                      setSelected(c);
                      setKlt("101");
                    }}
                  >
                    <div>
                      <span>{x?.name || c}</span>
                      <b className={(x?.changePct || 0) >= 0 ? "up" : "down"}>
                        {x ? pct(x.changePct) : "-"}
                      </b>
                    </div>
                    <strong>{x?.price ?? "-"}</strong>
                    <p>
                      高 {x?.high ?? "-"}　低 {x?.low ?? "-"}
                    </p>
                    <p>成交额 {x ? money(x.amount) : "-"}</p>
                  </article>
                );
              })}
            </div>
            <div className="market-workspace">
              <article className="panel market-focus">
                <div className="section-head">
                  <div>
                    <small>
                      {q?.name || selected.replace(/^[01]\./, "")} ·{" "}
                      {q?.code || selected.replace(/^[01]\./, "")}
                    </small>
                    <h2>
                      {q?.price ?? "-"}{" "}
                      <em className={(q?.changePct || 0) >= 0 ? "up" : "down"}>
                        {q ? pct(q.changePct) : "-"}
                      </em>
                    </h2>
                  </div>
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {!watch.includes(selected) && (
                      <option value={selected}>{q?.name || selected}</option>
                    )}
                    {watch.map((c) => (
                      <option key={c} value={c}>
                        {map[c]?.name || c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="chart-toolbar">
                  <div>
                    {[
                      ["5", "5分"],
                      ["30", "30分"],
                      ["60", "60分"],
                      ["101", "日K"],
                      ["102", "周K"],
                      ["103", "月K"],
                    ].map((x) => (
                      <button
                        className={klt === x[0] ? "active" : ""}
                        key={x[0]}
                        onClick={() => setKlt(x[0])}
                      >
                        {x[1]}
                      </button>
                    ))}
                  </div>
                  <div>
                    {[
                      ["candle", "蜡烛"],
                      ["line", "分时线"],
                      ["volume", "量价"],
                    ].map((x) => (
                      <button
                        className={chartMode === x[0] ? "active" : ""}
                        key={x[0]}
                        onClick={() => setChartMode(x[0])}
                      >
                        {x[1]}
                      </button>
                    ))}
                  </div>
                </div>
                {klineMeta.savedAt && (
                  <div className={`kline-cache-state ${klineMeta.fromCache ? "cached" : "fresh"}`}>
                    <span>{klineMeta.fromCache ? "本地缓存已秒开，后台更新中" : "K线已更新并保存到本地"}</span>
                    <small>
                      {klineMeta.source || "行情接口"} · {new Date(klineMeta.savedAt).toLocaleString("zh-CN")}
                    </small>
                  </div>
                )}
                <PriceChart bars={bars} mode={chartMode} />
                <div className="quote-detail">
                  <span>
                    开盘 <b>{q?.open ?? "-"}</b>
                  </span>
                  <span>
                    最高 <b>{q?.high ?? "-"}</b>
                  </span>
                  <span>
                    最低 <b>{q?.low ?? "-"}</b>
                  </span>
                  <span>
                    换手 <b>{q?.turnover ?? "-"}%</b>
                  </span>
                  <span>
                    PE(TTM) <b>{q?.pe ?? "-"}</b>
                  </span>
                  <span>
                    PB <b>{q?.pb ?? "-"}</b>
                  </span>
                </div>
              </article>
              <aside className="market-side">
                <article className={`panel decision-live ${tone}`}>
                  <small>系统观察 · {bars.length}条有效样本</small>
                  <h2>{signal}</h2>
                  <p>
                    MA20 {Number.isFinite(ma(20)) ? ma(20).toFixed(2) : "-"} ·
                    MA60 {Number.isFinite(ma(60)) ? ma(60).toFixed(2) : "-"}
                  </p>
                  <p>
                    {bars.length < 60
                      ? "数据不足时不输出方向性结论。"
                      : "结合价格、均线与量能描述当前结构，不预测收益。"}
                  </p>
                </article>
                <article className="panel orderbook">
                  <div className="section-head">
                    <h3>五档盘口</h3>
                    <small>实时快照</small>
                  </div>
                  {selected.includes(".") ? (
                    <p className="no-depth">指数不提供买卖五档</p>
                  ) : (
                    <>
                      <div className="book asks">
                        {(detail?.asks || [])
                          .slice()
                          .reverse()
                          .map((l, i) => (
                            <div key={i}>
                              <span>卖{5 - i}</span>
                              <b>{l.price ?? "-"}</b>
                              <em>{l.volume ? money(l.volume) : "-"}</em>
                            </div>
                          ))}
                      </div>
                      <div className="book-mid">最新 {q?.price ?? "-"}</div>
                      <div className="book bids">
                        {(detail?.bids || []).map((l, i) => (
                          <div key={i}>
                            <span>买{i + 1}</span>
                            <b>{l.price ?? "-"}</b>
                            <em>{l.volume ? money(l.volume) : "-"}</em>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </article>
              </aside>
            </div>
          </>
        )}
        {tab === "watch" && (
          <>
            <div className="toolrow">
              <div>
                <h1>自选股</h1>
                <p>支持公司名、股票简称、拼音首字母或6位代码模糊搜索。</p>
              </div>
              <div className="stock-search">
                <div>
                  <input
                    value={newCode}
                    onFocus={() => setWatchFocused(true)}
                    onBlur={() => setTimeout(() => setWatchFocused(false), 120)}
                    onChange={(e) => setNewCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCode(suggestions[0]?.code);
                      if (e.key === "Escape") setWatchFocused(false);
                    }}
                    placeholder="如：茅台 / gzmt / 600519"
                  />
                  <button onClick={() => addCode(suggestions[0]?.code)}>
                    添加
                  </button>
                </div>
                {watchFocused && newCode.trim() !== "" && (
                  <div
                    className="suggestions"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {searching && <p>正在搜索…</p>}
                    {!searching && suggestions.length === 0 && (
                      <p>没有找到沪深北股票</p>
                    )}
                    <div className="suggestion-list">
                      {suggestions
                        .slice(watchPage * pageSize, (watchPage + 1) * pageSize)
                        .map((s) => (
                          <button
                            key={`${s.exchange}${s.code}`}
                            onClick={() => addCode(s.code)}
                          >
                            <span>
                              <b>{s.name}</b>
                              <small>{s.pinyin}</small>
                            </span>
                            <em>
                              {s.exchange} {s.code}
                            </em>
                          </button>
                        ))}
                    </div>
                    {suggestions.length > pageSize && (
                      <div className="suggestion-pager">
                        <button
                          disabled={watchPage === 0}
                          onClick={() => setWatchPage((p) => p - 1)}
                        >
                          上一页
                        </button>
                        <span>
                          {watchPage + 1} / {watchPages} · 共{" "}
                          {suggestions.length} 项
                        </span>
                        <button
                          disabled={watchPage >= watchPages - 1}
                          onClick={() => setWatchPage((p) => p + 1)}
                        >
                          下一页
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="watch-groups panel">
              <div className="group-tabs" role="tablist" aria-label="自选股分组">
                {watchGroups.map((group) => (
                  <button
                    key={group.id}
                    className={group.id === activeWatchGroup ? "active" : ""}
                    onClick={() => {
                      setActiveWatchGroup(group.id);
                      setWatchListPage(0);
                    }}
                  >
                    {group.name} <small>{group.codes.length}</small>
                  </button>
                ))}
              </div>
              <div className="group-create">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addWatchGroup()}
                  placeholder="输入新分组名称"
                  aria-label="新分组名称"
                />
                <button onClick={addWatchGroup}>新建分组</button>
              </div>
            </div>
            <div className="stock-table watch-table">
              <div className="tr th">
                <span>名称 / 代码</span>
                {sortHead("最新价", "price")}
                {sortHead("涨跌额", "change")}
                {sortHead("涨跌幅", "changePct")}
                {sortHead("总市值", "marketCap")}
                {sortHead("流通市值", "floatMarketCap")}
                {sortHead("换手率", "turnover")}
                {sortHead("主力净流入", "mainNetInflow")}
                {sortHead("本月涨幅", "month")}
                {sortHead("今年涨幅", "ytd")}
                {sortHead("近一月涨幅", "rollingMonth")}
                {sortHead("近一年涨幅", "rollingYear")}
                {sortHead("自选日期", "addedAt")}
                {sortHead("自选价格", "addedPrice")}
                {sortHead("自选收益", "watchReturn")}
                <span>移动 / 操作</span>
              </div>
              {sortedWatchCodes
                .slice(
                  watchListPage * listPageSize,
                  (watchListPage + 1) * listPageSize,
                )
                .map((c) => {
                const x = map[c];
                const performance=watchPerformance[c];
                const meta=watchMeta[c];
                const watchReturn=meta?.addedPrice&&x?.price?((x.price-meta.addedPrice)/meta.addedPrice)*100:null;
                return (
                  <div
                    className="tr"
                    key={c}
                    onClick={() => {
                      setSelected(c);
                      setTab("market");
                    }}
                  >
                    <span>
                      <b>{x?.name || "数据暂不可用"}</b>
                      <small>{c}</small>
                    </span>
                    <span>{x?.price ?? "-"}</span>
                    <span className={(x?.change || 0) >= 0 ? "up" : "down"}>
                      {x && Number.isFinite(Number(x.change)) ? `${Number(x.change) >= 0 ? "+" : ""}${x.change}` : "-"}
                    </span>
                    <span className={(x?.changePct || 0) >= 0 ? "up" : "down"}>
                      {x ? pct(x.changePct) : "-"}
                    </span>
                    <span>{x ? money(x.marketCap) : "-"}</span>
                    <span>{x ? money(x.floatMarketCap) : "-"}</span>
                    <span>{x && Number.isFinite(Number(x.turnover)) ? `${x.turnover}%` : "-"}</span>
                    <span className={(x?.mainNetInflow || 0) >= 0 ? "up" : "down"}>
                      {x ? money(x.mainNetInflow) : "-"}
                    </span>
                    {[performance?.month,performance?.ytd,performance?.rollingMonth,performance?.rollingYear].map((value,index)=>(
                      <span key={index} className={(value??0)>=0?"up":"down"}>{value==null?"-":pct(value)}</span>
                    ))}
                    <span>{meta?.addedAt?new Date(meta.addedAt).toLocaleDateString("zh-CN"):"-"}</span>
                    <span>{meta?.addedPrice==null?"-":meta.addedPrice.toFixed(2)}</span>
                    <span className={(watchReturn??0)>=0?"up":"down"}>{watchReturn==null?"-":pct(watchReturn)}</span>
                    <span className="watch-actions" onClick={(e) => e.stopPropagation()}>
                      <select
                        value=""
                        disabled={watchGroups.length < 2}
                        aria-label={`移动 ${x?.name || c} 到其他分组`}
                        onChange={(e) => moveWatchCode(c, e.target.value)}
                      >
                        <option value="">移动到…</option>
                        {watchGroups.filter((g) => g.id !== activeWatchGroup).map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      <button onClick={() => removeWatchCode(c)}>移除</button>
                    </span>
                  </div>
                );
              })}
              {activeWatchCodes.length === 0 && (
                <div className="table-empty">当前分组暂无股票，请在上方搜索添加。</div>
              )}
              {activeWatchCodes.length > listPageSize && (
                <div className="list-pager">
                  <button disabled={watchListPage === 0} onClick={() => setWatchListPage((p) => p - 1)}>上一页</button>
                  <span>第 {watchListPage + 1} / {watchListPages} 页 · 共 {activeWatchCodes.length} 只</span>
                  <button disabled={watchListPage >= watchListPages - 1} onClick={() => setWatchListPage((p) => p + 1)}>下一页</button>
                </div>
              )}
            </div>
          </>
        )}
        {tab === "portfolio" && (
          <>
            <div className="toolrow">
              <div>
                <h1>我的持仓</h1>
                <p>输入公司名、简称、拼音或代码选择股票，再填写股数和成本。</p>
              </div>
              <div className="stock-search holding-search">
                <div>
                  <input
                    value={holdingInput}
                    onFocus={() => setHoldingFocused(true)}
                    onBlur={() =>
                      setTimeout(() => setHoldingFocused(false), 120)
                    }
                    onChange={(e) => setHoldingInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        addHolding(holdingSuggestions[0]?.code);
                      if (e.key === "Escape") setHoldingFocused(false);
                    }}
                    placeholder="如：宁德时代 / ndsd / 300750"
                  />
                  <button
                    onClick={() => addHolding(holdingSuggestions[0]?.code)}
                  >
                    新增仓位
                  </button>
                </div>
                {holdingFocused && holdingInput.trim() !== "" && (
                  <div
                    className="suggestions"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {holdingSearching && <p>正在搜索…</p>}
                    {!holdingSearching && holdingSuggestions.length === 0 && (
                      <p>没有找到沪深北股票</p>
                    )}
                    <div className="suggestion-list">
                      {holdingSuggestions
                        .slice(
                          holdingPage * pageSize,
                          (holdingPage + 1) * pageSize,
                        )
                        .map((s) => (
                          <button
                            key={`${s.exchange}${s.code}`}
                            onClick={() => addHolding(s.code)}
                          >
                            <span>
                              <b>{s.name}</b>
                              <small>{s.pinyin}</small>
                            </span>
                            <em>
                              {s.exchange} {s.code}
                            </em>
                          </button>
                        ))}
                    </div>
                    {holdingSuggestions.length > pageSize && (
                      <div className="suggestion-pager">
                        <button
                          disabled={holdingPage === 0}
                          onClick={() => setHoldingPage((p) => p - 1)}
                        >
                          上一页
                        </button>
                        <span>
                          {holdingPage + 1} / {holdingPages} · 共{" "}
                          {holdingSuggestions.length} 项
                        </span>
                        <button
                          disabled={holdingPage >= holdingPages - 1}
                          onClick={() => setHoldingPage((p) => p + 1)}
                        >
                          下一页
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="portfolio-summary">
              <div>
                <small>持仓市值</small>
                <b>¥ {money(holdingValue)}</b>
              </div>
              <div>
                <small>总收益</small>
                <b className={holdingTotalPnl > 0 ? "up" : holdingTotalPnl < 0 ? "down" : "flat"}>
                  ¥ {money(holdingTotalPnl)} <span className="rate">{pct(holdingTotalRate)}</span>
                </b>
              </div>
              <div>
                <small>当日收益</small>
                <b className={holdingDayPnl > 0 ? "up" : holdingDayPnl < 0 ? "down" : "flat"}>
                  ¥ {money(holdingDayPnl)} <span className="rate">{pct(holdingDayRate)}</span>
                </b>
              </div>
              <div>
                <small>持仓成本</small>
                <b>¥ {money(holdingCost)}</b>
              </div>
            </div>
            {holdings.length === 0 ? (
              <div className="empty">暂无持仓，请在上方搜索并选择股票。</div>
            ) : (
              <div className="stock-table holding-table">
                <div className="tr holding holding-head">
                  <span>股票代码</span>
                  <span>持有股数</span>
                  <span>每股成本</span>
                  <span>名称 / 当前市值</span>
                  <span>总收益 / 收益率</span>
                  <span>当日收益 / 收益率</span>
                  <span>操作</span>
                </div>
                {holdings
                  .slice(
                    holdingListPage * listPageSize,
                    (holdingListPage + 1) * listPageSize,
                  )
                  .map((h, pageIndex) => {
                  const i = holdingListPage * listPageSize + pageIndex;
                  const x = map[h.code];
                  const price = x?.price;
                  const prevClose = holdingPrevClose(h.code);
                  const totalPnl = typeof price === "number" && Number.isFinite(price) ? (price - h.cost) * h.shares : NaN;
                  const totalRate = typeof price === "number" && Number.isFinite(price) && h.cost > 0 ? ((price - h.cost) / h.cost) * 100 : NaN;
                  const dayPnl = typeof price === "number" && Number.isFinite(price) && prevClose > 0 ? (price - prevClose) * h.shares : NaN;
                  const dayRate = typeof price === "number" && Number.isFinite(price) && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : NaN;
                  return (
                    <div className="tr holding" key={i}>
                      <input
                        value={h.code}
                        aria-label="股票代码"
                        onChange={(e) => {
                          const z = [...holdings];
                          z[i] = {
                            ...h,
                            code: e.target.value.replace(/\D/g, "").slice(0, 6),
                          };
                          saveHold(z);
                        }}
                      />
                      <input
                        type="number"
                        value={h.shares}
                        aria-label="持有股数"
                        onChange={(e) => {
                          const z = [...holdings];
                          z[i] = { ...h, shares: +e.target.value };
                          saveHold(z);
                        }}
                      />
                      <input
                        type="number"
                        value={h.cost}
                        aria-label="每股成本"
                        onChange={(e) => {
                          const z = [...holdings];
                          z[i] = { ...h, cost: +e.target.value };
                          saveHold(z);
                        }}
                      />
                      <span>
                        <b>{x?.name || "行情暂不可用"}</b>
                        <small>
                          现价 {x?.price ?? "-"} · 市值 ¥
                          {money((x?.price || 0) * h.shares)}
                        </small>
                      </span>
                      <span className="gain">
                        <b className={totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : "flat"}>{money(totalPnl)}</b>
                        <small className={totalRate > 0 ? "up" : totalRate < 0 ? "down" : "flat"}>{pct(totalRate)}</small>
                      </span>
                      <span className="gain">
                        <b className={dayPnl > 0 ? "up" : dayPnl < 0 ? "down" : "flat"}>{money(dayPnl)}</b>
                        <small className={dayRate > 0 ? "up" : dayRate < 0 ? "down" : "flat"}>{pct(dayRate)}</small>
                      </span>
                      <button
                        onClick={() =>
                          saveHold(holdings.filter((_, j) => i !== j))
                        }
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
                {holdings.length > listPageSize && (
                  <div className="list-pager">
                    <button disabled={holdingListPage === 0} onClick={() => setHoldingListPage((p) => p - 1)}>上一页</button>
                    <span>第 {holdingListPage + 1} / {holdingListPages} 页 · 共 {holdings.length} 个持仓</span>
                    <button disabled={holdingListPage >= holdingListPages - 1} onClick={() => setHoldingListPage((p) => p + 1)}>下一页</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {tab === "alerts" && (
          <>
            <div className="alert-hero">
              <div>
                <span className="eyebrow">REAL-TIME SIGNAL ENGINE</span>
                <h1>智能预警中心</h1>
                <p>监控全部自选股与持仓股。规则在本地浏览器执行，依据真实行情快照生成可复核事件，不预测收益。</p>
              </div>
              <div className="alert-hero-actions">
                <button onClick={markAllAlertsRead}>全部已读</button>
                <button onClick={clearAlerts}>清空记录</button>
                <button className={alertSettings.desktopNotifications ? "" : "primary"} onClick={toggleNotifications}>
                  {alertSettings.desktopNotifications ? "关闭桌面通知" : notificationPermission === "denied" ? "桌面通知已被浏览器拒绝" : "开启桌面通知"}
                </button>
              </div>
            </div>
            <div className="alert-summary">
              <article><small>监控标的</small><b>{new Set([...watch, ...holdings.map((h) => h.code)]).size}</b></article>
              <article><small>未读事件</small><b>{unreadAlerts}</b></article>
              <article><small>高优先级</small><b className="up">{alerts.filter((a) => a.level === "critical").length}</b></article>
              <article><small>引擎状态</small><b className={alertSettings.enabled && alertMarketClock.isTradingSession ? "engine-on" : "down"}>{!alertSettings.enabled ? "已暂停" : alertMarketClock.isTradingSession ? "盘中监控" : `${alertMarketClock.phase}待机`}</b></article>
            </div>
            <section className="panel alert-settings">
              <div className="section-head">
                <div><small>规则阈值</small><h2>监控参数</h2></div>
                <label className="engine-switch"><input type="checkbox" checked={alertSettings.enabled} onChange={(e) => saveAlertSettings({ ...alertSettings, enabled: e.target.checked })}/><span>{alertSettings.enabled ? "实时监控" : "暂停监控"}</span></label>
              </div>
              <div className="alert-setting-grid">
                {([
                  ["changePct", "当日涨跌幅", "%"], ["instantMovePct", "短时价格位移", "%"], ["volumeRatio", "量比", "倍"],
                  ["turnover", "换手率", "%"], ["mainFlowYi", "主力净流额", "亿元"], ["holdingReturnPct", "持仓盈亏", "%"], ["cooldownMinutes", "同类冷却", "分钟"],
                ] as const).map(([key, label, unit]) => <label key={key}><span>{label}</span><div><input type="number" min="0.1" step="0.1" value={alertSettings[key]} onChange={(e) => saveAlertSettings({ ...alertSettings, [key]: Math.max(0.1, Number(e.target.value) || 0.1) })}/><em>{unit}</em></div></label>)}
              </div>
            </section>
            <div className="alert-toolbar">
              <div>{(["all", "critical", "warning", "info"] as const).map((level) => <button key={level} className={alertFilter === level ? "active" : ""} onClick={() => setAlertFilter(level)}>{level === "all" ? "全部" : level === "critical" ? "重大" : level === "warning" ? "关注" : "提示"}</button>)}</div>
              <small>仅交易时段生成事件 · 静态阈值按交易日去重 · 短时异动按冷却时间去重</small>
            </div>
            <section className="alert-feed">
              {visibleAlerts.map((item) => <article key={item.id} role="button" tabIndex={0} className={`alert-item ${item.level} ${item.read ? "read" : ""}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }} onClick={() => {
                const next = alerts.map((alert) => alert.id === item.id ? { ...alert, read: true } : alert);
                setAlerts(next); localStorage.setItem("wealth-alerts-v1", JSON.stringify(next)); setSelected(item.code);
              }}>
                <div className="alert-rank">{item.level === "critical" ? "重大" : item.level === "warning" ? "关注" : "提示"}</div>
                <div className="alert-copy"><div><b>{item.name}</b><small>{item.code} · {new Date(item.createdAt).toLocaleString("zh-CN")}</small></div><h3 className={item.direction}>{item.title}</h3><p>{item.detail}</p></div>
                <button onClick={(e) => { e.stopPropagation(); setSelected(item.code); setTab("market"); }}>查看行情</button>
              </article>)}
              {!visibleAlerts.length && <div className="empty alert-empty"><b>暂时没有符合阈值的异常事件</b><span>系统会继续监测自选和持仓，触发后自动记录在这里。</span></div>}
            </section>
          </>
        )}
        {tab === "strategy" && (
          <>
            <div className="strategy-title">
              <div>
                <span className="eyebrow">RULE-BASED ENGINE</span>
                <h1>纪律策略室</h1>
                <p>
                  以真实前复权日线、价格位置、估值和量能交叉验证；数据不足不分析。
                </p>
              </div>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {watch.map((c) => (
                  <option key={c} value={c}>
                    {map[c]?.name || c}
                  </option>
                ))}
              </select>
            </div>
            <article className={`decision panel strategy-tone ${tone}`}>
              <small>当前结构判断</small>
              <h2>{signal}</h2>
              <p>
                {q?.name || selected} 最新价 {q?.price ?? "-"}；20日均线{" "}
                {Number.isFinite(ma(20)) ? ma(20).toFixed(2) : "-"}，60日均线{" "}
                {Number.isFinite(ma(60)) ? ma(60).toFixed(2) : "-"}
                。红色表示偏多，绿色表示偏空，黄色表示中性或数据不足。
              </p>
              <div className="decision-metrics">
                <div>
                  <b>{q ? pct(q.changePct) : "-"}</b>
                  <span>当日涨跌</span>
                </div>
                <div>
                  <b>{q?.pe ?? "-"}</b>
                  <span>PE(TTM)</span>
                </div>
                <div>
                  <b>{q?.pb ?? "-"}</b>
                  <span>市净率</span>
                </div>
                <div>
                  <b>{bars.length}</b>
                  <span>有效样本</span>
                </div>
              </div>
            </article>
            <div className="strategy-grid">
              <article className="panel">
                <small>趋势与量能</small>
                <h3>
                  {tone === "bull"
                    ? "价格位于中期均线上方"
                    : tone === "bear"
                      ? "价格位于中期均线下方"
                      : "尚未形成一致方向"}
                </h3>
                <p>
                  近60期均量{" "}
                  {Number.isFinite(avgVolume) ? money(avgVolume) : "-"}
                  ；当前成交量 {bars.length ? money(bars.at(-1)!.volume) : "-"}
                  。
                </p>
              </article>
              <article className="panel">
                <small>关键区间</small>
                <h3>
                  {Number.isFinite(support)
                    ? `${support.toFixed(2)} — ${resistance.toFixed(2)}`
                    : "数据不足"}
                </h3>
                <p>区间来自最近60期最高与最低，仅作结构参考，不是目标价。</p>
              </article>
              <article className="panel">
                <small>触发与失效</small>
                <h3>
                  {tone === "bull"
                    ? "回踩MA20企稳后再确认"
                    : tone === "bear"
                      ? "重新站上MA20前保持谨慎"
                      : "等待突破区间边界"}
                </h3>
                <p>
                  {tone === "bull"
                    ? "跌破MA60则原偏强结构失效。"
                    : tone === "bear"
                      ? "放量站回MA60后重新评估。"
                      : "突破需量能确认，假突破则继续观察。"}
                </p>
              </article>
            </div>
            <section className="strategy-news panel">
              <div className="section-head">
                <div>
                  <small>公开消息面 · {q?.name || selected}</small>
                  <h2>实时事件与市场热点</h2>
                </div>
                <span>{newsUpdatedAt ? `更新 ${new Date(newsUpdatedAt).toLocaleTimeString("zh-CN")}` : "正在获取"}</span>
              </div>
              <p className="news-note">标题与摘要来自公开资讯检索；标签按关键词归类，不代表利好、利空判断。点击标题可查看原文。</p>
              <div className="stock-news-list">
                {stockNews.length ? stockNews.slice(0,8).map(item=>{
                  const tag=/业绩|年报|季报|营收|净利润/.test(item.title)?"业绩":/回购|增持|减持/.test(item.title)?"股东动向":/并购|收购|重组/.test(item.title)?"资本运作":/政策|监管|交易所/.test(item.title)?"政策监管":/产品|发布|技术|研发/.test(item.title)?"产业动态":"公司资讯";
                  return <article key={item.id}>
                    <div><span className="event-tag">{tag}</span><time>{item.publishedAt}</time><em>{item.source}</em></div>
                    <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                    {item.summary&&<p>{item.summary}</p>}
                  </article>
                }):<div className="news-empty">暂未取得该股票的公开资讯，系统不会生成虚构消息。</div>}
              </div>
            </section>
            <section className="ai-strategy panel">
              <div className="section-head">
                <div><small>DEEPSEEK AI · 数据约束分析</small><h2>智能策略解读</h2></div>
                <button disabled={aiLoading||!q||bars.length<20} onClick={runAiAnalysis}>{aiLoading?"分析中…":aiAnalysis?"重新生成":"生成AI分析"}</button>
              </div>
              <p className="ai-intro">模型只接收页面当前股票的真实行情、技术统计和公开消息摘要。结果缓存30分钟，点击重新生成才会再次产生API调用费用。</p>
              {aiError&&<div className="ai-error">{aiError}</div>}
              {!aiAnalysis&&!aiError&&<div className="ai-placeholder">点击“生成AI分析”后，DeepSeek将基于当前数据给出证据、消息影响、情景与风险。未配置密钥时规则证据层仍可正常使用。</div>}
              {aiAnalysis&&<div className="ai-result">
                <div className="ai-summary"><span className={`ai-stance ${aiAnalysis.stance==="偏强"?"bull":aiAnalysis.stance==="偏弱"?"bear":"neutral"}`}>{aiAnalysis.stance||"待判断"}</span><strong>{aiAnalysis.summary}</strong><small>置信度 {aiAnalysis.confidence||"-"}</small></div>
                <div className="ai-columns">
                  <article><h3>核心证据</h3><ul>{(aiAnalysis.evidence||[]).map((x:string,i:number)=><li key={i}>{x}</li>)}</ul></article>
                  <article><h3>主要风险</h3><ul>{(aiAnalysis.risks||[]).map((x:string,i:number)=><li key={i}>{x}</li>)}</ul></article>
                </div>
                {!!aiAnalysis.newsImpact?.length&&<article className="ai-events"><h3>消息影响</h3>{aiAnalysis.newsImpact.map((x:any,i:number)=><div key={i}><b>{x.direction}</b><span>{x.event}</span><p>{x.reason}</p></div>)}</article>}
                {!!aiAnalysis.scenarios?.length&&<article className="ai-scenarios"><h3>纪律情景</h3>{aiAnalysis.scenarios.map((x:any,i:number)=><div key={i}><b>{x.name}</b><span>触发：{x.trigger}</span><p>{x.response}</p></div>)}</article>}
                {!!aiAnalysis.dataGaps?.length&&<p className="ai-gaps">数据缺口：{aiAnalysis.dataGaps.join("；")}</p>}
                <footer><span>{aiMeta.model} · {new Date(aiMeta.generatedAt).toLocaleString("zh-CN")}</span><span>{aiAnalysis.disclaimer}</span></footer>
              </div>}
            </section>
            <section className="strategy-method panel">
              <div><b>双层策略结构</b><span>规则证据层 + DeepSeek解释层</span></div>
              <p>规则层负责可复核的行情、K线、均线、成交量和估值计算；DeepSeek只在你点击生成时读取当前快照，归纳消息、证据、情景和风险。</p>
              <small>AI输出不回写行情，不替代原始数据，也不构成收益保证或自动交易指令。</small>
            </section>
          </>
        )}
        {tab === "learn" && (
          <>
            <div className="learn-hero">
              <div>
                <span className="eyebrow">WEALTH ACADEMY</span>
                <h1>金融知识，从零基础到独立分析</h1>
                <p>双轨课程：先掌握投资与财报基础，再用《薛兆丰经济学讲义》的10章、118讲建立稀缺、成本、价格、产权、利率、信息与周期的完整思维框架。</p>
              </div>
              <div className="progress-card">
                <div className="ring">
                  <b>{Math.round(((lesson + 1) / courseLessons.length) * 100)}%</b>
                </div>
                <div>
                  <small>当前章节</small>
                  <h3>{courseLessons[lesson].title}</h3>
                  <p>
                    {lesson + 1} / {courseLessons.length}
                  </p>
                </div>
              </div>
            </div>
            <div className="academy">
              <aside>
                <input
                  value={learnQ}
                  onChange={(e) => setLearnQ(e.target.value)}
                  placeholder="搜索术语或知识点"
                />
                {filtered.map(({ x, i }) => (
                  <button
                    className={lesson === i ? "active" : ""}
                    key={i}
                    onClick={() => setLesson(i)}
                  >
                    <small>
                      {x.stage} · {String(i + 1).padStart(2, "0")}
                    </small>
                    <b>{x.title}</b>
                  </button>
                ))}
              </aside>
              <article className="lesson panel">
                <span className="eyebrow">
                  {courseLessons[lesson].stage}篇 · 知识点 {lesson + 1}
                </span>
                <h1>{courseLessons[lesson].title}</h1>
                <p className="lead">{courseLessons[lesson].summary}</p>
                {courseLessons[lesson].source && <div className="lesson-source"><b>内容依据</b><span>{courseLessons[lesson].source}</span><small>以下为基于用户提供版本的教学性归纳与书外投资连接，不是原文复制。</small></div>}
                {!!courseLessons[lesson].topics?.length && <section className="lesson-section"><h3>本章学习路线</h3><div className="lesson-topics">{courseLessons[lesson].topics!.map((item,i)=><span key={i}>{String(i+1).padStart(2,"0")} · {item}</span>)}</div></section>}
                <section className="lesson-section">
                  <h3>核心理论</h3>
                  <ul>{courseLessons[lesson].theory.map((item,i)=><li key={i}>{item}</li>)}</ul>
                </section>
                <section className="lesson-section example-box">
                  <h3>实际例子</h3>
                  <p>{courseLessons[lesson].example}</p>
                </section>
                {courseLessons[lesson].formula && (
                  <section className="lesson-section formula-box">
                    <h3>公式与适用口径</h3>
                    <strong>{courseLessons[lesson].formula}</strong>
                    <p>{courseLessons[lesson].calculation}</p>
                  </section>
                )}
                <section className="lesson-section pitfall-box">
                  <h3>常见误区</h3>
                  <ul>{courseLessons[lesson].pitfalls.map((item,i)=><li key={i}>{item}</li>)}</ul>
                </section>
                {!!courseLessons[lesson].investmentLink?.length && <section className="lesson-section investment-box"><h3>连接到投资分析</h3><ul>{courseLessons[lesson].investmentLink!.map((item,i)=><li key={i}>{item}</li>)}</ul></section>}
                {!!courseLessons[lesson].questions?.length && <section className="lesson-section question-box"><h3>本章自测</h3>{courseLessons[lesson].questions!.map((item,i)=><p key={i}><b>{i+1}</b>{item}</p>)}</section>}
                <div className="tip">
                  <b>学完这一节：</b>尝试用自己的话解释核心概念，并找一个现实资产判断它的收益来源、风险和失效条件。
                </div>
                {courseLessons[lesson].interactive === "compound" && (<div className="interactive-case"><hr />
                <h3>复利互动计算案例</h3>
                <label>
                  本金{" "}
                  <input
                    type="number"
                    value={principal}
                    onChange={(e) => setPrincipal(+e.target.value)}
                  />
                </label>
                <label>
                  年化假设 {rate}%{" "}
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={rate}
                    onChange={(e) => setRate(+e.target.value)}
                  />
                </label>
                <label>
                  年限 {years}年{" "}
                  <input
                    type="range"
                    min="1"
                    max="40"
                    value={years}
                    onChange={(e) => setYears(+e.target.value)}
                  />
                </label>
                <div className="result">
                  <small>教学演算终值</small>
                  <strong>¥ {Math.round(total).toLocaleString("zh-CN")}</strong>
                  <span>不含税费，不代表收益承诺</span>
                </div>
                </div>)}
              </article>
            </div>
          </>
        )}
      </section>
      <footer>
        <span>WEALTH OS · 真实数据、明确口径、失败不造数</span>
        <span>研究与学习辅助，不构成投资建议</span>
      </footer>
    </main>
  );
}
