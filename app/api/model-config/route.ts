import { currentUser, database, ensureAuthSchema } from "../../../lib/auth";
import { encryptApiKey } from "../../../lib/ai-secrets";
import {
  AI_PROVIDERS,
  providerById,
  type AiProviderId,
} from "../../../lib/ai-models";

type KeyRow = {
  provider: AiProviderId;
  encrypted_key: string;
  iv: string;
  key_hint: string;
  updated_at: string;
};

export async function GET(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user)
      return Response.json({ ok: false, error: "未登录" }, { status: 401 });
    await ensureAuthSchema();
    const result = await database()
      .prepare(
        "SELECT provider, key_hint, updated_at FROM ai_provider_keys WHERE user_id = ? ORDER BY provider",
      )
      .bind(user.id)
      .all<Pick<KeyRow, "provider" | "key_hint" | "updated_at">>();
    const configured: Record<
      string,
      {
        configured: boolean;
        keyHint: string;
        updatedAt: string | null;
        source?: string;
      }
    > = Object.fromEntries(
      (result.results || []).map((row) => [
        row.provider,
        { configured: true, keyHint: row.key_hint, updatedAt: row.updated_at },
      ]),
    );
    if (!configured.deepseek && process.env.DEEPSEEK_API_KEY)
      configured.deepseek = {
        configured: true,
        keyHint: "环境变量已配置",
        updatedAt: null,
        source: "environment",
      };
    return Response.json({ ok: true, providers: AI_PROVIDERS, configured });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "读取模型配置失败",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user)
      return Response.json({ ok: false, error: "未登录" }, { status: 401 });
    const body = (await request.json()) as {
      provider?: string;
      apiKey?: string;
    };
    const provider = providerById(String(body.provider || ""));
    const apiKey = String(body.apiKey || "").trim();
    if (!provider)
      return Response.json(
        { ok: false, error: "不支持的模型供应商" },
        { status: 400 },
      );
    if (apiKey.length < 8 || apiKey.length > 500)
      return Response.json(
        { ok: false, error: "API Key 格式或长度不正确" },
        { status: 400 },
      );
    const cipher = await encryptApiKey(apiKey);
    const hint = `${apiKey.slice(0, Math.min(4, apiKey.length))}••••${apiKey.slice(-4)}`;
    const now = new Date().toISOString();
    await database()
      .prepare(
        "INSERT INTO ai_provider_keys (user_id, provider, encrypted_key, iv, key_hint, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, provider) DO UPDATE SET encrypted_key = excluded.encrypted_key, iv = excluded.iv, key_hint = excluded.key_hint, updated_at = excluded.updated_at",
      )
      .bind(user.id, provider.id, cipher.encrypted, cipher.iv, hint, now)
      .run();
    return Response.json({
      ok: true,
      provider: provider.id,
      keyHint: hint,
      updatedAt: now,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "保存模型配置失败",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user)
      return Response.json({ ok: false, error: "未登录" }, { status: 401 });
    const provider = new URL(request.url).searchParams.get("provider") || "";
    if (!providerById(provider))
      return Response.json(
        { ok: false, error: "不支持的模型供应商" },
        { status: 400 },
      );
    await database()
      .prepare(
        "DELETE FROM ai_provider_keys WHERE user_id = ? AND provider = ?",
      )
      .bind(user.id, provider)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "删除模型配置失败",
      },
      { status: 500 },
    );
  }
}
