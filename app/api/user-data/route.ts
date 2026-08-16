import { currentUser, database } from "../../../lib/auth";

export async function GET(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return Response.json({ ok: false, error: "未登录" }, { status: 401 });
    const row = await database().prepare("SELECT payload, revision, updated_at FROM user_data WHERE user_id = ?").bind(user.id).first<{ payload: string; revision: number; updated_at: string }>();
    return Response.json({ ok: true, data: row ? JSON.parse(row.payload) : null, revision: row?.revision || 0, updatedAt: row?.updated_at || null });
  } catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "读取用户数据失败" }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return Response.json({ ok: false, error: "未登录" }, { status: 401 });
    const body = await request.json() as { data?: unknown };
    const payload = JSON.stringify(body.data ?? {});
    if (payload.length > 5_000_000) return Response.json({ ok: false, error: "用户数据超过5MB限制" }, { status: 413 });
    const now = new Date().toISOString();
    await database().prepare("INSERT INTO user_data (user_id, payload, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, revision = user_data.revision + 1, updated_at = excluded.updated_at").bind(user.id, payload, now).run();
    return Response.json({ ok: true, updatedAt: now });
  } catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "保存用户数据失败" }, { status: 500 }); }
}
