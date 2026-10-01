/**
 * T283f — Rekabetçi ekranlarda (değerlendirme, Meydan Okuma) yapay zekâ ajanı /
 * otomasyon tespiti (ADR-009 önlem paketi; depo sahibi kararı 30 Eyl 2026:
 * "uyarı çıkarıp 10 sn zaman verebiliriz kapatması için").
 *
 * Yalnız tarayıcıda, yerel çalışır: sayfaya eklenmiş bilinen ajan işaretleri.
 * Eklenti listesi okunmaz, hiçbir veri gönderilmez (KVKK). `navigator.webdriver`
 * bilinçli olarak engel sebebi DEĞİLDİR (test otomasyonu ve bazı yardımcı
 * teknolojilerde de doğrudur); ölçümle desteklenen sunucu sinyali olarak T283c'ye kalır.
 * Sonuç ceza değil engeldir: süre dolarsa ekran, ajan kapanana dek kilitlenir.
 * Sunucuya sinyal (T283c) ve yönetici kararı (T283b) bu modülün dışındadır.
 */

/** Tespit sinyalleri; arayüz metni ve ileride T283c telemetrisi bu adları kullanır. */
export type AiAgentSignal = "claude-in-chrome";

/**
 * Bilinen ajan işaretleri: ajanın sayfaya eklediği öğeler. Liste yalnız
 * doğrulanmış işaretlerle genişletilir (yanlış pozitif = haksız engel).
 */
export const AI_AGENT_MARKERS: readonly { readonly signal: AiAgentSignal; readonly selector: string }[] = [
  // Claude in Chrome eklentisi, kontrol ettiği sekmeye `claude-agent-*` kimlikli kaplama öğeleri ekler.
  { signal: "claude-in-chrome", selector: '[id^="claude-agent-"]' },
];

/** DOM'suz test edilebilir dar ortam. */
export interface AiGuardEnvironment {
  querySelector(selector: string): unknown;
  /** Geçerli adres (`location.hash`); sim kendi ekranını değiştirince de güncel kalır. */
  hash(): string;
}

/** XP kazandıran rekabetçi ekranlar: sim değerlendirmesi ve karşılaşma oynanışı. */
export function isCompetitiveHash(hash: string): boolean {
  return /^#\/sims\/[a-z]+\/(?:degerlendirme|duello\/[0-9a-f-]{36})(?:[/?]|$)/.test(hash);
}

export function detectAiAgents(environment: AiGuardEnvironment): readonly AiAgentSignal[] {
  const signals: AiAgentSignal[] = [];
  for (const marker of AI_AGENT_MARKERS) {
    if (environment.querySelector(marker.selector) != null && !signals.includes(marker.signal)) signals.push(marker.signal);
  }
  return signals;
}

/** Tarayıcı ortamı; DOM yoksa (SSR/test) `null`. */
export function browserAiGuardEnvironment(): AiGuardEnvironment | null {
  const scope = globalThis as {
    document?: { querySelector(selector: string): unknown };
    location?: { hash: string };
  };
  const doc = scope.document;
  if (doc === undefined) return null;
  return {
    querySelector: (selector) => doc.querySelector(selector),
    hash: () => scope.location?.hash ?? "",
  };
}

/** Kapatma için tanınan süre. */
export const AI_GUARD_GRACE_MS = 10_000;

export type AiGuardState =
  | { readonly kind: "clear" }
  | { readonly kind: "warning"; readonly signals: readonly AiAgentSignal[]; readonly since: number }
  | { readonly kind: "blocked"; readonly signals: readonly AiAgentSignal[] };

export const AI_GUARD_CLEAR: AiGuardState = { kind: "clear" };

/**
 * Durum geçişi: sinyal yok → temiz (uyarı/engel kalkar); sinyal ilk kez →
 * uyarı başlar; uyarıda süre dolduysa → engel. Engel yalnız sinyaller
 * kalkınca açılır.
 */
export function aiGuardStep(state: AiGuardState, signals: readonly AiAgentSignal[], now: number): AiGuardState {
  if (signals.length === 0) return state.kind === "clear" ? state : AI_GUARD_CLEAR;
  if (state.kind === "clear") return { kind: "warning", signals, since: now };
  if (state.kind === "warning") {
    return now - state.since >= AI_GUARD_GRACE_MS ? { kind: "blocked", signals } : { ...state, signals };
  }
  return { kind: "blocked", signals };
}

/** Uyarıda kalan tam saniye (0–10). */
export function aiGuardSecondsLeft(state: AiGuardState, now: number): number {
  if (state.kind !== "warning") return 0;
  return Math.max(0, Math.ceil((AI_GUARD_GRACE_MS - (now - state.since)) / 1000));
}
