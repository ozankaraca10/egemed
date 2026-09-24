/** DOM lib'siz Pulse modül kökü. Gerçek bir HTMLElement yapısal olarak uyumludur. */
export interface PulseRoot {
  readonly dataset: Record<string, string | undefined>;
  querySelector(selector: string): unknown;
}

/** Seçiciyi belge yerine yalnızca simülasyon kökünde arar. */
export function query<T = unknown>(root: PulseRoot, selector: string): T | null {
  return root.querySelector(selector) as T | null;
}

/** Durum bayrakları body/document üzerinde değil, örnek kökünde tutulur. */
export function setRootFlag(root: PulseRoot, name: string, value: string | boolean | null): void {
  if (value === null || value === false) {
    delete root.dataset[name];
  } else {
    root.dataset[name] = value === true ? "true" : value;
  }
}

export function getRootFlag(root: PulseRoot, name: string): string | undefined {
  return root.dataset[name];
}
