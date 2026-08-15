type AnalysisInput = {
  code?: string;
  name?: string;
  quote?: Record<string, unknown>;
  technical?: Record<string, unknown>;
  news?: Array<{ title?: string; summary?: string; publishedAt?: string; source?: string }>;
};

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "未配置 DEEPSEEK_API_KEY，请在 .env.local 或部署平台环境变量中设置。" },
      { status: 503 },
    );
  }
  try {
    const input = (await request.json()) as AnalysisInput;
    if (!input.code || !input.name)
      return Response.json({ ok: false, error: "缺少股票代码或名称。" }, { status: 400 });
    const system = `你是中国A股研究辅助系统。只能依据用户提供的数据分析，不得补造价格、公告、新闻、财务数据或来源。明确区分事实、计算结果与推断；数据不足就直说。不要承诺收益，不使用“必涨、稳赚、抄底、满仓”等措辞。输出必须是JSON对象，结构为：{"summary":"一句话结论","stance":"偏强|中性|偏弱|数据不足","confidence":"高|中|低","evidence":["证据"],"newsImpact":[{"event":"事件","direction":"利好|利空|中性|待核验","reason":"原因"}],"scenarios":[{"name":"情景","trigger":"触发条件","response":"纪律动作"}],"risks":["风险"],"dataGaps":["数据缺口"],"disclaimer":"风险声明"}。新闻标题只能作为公开消息线索，若摘要不足必须标记待核验。`;
    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `请用JSON分析以下实时数据快照：\n${JSON.stringify(input)}` },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "enabled" },
        max_tokens: 1800,
      }),
      signal: AbortSignal.timeout(60000),
    });
    const raw = (await upstream.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: unknown;
    };
    if (!upstream.ok) throw new Error(raw.error?.message || `DeepSeek API ${upstream.status}`);
    const content = raw.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek 返回内容为空");
    return Response.json({
      ok: true,
      model: raw.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
      generatedAt: new Date().toISOString(),
      analysis: JSON.parse(content),
      usage: raw.usage,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "AI分析暂不可用" },
      { status: 502 },
    );
  }
}
