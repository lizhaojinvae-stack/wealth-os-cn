const EM_QUOTE = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const EM_KLINE = "https://push2his.eastmoney.com/api/qt/stock/kline/get";

function secid(code: string) {
  if (/^[01]\.\d{6}$/.test(code)) return code;
  const c = code.replace(/\D/g, "").slice(-6);
  return `${/^(5|6)/.test(c) ? "1" : "0"}.${c}`;
}
function txSymbol(code:string){if(/^[01]\.\d{6}$/.test(code))return `${code.startsWith("1.")?"sh":"sz"}${code.slice(2)}`;const c=code.replace(/\D/g,"").slice(-6);return `${/^[489]/.test(c)?"bj":/^(5|6)/.test(c)?"sh":"sz"}${c}`}
async function fetchText(url:string,headers:Record<string,string>,tries=2){let last:unknown;for(let i=0;i<tries;i++){try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(9000)});if(!r.ok)throw new Error(`上游 ${r.status}`);return await r.text()}catch(e){last=e}}throw last}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "quotes";
  const headers = { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" };
  try {
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
        const results=rows
          .filter(v=>/^\d{6}$/.test(v.Code)&&(
            (stockPrefix.test(v.Code)&&(v.Classify==="AStock"||v.Classify==="23"||v.SecurityTypeName?.includes("A")||v.SecurityTypeName?.includes("科创")))||
            (v.SecurityTypeName?.includes("京A"))||
            (v.Classify==="Fund"&&etfPrefix.test(v.Code))
          ))
          .map(v=>({exchange:v.SecurityTypeName?.includes("京A")?"BJ":v.QuoteID?.startsWith("1.")?"SH":"SZ",code:v.Code,name:v.Name,pinyin:(v.PinYin||"").toLowerCase(),type:v.Classify==="Fund"?"ETF":v.SecurityTypeName||"A股"}))
          .filter(v=>isChinese?compact(v.name).includes(normalizedNeedle)||normalizedNeedle.includes(compact(v.name)):v.code.includes(needle)||v.pinyin.includes(needle))
          .sort((a,b)=>Number(b.code.startsWith(needle))-Number(a.code.startsWith(needle))||Number(compact(b.name).startsWith(normalizedNeedle))-Number(compact(a.name).startsWith(normalizedNeedle))||a.name.localeCompare(b.name,"zh-CN"));
        return Response.json({ok:true,source:"东方财富证券搜索 · 沪深/科创板/创业板/北交所",fetchedAt:new Date().toISOString(),query:q,total:results.length,results});
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
            try{
              const upstream=`${EM_KLINE}?secid=${secid(code)}&klt=101&fqt=1&beg=0&end=20500101&lmt=320&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56`;
              const body=await fetchText(upstream,headers);
              rows=((JSON.parse(body) as {data?:{klines?:string[]}}).data?.klines||[]).map(x=>{const v=x.split(",");return {date:v[0],close:+v[2]}}).filter(x=>Number.isFinite(x.close));
            }catch{}
            if(!rows.length){
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
      return Response.json({ok:true,source:"东方财富前复权日线计算",fetchedAt:new Date().toISOString(),results});
    }
    if (type === "kline") {
      const code = url.searchParams.get("code") || "000001";
      const klt = ["5","15","30","60","101","102","103"].includes(url.searchParams.get("klt")||"") ? url.searchParams.get("klt") : "101";
      const upstream = `${EM_KLINE}?secid=${secid(code)}&klt=${klt}&fqt=1&beg=0&end=20500101&lmt=180&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
      try{const body=await fetchText(upstream,headers);const json=JSON.parse(body) as { data?: { name?: string; code?: string; klines?: string[] } };const bars=(json.data?.klines||[]).slice(-180).map(x=>{const v=x.split(",");return {date:v[0],open:+v[1],close:+v[2],high:+v[3],low:+v[4],volume:+v[5],amount:+v[6],amplitude:+v[7],changePct:+v[8],change:+v[9],turnover:+v[10]}});if(bars.length)return Response.json({ok:true,source:"东方财富 push2his",fetchedAt:new Date().toISOString(),code:json.data?.code,name:json.data?.name,adjustment:"前复权",bars})}catch{}
      const sym=txSymbol(code),period=klt==="102"?"week":klt==="103"?"month":klt==="101"?"day":`m${klt}`;const txUrl=klt==="101"||klt==="102"||klt==="103"?`http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},${period},,,180,qfq`:`http://ifzq.gtimg.cn/appstock/app/kline/mkline?param=${sym},${period},,180`;const tx=JSON.parse(await fetchText(txUrl,headers)) as {data?:Record<string,Record<string,string[][]>>};const node=tx.data?.[sym]||{},rows=(node[`qfq${period}`]||node[period]||[]).slice(-180);const bars=rows.map(v=>({date:v[0],open:+v[1],close:+v[2],high:+v[3],low:+v[4],volume:+v[5],amount:0,amplitude:0,changePct:0,change:0,turnover:0}));return Response.json({ok:true,source:"腾讯证券K线（备用）",fetchedAt:new Date().toISOString(),code:sym.slice(2),adjustment:"前复权",bars});
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
