import { env } from "cloudflare:workers";

export type AuthUser = { id: string; email: string; displayName: string };
type UserRow = { id: string; email: string; display_name: string; password_hash: string; password_salt: string };

const encoder = new TextEncoder();
const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const randomToken = (size = 32) => { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return bytesToBase64(bytes); };
const sha256 = async (value: string) => bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));

export const database = () => (env as unknown as { DB: D1Database }).DB;

let authSchemaPromise: Promise<void> | null = null;

export function ensureAuthSchema(): Promise<void> {
  if (!authSchemaPromise) {
    authSchemaPromise = (async () => {
      const db = database();
      let usersExists = false;
      try {
        usersExists = Boolean(await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").first());
      } catch {
        usersExists = false;
      }
      if (usersExists) return;
      await db.batch([
        db.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
        db.prepare("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"),
        db.prepare("CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)"),
        db.prepare("CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)"),
        db.prepare("CREATE TABLE IF NOT EXISTS user_data (user_id TEXT PRIMARY KEY, payload TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"),
      ]);
    })().catch((error) => {
      authSchemaPromise = null;
      throw error;
    });
  }
  return authSchemaPromise;
}

export async function hashPassword(password: string, salt = randomToken(18)) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: 210000 }, key, 256);
  return { salt, hash: bytesToBase64(new Uint8Array(bits)) };
}

export async function verifyPassword(password: string, salt: string, expected: string) {
  const { hash } = await hashPassword(password, salt);
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < hash.length; index += 1) diff |= hash.charCodeAt(index) ^ expected.charCodeAt(index);
  return diff === 0;
}

export function readSessionCookie(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("wealth_session="));
  return value ? decodeURIComponent(value.slice("wealth_session=".length)) : "";
}

export async function currentUser(request: Request): Promise<AuthUser | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  await ensureAuthSchema();
  const row = await database().prepare("SELECT users.id, users.email, users.display_name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?").bind(await sha256(token), new Date().toISOString()).first<{ id: string; email: string; display_name: string }>();
  return row ? { id: row.id, email: row.email, displayName: row.display_name } : null;
}

export async function createSession(userId: string) {
  await ensureAuthSchema();
  const token = randomToken();
  const now = new Date(), expires = new Date(now.getTime() + 30 * 86400000);
  await database().prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), userId, expires.toISOString(), now.toISOString()).run();
  return { token, expires };
}

export async function removeSession(request: Request) {
  const token = readSessionCookie(request);
  if (token) {
    await ensureAuthSchema();
    await database().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  }
}

export const sessionCookie = (token: string, maxAge = 30 * 86400) => `wealth_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
export const publicUser = (row: UserRow): AuthUser => ({ id: row.id, email: row.email, displayName: row.display_name });
export type { UserRow };
