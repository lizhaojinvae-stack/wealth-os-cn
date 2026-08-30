import { currentUser, database } from "../../../lib/auth";
import { decryptApiKey } from "../../../lib/ai-secrets";
import {
  providerById,
  providerEndpoint,
  validateModel,
  type AiProviderId,
} from "../../../lib/ai-models";

type AnalysisInput = {
  provider?: AiProviderId;
  model?: string;
  code?: string;
  name?: string;
  quote?: Record<string, unknown>;
  technical?: Record<string, unknown>;
  news?: Array<{
    title?: string;
    summary?: string;
    publishedAt?: string;
    source?: string;
  }>;
};

type UpstreamResponse = {
  error?: { message?: string };
  message?: string;
  model?: string;
  usage?: unknown;
  usageMetadata?: unknown;
  choices?: Array<{ message?: { content?: string } }>;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

const systemPrompt = `你是中国A股研究辅助系统。只能依据用户提供的数据分析，不得补造价格、公告、新闻、财务数据或来源。明确区分事实、计算结果与推断；数据不足就直说。不要承诺收益，不使用“必涨、稳赚、抄底、满仓”等措辞。输出必须是JSON对象，结构为：{"summary":"一句话结论","stance":"偏强|中性|偏弱|数据不足","confidence":"高|中|低","evidence":["证据"],"newsImpact":[{"event":"事件","direction":"利好|利空|中性|待核验","reason":"原因"}],"scenarios":[{"name":"情景","trigger":"触发条件","response":"纪律动作"}],"risks":["风险"],"dataGaps":["数据缺口"],"disclaimer":"风险声明"}。新闻标题只能作为公开消息线索，若摘要不足必须标记待核验。`;

async function configuredKey(userId: string, provider: AiProviderId) {
  const row = await database()
    .prepare(
      "SELECT encrypted_key, iv FROM ai_provider_keys WHERE user_id = ? AND provider = ?",
    )
    .bind(userId, provider)
    .first<{ encrypted_key: string; iv: string }>();
  return row ? decryptApiKey(row.encrypted_key, row.iv) : null;
}

export async function POST(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user)
      return Response.json({ ok: false, error: "未登录" }, { status: 401 });
    const input = (await request.json()) as AnalysisInput;
    if (!input.code || !input.name)
      return Response.json(
        { ok: false, error: "缺少股票代码或名称。" },
        { status: 400 },
      );
    const provider = (input.provider || "deepseek") as AiProviderId;
    const definition = providerById(provider);
    const model = String(input.model || definition?.models[0]?.id || "");
    if (!definition || !validateModel(provider, model))
      return Response.json(
        { ok: false, error: "模型供应商或模型ID无效" },
        { status: 400 },
      );
    let apiKey = await configuredKey(user.id, provider);
    if (!apiKey && provider === "deepseek")
      apiKey = process.env.DEEPSEEK_API_KEY || null;
    if (!apiKey)
      return Response.json(
        {
          ok: false,
          error: `请先在个人中心配置 ${definition.name} 的 API Key`,
        },
        { status: 503 },
      );

    const target = providerEndpoint(provider, model, apiKey);
    const userPrompt = `请直接输出完整JSON对象，不要使用Markdown代码块。分析以下实时数据快照：\n${JSON.stringify({ ...input, provider: undefined, model: undefined })}`;
    let content = "",
      responseModel = model,
      usage: unknown;
    for (let attempt = 0; attempt < 2 && !content; attempt += 1) {
      const body =
        target.kind === "gemini"
          ? {
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `${attempt ? "上一次没有返回正文。" : ""}${userPrompt}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 3000,
              },
            }
          : {
              model,
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: `${attempt ? "上一次没有返回正文。" : ""}${userPrompt}`,
                },
              ],
              ...(attempt === 0
                ? { response_format: { type: "json_object" } }
                : {}),
              ...(provider === "openai"
                ? { max_completion_tokens: 3000 }
                : { max_tokens: 3000 }),
            };
      const upstream = await fetch(target.url, {
        method: "POST",
        headers: target.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      const raw = (await upstream.json()) as UpstreamResponse;
      if (!upstream.ok)
        throw new Error(
          raw?.error?.message ||
            raw?.message ||
            `${definition.name} API ${upstream.status}`,
        );
      if (target.kind === "gemini") {
        content =
          raw?.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text || "")
            .join("")
            .trim() || "";
        usage = raw?.usageMetadata;
      } else {
        content = raw?.choices?.[0]?.message?.content?.trim() || "";
        responseModel = raw?.model || model;
        usage = raw?.usage;
      }
    }
    if (!content) throw new Error(`${definition.name} 两次返回内容为空`);
    const normalized = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return Response.json({
      ok: true,
      provider,
      providerName: definition.name,
      model: responseModel,
      generatedAt: new Date().toISOString(),
      analysis: JSON.parse(normalized),
      usage,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "AI分析暂不可用",
      },
      { status: 502 },
    );
  }
}
