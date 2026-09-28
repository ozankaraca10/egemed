# EGEMED ajan kuralları

EGEMED, Pulse, Ausculta ve Opaca simülatörlerini tek React platformu içinde ayrı modüller olarak sunan mobil uyumlu klinik öğrenme platformudur (ADR-006; eski SCORM/iframe modelinin yerine geçer). Simülatör verileri hiçbir yüzeyde birleştirilmez; öğrenci verisi kurum altyapısında kalır. Ders, ödev ve not defteri platform kapsamı dışındadır.

## Harita
`apps/shell` React web kabuğu; `apps/api` Hono + PostgreSQL API (migrations); `packages/sim-opaca`, `sim-pulse`, `sim-ausculta` simülatörleri; `packages/sim-host`, `gamification-core`, `contracts`, `api-client`, `tokens`, `ui`, `xapi-client`, `xapi-profile`; `e2e/` testleri ve `e2e-artifacts/` çıktıları; `infra/` geliştirme, `infra/prod/` üretim; `docs/adr`, `specs`, `agentic`, `ops`, `audits`, `legacy`.

## Komutlar
`pnpm i`; `pnpm turbo lint typecheck test`; `pnpm e2e:mobile` (tekrarlanabilir özet ve ekran görüntüleri `e2e-artifacts/<run-id>/` altına yazılır); `pnpm dev`; `pnpm --filter @egemed/api migrate:up`; `pnpm --filter @egemed/api seed:admin`; `pnpm --filter @egemed/sim-opaca sync:xray`; `pnpm --filter @egemed/sim-ausculta sync:audio`.

## Kod ve tasarım
TypeScript strict. Yeni bağımlılık yalnız onaylı planda. Renkler `packages/tokens` üzerinden. Arayüz metinleri Türkçe ve `packages/ui/i18n/tr.ts` içinden. Tarih/saat `Europe/Istanbul`. `now` bağımlılık olarak enjekte edilir; doğrudan `Date.now()` kullanılmaz.

360, 768, 1440 px genişlikleri doğrula; dokunma hedefleri en az 44 px; yatay kaydırma yok. WCAG 2.2 AA, tam klavye gezinmesi ve renk dışında bilgi işareti şart.

Gerçek öğrenci verisi repoya girmez. Mock veri deterministik tohumludur. Sırlar yalnız yerel `.env` dosyalarında; repoda sadece `.env.example`.

## Faz ve kapsam
Her görev tek paket/uygulama ve yaklaşık en fazla 400 satır diff hedefler. Aynı pakette paralel Running görev açma. Sözleşme değişikliği tüketicilerinden önce birleştirilir. Artefaktlar git dışı `.egemed-run/research.md`, `plan.md`, `summary.md`, `review.md` dosyalarında tutulur. İnsan onayı ve merge yalnız depo sahibindedir.

## Okuma sınırı
`sims/*/src/data/*.json`, `sims/*/public/assets/**`, `**/dist/**`, `**/*.lock`, `reports/**` topluca okunmaz. Gerekirse sadece hedefli `head` veya `jq`. Gerçek veri veya sır içeren dosyayı ajan bağlamına alma.

## Kodlama ilkeleri
(Kaynak: forrestchang/andrej-karpathy-skills, projeye uyarlandı.) Önemsiz işlerde sağduyu kullan.
- **Önce düşün:** Varsayımlarını açıkça yaz; birden çok yorum varsa sessizce seçme. Daha basit yol varsa söyle. Claude belirsizlikte kullanıcıya sorar; DeepSeek işçisi soramaz — varsayımını `summary.md`'ye yazar, riskli/geri dönüşsüz belirsizlikte o adımı yapmadan raporlar.
- **Önce sadelik:** İsteneni çözen en az kod. İstenmemiş özellik, tek kullanımlık soyutlama, istenmemiş yapılandırılabilirlik, imkânsız durum için hata yönetimi yok. 200 satır 50 olabiliyorsa yeniden yaz.
- **Cerrahi değişiklik:** Yalnız gerekeni değiştir; komşu kodu, yorumu, biçimi "iyileştirme"; bozuk olmayanı yeniden düzenleme; mevcut üsluba uy. İlgisiz ölü kodu silme, raporla. Kendi değişikliğinin kullanılmaz bıraktığı import/değişken/fonksiyonu kaldır. Her değişen satır doğrudan isteğe bağlanabilmeli.
- **Hedefe göre yürüt:** İşi doğrulanabilir hedefe çevir ("hatayı düzelt" → önce hatayı yeniden üreten test, sonra geçir; "yeniden düzenle" → öncesi ve sonrası testler yeşil). Çok adımlı işte kısa plan: `adım → doğrulama`. Başarı ölçütü `pnpm turbo lint typecheck test` ve ilgili e2e'dir.

## Ajanlar ve iş akışı
Claude Code planlar, işi dağıtır, gözden geçirir, test eder ve merge eder; uygulama işleri (Z1–Z4) OpenCode DeepSeek V4.1 Flash `max` ile ayrı worktree'lerde yürür, yalnız Z5 işleri Claude yazar. Merge yalnız `scripts/agtx/claude/merge-gated.sh` ile. Ayrıntılar ve süren işler: `docs/agentic/CLAUDE-DEVIR.md`. Codex Astra bağımsız denetim ve ikinci görüş verir; bulgularını raporlar, merge etmez.
