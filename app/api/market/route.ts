const EM_QUOTE = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const EM_KLINE = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const EM_KLINE_HOSTS = ["push2his.eastmoney.com", "7.push2his.eastmoney.com", "33.push2his.eastmoney.com", "63.push2his.eastmoney.com", "91.push2his.eastmoney.com"];
const EM_UT = "7eea3edcaed734bea9cbfc24409ed989";

const SECID_RE = /^\d{3}\.[A-Za-z0-9.-]+$/i;
function klineBegin(klt:string, targetBars=180){
  const days=klt==="103"?targetBars*32:klt==="102"?targetBars*8:klt==="101"?Math.ceil(targetBars*1.7):Math.max(7,Math.ceil(targetBars/(240/Number(klt||5))*1.7)+5);
  const date=new Date(Date.now()-days*86400000);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,"0")}${String(date.getUTCDate()).padStart(2,"0")}`;
}
function secid(code: string) {
  if (/^[01]\.\d{6}$/.test(code)) return code;
  // 直接透传全球标的 secid：105.AAPL / 106.BRK.B / 122.XAU / 113.aum / 101.GC00Y / 100.DJIA / 116.00700
  if (SECID_RE.test(code)) return code;
  const c = code.replace(/\D/g, "").slice(-6);
  return `${/^(5|6)/.test(c) ? "1" : "0"}.${c}`;
}
// 境外/全球标的：非 沪深京 的 secid（美股/港美股指数/贵金属现货/内外盘期货）
const isGlobal = (code: string) => SECID_RE.test(code) && !/^[01]\.\d{6}$/.test(code);
function txSymbol(code:string){if(/^[01]\.\d{6}$/.test(code))return `${code.startsWith("1.")?"sh":"sz"}${code.slice(2)}`;const c=code.replace(/\D/g,"").slice(-6);return `${/^[489]/.test(c)?"bj":/^(5|6)/.test(c)?"sh":"sz"}${c}`}
async function fetchText(url:string,headers:Record<string,string>,tries=2,timeout=9000){let last:unknown;for(let i=0;i<tries;i++){try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new Error(`上游 ${r.status}`);return await r.text()}catch(e){last=e}}throw last}
async function fetchKlineJson(query: URLSearchParams, headers: Record<string,string>) {
  let last: unknown;
  query.set("ut", EM_UT);
  const klineHeaders={...headers,Accept:"application/json, text/plain, */*"};
  for (const host of EM_KLINE_HOSTS.slice(0,3)) {
    try {
      const text = await fetchText(`https://${host}/api/qt/stock/kline/get?${query}`, klineHeaders, 1, 3500);
      const json = JSON.parse(text) as { rc?: number; data?: { name?: string; code?: string; klines?: string[] } | null };
      if (json.data?.klines?.length) return { json, host };
      last = new Error(`${host} 返回空K线（可能限流）`);
    } catch (failure) { last = failure; }
  }
  throw last || new Error("东方财富K线节点均不可用");
}
function yahooSymbol(code:string){
  const [market,symbol]=code.split(".",2);
  if(["105","106","107"].includes(market))return symbol.replace(".","-");
  if(market==="100")return ({DJIA:"^DJI",NDX:"^NDX",SPX:"^GSPC"} as Record<string,string>)[symbol]||`^${symbol}`;
  if(market==="122")return symbol==="XAG"?"SI=F":"GC=F";
  if(market==="101")return /^SI/i.test(symbol)?"SI=F":"GC=F";
  return "";
}
async function fetchYahooKline(code:string,klt:string,headers:Record<string,string>){
  const symbol=yahooSymbol(code);if(!symbol)throw new Error("该全球品种暂无备用K线映射");
  const intervals:Record<string,string>={"5":"5m","15":"15m","30":"30m","60":"60m","101":"1d","102":"1wk","103":"1mo"};
  const ranges:Record<string,string>={"5":"5d","15":"1mo","30":"1mo","60":"3mo","101":"1y","102":"5y","103":"10y"};
  const endpoint=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${ranges[klt]||"1y"}&interval=${intervals[klt]||"1d"}&events=div%2Csplits`;
  const json=JSON.parse(await fetchText(endpoint,{...headers,Referer:"https://finance.yahoo.com/"},2,7000)) as {chart?:{error?:{description?:string}|null;result?:Array<{timestamp?:number[];indicators?:{quote?:Array<{open?:(number|null)[];close?:(number|null)[];high?:(number|null)[];low?:(number|null)[];volume?:(number|null)[]}>}}>} };
  if(json.chart?.error)throw new Error(json.chart.error.description||"Yahoo Finance K线失败");
  const result=json.chart?.result?.[0],quote=result?.indicators?.quote?.[0],timestamps=result?.timestamp||[];
  const bars=timestamps.map((stamp,index)=>({date:new Date(stamp*1000).toISOString().replace("T"," ").slice(0,klt==="101"||klt==="102"||klt==="103"?10:16),open:Number(quote?.open?.[index]),close:Number(quote?.close?.[index]),high:Number(quote?.high?.[index]),low:Number(quote?.low?.[index]),volume:Number(quote?.volume?.[index])||0,amount:0,amplitude:0,changePct:0,change:0,turnover:0})).filter(bar=>[bar.open,bar.close,bar.high,bar.low].every(Number.isFinite)).slice(-180);
  if(!bars.length)throw new Error("Yahoo Finance 返回空K线");
  return {bars,symbol};
}
type GlobalBar={date:string;open:number;close:number;high:number;low:number;volume:number;amount:number;amplitude:number;changePct:number;change:number;turnover:number};
function aggregateBars(rows:GlobalBar[],period:"week"|"month"){
  const groups=new Map<string,GlobalBar[]>();
  for(const row of rows){const date=new Date(`${row.date.slice(0,10)}T00:00:00Z`),key=period==="month"?row.date.slice(0,7):new Date(date.getTime()-((date.getUTCDay()+6)%7)*86400000).toISOString().slice(0,10);groups.set(key,[...(groups.get(key)||[]),row])}
  return [...groups.values()].map(group=>{const first=group[0],last=group.at(-1)!;return {...last,date:last.date.slice(0,10),open:first.open,high:Math.max(...group.map(x=>x.high)),low:Math.min(...group.map(x=>x.low)),close:last.close,volume:group.reduce((sum,x)=>sum+x.volume,0)}});
}
async function fetchSinaGlobalKline(code:string,klt:string,headers:Record<string,string>){
  const [market,symbol]=code.split(".",2);let rows:GlobalBar[]=[];let source="";
  if(["105","106","107"].includes(market)){
    const endpoint=`https://stock.finance.sina.com.cn/usstock/api/json_v2.php/US_MinKService.getDailyK?symbol=${encodeURIComponent(symbol)}`;
    const raw=JSON.parse(await fetchText(endpoint,headers,2,12000)) as Array<{d:string;o:string;c:string;h:string;l:string;v:string;a?:string}>;
    rows=raw.map(x=>({date:x.d,open:+x.o,close:+x.c,high:+x.h,low:+x.l,volume:+x.v||0,amount:+(x.a||0)||0,amplitude:0,changePct:0,change:0,turnover:0}));source="新浪财经美股历史行情";
  }else if(market==="122"||market==="101"){
    const spot=market==="122",metal=spot?(symbol==="XAG"?"XAG":"XAU"):(/^SI/i.test(symbol)?"SI":"GC"),endpoint=`https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20k=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=${metal}`;
    const text=await fetchText(endpoint,headers,2,12000),start=text.indexOf("(["),end=text.lastIndexOf(");");if(start<0||end<0)throw new Error("新浪贵金属K线格式异常");
    const raw=JSON.parse(text.slice(start+1,end)) as Array<{date:string;open:string;close:string;high:string;low:string;volume:string}>;
    rows=raw.map(x=>({date:x.date,open:+x.open,close:+x.close,high:+x.high,low:+x.low,volume:+x.volume||0,amount:0,amplitude:0,changePct:0,change:0,turnover:0}));source=`新浪财经${metal==="SI"||metal==="XAG"?"白银":"黄金"}${spot?"现货":"连续"}行情`;
  }
  rows=rows.filter(x=>[x.open,x.close,x.high,x.low].every(Number.isFinite));
  if(klt==="102")rows=aggregateBars(rows,"week");else if(klt==="103")rows=aggregateBars(rows,"month");else if(klt!=="101")throw new Error("备用源暂不支持该分钟周期");
  if(!rows.length)throw new Error("新浪财经返回空K线");return {bars:rows.slice(-180),source};
}
async function fetchSinaGlobalMinute(code:string,klt:string,headers:Record<string,string>){
  const [market,symbol]=code.split(".",2),minutes=Number(klt);if(![5,15,30,60].includes(minutes))throw new Error("分钟周期不支持");
  if(["105","106","107"].includes(market)){
    const endpoint=`https://stock.finance.sina.com.cn/usstock/api/json_v2.php/US_MinKService.getMinK?symbol=${encodeURIComponent(symbol)}&type=${minutes}`;
    const raw=JSON.parse(await fetchText(endpoint,headers,2,12000)) as Array<{d:string;o:string;c:string;h:string;l:string;v:string;a?:string}>;
    const bars=raw.map(x=>({date:x.d.slice(0,16),open:+x.o,close:+x.c,high:+x.h,low:+x.l,volume:+x.v||0,amount:+(x.a||0)||0,amplitude:0,changePct:0,change:0,turnover:0})).filter(x=>[x.open,x.close,x.high,x.low].every(Number.isFinite)).slice(-180);
    if(!bars.length)throw new Error("新浪美股分钟K线为空");return {bars,source:"新浪财经美股分钟行情"};
  }
  if(market==="122"){
    const metal=symbol==="XAG"?"XAG":"XAU",endpoint=`https://stock2.finance.sina.com.cn/futures/api/json.php/GlobalFuturesService.getGlobalFuturesMinLine?symbol=${metal}`;
    const json=JSON.parse(await fetchText(endpoint,headers,2,12000)) as {minLine_1d?:Array<Array<string>>};
    const points=(json.minLine_1d||[]).map(row=>({date:String(row.at(-1)||"").slice(0,16),price:+row[1]})).filter(x=>x.date.length===16&&Number.isFinite(x.price));
    const groups=new Map<string,typeof points>();for(const point of points){const minute=Number(point.date.slice(14,16)),key=`${point.date.slice(0,14)}${String(Math.floor(minute/minutes)*minutes).padStart(2,"0")}`;groups.set(key,[...(groups.get(key)||[]),point])}
    const bars=[...groups.entries()].map(([date,group])=>({date,open:group[0].price,close:group.at(-1)!.price,high:Math.max(...group.map(x=>x.price)),low:Math.min(...group.map(x=>x.price)),volume:0,amount:0,amplitude:0,changePct:0,change:0,turnover:0})).slice(-180);
    if(!bars.length)throw new Error("新浪贵金属分钟行情为空");return {bars,source:`新浪财经${metal==="XAG"?"白银":"黄金"}现货分钟行情`};
  }
  throw new Error("该全球标的暂无分钟备用源");
}
async function fetchTencentMinute(code:string,klt:string,headers:Record<string,string>){
  const sym=txSymbol(code),period=`m${klt}`,endpoint=`https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=${sym},${period},,180`;
  const json=JSON.parse(await fetchText(endpoint,headers,2,8000)) as {data?:Record<string,Record<string,string[][]>>},rows=(json.data?.[sym]?.[period]||[]).slice(-180);
  const bars=rows.map(v=>({date:v[0],open:+v[1],close:+v[2],high:+v[3],low:+v[4],volume:+v[5],amount:0,amplitude:0,changePct:0,change:0,turnover:0})).filter(x=>[x.open,x.close,x.high,x.low].every(Number.isFinite));
  if(!bars.length)throw new Error("腾讯证券分钟K线为空");return {bars,source:"腾讯证券分钟K线"};
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "quotes";
  const headers = { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" };
  try {
    if (type === "screener") {
      const numberParam = (name: string, fallback: number) => {
        const value = Number(url.searchParams.get(name));
        return Number.isFinite(value) ? value : fallback;
      };
      const minChange = numberParam("minChange", -20), maxChange = numberParam("maxChange", 20);
      const minTurnover = Math.max(0, numberParam("minTurnover", 0));
      const minAmountYi = Math.max(0, numberParam("minAmountYi", 0));
      const minCapYi = Math.max(0, numberParam("minCapYi", 0));
      const maxPe = Math.max(0, numberParam("maxPe", 0));
      const maxPb = Math.max(0, numberParam("maxPb", 0));
      const minVolumeRatio = Math.max(0, numberParam("minVolumeRatio", 0));
      const minMainFlowYi = numberParam("minMainFlowYi", -99999);
      const sort = ["changePct", "amount", "turnover", "marketCap", "mainNetInflow", "volumeRatio"].includes(url.searchParams.get("sort") || "") ? url.searchParams.get("sort")! : "changePct";
      const direction = url.searchParams.get("direction") === "asc" ? "asc" : "desc";
      const segment = Math.min(6, Math.max(1, Math.floor(numberParam("segment", 1))));
      const fields = "f2,f3,f4,f6,f8,f9,f10,f12,f13,f14,f20,f21,f23,f62";
      const universe = "m:0+t:6,m:0+t:80,m:0+t:81+s:2048,m:1+t:2,m:1+t:23";
      type RawScreenRow = Record<string, number | string>;
      const pageUrl = (page: number) => `https://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(universe)}&fields=${fields}`;
      const firstPage = JSON.parse(await fetchText(pageUrl((segment - 1) * 10 + 1), headers)) as { data?: { diff?: RawScreenRow[]; total?: number } };
      const universeTotal = Number(firstPage.data?.total) || 0, maxPage = Math.ceil(universeTotal / 100), startPage = (segment - 1) * 10 + 1, endPage = Math.min(startPage + 9, maxPage);
      const remainingPages: { data?: { diff?: RawScreenRow[] } }[] = [];
      for (let page = startPage + 1; page <= endPage; page += 3) {
        remainingPages.push(...await Promise.all(Array.from({ length: Math.min(3, endPage - page + 1) }, (_, index) => fetchText(pageUrl(page + index), headers).then((text) => JSON.parse(text) as { data?: { diff?: RawScreenRow[] } }))));
      }
      const rawRows = [...(firstPage.data?.diff || []), ...remainingPages.flatMap((payload) => payload.data?.diff || [])];
      const rows = rawRows.map((row) => ({
        code: String(row.f12 || ""), market: Number(row.f13) || 0, name: String(row.f14 || ""), price: Number(row.f2) || 0,
        changePct: Number(row.f3) || 0, change: Number(row.f4) || 0, amount: Number(row.f6) || 0, turnover: Number(row.f8) || 0,
        pe: Number(row.f9) || 0, volumeRatio: Number(row.f10) || 0, marketCap: Number(row.f20) || 0,
        floatMarketCap: Number(row.f21) || 0, pb: Number(row.f23) || 0, mainNetInflow: Number(row.f62) || 0,
      })).filter((row) => /^\d{6}$/.test(row.code) && row.price > 0 && row.changePct >= minChange && row.changePct <= maxChange && row.turnover >= minTurnover && row.amount >= minAmountYi * 100000000 && row.marketCap >= minCapYi * 100000000 && (!maxPe || (row.pe > 0 && row.pe <= maxPe)) && (!maxPb || (row.pb > 0 && row.pb <= maxPb)) && row.volumeRatio >= minVolumeRatio && row.mainNetInflow >= minMainFlowYi * 100000000);
      const sortKey: Record<string, keyof typeof rows[number]> = { changePct: "changePct", amount: "amount", turnover: "turnover", marketCap: "marketCap", mainNetInflow: "mainNetInflow", volumeRatio: "volumeRatio" };
      rows.sort((a, b) => (Number(a[sortKey[sort]]) - Number(b[sortKey[sort]])) * (direction === "asc" ? 1 : -1));
      return Response.json({ ok: true, source: "东方财富沪深京A股实时行情", fetchedAt: new Date().toISOString(), universeTotal, segment, scanned: rawRows.length, results: rows, filters: { minChange, maxChange, minTurnover, minAmountYi, minCapYi, maxPe, maxPb, minVolumeRatio, minMainFlowYi, sort, direction } });
    }
    if (type === "radar") {
      const radarDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
      const boardFields = "f2,f3,f8,f12,f14,f20,f62,f104,f105,f128,f136,f140,f141";
      const boardUrl = (kind: "industry" | "concept") =>
        `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=30&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:${kind === "industry" ? "2" : "3"}&fields=${boardFields}`;
      const [industryBody, conceptBody, limitBody] = await Promise.all([
        fetchText(boardUrl("industry"), headers),
        fetchText(boardUrl("concept"), headers),
        fetchText(`https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fbt:asc&date=${radarDate}`, headers),
      ]);
      type RawBoard = Record<string, number | string>;
      const industryRows = (JSON.parse(industryBody) as { data?: { diff?: RawBoard[] } }).data?.diff || [];
      const conceptRows = (JSON.parse(conceptBody) as { data?: { diff?: RawBoard[] } }).data?.diff || [];
      const allBoards = [...industryRows, ...conceptRows];
      const maxFlow = Math.max(1, ...allBoards.map((row) => Math.max(0, Number(row.f62) || 0)));
      const clamp = (value: number) => Math.max(0, Math.min(100, value));
      const normalizeBoards = (rows: RawBoard[], kind: "industry" | "concept") => rows.map((row) => {
        const changePct = Number(row.f3) || 0, turnover = Number(row.f8) || 0;
        const upCount = Number(row.f104) || 0, downCount = Number(row.f105) || 0, total = upCount + downCount;
        const mainNetInflow = Number(row.f62) || 0;
        const components = {
          momentum: clamp(((changePct + 2) / 9) * 100),
          breadth: total ? clamp((upCount / total) * 100) : 0,
          flow: clamp((Math.max(0, mainNetInflow) / maxFlow) * 100),
          activity: clamp((turnover / 12) * 100),
        };
        const heatScore = +(components.momentum * .35 + components.breadth * .25 + components.flow * .25 + components.activity * .15).toFixed(1);
        return { kind, code: String(row.f12 || ""), name: String(row.f14 || ""), changePct, turnover, marketCap: Number(row.f20) || 0, mainNetInflow, upCount, downCount, leaderName: String(row.f128 || ""), leaderCode: String(row.f140 || ""), leaderChangePct: Number(row.f136) || 0, heatScore, components };
      });
      type RawLimit = { c?: string; m?: number; n?: string; p?: number; zdp?: number; amount?: number; ltsz?: number; tshare?: number; hs?: number; lbc?: number; fbt?: number; lbt?: number; fund?: number; zbc?: number; hybk?: string; zttj?: { days?: number; ct?: number } };
      const limitJson = JSON.parse(limitBody) as { data?: { tc?: number; qdate?: number; pool?: RawLimit[] } };
      const formatClock = (value = 0) => String(value).padStart(6, "0").replace(/^(\d{2})(\d{2})(\d{2})$/, "$1:$2:$3");
      const limitUp = (limitJson.data?.pool || []).map((row) => ({ code: row.c || "", market: row.m ?? 0, name: row.n || "", price: (row.p || 0) / 1000, changePct: row.zdp || 0, amount: row.amount || 0, floatMarketCap: row.ltsz || 0, marketCap: row.tshare || 0, turnover: row.hs || 0, streak: row.lbc || row.zttj?.ct || 1, firstSealTime: formatClock(row.fbt), lastSealTime: formatClock(row.lbt), sealedAmount: row.fund || 0, openCount: row.zbc || 0, industry: row.hybk || "未分类", streakDays: row.zttj?.days || 1 }));
      const ladder = Array.from(new Set(limitUp.map((row) => row.streak))).sort((a, b) => b - a).map((level) => ({ level, stocks: limitUp.filter((row) => row.streak === level) }));
      const industryStats = Array.from(limitUp.reduce((map, row) => { const hit = map.get(row.industry) || { name: row.industry, count: 0, maxStreak: 0, sealedAmount: 0 }; hit.count += 1; hit.maxStreak = Math.max(hit.maxStreak, row.streak); hit.sealedAmount += row.sealedAmount; map.set(row.industry, hit); return map; }, new Map<string, { name: string; count: number; maxStreak: number; sealedAmount: number }>()).values()).sort((a, b) => b.count - a.count || b.maxStreak - a.maxStreak).slice(0, 15);
      return Response.json({ ok: true, source: "东方财富板块行情 / 涨停池", fetchedAt: new Date().toISOString(), tradingDate: String(limitJson.data?.qdate || ""), methodology: { formula: "热度=涨幅动量35%+上涨宽度25%+主力净流25%+换手活跃15%", note: "分数用于同批板块相对比较，不代表收益预测。" }, boards: { industry: normalizeBoards(industryRows, "industry"), concept: normalizeBoards(conceptRows, "concept") }, limitUp: { total: limitJson.data?.tc || limitUp.length, stocks: limitUp, ladder, industries: industryStats } });
    }
    if (type === "backtest") {
      const code = (url.searchParams.get("code") || "").replace(/\D/g, "").slice(-6);
      if (!/^\d{6}$/.test(code)) return Response.json({ ok: false, error: "股票代码无效" }, { status: 400 });
      const initial = Math.max(10000, Math.min(100000000, Number(url.searchParams.get("initial")) || 100000));
      const feeRate = Math.max(0, Math.min(.01, Number(url.searchParams.get("fee")) || .0003));
      const slippage = Math.max(0, Math.min(.03, Number(url.searchParams.get("slippage")) || .001));
      type TestBar = { date: string; open: number; close: number; high: number; low: number; volume: number };
      let bars: TestBar[] = [];
      try {
        const body = await fetchText(`${EM_KLINE}?secid=${secid(code)}&klt=101&fqt=1&beg=0&end=20500101&lmt=600&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56`, headers);
        const json = JSON.parse(body) as { data?: { name?: string; klines?: string[] } };
        bars = (json.data?.klines || []).map((line) => { const row = line.split(","); return { date: row[0], open: +row[1], close: +row[2], high: +row[3], low: +row[4], volume: +row[5] }; }).filter((bar) => Number.isFinite(bar.close) && bar.close > 0);
      } catch {}
      if (bars.length < 180) {
        const symbol = txSymbol(code), body = await fetchText(`http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,600,qfq`, headers);
        const json = JSON.parse(body) as { data?: Record<string, Record<string, string[][]>> }, node = json.data?.[symbol] || {};
        bars = (node.qfqday || node.day || []).map((row) => ({ date: row[0], open: +row[1], close: +row[2], high: +row[3], low: +row[4], volume: +row[5] })).filter((bar) => Number.isFinite(bar.close) && bar.close > 0);
      }
      if (bars.length < 180) return Response.json({ ok: false, error: `仅取得${bars.length}条有效日线，低于180条回测最低口径` }, { status: 422 });
      const quoteBody = await fetchText(`${EM_QUOTE}?fltt=2&secids=${secid(code)}&fields=f12,f14`, headers);
      const quoteJson = JSON.parse(quoteBody) as { data?: { diff?: Record<string, string>[] } };
      const name = String(quoteJson.data?.diff?.[0]?.f14 || code);
      type TestTrade = { entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; shares: number; pnl: number; returnPct: number; holdingDays: number; reason: string };
      const trades: TestTrade[] = [], curve: { date: string; equity: number; benchmark: number; drawdown: number }[] = [];
      let cash = initial, shares = 0, entryPrice = 0, entryDate = "", entryIndex = 0, pending: "buy" | "sell" | null = null, exitReason = "", peak = initial;
      const maAt = (index: number, days: number) => bars.slice(index - days + 1, index + 1).reduce((sum, bar) => sum + bar.close, 0) / days;
      const benchmarkBase = bars[60].close;
      for (let i = 60; i < bars.length; i++) {
        const bar = bars[i];
        if (pending === "buy" && !shares) {
          const fill = bar.open * (1 + slippage), maxShares = Math.floor(cash / (fill * (1 + feeRate)) / 100) * 100;
          if (maxShares > 0) { shares = maxShares; entryPrice = fill; entryDate = bar.date; entryIndex = i; cash -= shares * fill * (1 + feeRate); }
          pending = null;
        } else if (pending === "sell" && shares) {
          const fill = bar.open * (1 - slippage), proceeds = shares * fill * (1 - feeRate), cost = shares * entryPrice * (1 + feeRate), pnl = proceeds - cost;
          trades.push({ entryDate, exitDate: bar.date, entryPrice: +entryPrice.toFixed(2), exitPrice: +fill.toFixed(2), shares, pnl: +pnl.toFixed(2), returnPct: +(pnl / cost * 100).toFixed(2), holdingDays: i - entryIndex, reason: exitReason });
          cash += proceeds; shares = 0; entryPrice = 0; pending = null;
        }
        const ma20 = maAt(i, 20), ma60 = maAt(i, 60), prior20 = bars.slice(i - 20, i), high20 = Math.max(...prior20.map((x) => x.high));
        const avgVolume20 = prior20.reduce((sum, x) => sum + x.volume, 0) / 20, volumeRatio = avgVolume20 ? bar.volume / avgVolume20 : 0;
        if (!shares && i < bars.length - 1 && bar.close > high20 && ma20 > ma60 && volumeRatio >= 1.2) pending = "buy";
        if (shares && i < bars.length - 1) {
          if (bar.close <= entryPrice * .92) { pending = "sell"; exitReason = "收盘跌破8%风险线"; }
          else if (bar.close < ma20) { pending = "sell"; exitReason = "收盘跌破MA20"; }
          else if (i - entryIndex >= 20) { pending = "sell"; exitReason = "持有满20个交易日"; }
        }
        const equity = cash + shares * bar.close, drawdown = peak ? (equity / peak - 1) * 100 : 0; peak = Math.max(peak, equity);
        curve.push({ date: bar.date, equity: +equity.toFixed(2), benchmark: +(initial * bar.close / benchmarkBase).toFixed(2), drawdown: +Math.min(0, drawdown).toFixed(2) });
      }
      if (shares) {
        const bar = bars.at(-1)!, proceeds = shares * bar.close * (1 - feeRate), cost = shares * entryPrice * (1 + feeRate), pnl = proceeds - cost;
        trades.push({ entryDate, exitDate: bar.date, entryPrice: +entryPrice.toFixed(2), exitPrice: +bar.close.toFixed(2), shares, pnl: +pnl.toFixed(2), returnPct: +(pnl / cost * 100).toFixed(2), holdingDays: bars.length - 1 - entryIndex, reason: "回测期末按收盘价结算" });
        cash += proceeds; shares = 0;
        if (curve.length) curve[curve.length - 1].equity = +cash.toFixed(2);
      }
      const finalEquity = cash, totalReturn = (finalEquity / initial - 1) * 100, years = Math.max(1 / 252, curve.length / 252), annualized = (Math.pow(finalEquity / initial, 1 / years) - 1) * 100;
      const maxDrawdown = Math.min(0, ...curve.map((x) => x.drawdown)), wins = trades.filter((trade) => trade.pnl > 0), losses = trades.filter((trade) => trade.pnl <= 0);
      const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0), grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
      return Response.json({ ok: true, source: "东方财富/腾讯前复权日线", fetchedAt: new Date().toISOString(), code, name, range: { start: bars[60].date, end: bars.at(-1)!.date, samples: curve.length }, parameters: { initial, feeRate, slippage, entry: "收盘突破前20日最高价、MA20>MA60、量比≥1.2；下一交易日开盘成交", exit: "收盘跌破MA20、跌破成本8%或持有20日；下一交易日开盘成交", lotSize: 100 }, metrics: { finalEquity: +finalEquity.toFixed(2), totalReturn: +totalReturn.toFixed(2), annualized: +annualized.toFixed(2), maxDrawdown: +maxDrawdown.toFixed(2), trades: trades.length, winRate: trades.length ? +(wins.length / trades.length * 100).toFixed(2) : 0, profitFactor: grossLoss ? +(grossProfit / grossLoss).toFixed(2) : grossProfit ? null : 0, benchmarkReturn: +(curve.at(-1)!.benchmark / initial * 100 - 100).toFixed(2) }, curve, trades: trades.reverse() });
    }
    if (type === "plans") {
      const codes = Array.from(new Set((url.searchParams.get("codes") || "").split(",").map((value) => value.replace(/\D/g, "").slice(-6)).filter((value) => /^\d{6}$/.test(value)))).slice(0, 20);
      if (!codes.length) return Response.json({ ok: true, plans: [] });
      const quoteCodes = [...codes, "1.000001", "0.399001", "0.399006"];
      const quoteUrl = `${EM_QUOTE}?fltt=2&secids=${quoteCodes.map(secid).join(",")}&fields=f2,f3,f4,f5,f6,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f62`;
      const quoteJson = JSON.parse(await fetchText(quoteUrl, headers)) as { data?: { diff?: Record<string, number | string>[] } };
      const quoteRows = quoteJson.data?.diff || [];
      const quoteMap = new Map(quoteRows.map((row) => [String(row.f12), row]));
      const marketChanges = ["000001", "399001", "399006"].map((code) => Number(quoteMap.get(code)?.f3)).filter(Number.isFinite);
      const marketChange = marketChanges.length ? marketChanges.reduce((sum, value) => sum + value, 0) / marketChanges.length : 0;
      const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
      const marketScore = +clamp(((marketChange + 2) / 4) * 15, 0, 15).toFixed(1);
      type PlanBar = { date: string; open: number; close: number; high: number; low: number; volume: number; amount: number; turnover: number };
      const plans: Record<string, unknown>[] = [];
      for (let start = 0; start < codes.length; start += 5) {
        await Promise.all(codes.slice(start, start + 5).map(async (code) => {
          try {
            const quote = quoteMap.get(code); if (!quote) return;
            let bars: PlanBar[] = [];
            try {
              const body = await fetchText(`${EM_KLINE}?secid=${secid(code)}&klt=101&fqt=1&beg=0&end=20500101&lmt=150&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`, headers);
              const klineJson = JSON.parse(body) as { data?: { klines?: string[] } };
              bars = (klineJson.data?.klines || []).map((line) => { const row = line.split(","); return { date: row[0], open: +row[1], close: +row[2], high: +row[3], low: +row[4], volume: +row[5], amount: +row[6], turnover: +row[10] }; }).filter((bar) => Number.isFinite(bar.close));
            } catch {}
            if (bars.length < 120) {
              const symbol = txSymbol(code), txBody = await fetchText(`http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,150,qfq`, headers);
              const txJson = JSON.parse(txBody) as { data?: Record<string, Record<string, string[][]>> }, node = txJson.data?.[symbol] || {};
              bars = (node.qfqday || node.day || []).map((row) => ({ date: row[0], open: +row[1], close: +row[2], high: +row[3], low: +row[4], volume: +row[5], amount: 0, turnover: 0 })).filter((bar) => Number.isFinite(bar.close));
            }
            if (bars.length < 120) { plans.push({ code, name: String(quote.f14 || code), status: "insufficient", statusLabel: "数据不足", score: null, asOf: bars.at(-1)?.date || null, reasons: [`仅取得${bars.length}个交易日样本，低于120日最低口径。`] }); return; }
            const closes = bars.map((bar) => bar.close), ma = (days: number) => closes.slice(-days).reduce((sum, value) => sum + value, 0) / days;
            const ma5 = ma(5), ma10 = ma(10), ma20 = ma(20), ma60 = ma(60), ma120 = ma(120);
            const latest = bars.at(-1)!, previousBars = bars.slice(0, -1), high20 = Math.max(...previousBars.slice(-20).map((bar) => bar.high)), low20 = Math.min(...previousBars.slice(-20).map((bar) => bar.low)), high60 = Math.max(...previousBars.slice(-60).map((bar) => bar.high)), high120 = Math.max(...previousBars.slice(-120).map((bar) => bar.high));
            const avgVolume20 = previousBars.slice(-20).reduce((sum, bar) => sum + bar.volume, 0) / 20, volumeRatio = avgVolume20 ? latest.volume / avgVolume20 : 0;
            const trueRanges = bars.slice(-15).map((bar, index, subset) => index === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - subset[index - 1].close), Math.abs(bar.low - subset[index - 1].close)));
            const atr14 = trueRanges.slice(-14).reduce((sum, value) => sum + value, 0) / 14;
            const price = Number(quote.f2) || latest.close, changePct = Number(quote.f3) || 0, turnover = Number(quote.f8) || latest.turnover || 0, amount = Number(quote.f6) || latest.amount || 0;
            const entryTrigger = +(high20 * 1.002).toFixed(2), invalidPrice = +(Math.max(low20, Math.min(ma20, ma60)) * .995).toFixed(2), pressure = +(Math.max(high60, high120) * .998).toFixed(2);
            const riskReward = entryTrigger > invalidPrice && pressure > entryTrigger ? +((pressure - entryTrigger) / (entryTrigger - invalidPrice)).toFixed(2) : null;
            const components = {
              market: marketScore,
              midTrend: +(Number(price > ma20) * 8 + Number(ma20 > ma60) * 7 + Number(ma60 > ma120) * 5).toFixed(1),
              shortStructure: +(Number(price > ma5) * 5 + Number(ma5 > ma10) * 5 + Number(price >= high20 * .97) * 5).toFixed(1),
              volumePrice: +(clamp(volumeRatio / 1.8 * 12, 0, 12) + clamp(turnover / 8 * 4, 0, 4) + clamp(amount / 800000000 * 4, 0, 4)).toFixed(1),
              momentum: +(clamp((changePct + 3) / 9 * 8, 0, 8) + (price >= ma20 && price <= ma20 * 1.12 ? 7 : price > ma20 ? 3 : 0)).toFixed(1),
              riskLiquidity: +(clamp(amount / 500000000 * 6, 0, 6) + (atr14 / price >= .015 && atr14 / price <= .06 ? 4 : 2) + (riskReward !== null && riskReward >= 1.5 ? 5 : riskReward !== null && riskReward >= 1 ? 3 : 0)).toFixed(1),
            };
            const score = +Object.values(components).reduce((sum, value) => sum + value, 0).toFixed(1);
            const confirmed = price >= entryTrigger && volumeRatio >= 1.2 && ma20 > ma60;
            // “结构失效”是计划生命周期状态，只有曾进入观察/确认后才有意义。
            // API 只返回当前结构事实，由前端结合上一次有效状态并连续确认后决定是否失效。
            const structureBroken = price < invalidPrice;
            const trendWeak = ma20 < ma60 * .97;
            const status = confirmed ? "confirmed" : score >= 65 ? "watch" : "neutral";
            const statusLabel = confirmed ? "条件确认" : score >= 65 ? "重点观察" : "普通观察";
            const reasons = [price > ma20 ? "价格位于MA20上方" : "价格尚未站上MA20", ma20 > ma60 ? "MA20高于MA60" : "MA20尚未高于MA60", volumeRatio >= 1.2 ? `成交量为20日均量${volumeRatio.toFixed(2)}倍` : `量能仅为20日均量${volumeRatio.toFixed(2)}倍`, riskReward === null ? "上方历史压力不足以形成有效风险收益测算" : `第一压力对应风险收益比约${riskReward}`];
            plans.push({ code, name: String(quote.f14 || code), price, changePct, turnover, amount, status, statusLabel, score, asOf: latest.date, adjustment: "前复权", sampleSize: bars.length, marketChange: +marketChange.toFixed(2), dataHealth: "ok", structureBroken, trendWeak, components, indicators: { ma5: +ma5.toFixed(2), ma10: +ma10.toFixed(2), ma20: +ma20.toFixed(2), ma60: +ma60.toFixed(2), ma120: +ma120.toFixed(2), volumeRatio: +volumeRatio.toFixed(2), atr14: +atr14.toFixed(2) }, levels: { entryTrigger, pullbackLow: +(ma20 * .99).toFixed(2), pullbackHigh: +(ma20 * 1.01).toFixed(2), invalidPrice, pressure, riskReward }, rules: { confirm: `价格不低于${entryTrigger}且量能达到20日均量1.2倍，同时MA20高于MA60`, pullback: `回踩${(ma20 * .99).toFixed(2)}—${(ma20 * 1.01).toFixed(2)}区间后企稳，仍需量价确认`, invalid: `计划进入重点观察或条件确认后，连续两次跌破${invalidPrice}才判定结构失效` }, reasons });
          } catch (planError) { plans.push({ code, name: String(quoteMap.get(code)?.f14 || code), status: "insufficient", statusLabel: "数据不足", score: null, reasons: [planError instanceof Error ? planError.message : "K线数据不可用"] }); }
        }));
      }
      plans.sort((a, b) => Number(b.score || -1) - Number(a.score || -1));
      return Response.json({ ok: true, source: "东方财富实时行情 / 前复权日线", fetchedAt: new Date().toISOString(), methodology: { score: "市场15 + 中期趋势20 + 短期结构15 + 量价20 + 动量15 + 风险收益与流动性15", confirmation: "盘中越过触发位只称条件确认，收盘有效性需下一交易日复核。" }, plans });
    }
    if (type === "search") {
      const q = (url.searchParams.get("q") || "").trim().slice(0, 30);
      if (!q) return Response.json({ ok: true, results: [] });
      try {
        const compact=(value:string)=>value.toLowerCase().replace(/(股份有限公司|有限责任公司|有限公司|股份|科技|公司|集团|控股|半导体)/g,"").replace(/\s/g,"");
        const variants=Array.from(new Set([q,compact(q)].filter(Boolean)));
        const payloads=await Promise.all(variants.map(async input=>{const body=await fetchText(`https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(input)}&type=14&count=100&token=D43BF722C8E33BDC906FB84D85E326E8`,headers);return (JSON.parse(body) as {QuotationCodeTable?:{Data?:Record<string,string>[]}}).QuotationCodeTable?.Data||[]}));
        const needle=q.toLowerCase(),normalizedNeedle=compact(q),isChinese=/[\u3400-\u9fff]/.test(q);
        const rows=Array.from(new Map(payloads.flat().map(v=>[`${v.QuoteID}:${v.Code}`,v])).values());
        const stockPrefix=/^(000|001|002|003|300|301|600|601|603|605|688|689)/;
        const etfPrefix=/^(159|510|511|512|513|515|516|517|518|520|560|561|562|563|588|589)/;
        // 全球市场代码前缀 → 展示标签
        const GLOBAL_META: Record<string,{exchange:string;type:string}> = {
          "105":{exchange:"US",type:"美股"}, "106":{exchange:"US",type:"美股"}, "107":{exchange:"US",type:"美股"},
          "100":{exchange:"US-IDX",type:"美股指数"}, "122":{exchange:"SPOT",type:"贵金属现货"},
          "113":{exchange:"CN-FUT",type:"内盘期货"}, "101":{exchange:"FUT",type:"外盘期货"}, "116":{exchange:"HK",type:"港股"},
        };
        const US_INDEX_WHITELIST = new Set(["DJIA","NDX","SPX","IXIC"]);
        const shortCode = (value: string) => value.includes(".") ? value.split(".").slice(1).join(".") : value;
        const results=rows
          .filter(v=>{
            const qid=String(v.QuoteID||""), gm=qid.match(/^(\d{3})\.([A-Za-z0-9]+)$/);
            if (gm) {
              const pre=gm[1], cd=gm[2].toUpperCase();
              if (["105","106","107"].includes(pre)) return true;
              if (pre==="100") return US_INDEX_WHITELIST.has(cd);
              if (["122","113","101","116"].includes(pre)) return true;
              return false;
            }
            return /^\d{6}$/.test(v.Code)&&(
              (stockPrefix.test(v.Code)&&(v.Classify==="AStock"||v.Classify==="23"||v.SecurityTypeName?.includes("A")||v.SecurityTypeName?.includes("科创")))||
              (v.SecurityTypeName?.includes("京A"))||
              (v.Classify==="Fund"&&etfPrefix.test(v.Code))
            );
          })
          .map(v=>{
            const qid=String(v.QuoteID||""), gm=qid.match(/^(\d{3})\.([A-Za-z0-9]+)$/);
            if (gm) {
              const meta=GLOBAL_META[gm[1]]||{exchange:"GLOBAL",type:"全球市场"};
              return {exchange:meta.exchange,code:qid,name:v.Name||gm[2],pinyin:(v.PinYin||"").toLowerCase(),type:meta.type};
            }
            return {exchange:v.SecurityTypeName?.includes("京A")?"BJ":v.QuoteID?.startsWith("1.")?"SH":"SZ",code:v.Code,name:v.Name,pinyin:(v.PinYin||"").toLowerCase(),type:v.Classify==="Fund"?"ETF":v.SecurityTypeName||"A股"};
          })
          .filter(v=>isChinese?compact(v.name).includes(normalizedNeedle)||normalizedNeedle.includes(compact(v.name)):(shortCode(v.code).toLowerCase().includes(needle)||v.code.includes(needle)||v.pinyin.includes(needle)||v.name.toLowerCase().includes(needle)))
          .sort((a,b)=>Number(shortCode(b.code).toLowerCase().startsWith(needle))-Number(shortCode(a.code).toLowerCase().startsWith(needle))||Number(compact(b.name).startsWith(normalizedNeedle))-Number(compact(a.name).startsWith(normalizedNeedle))||a.name.localeCompare(b.name,"zh-CN"));
        return Response.json({ok:true,source:"东方财富证券搜索 · A股/ETF/美股/港股/贵金属/期货",fetchedAt:new Date().toISOString(),query:q,total:results.length,results});
      }catch{}
      const body = await fetchText(`https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(q)}&t=all`,headers);
      const encoded = body.match(/v_hint="([\s\S]*)"/)?.[1] || "",decoded = JSON.parse(`"${encoded.replace(/"/g, '\\"')}"`) as string;
      const needle=q.toLowerCase(),isChinese=/[\u3400-\u9fff]/.test(q);const results = decoded.split("^").map(row => row.split("~")).filter(v => v.length >= 5 && ["sh","sz","bj"].includes(v[0]) && /^\d{6}$/.test(v[1])&&v[4].startsWith("GP")).map(v => ({ exchange:v[0].toUpperCase(), code:v[1], name:v[2], pinyin:v[3].toLowerCase(), type:v[4] })).filter(v=>isChinese?v.name.includes(q):v.code.includes(needle)||v.pinyin.includes(needle));
      return Response.json({ ok:true, source:"腾讯证券智能搜索（备用）", fetchedAt:new Date().toISOString(),total:results.length,results });
    }
    if (type === "news") {
      const keyword=(url.searchParams.get("q")||"").trim().slice(0,40);
      if(!keyword)return Response.json({ok:true,items:[]});
      const param={uid:"",keyword,type:["cmsArticleWebOld"],client:"web",clientType:"web",clientVersion:"curr",param:{cmsArticleWebOld:{searchScope:"default",sort:"time",pageIndex:1,pageSize:12,preTag:"",postTag:""}}};
      const upstream=`https://search-api-web.eastmoney.com/search/jsonp?cb=callback&param=${encodeURIComponent(JSON.stringify(param))}`;
      const body=await fetchText(upstream,headers);
      const start=body.indexOf("("),end=body.lastIndexOf(")");
      const json=JSON.parse(body.slice(start+1,end)) as {result?:{cmsArticleWebOld?:Record<string,string>[]}};
      const items=(json.result?.cmsArticleWebOld||[]).map(x=>({id:x.code,title:x.title,summary:(x.content||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim().slice(0,180),publishedAt:x.date,source:x.mediaName||"公开媒体",url:x.url}));
      return Response.json({ok:true,source:"东方财富公开资讯检索",fetchedAt:new Date().toISOString(),keyword,items});
    }
    if (type === "performance") {
      const codes=(url.searchParams.get("codes")||"").split(",").map(x=>x.trim()).filter(Boolean).slice(0,40);
      const results:Record<string,{month:number|null,ytd:number|null,rollingMonth:number|null,rollingYear:number|null,asOf:string|null}>={};
      const calc=(now:number,base:number|undefined)=>Number.isFinite(now)&&Number.isFinite(base)&&Number(base)!==0?+((now/Number(base)-1)*100).toFixed(2):null;
      for(let i=0;i<codes.length;i+=6){
        await Promise.all(codes.slice(i,i+6).map(async code=>{
          try{
            let rows:{date:string;close:number}[]=[];
            const global = isGlobal(code);
            try{
              const query=new URLSearchParams({secid:secid(code),klt:"101",fqt:global?"0":"1",beg:klineBegin("101",320),end:"20500101",lmt:"320",fields1:"f1,f2,f3,f4,f5,f6",fields2:"f51,f52,f53,f54,f55,f56"});
              const {json}=await fetchKlineJson(query,headers);
              rows=(json.data?.klines||[]).map(x=>{const v=x.split(",");return {date:v[0],close:+v[2]}}).filter(x=>Number.isFinite(x.close));
            }catch{}
            if(!rows.length&&global){
              try{const fallback=await fetchSinaGlobalKline(code,"101",headers);rows=fallback.bars.map(bar=>({date:bar.date.slice(0,10),close:bar.close}))}catch{try{const fallback=await fetchYahooKline(code,"101",headers);rows=fallback.bars.map(bar=>({date:bar.date.slice(0,10),close:bar.close}))}catch{}}
            }
            if(!rows.length && !global){
              const sym=txSymbol(code),txUrl=`http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},day,,,320,qfq`;
              const tx=JSON.parse(await fetchText(txUrl,headers)) as {data?:Record<string,Record<string,string[][]>>};
              const node=tx.data?.[sym]||{};
              rows=(node.qfqday||node.day||[]).map(v=>({date:v[0],close:+v[2]})).filter(x=>Number.isFinite(x.close));
            }
            const last=rows.at(-1);if(!last)return;
            const year=last.date.slice(0,4),month=last.date.slice(0,7),firstMonth=rows.findIndex(x=>x.date.startsWith(month)),firstYear=rows.findIndex(x=>x.date.startsWith(year));
            results[code]={month:calc(last.close,rows[firstMonth-1]?.close),ytd:calc(last.close,rows[firstYear-1]?.close),rollingMonth:calc(last.close,rows.at(-23)?.close),rollingYear:calc(last.close,rows.at(-251)?.close),asOf:last.date};
          }catch{}
        }));
      }
      return Response.json({ok:true,source:"东方财富日线计算（A股前复权/全球不复权）",fetchedAt:new Date().toISOString(),results});
    }
    if (type === "kline") {
      const code = url.searchParams.get("code") || "000001";
      const klt = ["5","15","30","60","101","102","103"].includes(url.searchParams.get("klt")||"") ? url.searchParams.get("klt") : "101";
      const global = isGlobal(code);
      const minutePeriod=["5","15","30","60"].includes(klt||"");
      if(minutePeriod&&global){try{const result=await fetchSinaGlobalMinute(code,klt||"5",headers);return Response.json({ok:true,source:result.source,fetchedAt:new Date().toISOString(),code:code.split(".").slice(1).join("."),adjustment:"不复权",bars:result.bars})}catch{}}
      if(minutePeriod&&!global){try{const result=await fetchTencentMinute(code,klt||"5",headers);return Response.json({ok:true,source:result.source,fetchedAt:new Date().toISOString(),code:secid(code).slice(2),adjustment:"不复权",bars:result.bars})}catch{}}
      const query=new URLSearchParams({secid:secid(code),klt:klt||"101",fqt:global?"0":"1",beg:klineBegin(klt||"101"),end:"20500101",lmt:"180",fields1:"f1,f2,f3,f4,f5,f6",fields2:"f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"});
      let eastmoneyFailure:unknown;
      try{const {json,host}=await fetchKlineJson(query,headers);const bars=(json.data?.klines||[]).slice(-180).map(x=>{const v=x.split(",");return {date:v[0],open:+v[1],close:+v[2],high:+v[3],low:+v[4],volume:+v[5],amount:+v[6],amplitude:+v[7],changePct:+v[8],change:+v[9],turnover:+v[10]}});if(bars.length)return Response.json({ok:true,source:`东方财富 ${host} push2his`,fetchedAt:new Date().toISOString(),code:json.data?.code,name:json.data?.name,adjustment:global?"不复权":"前复权",bars})}catch(failure){eastmoneyFailure=failure}
      if (global) {
        try{const fallback=await fetchSinaGlobalKline(code,klt||"101",headers);return Response.json({ok:true,source:`${fallback.source}（东方财富历史节点暂不可用）`,fetchedAt:new Date().toISOString(),code:code.split(".").slice(1).join("."),adjustment:"不复权",bars:fallback.bars})}
        catch(sinaFailure){try{const fallback=await fetchYahooKline(code,klt||"101",headers);return Response.json({ok:true,source:`Yahoo Finance 全球行情（${fallback.symbol}，东方财富及新浪节点暂不可用）`,fetchedAt:new Date().toISOString(),code:code.split(".").slice(1).join("."),adjustment:"不复权",bars:fallback.bars})}catch(fallbackFailure){return Response.json({ok:false,error:`东方财富：${eastmoneyFailure instanceof Error?eastmoneyFailure.message:"获取失败"}；新浪：${sinaFailure instanceof Error?sinaFailure.message:"获取失败"}；Yahoo：${fallbackFailure instanceof Error?fallbackFailure.message:"获取失败"}`},{status:502})}}
      }
      const sym=txSymbol(code),period=klt==="102"?"week":klt==="103"?"month":klt==="101"?"day":`m${klt}`;const txUrl=klt==="101"||klt==="102"||klt==="103"?`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},${period},,,180,qfq`:`https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=${sym},${period},,180`;const tx=JSON.parse(await fetchText(txUrl,headers)) as {data?:Record<string,Record<string,string[][]>>};const node=tx.data?.[sym]||{},rows=(node[`qfq${period}`]||node[period]||[]).slice(-180);const bars=rows.map(v=>({date:v[0],open:+v[1],close:+v[2],high:+v[3],low:+v[4],volume:+v[5],amount:0,amplitude:0,changePct:0,change:0,turnover:0}));return Response.json({ok:true,source:"腾讯证券K线（备用）",fetchedAt:new Date().toISOString(),code:sym.slice(2),adjustment:"前复权",bars});
    }
    if (type === "detail") {
      const code = url.searchParams.get("code") || "600519";
      const fields = "f11,f12,f13,f14,f15,f16,f17,f18,f19,f20,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f43,f44,f45,f46,f47,f48,f57,f58,f60,f116,f162,f167,f168,f169,f170";
      const raw = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid(code)}&invt=2&fltt=2&fields=${fields}`, { headers, cf:{cacheTtl:5} } as RequestInit & {cf:{cacheTtl:number}});
      const json = await raw.json() as {data?:Record<string,number|string>}; const d=json.data||{};
      const level=(p:string,v:string)=>({price:Number(d[p])||null,volume:Number(d[v])||null});
      return Response.json({ok:true,source:"东方财富 push2 五档",fetchedAt:new Date().toISOString(),name:d.f58,code:d.f57,bids:[level("f11","f12"),level("f13","f14"),level("f15","f16"),level("f17","f18"),level("f19","f20")],asks:[level("f31","f32"),level("f33","f34"),level("f35","f36"),level("f37","f38"),level("f39","f40")],quote:{price:d.f43,high:d.f44,low:d.f45,open:d.f46,volume:d.f47,amount:d.f48,prevClose:d.f60,marketCap:d.f116,pe:d.f162,pb:d.f167,turnover:d.f168,change:d.f169,changePct:d.f170}});
    }
    const requested = (url.searchParams.get("codes") || "000001,399001,399006,000688,000300,600519,300750").split(",").slice(0,40);
    const upstream = `${EM_QUOTE}?fltt=2&secids=${requested.map(secid).join(",")}&fields=f2,f3,f4,f5,f6,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f62`;
    const raw = await fetch(upstream, { headers, cf: { cacheTtl: 8 } } as RequestInit & {cf:{cacheTtl:number}});
    if (!raw.ok) throw new Error(`行情源 ${raw.status}`);
    const json = await raw.json() as { data?: { diff?: Record<string, number|string>[] } };
    const quotes = (json.data?.diff || []).map(x => ({price:x.f2,changePct:x.f3,change:x.f4,volume:x.f5,amount:x.f6,turnover:x.f8,pe:x.f9,volumeRatio:x.f10,code:x.f12,market:x.f13,name:x.f14,high:x.f15,low:x.f16,open:x.f17,prevClose:x.f18,marketCap:x.f20,floatMarketCap:x.f21,pb:x.f23,mainNetInflow:x.f62}));
    return Response.json({ ok:true, source:"东方财富 push2", fetchedAt:new Date().toISOString(), quotes });
  } catch (error) {
    return Response.json({ ok:false, error:error instanceof Error?error.message:"数据源不可用", fetchedAt:new Date().toISOString() }, { status:502 });
  }
}
