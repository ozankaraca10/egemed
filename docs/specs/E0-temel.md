# E0 Temel — Epik spesifikasyonu

> Durum: **E0 ve T01 planı insan tarafından 23 Eylül 2026 tarihinde onaylandı.** Bu belgede geçen ADR, LRS ve kimlik konuları karar değil, açık sorudur.
> Kaynaklar: `AGENTS.md`, T01 planı (`.egemed-run/plan.md`, T01 worktree), `docs/agentic/KURULUM-NOTLARI.md`, AGTX T01–T12 backlog kaydı.
> Not: `.egemed-run/research.md` bu epik için henüz yok; ilgili görevlerin Research fazında üretilmeli.

## Amaç
Sonraki epiklerin güvenle üzerine kurulabileceği bir temel hazırlamak: çalışan monorepo, anlamlı kalite kapıları (lint, typecheck, test, mobil e2e), tasarım tokenları, temel UI ve boş kabuk. Ayrıca mimari kararların (ADR) ve xAPI profilinin taslaklarını insan onayına sunmak.

## Kapsam
- pnpm + Turborepo monorepo, strict TypeScript temel ayarları (T01).
- CI iş akışı: lint, typecheck, test (T02).
- `packages/tokens` tasarım tokenları (T03).
- ADR-001…005 **taslakları**: monorepo, yığın, gömme, LRS, kimlik (T04).
- Yerel geliştirme altyapısı `infra/`, yalnız insan onaylı bileşenlerle (T05).
- xAPI profili v0 **taslağı** (T06).
- `packages/ui` temel bileşenleri ve `i18n/tr.ts` (T07).
- `apps/shell` kabuk düzeni ve boş sayfalar (T08).
- `pnpm e2e:mobile`, 360/768/1440 px doğrulaması (T09).
- `docs/legacy/` belge kopyası (T12).

## Kapsam dışı
- Simülatör içerikleri, Opaca subtree taşıma (T10), oyunlaştırma çekirdeği (T11).
- Gerçek LRS/kimlik entegrasyonu, üretim altyapısı, dağıtım.
- Ders, ödev ve not defteri işlevleri. Bunlar platform kapsamı dışındadır.
- Gerçek öğrenci verisi. Yalnız deterministik tohumlu mock veri kullanılır.
- Simülatör verilerini birleştiren herhangi bir yüzey.

## Görev sırası ve bağımlılıklar
| Sıra | Görev | Hedef | Bağımlı | Not |
|---|---|---|---|---|
| 1 | T01 Monorepo iskeleti | kök, `apps/shell`, `apps/api` | — | Lint/test düzeltmesi aşağıda |
| 2 | T02 CI iş akışı | `.github/workflows` | T01 | Gerçek lint olmadan anlamı zayıf |
| 2 | T03 Tasarım tokenları | `packages/tokens` | T01 | Kaynak belgeler bekleniyor |
| 2 | T04 ADR taslakları | `docs/adr` | T01 | Opus yazar, Astra ikinci görüş verir, insan onaylar. Running fazı yok |
| 2 | T12 Legacy belge kopyası | `docs/legacy` | T01 | Kaynaklar bekleniyor, mekanik görev |
| 3 | T05 Geliştirme altyapısı | `infra/` | T04 onayı | LRS adayı onaylanmadan LRS servisi eklenmez |
| 3 | T06 xAPI profili v0 | `packages/xapi-profile` | T04 onayı | [KARAR] Astra ve insan onayı |
| 3 | T07 Temel UI | `packages/ui` | T03 | **Öneri:** T04 yığın ADR onayına da bağlansın |
| 4 | T08 Kabuk düzeni | `apps/shell` | T07 | **Öneri:** T04 yığın ve gömme ADR'lerine de bağlansın |
| 5 | T09 Mobil e2e | kök + `apps/shell` | T08 | Playwright yeni bağımlılıktır, onay gerekir |

Kurallar: aynı pakette paralel Running görev açılmaz. Sözleşme değişiklikleri (`packages/contracts`, xAPI profili) tüketicilerinden önce birleştirilir. Her görevin diff'i yaklaşık 400 satırı geçmemeli.

## T01 düzeltme önerisi: yer tutucu lint ve değersiz duman testi
**Sorun 1:** Plan `lint` betiğini `tsc --noEmit -p .` olarak tanımlıyor. Bu, `typecheck` işini ikinci kez yapar ve kapıda sahte bir "lint geçti" sonucu üretir. T02 CI de bu yanıltıcı sinyali devralır.
**Sorun 2:** `APP_ID === "shell"` testi, sabiti kendisiyle karşılaştırır. Hiçbir regresyonu yakalamaz. Plandaki strict negatif kontrol ise elle yapılıp commit edilmediği için tekrarlanamaz.

**Önerilen düzeltme (insan onayına):**
1. **Gerçek, en küçük lint:** `eslint` ve `typescript-eslint` ile kök flat config kurulur. Kural seti `recommended` artı proje kuralıdır: `no-restricted-properties` ile `Date.now` yasaklanır (AGENTS.md "now enjekte edilir" kuralı). Kanıt olarak, yasak kullanımı içeren küçük bir fixture'ın lint'ten düştüğünü doğrulayan bir test eklenir. Prettier kapsam dışı kalır.
2. **Yeni bağımlılık onaylanmazsa:** `lint` hiçbir pakette tanımlanmaz. `turbo.json` görevi tanımlı kalır, yani no-op olur. `summary.md` içinde "lint yapılandırılmadı" diye açıkça yazılır ve ayrı ESLint görevi açılır. Hiçbir koşulda `tsc` lint diye adlandırılmaz.
3. **Anlamlı test, yeni bağımlılık gerektirmez:**
   - *Strict koruma testi:* commit edilen `strict.check.ts` dosyasında `@ts-expect-error` satırları bulunur: `undefined`'ı `string`'e atama, indeks erişiminde `T | undefined` beklentisi, isteğe bağlı alana `undefined` atama. Bayraklardan biri gevşetilirse ilgili satır "kullanılmayan @ts-expect-error" olur ve `typecheck` kırılır. Elle yapılan negatif kontrolün yerini alır.
   - *Yapılandırma sözleşmesi testi:* Vitest, her workspace `tsconfig.json` dosyasının `tsconfig.base.json`'u genişlettiğini ve strict bayraklarını ezmediğini doğrular.
   - `APP_ID` duman testi kaldırılır. İstenirse yalnız modülün yüklenebildiğini gösteren tek satır olarak kalır.
4. Diff tahmini yaklaşık 250–300 satırdır ve 400 sınırının altında kalır. Sınır aşılırsa ESLint ayrı T01b görevine bölünür.

## Kabul ölçütleri (epik düzeyi)
- `pnpm i` ve `pnpm install --frozen-lockfile` temiz geçer. Kilit dosyası T01 ile gelir.
- `pnpm turbo lint typecheck test` sıfır hatayla geçer. Lint gerçek bir linter'dır; yoksa bu açıkça raporlanır.
- Strict bayraklarından biri gevşetildiğinde `typecheck` kırılır (otomatik kanıt).
- CI, `dev` ve PR'larda aynı kapıları çalıştırır. Kırmızı kapı birleştirmeyi engeller (T02).
- Renkler yalnız `packages/tokens` üzerinden gelir. UI metinleri `packages/ui/i18n/tr.ts` içindedir.
- `pnpm e2e:mobile` 360/768/1440 px'te kabuğu doğrular: yatay kaydırma yok, dokunma hedefleri en az 44 px, klavye ile tam gezinme, WCAG 2.2 AA otomatik denetimi geçer, bilgi yalnız renkle verilmez.
- `Date.now()` kullanımı lint ile yakalanır. Tarih/saat `Europe/Istanbul`.
- Repoda sır veya gerçek öğrenci verisi yoktur. Yalnız `.env.example` bulunur.
- ADR-001…005 ve xAPI profili v0 "Önerildi" durumundadır. Astra bulguları karar kaydında görünür. "Kabul" durumuna yalnız insan geçirir.
- Hiçbir paket birden fazla simülatörün verisini birleştirmez. `sims/*` workspace'e bağımlılık sızdırmaz.

## İnsan kararları
- T01: `typescript`, `turbo`, `vitest`, `eslint`, `typescript-eslint`, `@eslint/js` bağımlılıkları ve gerçek lint onaylandı. Node 22 ve pnpm 10 sürüm ailesi sabitlenir.
- T04: ADR-001…005 kabulü. Monorepo, yığın (kabuk ve API çerçevesi), gömme (SCORM/HTML sunumu), LRS ve kimlik konularının hiçbiri henüz karara bağlanmadı.
- T05: Geliştirme ortamında hangi LRS adayının çalıştırılacağı. Bu, T04 LRS ADR'si onaylanmadan seçilmez.
- T06: xAPI fiilleri ve activity ID şeması. KVKK açısından hangi öğrenci tanımlayıcısının ifadeye gireceği.
- T07/T08 bağımlılık grafiğine T04'ün eklenip eklenmeyeceği.
- T09: Playwright ve erişilebilirlik denetim aracı onayı.
- T03 ve T12 kaynak belgelerinin ne zaman sağlanacağı.

## Açık riskler
- **Yığın kararı öncesi UI işi:** T07 ve T08 yığın ADR'si onaylanmadan başlarsa çerçeve seçimi fiilen ajan tarafından yapılmış olur.
- **LRS/kimlik belirsizliği:** T05 ve T06 bu kararlara bağlıdır. Kurum altyapısı ve KVKK kısıtları netleşmeden profil öğrenci tanımlayıcısını sabitlememeli.
- **Kaynak eksikliği:** T03 token kaynakları ve T12 legacy belgeleri yok. Bu görevler bloklu kalabilir.
- **Araç zinciri doğrulanmadı:** OpenCode DeepSeek, Claude Opus 5.5 ve Cursor Grok çağrıları gerçek oturumda doğrulanmadı. AGTX faz geçişi otomatik değil (KURULUM-NOTLARI).
- **Okuma yasağı denetimi:** Claude deny kuralı ve Codex okuma sınırı test edilemedi. Opaca verisi geldiğinde (T10) sızıntı riski doğar.
- **`exactOptionalPropertyTypes`:** üçüncü taraf tiplerle sürtünme yaratabilir. Gevşetme yalnız ADR ile yapılır.
- **T09 kapsamı:** e2e, ekran görüntüsü karşılaştırması ve a11y denetimi tek görevde 400 satırı aşabilir. Bölme gerekebilir.
- **`sims/*` workspace glob'u:** simülatör bağımsızlığını zayıflatabilir. Gömme ADR'sinde ele alınmalı.

## Astra ikinci görüşü — insan kararına hazırlık
- T01 planındaki gerçek ESLint ve tekrar edilebilir yapılandırma testleri, sahte yeşil kapı sorununu gideriyor. Altı kök geliştirme bağımlılığı T01 onayının parçası olmalı.
- `pnpm-lock.yaml` 400 satırı tek başına aşabilir. Görev boyutu değerlendirmesi üretilen kilit dosyası dışındaki kaynak diff'i üzerinden yapılmalı; kilit dosyası yine denetlenip commit edilir.
- T07 ve T08, yığın ADR'sinin insan onayından önce Running'e alınmamalı. T03 ve T12 kaynak belgeleri sağlanmadan başlamamalı.
- CI taban dalı `dev` olmalı; `main` varsayımı mevcut depo dalıyla çelişir.
- Bu görüş ADR, LRS veya kimlik kararını onaylamaz; açık kararlar insan onayına bırakılır.
