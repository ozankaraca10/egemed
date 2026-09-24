# EGEMED ajan kuralları

EGEMED, Pulse, Ausculta ve Opaca simülatörlerini tek React platformu içinde ayrı modüller olarak sunan mobil uyumlu klinik öğrenme platformudur (ADR-006; eski SCORM/iframe modelinin yerine geçer). Simülatör verileri hiçbir yüzeyde birleştirilmez; öğrenci verisi kurum altyapısında kalır; ders, ödev ve not defteri Moodle'dadır.

## Harita
`apps/shell` React web kabuğu; `apps/api` Hono + PostgreSQL API (migrations); `packages/sim-opaca`, `sim-pulse`, `sim-ausculta` simülatörleri; `packages/sim-host`, `gamification-core`, `contracts`, `api-client`, `tokens`, `ui`, `xapi-client`, `xapi-profile`; `e2e/` testleri ve `e2e-artifacts/` çıktıları; `infra/` geliştirme, `infra/prod/` üretim; `docs/adr`, `specs`, `agentic`, `ops`, `audits`, `legacy`.

## Komutlar
`pnpm i`; `pnpm turbo lint typecheck test`; `pnpm e2e:mobile` (tekrarlanabilir özet ve ekran görüntüleri `e2e-artifacts/<run-id>/` altına yazılır); `pnpm dev`; `pnpm --filter @egemed/api migrate:up`; `pnpm --filter @egemed/api seed:admin`; `pnpm --filter @egemed/sim-opaca sync:xray`; `pnpm --filter @egemed/sim-ausculta sync:audio`; `pnpm --filter @egemed/sim-pulse sync:runtime`.

## Kod ve tasarım
TypeScript strict. Yeni bağımlılık yalnız onaylı planda. Renkler `packages/tokens` üzerinden. Arayüz metinleri Türkçe ve `packages/ui/i18n/tr.ts` içinden. Tarih/saat `Europe/Istanbul`. `now` bağımlılık olarak enjekte edilir; doğrudan `Date.now()` kullanılmaz.

360, 768, 1440 px genişlikleri doğrula; dokunma hedefleri en az 44 px; yatay kaydırma yok. WCAG 2.2 AA, tam klavye gezinmesi ve renk dışında bilgi işareti şart.

Gerçek öğrenci verisi repoya girmez. Mock veri deterministik tohumludur. Sırlar yalnız yerel `.env` dosyalarında; repoda sadece `.env.example`.

## Faz ve kapsam
Her görev tek paket/uygulama ve yaklaşık en fazla 400 satır diff hedefler. Aynı pakette paralel Running görev açma. Sözleşme değişikliği tüketicilerinden önce birleştirilir. Artefaktlar git dışı `.egemed-run/research.md`, `plan.md`, `summary.md`, `review.md` dosyalarında tutulur. İnsan onayı ve merge yalnız depo sahibindedir.

## Okuma sınırı
`sims/*/src/data/*.json`, `sims/*/public/assets/**`, `**/dist/**`, `**/*.lock`, `reports/**` topluca okunmaz. Gerekirse sadece hedefli `head` veya `jq`. Gerçek veri veya sır içeren dosyayı ajan bağlamına alma.

Uzun bağlam ve yüksek token gerektiren istisna görevlerde, insan triage sonrası Cursor CLI Grok 4.7 `high` kullanılabilir. AGTX faz ajanı proje düzeyinde olduğu için bu görevler ayrı worktree içinde `scripts/agtx/cursor-grok.sh` ile elle yürütülür; varsayılan Running OpenCode DeepSeek V4.1 Flash `max` kalır.

Claude Code kotası doluyken AGTX Planning Cursor CLI Grok 4.7 `high` ile yürür. Kritik ADR, xAPI profili, güvenlik/KVKK ve paketler arası sözleşme kararlarında Codex GPT-6 Astra ikinci görüş verir; bulgular karar kaydında görünür ve insan onayı bekler. Review fazı Codex Astra ile yürür; Astra kendi bulgularını raporlar, merge etmez.
