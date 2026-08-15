const EM_QUOTE = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const EM_KLINE = "https://push2his.eastmoney.com/api/qt/stock/kline/get";

function secid(code: string) {
  if (/^[01]\.\d{6}$/.test(code)) return code;
  const c = code.replace(/\D/g, "").slice(-6);
  return `${/^(5|6|9)/.test(c) ? "1" : "0"}.${c}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "quotes";
  const headers = { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" };
  try {
    if (type === "kline") {
      const code = url.searchParams.get("code") || "000001";
      const upstream = `${EM_KLINE}?secid=${secid(code)}&klt=101&fqt=1&lmt=180&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
      const raw = await fetch(upstream, { headers, cf: { cacheTtl: 180 } } as RequestInit & {cf:{cacheTtl:number}});
      if (!raw.ok) throw new Error(`行情源 ${raw.status}`);
      const json = await raw.json() as { data?: { name?: string; code?: string; klines?: string[] } };
      const bars = (json.data?.klines || []).map(x => { const v=x.split(","); return {date:v[0],open:+v[1],close:+v[2],high:+v[3],low:+v[4],volume:+v[5],amount:+v[6],amplitude:+v[7],changePct:+v[8],change:+v[9],turnover:+v[10]}; });
      return Response.json({ ok:true, source:"东方财富 push2his", fetchedAt:new Date().toISOString(), code:json.data?.code, name:json.data?.name, adjustment:"前复权", bars });
    }
    const requested = (url.searchParams.get("codes") || "000001,399001,399006,000688,000300,600519,300750").split(",").slice(0,40);
    const upstream = `${EM_QUOTE}?fltt=2&secids=${requested.map(secid).join(",")}&fields=f2,f3,f4,f5,f6,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f23`;
    const raw = await fetch(upstream, { headers, cf: { cacheTtl: 8 } } as RequestInit & {cf:{cacheTtl:number}});
    if (!raw.ok) throw new Error(`行情源 ${raw.status}`);
    const json = await raw.json() as { data?: { diff?: Record<string, number|string>[] } };
    const quotes = (json.data?.diff || []).map(x => ({price:x.f2,changePct:x.f3,change:x.f4,volume:x.f5,amount:x.f6,turnover:x.f8,pe:x.f9,volumeRatio:x.f10,code:x.f12,market:x.f13,name:x.f14,high:x.f15,low:x.f16,open:x.f17,prevClose:x.f18,marketCap:x.f20,pb:x.f23}));
    return Response.json({ ok:true, source:"东方财富 push2", fetchedAt:new Date().toISOString(), quotes });
  } catch (error) {
    return Response.json({ ok:false, error:error instanceof Error?error.message:"数据源不可用", fetchedAt:new Date().toISOString() }, { status:502 });
  }
}
