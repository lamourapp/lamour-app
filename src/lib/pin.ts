// Server-side PIN hashing.
// Stored as "scrypt:<saltHex>:<hashHex>" in Settings.pinHash.
// Using Node's built-in scrypt to avoid external deps.

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_LEN = 32;
const PREFIX = "scrypt";

export function hashPin(pin: string): string {
  if (typeof pin !== "string" || pin.length < 4) {
    throw new Error("PIN must be at least 4 characters");
  }
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, KEY_LEN);
  return `${PREFIX}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string | undefined | null): boolean {
  if (!pin || !stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (expected.length !== KEY_LEN) return false;
  const actual = scryptSync(pin, salt, KEY_LEN);
  try {
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
