# EGEMED Impeccable UI/UX Denetimi

**Tarih:** 24 Eylül 2026  
**Görev:** T77 — salt okunur denetim + tasarım bağlamı  
**Yöntem:** Dual-agent (A: tasarım incelemesi · B: detector + teknik tarama)  
**Kapsam:** `apps/shell`, `packages/ui`, `packages/sim-{pulse,opaca,ausculta}`  
**Referans:** `PRODUCT.md`, `DESIGN.md`, `packages/tokens/family-tokens.css`, AGENTS.md

---

## Özet

Kabuk ve `@egemed/ui` katmanı **kurumsal, token-disiplinli ve erişilebilirlik bilinçli** bir temel sunuyor; giriş ekranı ve ana sayfa Ege Tıp kimliğini taşıyor. Ancak sim paketleriyle kabuk arasında **terminoloji, i18n ve responsive politika** ayrışması var; birkaç öğrenci yüzeyinde **kırık veya yanıltıcı yol** (Ausculta CTA, ham hata kodları, rozet anahtarları) premium-sakin tonu zedeliyor.

| Metrik | Değer |
|--------|-------|
| Audit Health Score | **13/20** (Acceptable) |
| Design Health Score | **26/40** (Acceptable) |
| Bulgu sayısı | P0: 3 · P1: 8 · P2: 7 |
| Detector uyarıları | 13 (5 doğrulanmış, 5 yanlış pozitif, 3 karma) |

---

## Audit Health Score

| # | Boyut | Skor | Kritik bulgu |
|---|-------|------|--------------|
| 1 | Erişilebilirlik | 2 | Sim ikincil kontrolleri &lt;44px; `prefers-reduced-motion` Ausculta'da yok |
| 2 | Performans | 3 | Üç simde `transition: width` ilerleme çubukları |
| 3 | Duyarlı tasarım | 2 | Ausculta CSS'te sıfır `@media`; sim breakpoint'leri 360/768/1440 ile hizalı değil |
| 4 | Temalandırma | 3 | Kabuk/ui token-temiz; simlerde dağınık px font-size |
| 5 | Uygulama bütünlüğü | 3 | Kabuk i18n doğru; simlerde yüzlerce gömülü Türkçe string |
| **Toplam** | | **13/20** | **Acceptable — önemli tutarlılık ve a11y işi gerekli** |

### Implementation Integrity Verdict

**Kısmen geçti.** Kabuk + UI kiti tutarlı bir EGEMED ürün dili taşıyor; sim yüzeyleri hâlâ üç ayrı ürünün taşınmış görünümü. Mod adlandırması (İnceleme vs Öğrenme), hata metinleri (`internal_error`) ve Ausculta yer tutucu CTA'sı ürün-spesifik sistem hissini kırıyor.

---

## Olumlu Bulgular

1. **Token ve odak disiplini (kabuk)** — `shell.css` renk literali kullanmıyor; `:focus-visible` halkası, skip link, 44px nav hedefleri, `aria-current` ile renk-dışı aktif sekme (`shell.css:17-96`).
2. **Paylaşılan UI primitifleri** — `Modal` odak tuzağı + Escape (`Modal.tsx:64-112`); `Tabs` roving tabindex (`Tabs.tsx`); `ModeCard` ilerleme için renk-dışı gösterge.
3. **Kurumsal giriş deneyimi** — Klinik arka plan, Ege logosu, sim ikon sırası, rol seçici (`EntryPage.tsx:106-186`).
4. **Pulse reduced-motion** — Global `prefers-reduced-motion` bloğu (`sim-pulse/responsive.css:140`).
5. **Admin responsive tablo↔kart** — 768px eşiğinde kullanıcı listesi kart moduna geçer (`shell.css:215-224`).

---

## Bulgular (önem sırasıyla)

### P0 — Kırık / erişilemez / güven kırıcı

#### [P0-1] Ausculta kartı "Yakında" rozetiyle birlikte aktif CTA sunuyor

| Alan | Değer |
|------|-------|
| **Ekran / rota** | `#/` ana sayfa, `#/simulatorler`, `#/sims/ausculta` |
| **Dosya:satır** | `apps/shell/src/SimCard.tsx:73-88`, `apps/shell/src/sims/loaders.ts:13` |
| **Sorun** | `LIVE_SIM_IDS` Ausculta'yı içermiyor; rozet "Yakında" gösteriliyor ancak `href` verildiğinde "Simülatörü aç" bağlantısı yer tutucu modüle gidiyor. |
| **Önerilen düzeltme** | `!LIVE_SIM_IDS.has(id)` ise CTA'yı gizle veya devre dışı bırak; alternatif olarak "Hazırlanıyor" sayfası (Moodle yönlendirmesiyle). |
| **Impeccable ilkesi** | Error prevention (Nielsen #5); Design specificity — ürün güveni |

#### [P0-2] Öğrenci yüzeyinde `internal_error` metni görünür

| Alan | Değer |
|------|-------|
| **Ekran / rota** | `#/` İlerlemem; admin hata durumları |
| **Dosya:satır** | `packages/ui/i18n/tr.ts:404` (ve `119,160,205-206,237,258,265,310,340,368`) |
| **Sorun** | Kullanıcıya API hata kodu + tire ile teknik mesaj sunuluyor; ekran okuyucu ve öğrenci için kırık deneyim. |
| **Önerilen düzeltme** | Türkçe düz dil mesajı; kod yalnızca log/telemetry. Örn. "İlerlemeniz şu an yüklenemedi. Biraz sonra yeniden deneyin." |
| **Impeccable ilkesi** | Error recovery (Nielsen #9); `/impeccable clarify` |

#### [P0-3] Ausculta sim CSS'te responsive kural yok — 360px'te kırılma riski

| Alan | Değer |
|------|-------|
| **Ekran / rota** | `#/sims/ausculta` (yer tutucu ve gelecek modül) |
| **Dosya:satır** | `packages/sim-ausculta/src/styles/components.css` (tüm dosya; `@media` yok) |
| **Sorun** | 3 sütun mod ızgarası ve 2 sütun sim/learn düzeni dar ekranda yatay taşma / okunamazlık riski. AGENTS.md 360px doğrulaması karşılanmıyor. |
| **Önerilen düzeltme** | 360 / 768 / 1440 breakpoint seti; `.hide-mobile` stub'unu (`components.css:29`) bağla. |
| **Impeccable ilkesi** | `/impeccable adapt`; Responsive design |

---

### P1 — Tutarsızlık / görsel dil ihlali / WCAG riski

#### [P1-1] Mod terminolojisi: "İnceleme" vs "Öğrenme Modu"

| Alan | Değer |
|------|-------|
| **Ekran / rota** | `#/` Nasıl çalışır?; `#/sims/opaca`, `#/sims/ausculta` mod seçimi |
| **Dosya:satır** | `packages/ui/i18n/tr.ts:381`; `packages/sim-opaca/src/screens/ModeSelectScreen.tsx:66`; `packages/sim-ausculta/src/screens/ModeSelectScreen.tsx:61` |
| **Sorun** | Kabuk yeşil modu "İnceleme" öğretir; Opaca/Ausculta "Öğrenme Modu" kullanır. Pulse doğru: `sim-pulse/src/ui/modes.ts:17`. |
| **Önerilen düzeltme** | Platform genelinde **İnceleme** terimini kilitle; sim ekranlarını `tr.ts` anahtarlarına taşı. |
| **Impeccable ilkesi** | Consistency (Nielsen #4); `/impeccable clarify` |

#### [P1-2] İlerleme rozetleri ham `badge.key` gösteriyor

| Alan | Değer |
|------|-------|
| **Ekran / rota** | `#/` → İlerlemem sekmeleri |
| **Dosya:satır** | `apps/shell/src/home/ProgressSection.tsx:76-79` |
| **Sorun** | `<Badge>{badge.key}</Badge>` geliştirici anahtarını öğrenciye gösterir. |
| **Önerilen düzeltme** | `badge.title` veya i18n map (`home.progress.badge.*`). |
| **Impeccable ilkesi** | Match system/real world (#2); `/impeccable clarify` |

#### [P1-3] Sim çıkış bağlantısı yanlış etiketli

| Alan | Değer |
|------|-------|
| **Ekran / rota** | `#/sims/{pulse,opaca,ausculta}` |
| **Dosya:satır** | `apps/shell/src/SimRoute.tsx:99-100` |
| **Sorun** | "Simülatörler" listesine giden çıkış; geri dönüş beklentisi karşılanmıyor. |
| **Önerilen düzeltme** | Yeni anahtar: `shell.sim.exit` → "Simülatörlere dön" veya "Kabuka dön". |
| **Impeccable ilkesi** | Recognition rather than recall (#6) |

#### [P1-4] Sim hata durumunda "Tekrar dene" yerine "Simülatörü aç"

| Alan | Değer |
|------|-------|
| **Ekran / rota** | `#/sims/*` hata kutusu |
| **Dosya:satır** | `apps/shell/src/SimRoute.tsx:121-127` |
| **Sorun** | Yükleme hatası sonrası düğme `sims.open` kullanıyor; yeniden yükleme değil navigasyon ima ediyor. |
| **Önerilen düzeltme** | `shell.sim.retry` anahtarı; mevcut `home.progress.error.retry` ile hizalanabilir. |
| **Impeccable ilkesi** | Error recovery (#9); `/impeccable harden` |

#### [P1-5] Admin panelinde içe aktarma kartı yanlış i18n anahtarı

| Alan | Değer |
|------|-------|
| **Ekran / rota** | `#/admin` |
| **Dosya:satır** | `apps/shell/src/AdminPage.tsx:20-24`; `packages/ui/i18n/tr.ts:66` |
| **Sorun** | `admin.section.roles` metni "Toplu içe aktarma"; "Roller ve erişim" ayrı kart. Anahtar adı IA ile çelişiyor. |
| **Önerilen düzeltme** | `admin.section.import` anahtarı; kart başlık/açıklama yeniden adlandır. |
| **Impeccable ilkesi** | Consistency (#4); `/impeccable distill` |

#### [P1-6] Sim ikincil kontrollerinde dokunma hedefi &lt;44px

| Alan | Değer |
|------|-------|
| **Ekran / rota** | Tüm sim yüzeyleri (modal kapat, araç çubuğu, sonuç şeridi) |
| **Dosya:satır** | `sim-ausculta/.../components.css:355,535`; `sim-opaca/.../rest.css:434,493`; `sim-pulse/.../responsive.css:178`, `explain.css:82` |
| **Sorun** | 30–38px düğmeler AGENTS.md 44px kuralını ihlal eder. |
| **Önerilen düzeltme** | `min-height/min-width: 44px` veya görünmez padding ile hit area genişlet. |
| **Impeccable ilkesi** | WCAG 2.5.8; `/impeccable adapt` |

#### [P1-7] `prefers-reduced-motion` parçalı — Ausculta tamamen eksik

| Alan | Değer |
|------|-------|
| **Ekran / rota** | Kabuk (ana), Ausculta animasyonları |
| **Dosya:satır** | `apps/shell/src/shell.css:637-640` (yalnız entry); `sim-ausculta/.../components.css:187-302` (animasyonlar, guard yok) |
| **Sorun** | Hareket hassasiyeti olan kullanıcılar Ausculta ve ana kabukta gereksiz animasyon görür. |
| **Önerilen düzeltme** | Pulse/Opaca desenini kopyala; `.eg-shell` geneline genişlet. |
| **Impeccable ilkesi** | WCAG 2.3.3; `/impeccable animate` (azaltma) |

#### [P1-8] Giriş rol geçişi `aria-label` yanlış

| Alan | Değer |
|------|-------|
| **Ekran / rota** | `#/giris/admin`, `#/giris/test-ogrenci` |
| **Dosya:satır** | `apps/shell/src/EntryPage.tsx:131` |
| **Sorun** | Rol `<nav>` öğesi `aria-label={t("entry.brand")}` ("EGEMED") — rol seçimi değil marka duyuruluyor. |
| **Önerilen düzeltme** | `entry.role.nav` → "Oturum rolü seçimi" gibi. |
| **Impeccable ilkesi** | ARIA landmarks; `/impeccable harden` |

---

### P2 — Cila / verimlilik / teknik borç

#### [P2-1] İçe aktarma sihirbazı yalnız textarea CSV — dosya seçici yok

| **Ekran** | `#/admin/ice-aktar` |
| **Dosya:satır** | `apps/shell/src/admin/ImportWizardPage.tsx:161-177` |
| **Sorun** | Mobilde yüksek yazma yükü; Excel'den yapıştırma hataya açık. |
| **Düzeltme** | `<input type="file" accept=".csv">` + textarea gelişmiş seçenek. |
| **Komut** | `/impeccable adapt` |

#### [P2-2] Modal açıkken arka plan kaydırması kilitlenmiyor

| **Ekran** | Admin formlar, toplu düzenleme, denetim ayrıntı |
| **Dosya:satır** | `packages/ui/src/Modal.tsx:68-69` |
| **Sorun** | Odak tuzağı var; gövde scroll devam eder — mobilde çift scroll. |
| **Düzeltme** | `Modal` içinde `overflow: hidden` veya kabuk düzeyinde kilitleme. |
| **Komut** | `/impeccable harden` |

#### [P2-3] İlerleme hata "Yeniden dene" düğmesi 44px değil

| **Ekran** | `#/` İlerlemem hata |
| **Dosya:satır** | `apps/shell/src/home/ProgressSection.tsx:122-124` |
| **Sorun** | Ham `<button>` kabuk touch sınıfı almıyor. |
| **Düzeltme** | `eg-shell-progress__tabEmptyLink` veya ortak `.eg-shell-btn` sınıfı. |
| **Komut** | `/impeccable layout` |

#### [P2-4] Ana sayfa yoğun — İlerlemem üç sim kartının altında

| **Ekran** | `#/` |
| **Dosya:satır** | `apps/shell/src/pages.tsx:51-103` |
| **Sorun** | Oturumlu öğrenci ilerlemeyi görmek için uzun kaydırır (cognitive load). |
| **Düzeltme** | Oturumda İlerlemem'i hero altına taşı veya özet şerit. |
| **Komut** | `/impeccable layout` |

#### [P2-5] Admin kullanıcı filtreleri 6+ kontrol tek kartta

| **Ekran** | `#/admin/kullanicilar` |
| **Dosya:satır** | `apps/shell/src/admin/UsersPage.tsx:244-327` |
| **Sorun** | İlk bakışta aşırı seçenek; güç kullanıcısı için kayıtlı filtre yok. |
| **Düzeltme** | 4'lü gruplara böl; "Gelişmiş filtreler" disclosure. |
| **Komut** | `/impeccable distill` |

#### [P2-6] İçe aktarma adım göstergesi 7 adımı aynı anda gösterir

| **Ekran** | `#/admin/ice-aktar` |
| **Dosya:satır** | `apps/shell/src/admin/ImportWizardPage.tsx:73-87` |
| **Sorun** | Çalışma belleği yükü (Miller/Cowan). |
| **Düzeltme** | Mevcut + sonraki adım; tam liste yardım panelinde. |
| **Komut** | `/impeccable distill` |

#### [P2-7] Üç simde `transition: width` ilerleme çubukları

| **Ekran** | Sim ilerleme göstergeleri |
| **Dosya:satır** | `sim-ausculta/.../components.css:21`; `sim-opaca/.../shell.css:117`; `sim-pulse/.../responsive.css:209` |
| **Sorun** | Layout thrash; düşük cihazlarda takılma. |
| **Düzeltme** | `transform: scaleX()` + `transform-origin: left`. |
| **Komut** | `/impeccable optimize` |

---

## Sistemik Kalıplar

1. **İki katmanlı frontend** — Kabuk/ui AGENTS.md uyumlu; simler eski gömülü Türkçe ve farklı breakpoint seti.
2. **Mod şeridi görsel dili** — Üst/sol kenar vurgusu ürün dilinin parçası; detector "side-tab" uyarılarının çoğu kasıtlı mod/durum göstergesi (yanlış pozitif).
3. **`internal_error` i18n antipattern** — Admin + öğrenci metinlerinde tekrarlanan API kodu sızıntısı.
4. **Touch target tutarsızlığı** — Birincil CTA'lar genelde 44px; ikincil/icon kontroller sistematik olarak küçük.
5. **Sim yükleme durumu sessiz** — `aria-busy` var; `aria-live` polite duyurusu yok (`SimRoute.tsx:112-116`).

---

## Persona Kırmızı Bayrakları

| Persona | Kırmızı bayrak |
|---------|----------------|
| **Alex (güç kullanıcı / admin)** | 6 filtre duvarı; kayıtlı görünüm yok; CSV textarea; mobilde bulk bar + alt nav çakışması |
| **Sam (erişilebilirlik)** | `internal_error` alert; ham rozet anahtarları; sim küçük düğmeler; Ausculta motion guard yok |
| **Casey (mobil)** | Sim çıkış üstte; import paste; uzun ana sayfa kaydırması |
| **Elif (tıp öğrencisi)** | İnceleme/Öğrenme terminoloji whiplash; Ausculta CTA güven kırığı; Görevler/Not defteri boş uç |

---

## Önerilen Düzeltme Görevleri (paket bazında, ~400 satır dilim)

### Dilim 1 — `apps/shell` (~350 satır)

| Görev | Dosyalar | Öncelik |
|-------|----------|---------|
| T77a Ausculta CTA kilidi | `SimCard.tsx`, `pages.tsx` | P0 |
| T77b Sim rota copy | `SimRoute.tsx`, `tr.ts` (exit + retry) | P1 |
| T77c İlerleme rozet + retry düğme | `ProgressSection.tsx`, `shell.css` | P1 |
| T77d Admin IA anahtar düzeltme | `AdminPage.tsx`, `tr.ts` | P1 |
| T77e Giriş nav aria-label | `EntryPage.tsx`, `tr.ts` | P1 |
| T77f Kabuk reduced-motion genişletme | `shell.css` | P1 |

### Dilim 2 — `packages/ui` (~200 satır)

| Görev | Dosyalar | Öncelik |
|-------|----------|---------|
| T77g Kullanıcı mesajları (internal_error temizliği) | `i18n/tr.ts` | P0 |
| T77h Modal scroll lock | `Modal.tsx` | P2 |

### Dilim 3 — `packages/sim-ausculta` (~400 satır)

| Görev | Dosyalar | Öncelik |
|-------|----------|---------|
| T77i Responsive breakpoint seti (360/768/1440) | `styles/components.css` | P0 |
| T77j Touch target yükseltme | `styles/components.css` | P1 |
| T77k prefers-reduced-motion | `styles/components.css` | P1 |
| T77l Mod adı hizalama + i18n başlangıcı | `screens/ModeSelectScreen.tsx` | P1 |

### Dilim 4 — `packages/sim-opaca` (~350 satır)

| Görev | Dosyalar | Öncelik |
|-------|----------|---------|
| T77m Mod terminolojisi | `screens/ModeSelectScreen.tsx` | P1 |
| T77n Touch targets (modal, icon-btn, film-tools) | `styles/rest.css`, `film.css` | P1 |
| T77o Breakpoint hizalama (720→768 dokümantasyon veya kod) | `styles/shell.css` | P2 |

### Dilim 5 — `packages/sim-pulse` (~300 satır)

| Görev | Dosyalar | Öncelik |
|-------|----------|---------|
| T77p Touch targets (results-strip, mode-card btn) | `responsive.css`, `explain.css`, `case.css` | P1 |
| T77q Progress bar transform geçişi | `responsive.css`, ilgili CSS | P2 |

### Dilim 6 — `apps/shell` admin UX (~400 satır)

| Görev | Dosyalar | Öncelik |
|-------|----------|---------|
| T77r Import dosya seçici | `ImportWizardPage.tsx` | P2 |
| T77s Kullanıcı filtre chunking | `UsersPage.tsx`, `shell.css` | P2 |
| T77t Import adım göstergesi sadeleştirme | `ImportWizardPage.tsx` | P2 |

---

## Önerilen Impeccable Komut Sırası

1. **`/impeccable harden`** — `SimCard.tsx`, `SimRoute.tsx`, `EntryPage.tsx`, `Modal.tsx`
2. **`/impeccable clarify`** — `tr.ts`, `ProgressSection.tsx`, sim `ModeSelectScreen.tsx`
3. **`/impeccable adapt`** — `sim-ausculta` CSS, `ImportWizardPage.tsx`, sim touch targets
4. **`/impeccable layout`** — ana sayfa İlerlemem konumu, admin filtreler
5. **`/impeccable distill`** — `AdminPage.tsx`, `ImportWizardPage.tsx` adım UI
6. **`/impeccable optimize`** — sim progress bar `width` → `scaleX`
7. **`/impeccable polish`** — düzeltmeler sonrası yeniden denetim

---

## Detector Özeti (Assessment B)

| Dosya | Kural | Doğrulama |
|-------|-------|-----------|
| `shell.css:403` | border-accent-on-rounded | **TP (düşük)** — kasıtlı mod şeridi; WCAG 1.4.1 numara+başlık ile destekleniyor |
| `sim-ausculta/components.css:321` | side-tab | **FP** — aktif kütüphane öğesi seçimi |
| `sim-ausculta/components.css:466` | side-tab | **TP (düşük)** — envanter durum şeridi |
| `sim-ausculta/components.css:21` | layout-transition | **TP** — `scaleX` önerilir |
| `sim-opaca/gami.css:263` | side-tab | **FP** — liderlik "ben" satırı |
| `sim-pulse/explain.css:8` | side-tab | **FP** — değerlendirme mod kimliği |

---

*Bu rapor salt okunur denetim çıktısıdır; kod değişikliği içermez. Tasarım bağlamı: `PRODUCT.md`, `DESIGN.md`.*
