import { z } from "zod";

/**
 * T62 — ortam doğrulaması (E3 §a, §g). Değerler `@egemed/contracts` dışında
 * burada zod ile doğrulanır; hata metni hiçbir değeri (özellikle DSN'i)
 * taşımaz. `AUTH_DEV_ENABLED=true` yalnız üretim dışı ortamda geçerlidir.
 * T64 — SSO sağlayıcı kimliği ve state imza anahtarı da burada doğrulanır.
 */

/** Boş dizge "tanımsız" sayılır: `.env.example` boş değerlerle kopyalanabilir. */
function emptyAsUndefined(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

const envSchema = z.object({
  DATABASE_URL: z.string().trim().min(1).startsWith("postgres"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_DEV_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Oturum süreleri (E3 §a): boşta kalma 30 dk, mutlak üst sınır 12 sa.
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  // Giriş hız sınırı (T81): anahtar başına 15 dakikada deneme sayısı. Üretimde
  // varsayılan 8 kalmalı; e2e/CI aynı tohum kullanıcıyla sık giriş yaptığı için yükseltir.
  AUTH_LOGIN_RATE_MAX: z.coerce.number().int().min(1).max(1000).default(8),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  // T64 — SSO adaptörü: protokol (§i) seçilene dek `none` kalır ve uçlar 404
  // döner. Seçim yapıldığında bu değer adaptörü belirler.
  SSO_PROVIDER: z.enum(["none", "oidc", "saml", "cas"]).default("none"),
  // state/nonce çerezini imzalayan HMAC anahtarı; en az 256 bit entropi bekler.
  SSO_STATE_SECRET: z.string().trim().min(32).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Doğrulama hatası: yalnız geçersiz anahtar adlarını taşır, değer taşımaz. */
export class EnvValidationError extends Error {
  readonly keys: readonly string[];

  constructor(keys: readonly string[]) {
    super(`Ortam doğrulaması başarısız: ${keys.join(", ")}`);
    this.name = "EnvValidationError";
    this.keys = keys;
  }
}

/** Ortam kaynağını doğrular; eksik/geçersiz değerde açılışı durdurur. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL,
    PORT: emptyAsUndefined(source.PORT),
    NODE_ENV: emptyAsUndefined(source.NODE_ENV),
    AUTH_DEV_ENABLED: emptyAsUndefined(source.AUTH_DEV_ENABLED),
    SESSION_IDLE_MINUTES: emptyAsUndefined(source.SESSION_IDLE_MINUTES),
    AUTH_LOGIN_RATE_MAX: emptyAsUndefined(source.AUTH_LOGIN_RATE_MAX),
    SESSION_ABSOLUTE_HOURS: emptyAsUndefined(source.SESSION_ABSOLUTE_HOURS),
    SSO_PROVIDER: emptyAsUndefined(source.SSO_PROVIDER),
    SSO_STATE_SECRET: emptyAsUndefined(source.SSO_STATE_SECRET),
  });
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => issue.path.map(String).join(".")),
    );
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.AUTH_DEV_ENABLED) {
    throw new EnvValidationError(["AUTH_DEV_ENABLED"]);
  }
  // Sağlayıcı seçildiyse imza anahtarı da zorunludur; eksikse açılış durur.
  if (parsed.data.SSO_PROVIDER !== "none" && parsed.data.SSO_STATE_SECRET === undefined) {
    throw new EnvValidationError(["SSO_STATE_SECRET"]);
  }
  return parsed.data;
}
