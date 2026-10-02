/** DOM yüzeyi — kök tsconfig DOM lib içermediğinden globalThis üzerinden erişilir. */

interface Focusable {
  focus(): void;
}

interface ScrollTarget {
  scrollIntoView(options?: { behavior?: string; block?: string }): void;
  focus(options?: { preventScroll?: boolean }): void;
  querySelector<T = unknown>(selector: string): T | null;
}

interface DocLike {
  getElementById(id: string): ScrollTarget | null;
  activeElement: Focusable | null;
  addEventListener(type: string, handler: (event: KeyLike) => void): void;
  removeEventListener(type: string, handler: (event: KeyLike) => void): void;
  querySelectorAll<T = unknown>(selector: string): T[];
}

interface KeyLike {
  key: string;
  shiftKey: boolean;
  preventDefault(): void;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function documentLike(): DocLike | undefined {
  return (globalThis as unknown as { document?: DocLike }).document;
}

export function windowLike(): { setInterval(handler: () => void, ms: number): number; clearInterval(id: number): void; location?: { search: string } } | undefined {
  return (globalThis as { window?: { setInterval(handler: () => void, ms: number): number; clearInterval(id: number): void; location?: { search: string } } }).window;
}

export function localStorageLike(): StorageLike | undefined {
  return (globalThis as { localStorage?: StorageLike }).localStorage;
}

export function searchParam(search: string, key: string): string | null {
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return null;
  for (const part of q.split("&")) {
    const eq = part.indexOf("=");
    const k = decodeURIComponent(eq === -1 ? part : part.slice(0, eq));
    if (k === key) return decodeURIComponent(eq === -1 ? "" : part.slice(eq + 1));
  }
  return null;
}

export function locationSearch(): string {
  return windowLike()?.location?.search ?? "";
}
