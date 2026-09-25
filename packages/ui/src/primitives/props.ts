/** `exactOptionalPropertyTypes` altında isteğe bağlı prop'ları taşımak için tanımsız anahtarları ayıklar. */
export function definedProps<T extends Record<string, unknown>>(props: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = value;
  }
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/** Boş/yanlış değerleri atarak sınıf adlarını birleştirir. */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" ");
}
