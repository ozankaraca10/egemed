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
Kaynak: [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) `CLAUDE.md` — yaygın LLM kodlama hatalarını azaltan davranış ilkeleri; projeye özgü kurallarla birlikte uygulanır.

**Ödünleşim:** Bu ilkeler hızdan çok dikkati öne alır. Önemsiz işlerde sağduyu kullan.

### 1. Kodlamadan önce düşün
**Varsayma. Kafa karışıklığını saklama. Ödünleşimleri ortaya koy.**

Uygulamadan önce:
- Varsayımlarını açıkça yaz. Emin değilsen sor.
- Birden çok yorum varsa hepsini sun — sessizce birini seçme.
- Daha basit bir yol varsa söyle. Gerektiğinde itiraz et.
- Bir şey belirsizse dur. Neyin kafa karıştırdığını adlandır. Sor.

### 2. Önce sadelik
**Sorunu çözen en az kod. Spekülatif hiçbir şey yok.**

- İstenenin ötesinde özellik yok.
- Tek kullanımlık kod için soyutlama yok.
- İstenmemiş "esneklik" ya da "yapılandırılabilirlik" yok.
- İmkânsız senaryolar için hata yönetimi yok.
- 200 satır yazdıysan ve 50 olabiliyorsa, yeniden yaz.

Kendine sor: "Kıdemli bir mühendis bunun gereğinden karmaşık olduğunu söyler mi?" Evetse sadeleştir.

### 3. Cerrahi değişiklikler
**Yalnız gerekene dokun. Yalnız kendi dağınıklığını temizle.**

Mevcut kodu düzenlerken:
- Komşu kodu, yorumları ya da biçimlendirmeyi "iyileştirme".
- Bozuk olmayanı yeniden düzenleme.
- Farklı yapacak olsan bile mevcut üsluba uy.
- İlgisiz ölü kod görürsen belirt — silme.

Değişikliklerin yetim bırakırsa:
- SENİN değişikliğinin kullanılmaz bıraktığı import/değişken/fonksiyonları kaldır.
- İstenmedikçe önceden var olan ölü kodu kaldırma.

Test: Değişen her satır doğrudan kullanıcının isteğine bağlanabilmeli.

### 4. Hedefe göre yürütme
**Başarı ölçütünü tanımla. Doğrulanana dek döngüde kal.**

İşleri doğrulanabilir hedeflere çevir:
- "Doğrulama ekle" → "Geçersiz girdiler için testleri yaz, sonra geçir"
- "Hatayı düzelt" → "Hatayı yeniden üreten bir test yaz, sonra geçir"
- "X'i yeniden düzenle" → "Testlerin öncesinde ve sonrasında geçtiğinden emin ol"

Çok adımlı işlerde kısa bir plan yaz:
```
1. [Adım] → doğrula: [kontrol]
2. [Adım] → doğrula: [kontrol]
3. [Adım] → doğrula: [kontrol]
```

Güçlü başarı ölçütleri bağımsız döngü kurmanı sağlar. Zayıf ölçütler ("çalışsın") sürekli açıklama ister.

**Bu ilkeler işe yarıyorsa:** diff'lerde gereksiz değişiklik azalır, aşırı karmaşıklık yüzünden yeniden yazma azalır ve açıklayıcı sorular hatalardan sonra değil uygulamadan önce gelir.

### EGEMED uyarlaması
- **Soru sorma:** Claude belirsizlikte kullanıcıya sorar. DeepSeek işçisi etkileşimsiz çalışır ve soramaz — varsayımını ve birden çok yorumu `.egemed-run/summary.md`'ye yazar; riskli ya da geri dönüşsüz bir belirsizlikte o adımı yapmadan raporlar.
- **Başarı ölçütü:** `pnpm turbo lint typecheck test` ve görevin ilgili e2e testleri (plan dosyasındaki Kabul bölümü).
- **Cerrahi değişiklik ve kapsam:** Plan dosyasındaki kapsam dışına çıkılmaz; kapsam dışı fark edilen sorunlar summary'de raporlanır.

## Ajanlar ve iş akışı
Claude Code planlar, işi dağıtır, gözden geçirir, test eder ve merge eder; uygulama işleri (Z1–Z4) OpenCode DeepSeek V4.1 Flash `max` ile ayrı worktree'lerde yürür, yalnız Z5 işleri Claude yazar. Merge yalnız `scripts/agtx/claude/merge-gated.sh` ile. Ayrıntılar ve süren işler: `docs/agentic/CLAUDE-DEVIR.md`. Codex Astra bağımsız denetim ve ikinci görüş verir; bulgularını raporlar, merge etmez.
