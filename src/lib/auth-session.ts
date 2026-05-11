// App-level session cookie helpers — HMAC-signed value, no external deps.
//
// Сесія = `<expiryUnix>.<hmacHex>` де hmac = HMAC-SHA256(AUTH_SECRET, expiryUnix).
// Зберігаємо в httpOnly cookie. Дійсна 30 днів від моменту видачі.
//
// Працює і на Edge runtime (middleware), і на Node (API routes) — використовує
// Web Crypto API. На Vercel Edge `process.env` доступний як звичайний об'єкт.

const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = "salon_session";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET env var is not set or too short (need ≥16 chars)",
    );
  }
  return secret;
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Create a fresh session token valid for SESSION_DAYS. */
export async function createSessionToken(): Promise<string> {
  const expiry = Date.now() + SESSION_MS;
  const payload = String(expiry);
  const sig = await hmacSha256Hex(getSecret(), payload);
  return `${payload}.${sig}`;
}

/** Returns true if the cookie value is well-formed, signature is valid, and not expired. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiry = Number(payload);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  let expected: string;
  try {
    expected = await hmacSha256Hex(getSecret(), payload);
  } catch {
    return false;
  }
  return timingSafeEqualStr(sig, expected);
}

export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_MS / 1000);
