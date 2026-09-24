import { z } from "zod";

/**
 * T62 — ortam doğrulaması (E3 §a, §g). Değerler `@egemed/contracts` dışında
 * burada zod ile doğrulanır; hata metni hiçbir değeri (özellikle DSN'i)
 * taşımaz. `AUTH_DEV_ENABLED=true` yalnız üretim dışı ortamda geçerlidir.
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
  });
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => issue.path.map(String).join(".")),
    );
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.AUTH_DEV_ENABLED) {
    throw new EnvValidationError(["AUTH_DEV_ENABLED"]);
  }
  return parsed.data;
}
