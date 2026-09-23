# EGEMED CLIX ajan kuralları

EGEMED CLIX, Pulse, Ausculta ve Opaca simülatörlerini bağımsız sunan mobil uyumlu klinik öğrenme platformudur. Simülatör verileri hiçbir yüzeyde birleştirilmez; her simülatör tek başına SCORM/HTML çalışır; öğrenci verisi kurum altyapısında kalır; ders, ödev ve not defteri Moodle'dadır.

## Harita
`apps/shell` web kabuğu; `apps/api` API; `sims/` bağımsız simülatörler; `packages/tokens`, `ui`, `xapi-client`, `xapi-profile`, `gamification-core`, `contracts`; `infra/`; `docs/adr`, `specs`, `agentic`, `legacy`.

## Komutlar
`pnpm i`; `pnpm turbo lint typecheck test`; `pnpm e2e:mobile`; `pnpm dev`. Bu komutlar T01/T09 tamamlanana dek mevcut olmayabilir.

## Kod ve tasarım
TypeScript strict. Yeni bağımlılık yalnız onaylı planda. Renkler `packages/tokens` üzerinden. Arayüz metinleri Türkçe ve `packages/ui/i18n/tr.ts` içinden. Tarih/saat `Europe/Istanbul`. `now` bağımlılık olarak enjekte edilir; doğrudan `Date.now()` kullanılmaz.

360, 768, 1440 px genişlikleri doğrula; dokunma hedefleri en az 44 px; yatay kaydırma yok. WCAG 2.2 AA, tam klavye gezinmesi ve renk dışında bilgi işareti şart.

Gerçek öğrenci verisi repoya girmez. Mock veri deterministik tohumludur. Sırlar yalnız yerel `.env` dosyalarında; repoda sadece `.env.example`.

## Faz ve kapsam
Her görev tek paket/uygulama ve yaklaşık en fazla 400 satır diff hedefler. Aynı pakette paralel Running görev açma. Sözleşme değişikliği tüketicilerinden önce birleştirilir. Artefaktlar git dışı `.egemed-run/research.md`, `plan.md`, `summary.md`, `review.md` dosyalarında tutulur. İnsan onayı ve merge yalnız depo sahibindedir.

## Okuma sınırı
`sims/*/src/data/*.json`, `sims/*/public/assets/**`, `**/dist/**`, `**/*.lock`, `reports/**` topluca okunmaz. Gerekirse sadece hedefli `head` veya `jq`. Gerçek veri veya sır içeren dosyayı ajan bağlamına alma.

Uzun bağlam ve yüksek token gerektiren istisna görevlerde, insan triage sonrası Cursor CLI Grok 4.7 `high` kullanılabilir. AGTX faz ajanı proje düzeyinde olduğu için bu görevler ayrı worktree içinde `scripts/agtx/cursor-grok.sh` ile elle yürütülür; varsayılan Running OpenCode DeepSeek V4.1 Flash `max` kalır.
