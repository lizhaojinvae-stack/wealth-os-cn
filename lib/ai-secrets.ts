import { env } from "cloudflare:workers";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

async function encryptionKey() {
  const secret = (env as unknown as { AI_KEYS_ENCRYPTION_KEY?: string })
    .AI_KEYS_ENCRYPTION_KEY;
  if (!secret || secret.length < 24)
    throw new Error("服务端未配置 AI_KEYS_ENCRYPTION_KEY（至少24字符）");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptApiKey(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(value),
  );
  return { encrypted: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

export async function decryptApiKey(encrypted: string, iv: string) {
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await encryptionKey(),
    fromBase64(encrypted),
  );
  return decoder.decode(clear);
}
