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
    const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
    let content = "";
    let responseModel = model;
    let usage: unknown;
    let lastFinishReason = "unknown";

    // DeepSeek documents that JSON Output can occasionally return an empty
    // content field. Disable thinking for this short structured task so the
    // reasoning tokens cannot consume the whole output budget, then retry once
    // without response_format if the provider still returns an empty body.
    for (let attempt = 0; attempt < 2 && !content; attempt += 1) {
      const upstream = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: `${attempt ? "上一次未返回正文，请直接输出完整JSON对象，不要使用Markdown代码块。\n" : ""}请用JSON分析以下实时数据快照：\n${JSON.stringify(input)}`,
            },
          ],
          ...(attempt === 0 ? { response_format: { type: "json_object" } } : {}),
          thinking: { type: "disabled" },
          max_tokens: 3000,
        }),
        signal: AbortSignal.timeout(60000),
      });
      const raw = (await upstream.json()) as {
        error?: { message?: string };
        choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
        model?: string;
        usage?: unknown;
      };
      if (!upstream.ok) throw new Error(raw.error?.message || `DeepSeek API ${upstream.status}`);
      content = raw.choices?.[0]?.message?.content?.trim() || "";
      responseModel = raw.model || model;
      usage = raw.usage;
      lastFinishReason = raw.choices?.[0]?.finish_reason || "unknown";
    }
    if (!content) throw new Error(`DeepSeek 两次返回内容为空（finish_reason: ${lastFinishReason}）`);
    const normalizedContent = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return Response.json({
      ok: true,
      model: responseModel,
      generatedAt: new Date().toISOString(),
      analysis: JSON.parse(normalizedContent),
      usage,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "AI分析暂不可用" },
      { status: 502 },
    );
  }
}
