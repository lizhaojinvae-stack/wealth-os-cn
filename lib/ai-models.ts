export type AiProviderId = "openai" | "gemini" | "deepseek" | "qwen" | "glm";

export type AiProvider = {
  id: AiProviderId;
  name: string;
  note: string;
  models: { id: string; name: string; note?: string }[];
};

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "openai",
    name: "ChatGPT / OpenAI",
    note: "OpenAI API Key",
    models: [
      { id: "gpt-5.2", name: "GPT-5.2", note: "综合推理" },
      { id: "gpt-5-mini", name: "GPT-5 mini", note: "速度与成本均衡" },
      { id: "gpt-4.1", name: "GPT-4.1", note: "稳定通用" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    note: "Google AI Studio API Key",
    models: [
      {
        id: "gemini-3.7-flash",
        name: "Gemini 3.7 Flash",
        note: "最新高速模型",
      },
      { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview",
        note: "复杂推理",
      },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    note: "DeepSeek 开放平台 API Key",
    models: [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", note: "高质量推理" },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        note: "快速低成本",
      },
    ],
  },
  {
    id: "qwen",
    name: "阿里云百炼 / Qwen",
    note: "DashScope API Key（中国北京地域）",
    models: [
      { id: "qwen3.8-max", name: "Qwen3.8 Max", note: "旗舰" },
      { id: "qwen3.7-plus", name: "Qwen3.7 Plus", note: "综合均衡" },
      { id: "qwen3.7-flash", name: "Qwen3.7 Flash", note: "快速低成本" },
    ],
  },
  {
    id: "glm",
    name: "智谱 GLM",
    note: "智谱开放平台 API Key",
    models: [
      { id: "glm-5.2", name: "GLM-5.2", note: "最新旗舰" },
      { id: "glm-5.1", name: "GLM-5.1" },
      { id: "glm-5-turbo", name: "GLM-5 Turbo", note: "快速" },
    ],
  },
];

export const providerById = (id: string) =>
  AI_PROVIDERS.find((item) => item.id === id);

export function validateModel(provider: string, model: string) {
  const definition = providerById(provider);
  if (!definition) return false;
  return (
    definition.models.some((item) => item.id === model) ||
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,99}$/.test(model)
  );
}

export function providerEndpoint(
  provider: AiProviderId,
  model: string,
  apiKey: string,
) {
  if (provider === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      kind: "gemini" as const,
    };
  }
  const url = {
    openai: "https://api.openai.com/v1/chat/completions",
    deepseek: "https://api.deepseek.com/chat/completions",
    qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    glm: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  }[provider];
  return {
    url,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    kind: "openai" as const,
  };
}
