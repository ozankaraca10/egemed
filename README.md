# EGEMED — Klinik Öğrenme Platformu

EGEMED, Ege Üniversitesi Tıp Fakültesi için geliştirilen üç klinik simülatörü — **Pulse** (EKG ve kardiyak fizyoloji),
**Ausculta** (kardiyopulmoner oskültasyon) ve **Opaca** (akciğer grafisi ve toraks BT) — **tek bir React platformu** içinde ayrı
modüller olarak sunan, mobil uyumlu bir tıp eğitimi uygulamasıdır. Eski model (her simülatör ayrı SCORM paketi) terk edilmiştir
(ADR-006).

> Bu dosya repoya yeni gelen bir insanın veya yapay zekâ ajanının **her şeyi buradan başlayarak anlayabilmesi** için yazılmıştır.
> Bağlayıcı kurallar `AGENTS.md`'dedir; kararlar `docs/adr/`, planlar `docs/specs/` içindedir. Bu README onların haritasıdır ve
> düzenli güncellenir (son güncelleme: 25 Eylül 2026).

---

## 1. Hızlı başlangıç

```bash
pnpm i                               # Node ≥ 22 (.nvmrc), pnpm 10 (packageManager pin); --frozen-lockfile kırılmaz
pnpm turbo lint typecheck test       # ana kalite kapısı (her görevde yeşil olmalı)
pnpm dev                             # kabuk: http://localhost:5173
pnpm e2e:mobile                      # Playwright + axe: 360/768/1440 px, WCAG 2.2 AA, giriş/güvenlik akışları (artefakt: e2e-artifacts/<run-id>/)
pnpm infra:up / pnpm infra:down      # geliştirme Postgres 18 (5432) + SQL LRS (8080) — colima/docker; değerler .env.local
pnpm --filter @egemed/sim-opaca sync:xray   # git-dışı Opaca röntgen görsellerini yerel kaynak depodan kopyalar
```

Üretim alan adı: **egemed.ege.edu.tr** (iş bitince). Açık ad: **EGEMED Klinik Öğrenme Deneyimi Platformu**.

Geliştirme ortamında sahte giriş (yalnız `pnpm dev`; üretim derlemesinde kod ve hesaplar pakete girmez):
yönetici `#/giris/admin` → `admin` / `egemed`; test öğrencisi `#/giris/test-ogrenci` → `ogrenci` / `egemed`.

---

## 2. Depo haritası — neyi nereye koyduk

| Yol | Ne | Not |
|---|---|---|
| `apps/shell` | React 19 + Vite 8 **web kabuğu**: üst bar/alt sekme, hash yönlendirici, ana sayfa (dashboard), simülatörler sayfası, giriş ekranları, `/admin` taslağı, sim rotaları (`#/sims/<id>`; birleşik bar, ana gezinme/footer yok) | Metinler `packages/ui/i18n/tr.ts`'ten; renkler `packages/tokens` |
| `apps/api` | Hono + PostgreSQL API (ADR-002): migration'lar (`migrations/`; append-only denetim tetikleyicisi), oturum/CSRF, admin uçları (`/admin/users`, toplu işlem, CSV içe aktarma, rol, `/admin/audit`), `/me/gamification` (sim erişimi, sunucu XP'si ve rozet değerlendirmesi; migration 005 + ADR-008), `/me/preferences` (liderlik görünürlüğü; migration 006), `migrate:up` ve `seed:admin`; SSO adaptör iskeleti | SSO protokolü kararı bekliyor |
| `packages/sim-host` | **SimHost sözleşmesi**: `mount(target, context) → dispose`, lazy yükleme, epoch iptali, tek etkin oturum, birleşik bar kanalı (`SimChrome`/`setChrome`) | Tüm simler bu sözleşmeyle bağlanır |
| `packages/sim-opaca` | Opaca modülü: çekirdek, veri, UI ve SimHost adaptörü | Kabukta canlı; röntgen `public/assets/xray/runtime/` git dışı, `sync:xray` ile yerel kaynaktan alınır |
| `packages/sim-pulse` | Pulse modülü: kaynak runtime (`src/runtime/host.ts`, `module.ts`, `chrome.ts`, `gami.ts`, `vendor/`) ile EKG motoru, durum ve müfredat; eski `src/mount.ts` + `ui/*` ekranları kabukta kullanılmıyor | Kabukta canlı; vendor dosyaları platform kaynağıdır ve doğrudan düzenlenir (ADR-011) |
| `packages/sim-ausculta` | Ausculta modülü: çekirdek, ses motoru, store/runtime, UI, ekranlar ve SimHost adaptörü | Kabukta canlı; ses varlıkları git dışı, `sync:audio` ile yerel kaynaktan alınır |
| `packages/gamification-core` | **Sim-bağımsız oyunlaştırma çekirdeği**: XP, seviye, seri, haftalık hedef, zaman (Europe/Istanbul), jenerik rozet motoru, sıralama, ödül, grafik | Rozet kataloğu ve kurallar her simde ayrı (parametre) |
| `packages/gami-catalogs` | Sime özgü rozet katalogları, kuralları ve kodlu deneme özeti/istatistiği (ADR-008; Pulse, Opaca, Ausculta); simler ve API aynı paketi kullanır | S2 (Ausculta kataloğu) tamamlandı (T109) |
| `packages/gami-ui` | Ortak oyunlaştırma bileşenleri (T115; referans tasarım Opaca): `views.tsx`, `model.ts`, `icons.tsx`, `styles.css`, gölge DOM için `styles-inline.ts`, `server.tsx` | Opaca, Ausculta ve Pulse'ta kullanılır |
| `packages/contracts` | Paylaşılan sözleşmeler (zod): kimlik, kullanıcı, CSV içe aktarma, oyunlaştırma, hata kodları | API ve UI aynı şemayı kullanır |
| `packages/api-client` | Tipli API istemcisi: `contracts` şemalarıyla yanıt doğrulama, CSRF başlığı, oturum/admin/içe aktarma/oyunlaştırma uçları | Kabuk veri kaynakları (admin, dashboard) buradan beslenir |
| `packages/ui` | Ortak bileşenler (Card, Badge, Tabs, Table, Modal, ModeCard) + **Türkçe sözlük** `i18n/tr.ts` | Tüm arayüz metni buradan |
| `packages/tokens` | Aile tasarım token'ları (`family-tokens.css`, `opaca.css`) | `egemed-sim-ui-ux-framework` ile birebir |
| `packages/xapi-profile` | xAPI profili v0 (fiiller, IRI, opak aktör) — **Önerildi**, insan onayı (K2) bekliyor | |
| `packages/xapi-client` | Boş iskelet — K2/K3 sonrası T22 | |
| `tests/` | Vitest birim/sözleşme testleri (paket başına klasör) — DOM yok; `renderToStaticMarkup` + saf fonksiyonlar | `tests/config/*` yapı sözleşmeleri |
| `e2e/` · `e2e-artifacts/` | Playwright + axe testleri ve her koşuya ait JSON özet/ekran görüntüsü çıktıları | `playwright.config.ts` dev (5199) ve prod önizleme (5198) sunucusu kurar; artefaktlar git dışıdır |
| `infra/` · `infra/prod/` | Geliştirme Postgres/LRS compose'u; üretim API/Postgres compose'u, Dockerfile ve nginx örneği | Sırlar yalnız yerel env dosyalarında |
| `docs/adr/` | Mimari karar kayıtları 001–008 | Durum: Önerildi / Kabul |
| `docs/specs/` | Epik ve plan belgeleri (E0–E3) | Aşağıda §5 |
| `docs/agentic/` | Ajan devir/kurulum notları (`CODEX-DEVIR.md`) | Tarihsel bağlam |
| `docs/ops/` · `docs/audits/` | Üretim işletim kılavuzu ve denetim raporları (güvenlik, test bulguları) | Yayın hazırlığı ve denetim kaydı |
| `sims/` | **Eski yer tutucu** — K-P1 kararıyla simler `packages/sim-<id>` altında; burası arşiv/boş | Lint ve workspace dışı |
| `.agtx/` | Görev worktree'leri (`.agtx/worktrees/<görev>`) ve pano verisi — **git dışı** | Lint'ten hariç |

**Kaynak (eski) depolar** — salt okunur referans, platforma port edilen kod buradan gelir:
`~/Documents/EGEMED CLIX/{EGEMED_PULSE, egemed-ausculta, egemed-opaca, egemed-sim-ui-ux-framework}`.

---

## 3. Mimari

- **Tek platform, hibrit modüller (ADR-006):** Kabuk React'tir; her simülatör `packages/sim-<id>` altında bağımsız bir modüldür ve
  kabuğa `SimHost` üzerinden `mount/dispose` ile lazy bağlanır. Motorlar (EKG üretimi, ses mantığı, görüntü işaretleme) davranış
  değiştirmeden taşınır; Opaca ve Ausculta zaten React olduğundan ekranlar korunur; Pulse'un kaynak uygulaması (EGEMED_PULSE/cardai)
  betikleri değiştirilmeden gölge DOM'da çalıştırılır (PULSE-00/T88, §7).
- **Veri izolasyonu:** Simler arası durum veya veri birleştirilmez; her kayıt/ifade tek `SimulatorId` taşır. Dashboard simleri
  **sekmelerle** ayrı gösterir, toplam puan üretmez.
- **Gömülü mod:** Sim modülleri platform içinde kendi üst bar/footer'ını çizmez (tek üst bar kuralı); sim kapsayıcısı React çocuğu
  içermez (vanilla modül güvenle `appendChild`/temizlik yapar). Birleşik bar kararıyla (25 Eylül) sim rotasında bar EGEMED barıdır:
  simler adım/çip/eylemlerini `SimHost` kanalıyla (`setChrome`, `SimChrome`) kabuğa yazar; Pulse kaynağının açılış sayfası atlanır
  ve kaynak üst çubuğu/footer'ı gizlenir (`packages/sim-pulse/src/runtime/chrome.ts`). Kaynak Pulse'un ilk girişte açtığı kalıcı tam
  ekran önerisi (popup) platformda hiç açılmaz (25 Eylül kararı, T139; ADR-011 sonrası doğrudan vendor kaynağında
  `EGEMED-NO-FULLSCREEN-PROMPT`, `landing.js`); tam ekran yalnız birleşik bardaki ikondan tetiklenir.
- **Kimlik ve veri (ADR-007, Kabul):** EGEMED kullanıcı kaydı tutar; kullanıcıları admin kaydeder (tek tek ve toplu CSV); giriş tipi
  **SSO** (protokol henüz belirlenmedi; o zamana kadar geliştirme sağlayıcısı). EGEMED parola saklamaz. Roller şimdilik yalnız
  **admin** ve **kullanıcı** (diğerleri park edildi). Oyunlaştırma verisi EGEMED veritabanında kullanıcı×sim başına tutulur.
  xAPI ifadeleri kurum LRS'sine gider, aktör opaktır (ad/e-posta yok).
- **Zaman ve rastgelelik:** `Date.now()` yasak (lint kuralı); `now` bağımlılık olarak enjekte edilir. Rastgelelik tohumlu ve
  deterministiktir. Tarih/saat Europe/Istanbul.
- **Tarayıcı erişimi:** Sim paketlerinde doğrudan `window`/`document`/`localStorage` yoktur; yapısal tipli "env"/"port" arayüzleri
  enjekte edilir (test edilebilirlik ve sızıntısız yaşam döngüsü). Kök tsconfig DOM lib'i taşımaz.

### Kabuk ve sim bütünleşmesi (UX mimarisi)

**İlke (25 Eylül 2026, depo sahibi):** kabuk ve simler yek vücuttur; öğrenci sim içindeyken uygulama değiştirdiğini
hissetmez. Veri ayrılığı korunur ama kullanıcıya hissettirilmez: her kayıt tek `SimulatorId` taşır, simler arası toplam
veya karşılaştırma üretilmez (ADR-006). Sim rotasında EGEMED barı simin barıdır.

**SimChrome sözleşmesi.** Sim, barını kabuğa `packages/sim-host/src/SimHost.ts` içindeki kanalla bildirir: `SimChrome`
(`steps`/`chips`/`actions`), `SimChromeAction` (`label`, `SimChromeIcon`, isteğe bağlı `pressed`), `SimChromeChip`
(`tone`) ve `SimMountContext.setChrome` (durum değiştikçe yeniden çağrılır; `null` barı temizler). Barı kabuk çizer
(`apps/shell/src/SimBar.tsx`: konum, tek `h1`, adım göstergesi, çipler, ikon düğmeleri). Akış: `App` → `SimRoute`
`onChrome` → `ShellLayout` `simChrome`. Kurallar: sim kendi üst barını/footer'ını çizmez; dispose'ta `setChrome(null)`
ile barı temizler; arayüz metinleri sözlükten (`packages/ui/i18n/tr.ts`) gelir.

**Sim başına uygulama.**
- **Pulse:** kaynak runtime gölge DOM'da çalışır; `packages/sim-pulse/src/runtime/chrome.ts` kaynağın gizli düğmelerini
  tıklayarak davranışı birebir korur, adımları `activeView`ten eşler ve `MutationObserver` ile yeniden yayınlar.
  `host.ts` `unifiedChrome` ile kaynağın topbar/footer/landing'i ve içerik içi stepper'ı gizlenir; kaynağın açılış
  sayfası `CardAILanding.enter` ile atlanır (`runtime/module.ts`).
- **Opaca ve Ausculta (T108):** `EmbeddedContext` üzerinden `setChrome` ekranlara taşınır; içerik içi stepper/toolbar
  çizilmez, modaller sim içinde kalır. Gömülü modda simin kendi üst barı/footer'ı çizilmez.

**Bar düzeni ve öncelik (`apps/shell/src/shell.css`, "Birleşik sim barı").** <768 px: yalnız geri + başlık + eylem
simgeleri (marka ve oturum gizli); ≥768 px: geri etiketi; ≥1024 px: adım göstergesi + geliştirme çipi; ≥1280 px:
eylem etiketleri + rol; ≥1600 px: çipler. Öncelik başlık > eylemler > adımlar > çipler; ≥768 px'te başlık küçülmez ve
yatay taşma olmaz. Sim tam alandır (`eg-shell-main--sim`), host çerçevesizdir ve hazır olunca opaklık geçişiyle
görünür; sim rotasında ana gezinme ve footer yoktur. Sim kartına gelme/odaklanma/dokunmada modül önceden yüklenir
(`apps/shell/src/sims/loaders.ts` `prefetchSimModule`, `SimCard.tsx`).

**Yeni sim eklerken kontrol listesi.**
1. Modülü `SimModule` (`id` + `mount(target, context) → dispose`) olarak yaz; `apps/shell/src/sims/loaders.ts`
   tablosuna tek satır ekle (`SimHost` `id` eşleşmesini doğrular).
2. Yalnız verilen `target` altına çiz; dispose'ta kendi DOM'unu, zamanlayıcı ve dinleyicilerini temizle.
3. Adım/çip/eylemleri `context.setChrome` ile yayınla, dispose'ta `setChrome(null)` çağır; kendi üst barını çizme.
4. React simlerinde `setChrome`'u kendi context'inle (`EmbeddedContext`) ekranlara taşı; içerik içi stepper/toolbar ve
   footer çizme; modalleri sim içinde tut.
5. `SimChromeIcon` kümesinin dışına çıkma; eylemler etiketli ve dokunma hedefi ≥44 px olsun; renk dışında işaret
   kullan (WCAG 2.2 AA, tam klavye gezinmesi).
6. Kayıtları `egemed:u:<actorId>:<sim>:` (anonimde `egemed:anon:<sim>:`) ad alanında tut; simler arası veri
   birleştirme (ADR-006).
7. 360/768/1440 px'te yatay kaydırma olmadığını doğrula; `pnpm turbo lint typecheck test` kapısını yeşil tut.

**Oyunlaştırma tasarım birliği.** Ortak bileşen paketi `@egemed/gami-ui` (T115; referans tasarım Opaca) üç simde de
kullanılır: `views.tsx` (`GamiProgressPage`, `GamiAchievementsView`, `GamiLeaderboardView`), `model.ts`
(`buildAchievementsModel`, `buildLeaderboardModel`), `icons.tsx` (`defaultGamiIcons`), `styles.css` ve gölge DOM için
`styles-inline.ts` (`gamiUiStyles`), `server.tsx` (`GamiServerFrame`; sunucu vaatleri `Suspense` sınırının DIŞINDA
üretilir). Opaca (T115/T119), Ausculta (T119) ve Pulse (T122; gölge DOM'da React kökü) bu paketi kullanır; Pulse sonuç
ekranındaki kazanım kartı da ortaktır (T125). API oturumunda `SimMountContext.gamification` (T124) ile sunucu
rozet/XP/seri/liderlik verisi okunur, "Demo verisi" bandı ve demo etiketleri gizlenir. Birleşik bardaki oyunlaştırma
eyleminin etiketi tek: **İlerlemem**.

---

## 4. Eğitsel akış (pedagoji)

Her simülatör aynı öğrenme döngüsünü izler (framework `docs/03-mod-akisi-ve-pedagoji.md`):

1. **İnceleme** (yeşil): konu sistematik okuma rehberiyle, gerçek örnekler üzerinde keşfedilir.
2. **Uygulama** (mavi): vakalarda bulgular işaretlenir; her adımda anında geri bildirim.
3. **Değerlendirme** (mor): rastgele vaka seti; alan bazlı performans raporu.

Bağlayıcı kurallar: **kilit ≠ öneri** (mod sırası önerilir, gönderim hiçbir zaman gizli kilide bağlanmaz); seçenek sırası madde
kimliğinden tohumlanır; stem bulguyu anlatmaz, arayüz ipucu sızdırmaz; geri bildirim doğru/yanlış + çeldirici açıklaması içerir;
çeldiriciler yalnız "yok" olduğu kanıtlanmış bulgulardan seçilir. **Oyunlaştırma** üç simde de vardır: aynı mantık
(`gamification-core`) ve aynı tasarım (referans Opaca; ortak bileşen paketi U3 planı), sim başına farklı rozet ve hedefler;
kullanıcı ilerlemesini hem modül içinden hem ana sayfa dashboard'undan (sim sekmeleri) izler. Simler arası toplam puan/sıralama
üretilmez (ADR-006).

---

## 5. Planlar ve belgeler

| Belge | İçerik |
|---|---|
| `docs/specs/E0-temel.md` | Temel epik: monorepo, CI, token, UI, kabuk, e2e kapıları |
| `docs/specs/E1-sim-port.md` | İlk port epik taslağı (tarihsel) |
| `docs/specs/E2-tek-platform-yol-haritasi.md` | **Ana yol haritası**: aşamalar, görevler, karar kapıları, admin ekran haritası, yetki matrisi |
| `docs/specs/E2-opaca-port-inventory.md` | Opaca port envanteri ve dilimleri (S1–S23, oyunlaştırma G1–G8) |
| `docs/specs/E2-ausculta-port-inventory.md` | Ausculta port dilimleri (S0a–S20) ve kabul testi matrisi |
| `docs/specs/E2-pulse-port-inventory.md` | Pulse port dilimleri (S0a–S15b), bayt/40 boyut yöntemi |
| `docs/specs/E3-kullanici-yonetimi.md` | Kimlik akışı, DB şeması, API, 8 ekran (dashboard dahil), CSV şablonu, uygulama dilimleri T60–T76 |
| `docs/audits/2026-09-24-TEST-BULGULARI-VE-GOREVLER.md` | 24 Eylül test denetimi bulguları ve açık görev listesi (PULSE-00…11, PLATFORM-01…04, API-01…07, TEST-01, KAYNAK-01) |
| `docs/adr/001…008` | Monorepo, yığın (Hono/Postgres), gömme (geçersiz), LRS, kimlik (007 ile güncellendi), tek platform, kullanıcı verisi, rozetler sunucuda (008, Öneri) |

### Alınan önemli kararlar (depo sahibi)
- **K-P1:** simler `packages/sim-<id>` altında.
- **UX (25 Eylül):** kabuk + simler yek vücut. Sim rotasında EGEMED barı simin barıdır (konum, tek `h1`, adım göstergesi, çipler,
  eylemler); sim tam alan ve çerçevesiz, ana gezinme ve footer yok. Dar ekranda (<768) bar kademeli: geri + başlık + eylem simgeleri.
- **Opaca:** röntgen görselleri yerel kopyadan (git dışı); import/SCORM betik hattı taşınmaz, platform hedefi 153 çalışma zamanı testi.
- **Oyunlaştırma:** üç simde; çekirdek `gamification-core`, rozet/hedef sim başına, tasarım ortak (U3). Liderlik tablosu katılımı
  kullanıcı tercihidir (opt-out; `users.leaderboard_visible`): çıkan kullanıcı başkalarının listesinde görünmez, kendi satırını görür.
- **ADR-007 kabul;** onaylı bağımlılıklar: `pg`, `node-pg-migrate`, `zod`, `@playwright/test`, `@axe-core/playwright`.
- **Roller:** yalnız admin + kullanıcı. **Görsel dil:** `egemed-sim-ui-ux-framework` bileşenleri ve renk kartelası; yeni renk yok.

### Açık kararlar (insan)
SSO protokolü (OIDC/SAML/CAS); xAPI profili (K2) ve LRS iletim yolu (K3); saklama/imha süreleri; liderlik tablosunda ad/takma ad;
EGEMED logosu; ana sayfadaki "öğretim üyesi denetimi" ifadesinin teyidi; Pulse kaynak deposundaki `nextEvent` hatasının kaynağa da
uygulanması.

---

## 6. Çalışma biçimi (ajanlar ve insanlar)

Claude Code devir notu: `docs/agentic/CLAUDE-DEVIR.md`.

- **Görev = tek paket, ~400 satır diff.** Her görev kendi worktree'sinde (`.agtx/worktrees/<Txx>`, dal `task/<Txx>`), artefaktlar
  git dışı `.egemed-run/{plan,summary,review}.md`. Aynı pakette eşzamanlı iki görev açılmaz.
- **Kapı:** `pnpm turbo lint typecheck test` + `git diff --check`; kabuk görevlerinde ek olarak `pnpm e2e:mobile`.
- **Review:** yönetici ajan (şu an Claude Code) her diff'i kaynakla karşılaştırır (birebir port için normalize edilmiş karşılaştırma,
  motorlar için bağımsız diferansiyel test), UI'yi gerçek tarayıcıda 360/768/1440'ta görür, güvenliği dener; sonra `dev`'e
  `--no-ff` merge eder. Depo sahibi merge yetkisini yöneticiye vermiştir.
- **İşçi modeller:** OpenCode DeepSeek V4.1 Flash `max` (en fazla 2 eşzamanlı; ayrı worktree). Planlama, review ve merge Claude Code'da; ayrıntı `docs/agentic/CLAUDE-DEVIR.md`.
- **Port disiplini:** davranış birebir; strict TypeScript için yalnız tip daraltma; kaynaktan her bilinçli sapma summary'de gerekçeli
  yazılır ("emekli" testler dahil). Kaynak depolara yazılmaz; büyük veri JSON'ları ve varlıklar ajan bağlamına topluca alınmaz.
- **Gizlilik:** gerçek öğrenci verisi repoya girmez; test verisi sentetik ve tohumlu; sırlar yalnız `.env.local`.

---

## 7. Durum (25 Eylül 2026)

- **UX — birleşik kabuk (25 Eylül):** sim rotasında EGEMED barı simin barıdır (`apps/shell/src/SimBar.tsx`): konum
  ("Simülatörler › Sim"), tek `h1`, adım göstergesi, çipler ve simin eylemleri. Simler kendi üst barını çizmez; adım/çip/eylemleri
  `SimHost` `setChrome` kanalıyla (`SimChrome`) bara yazar. Sim tam alan ve çerçevesiz; sim rotasında ana gezinme ve footer yok
  (`ShellLayout.tsx`). Dar ekranda (<768 px) bar kademeli: geri + başlık + eylem simgeleri. Pulse kaynağının açılış sayfası
  platformda atlanır (`CardAILanding.enter`), kaynak üst çubuğu/footer'ı gizlenir (`packages/sim-pulse/src/runtime/chrome.ts`).
  Opaca/Ausculta birleşik bar uyarlaması T108 ile tamamlandı (`EmbeddedContext` üzerinden `setChrome`; içerik içi
  stepper/toolbar kalktı). Ayrıntılar §3 "Kabuk ve sim bütünleşmesi" altındadır.
- **Opaca:** port tamam ve kabukta canlı (`#/sims/opaca`); röntgen görselleri git dışı yerel kaynaktan `sync:xray` ile alınır.
  Kayıtlar kullanıcı×sim ad alanında tutulur (`egemed:u:<actorId>:opaca:`; anonimde `egemed:anon:opaca:`).
- **Pulse:** kabukta canlı (`#/sims/pulse`); platform kaynak runtime'ı EGEMED_PULSE/cardai betiklerini değiştirmeden gölge DOM'da
  çalıştırır (`packages/sim-pulse/src/runtime/host.ts`, `module.ts`, `vendor/`). Vendor dosyaları
  platform kaynağıdır (ADR-011); kaynak depodan senkron ve `manifest.json` yama listesi kaldırıldı. Oyunlaştırma köprüsü (`src/runtime/gami.ts`) kaynağın kendi kayıt çağrısını izler;
  görünür tek ek, birleşik bardaki **İlerlemem** eylemi/diyaloğu ve sonuç ekranındaki kazanım kartıdır. Kaynağın yerel liderlik
  tablosu demo akran verisi içerdiği için gösterilmez (gerçek sıralama API'den gelecektir). Kayıtlar kullanıcı×sim ad alanında
  tutulur (`egemed:u:<actorId>:pulse:`; anonimde `egemed:anon:pulse:`) ve SimHost `release(token)` ertelenen temizliğin yeni mount'u
  iptal etmesini önler (PLATFORM-01). KAYNAK-01 düzeltildi: sınav başarısı 80 puan eşiğine bağlıdır, modül tamamlama ayrı not
  olarak gösterilir (T105; `e2e/pulse-runtime.spec.ts`). Eski `src/mount.ts` ve `ui/*` ekranları kabukta kullanılmıyor;
  müfredattaki T04 kaynak bulgusu testte `it.fails`, insan kararı bekliyor.
- **Ausculta:** çekirdek, ses, store/runtime, UI ve ekranlar ile SimHost adaptörü hazır; kabukta canlı (`#/sims/ausculta`, T14e).
  Kayıtlar kullanıcı×sim ad alanında tutulur (`egemed:u:<actorId>:ausculta:`; anonimde `egemed:anon:ausculta:`). Ses varlıkları
  `sync:audio` ile git-dışı yerel kaynaktan alınır.
- **Platform API:** Hono/PostgreSQL, migration'lar, oturum/CSRF, admin kullanıcı ve denetim uçları, oyunlaştırma ve seed akışı
  mevcut. `/me/gamification` uçlarında sim erişimi her istekte DB'den doğrulanır; erişimi olmayan sim 403 `forbidden`, bilinmeyen
  sim 404 döner (API-03; `seed:dev` yöneticisi tüm simlere erişir). Deneme yazma kullanıcı×sim kapsamında idempotenttir: aynı `id`
  farklı gövdeyle veya aynı `attemptNo` başka istemci kimliğiyle gelirse 409 `conflict` (API-04). XP sunucuda hesaplanır —
  migration 005 `gami_attempts`e `mode/case_count/hints_used/xp` ekler, üç simde ortak `DEFAULT_RULES` geçerlidir ve deneme ile
  profil XP/düzey/seri tek SQL ifadesinde yazılır; istemcinin kodlu özetindeki `xp` yetkili değildir (API-05). Rozetler sunucuda
  değerlendirilir: yeni deneme yazılınca `@egemed/gami-catalogs` kataloğuyla (`SIM_BADGE_EVALUATORS`) kodlu özetten istatistik
  türetilir ve rozet satırları idempotent yazılır (ADR-008 S1–S3; Pulse T101/T103, Opaca T104). Liderlik tablosu katılımı
  `GET/PATCH /me/preferences` ile yönetilir (migration 006, `users.leaderboard_visible`); opt-out kullanıcı başkalarının
  listesinde görünmez, kendi satırını görür (T100). Üretim compose/Dockerfile/nginx yapılandırması `infra/prod/`, işletim adımları
  `docs/ops/ISLETIM.md` içindedir; yayın hazırlığı sürüyor ve SSO protokolü kararı bekliyor.
- **Kabuk veri kaynakları:** Admin ve ana sayfa (dashboard) sayfaları API oturumunda gerçek uçlara bağlanır
  (`apps/shell/src/dataSources.ts`, `apiShellSources.ts`); sahte `1450` XP sentetiği yalnız sahte dev oturumunda kalır
  (PLATFORM-02). Dashboard'daki liderlik görünürlüğü anahtarı API tercihini yazar (T106). API-03 UI kapısı: erişimi olmayan
  sim rotası hiç mount edilmez, erişim reddi sayfası gösterilir (`SimRoute.tsx`, `allowed`).
- **Modül önyükleme (T111):** sim kartına gelme/odaklanma/dokunmada lazy chunk önceden indirilir
  (`apps/shell/src/sims/loaders.ts` `prefetchSimModule`, `SimCard.tsx`); rota açılışında iskelet neredeyse görünmez.
- **Pulse birleşik bar (T112):** birleşik barda adım göstergesi varken kaynağın içerik içi stepper'ı gizlenir
  (`packages/sim-pulse/src/runtime/host.ts`, `:host(.pulse-unified) .stepper`).
- **Dashboard rozetleri (T114):** sim sekmeleri sunucudan gelen rozetleri katalog adlarıyla gösterir (ADR-008 S4).
- **Ausculta kataloğu (T109):** rozet kataloğu `@egemed/gami-catalogs`'a taşındı; kabuk deneme raporu üç sim
  kodlayıcısıyla çalışır (ADR-008 S2).
- **Birleşik bar önceliği (T117):** öncelik başlık > eylemler > adımlar > çipler; ≥768 px'te başlık küçülmez, adımlar
  tek satırda kalır, çipler yalnız ≥1600 px'te görünür (§3 "Bar düzeni ve öncelik").
- **Oyunlaştırma birliği (T115–T125):** ortak `@egemed/gami-ui` paketi (Opaca tasarımı) Opaca, Ausculta ve Pulse'ta
  canlı (§3 "Oyunlaştırma tasarım birliği"). API oturumunda kabuk `SimMountContext.gamification` (T124) ile sunucu
  rozet/XP/seri/liderlik verisini simlere verir; "Demo verisi" bandı ve demo etiketleri gizlenir. gami-ui CSS'indeki
  kapanmamış `@media` blokları ve kilitli rozet metni kontrastı T122'de düzeltildi.
- **Hesap menüsü (T120):** birleşik barda kompakt hesap menüsü; baş harf düğmesi + klavye erişilebilir açılır menü.
- **API ve test altyapısı (T123/T124/T126):** sunucu zaman damgaları tam milisaniye taşır (`toIstanbulIso`); giriş hız
  sınırı `AUTH_LOGIN_RATE_MAX` ile ayarlanabilir (varsayılan 8; CI `api-e2e` işi 200 verir) ve `e2e/auth-api.spec.ts`
  seri koşar; Playwright portları `E2E_PORT_BASE` ile kaydırılabilir (T123); gerçek PostgreSQL testleri
  `apps/api/test/db` altında ve `pnpm --filter @egemed/api test:db` ile koşar (T126).
- **Erişilebilirlik kapıları (T116):** Opaca ve Ausculta iç ekranları `e2e/sims-a11y.spec.ts` ile axe kapısından geçer;
  devralınan ihlaller `e2e/opaca-a11y-allowlist.json` ve `e2e/ausculta-a11y-allowlist.json` ile izlenir. Pulse kapısı
  `e2e/pulse-a11y.spec.ts` (+ `e2e/pulse-a11y-allowlist.json`) yukarıdaki PULSE-10 maddesindedir.
- **Erişilebilirlik (PULSE-10):** Pulse iç ekranları (`e2e/pulse-a11y.spec.ts`) 360/768/1440'ta axe ve 44 px dokunma hedefi
  kapısından geçer; kaynaktan devralınan ihlaller `e2e/pulse-a11y-allowlist.json` ile izlenir ve liste yalnız küçülür.
  Kaynak yeşili WCAG AA için koyulaştırıldı (`--green-600: #15803d`, birleşik bar uyarlaması T102). T113 kaynak kontrast
  tokenlarını ve 44 px hedefleri genişletti: izin listesi 17→5 ihlal, 55→8 hedefe indi.
- **E2E:** Playwright + axe her koşuda JSON özeti ve ekran görüntülerini `e2e-artifacts/<run-id>/` altına yazar. README'deki
  önceki 77/80 sonucu tarihsel koşuya aittir; güncel yayın kapısı olarak değerlendirilmemelidir.
- **24 Eylül geri almaları:** Impeccable beceri/referans paketi (T76) ve arayüz denetimi belgeleri (T77; `DESIGN.md`,
  `PRODUCT.md`, `docs/audits/IMPECCABLE-2026-09-24.md`) geri alındı; T53a test temizliği geri alındı (T83) — emekli edilen
  kabuk/UI testleri geri gelip canlı sime uyarlandı. Güncel bulgu ve görev listesi:
  `docs/audits/2026-09-24-TEST-BULGULARI-VE-GOREVLER.md`.

## CI

`dev` dalına push ve `dev`'i hedefleyen PR'larda GitHub Actions (`.github/workflows/ci.yml`) beş iş çalıştırır: `gates`
(`pnpm turbo run lint typecheck test`), `e2e` (Playwright mobil, axe), `api-e2e` (gerçek API + PostgreSQL; migration + `seed:dev`
sonrası `pnpm e2e:api`), `api-db` (migration turu) ve `prod-image` (temiz checkout imajı; `scripts/ops/verify-prod-image.sh`,
API-02 kabulü). Artefaktlar (`e2e-artifacts/`, `playwright-report/`, `api-e2e.log`) her
koşuda yüklenir. Node sürümü `.nvmrc`'den, pnpm sürümü `packageManager`'dan okunur; bağımlılıklar `--frozen-lockfile` ile kurulur,
eylemler commit SHA'sına sabitlidir. **Risk:** git-dışı sim varlıkları (Opaca xray, Ausculta ses) CI'da yoktur; bu varlıklara
bağlı e2e senaryoları CI'da tam doğrulanamaz (bkz. `docs/ops/ISLETIM.md` §8). Branch protection depo sahibinin adımıdır
(`CI / gates` zorunlu).
