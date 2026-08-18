import { createSession, currentUser, database, ensureAuthSchema, hashPassword, publicUser, removeSession, sessionCookie, verifyPassword, type UserRow } from "../../../lib/auth";

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  try { return json({ ok: true, user: await currentUser(request) }); }
  catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "认证服务不可用" }, 500); }
}

export async function POST(request: Request) {
  try {
    await ensureAuthSchema();
    const body = await request.json() as { action?: string; email?: string; password?: string; displayName?: string };
    if (body.action === "logout") {
      await removeSession(request);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "请输入有效邮箱" }, 400);
    if (password.length < 8 || password.length > 128) return json({ ok: false, error: "密码长度需为8至128位" }, 400);
    if (body.action === "register") {
      const displayName = String(body.displayName || "").trim().slice(0, 30);
      if (displayName.length < 2) return json({ ok: false, error: "昵称至少2个字符" }, 400);
      const exists = await database().prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (exists) return json({ ok: false, error: "该邮箱已经注册" }, 409);
      const id = crypto.randomUUID(), now = new Date().toISOString(), secret = await hashPassword(password);
      await database().prepare("INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, email, displayName, secret.hash, secret.salt, now, now).run();
      const session = await createSession(id);
      return json({ ok: true, user: { id, email, displayName } }, 201, { "Set-Cookie": sessionCookie(session.token) });
    }
    if (body.action === "login") {
      const row = await database().prepare("SELECT id, email, display_name, password_hash, password_salt FROM users WHERE email = ?").bind(email).first<UserRow>();
      if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) return json({ ok: false, error: "邮箱或密码错误" }, 401);
      const session = await createSession(row.id);
      return json({ ok: true, user: publicUser(row) }, 200, { "Set-Cookie": sessionCookie(session.token) });
    }
    return json({ ok: false, error: "不支持的认证操作" }, 400);
  } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "认证请求失败" }, 500); }
}
