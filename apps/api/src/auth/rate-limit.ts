import { sha256Hex } from "./session";

/**
 * T81 — giriş hız sınırı (E3 §a kural 5). Eşik açık karardır (§i.7); çalışan
 * varsayılan: anahtar başına 15 dakikada 8 deneme. Bellek içi; saat `now`
 * ile enjekte edilir. Anahtar ham kullanıcı adı taşımaz (SHA-256).
 */

export const LOGIN_RATE_MAX = 8;
export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 4096;

interface LoginRateLimiter {
  consume(key: string, now: number): boolean;
}

export function loginRateKey(scope: string, value: string): string {
  return `${scope}:${sha256Hex(value)}`;
}

export function createLoginRateLimiter(
  max: number = LOGIN_RATE_MAX,
  windowMs: number = LOGIN_RATE_WINDOW_MS,
): LoginRateLimiter {
  const hits = new Map<string, number[]>();

  return {
    consume(key, now) {
      const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > MAX_KEYS) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return true;
    },
  };
}
