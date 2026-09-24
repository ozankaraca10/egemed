# EGEMED — Klinik Öğrenme Platformu

EGEMED, Ege Üniversitesi Tıp Fakültesi için geliştirilen üç klinik simülatörü — **Pulse** (EKG ve kardiyak fizyoloji),
**Ausculta** (kardiyopulmoner oskültasyon) ve **Opaca** (akciğer grafisi ve toraks BT) — **tek bir React platformu** içinde ayrı
modüller olarak sunan, mobil uyumlu bir tıp eğitimi uygulamasıdır. Eski model (her simülatör ayrı SCORM paketi) terk edilmiştir
(ADR-006).

> Bu dosya repoya yeni gelen bir insanın veya yapay zekâ ajanının **her şeyi buradan başlayarak anlayabilmesi** için yazılmıştır.
> Bağlayıcı kurallar `AGENTS.md`'dedir; kararlar `docs/adr/`, planlar `docs/specs/` içindedir. Bu README onların haritasıdır ve
> düzenli güncellenir (son güncelleme: 24 Eylül 2026).

---

## 1. Hızlı başlangıç

```bash
pnpm i                               # Node ≥ 22 (.nvmrc), pnpm 10 (packageManager pin); --frozen-lockfile kırılmaz
pnpm turbo lint typecheck test       # ana kalite kapısı (her görevde yeşil olmalı)
pnpm dev                             # kabuk: http://localhost:5173
pnpm e2e:mobile                      # Playwright + axe: 360/768/1440 px, WCAG 2.2 AA, giriş/güvenlik akışları
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
| `apps/shell` | React 19 + Vite 8 **web kabuğu**: üst bar/alt sekme, hash yönlendirici, ana sayfa (dashboard), simülatörler sayfası, giriş ekranları, `/admin` taslağı, sim rotaları (`#/sims/<id>`) | Metinler `packages/ui/i18n/tr.ts`'ten; renkler `packages/tokens` |
| `apps/api` | Sunucu (Hono, ADR-002) — **inşa ediliyor**: PostgreSQL migration'ları (T61), sonra oturum/kimlik ve admin API'leri | E3 dilimleri T60–T76 |
| `packages/sim-host` | **SimHost sözleşmesi**: `mount(target, context) → dispose`, lazy yükleme, epoch iptali, tek etkin oturum | Tüm simler bu sözleşmeyle bağlanır |
| `packages/sim-opaca` | Opaca modülü (portlanıyor): çekirdek (tipler, geometri, skor, akış, oturum, suspend, reducer, runtime), veri JSON + BT/marka varlıkları, UI (chrome, sorular, modaller, film çekirdeği/bilgi paneli) | Röntgen `public/assets/xray/runtime/` **git dışı** (lisans incelemesi) |
| `packages/sim-pulse` | Pulse modülü (portlanıyor): EKG motoru (`engine/shapes`, `beats`, `model`) | Kaynak düz JS/yoğun satır; biçimlendirilerek taşınır |
| `packages/sim-ausculta` | Ausculta modülü (portlanıyor): çekirdek tipler, suspend, puanlama… | Ses motoru sonraki dilimlerde |
| `packages/gamification-core` | **Sim-bağımsız oyunlaştırma çekirdeği**: XP, seviye, seri, haftalık hedef, zaman (Europe/Istanbul), jenerik rozet motoru, sıralama, ödül, grafik | Rozet kataloğu ve kurallar her simde ayrı (parametre) |
| `packages/contracts` | Paylaşılan sözleşmeler (zod): kimlik, kullanıcı, CSV içe aktarma, oyunlaştırma, hata kodları | API ve UI aynı şemayı kullanır |
| `packages/ui` | Ortak bileşenler (Card, Badge, Tabs, Table, Modal, ModeCard) + **Türkçe sözlük** `i18n/tr.ts` | Tüm arayüz metni buradan |
| `packages/tokens` | Aile tasarım token'ları (`family-tokens.css`, `opaca.css`) | `egemed-sim-ui-ux-framework` ile birebir |
| `packages/xapi-profile` | xAPI profili v0 (fiiller, IRI, opak aktör) — **Önerildi**, insan onayı (K2) bekliyor | |
| `packages/xapi-client` | Boş iskelet — K2/K3 sonrası T22 | |
| `tests/` | Vitest birim/sözleşme testleri (paket başına klasör) — DOM yok; `renderToStaticMarkup` + saf fonksiyonlar | `tests/config/*` yapı sözleşmeleri |
| `e2e/` | Playwright + axe testleri (T09) | `playwright.config.ts` dev (5199) ve prod önizleme (5198) sunucusu kurar |
| `infra/` | `docker-compose.dev.yml` (Postgres 18.4, SQL LRS 0.9.8, digest-pinli) | Sırlar yalnız `.env.local` |
| `docs/adr/` | Mimari karar kayıtları 001–007 | Durum: Önerildi / Kabul |
| `docs/specs/` | Epik ve plan belgeleri (E0–E3) | Aşağıda §5 |
| `docs/agentic/` | Ajan devir/kurulum notları (`CODEX-DEVIR.md`) | Tarihsel bağlam |
| `sims/` | **Eski yer tutucu** — K-P1 kararıyla simler `packages/sim-<id>` altında; burası arşiv/boş | Lint ve workspace dışı |
| `.agtx/` | Görev worktree'leri (`.agtx/worktrees/<görev>`) ve pano verisi — **git dışı** | Lint'ten hariç |

**Kaynak (eski) depolar** — salt okunur referans, platforma port edilen kod buradan gelir:
`~/Documents/EGEMED CLIX/{EGEMED_PULSE, egemed-ausculta, egemed-opaca, egemed-sim-ui-ux-framework}`.

---

## 3. Mimari

- **Tek platform, hibrit modüller (ADR-006):** Kabuk React'tir; her simülatör `packages/sim-<id>` altında bağımsız bir modüldür ve
  kabuğa `SimHost` üzerinden `mount/dispose` ile lazy bağlanır. Motorlar (EKG üretimi, ses mantığı, görüntü işaretleme) davranış
  değiştirmeden taşınır; Opaca ve Ausculta zaten React olduğundan ekranlar korunur, Pulse (düz JS) kademeli taşınır.
- **Veri izolasyonu:** Simler arası durum veya veri birleştirilmez; her kayıt/ifade tek `SimulatorId` taşır. Dashboard simleri
  **sekmelerle** ayrı gösterir, toplam puan üretmez.
- **Gömülü mod:** Sim modülleri platform içinde kendi üst bar/footer'ını çizmez (tek üst bar kuralı); sim kapsayıcısı React çocuğu
  içermez (vanilla modül güvenle `appendChild`/temizlik yapar).
- **Kimlik ve veri (ADR-007, Kabul):** EGEMED kullanıcı kaydı tutar; kullanıcıları admin kaydeder (tek tek ve toplu CSV); giriş tipi
  **SSO** (protokol henüz belirlenmedi; o zamana kadar geliştirme sağlayıcısı). EGEMED parola saklamaz. Roller şimdilik yalnız
  **admin** ve **kullanıcı** (diğerleri park edildi). Oyunlaştırma verisi EGEMED veritabanında kullanıcı×sim başına tutulur.
  xAPI ifadeleri kurum LRS'sine gider, aktör opaktır (ad/e-posta yok).
- **Zaman ve rastgelelik:** `Date.now()` yasak (lint kuralı); `now` bağımlılık olarak enjekte edilir. Rastgelelik tohumlu ve
  deterministiktir. Tarih/saat Europe/Istanbul.
- **Tarayıcı erişimi:** Sim paketlerinde doğrudan `window`/`document`/`localStorage` yoktur; yapısal tipli "env"/"port" arayüzleri
  enjekte edilir (test edilebilirlik ve sızıntısız yaşam döngüsü). Kök tsconfig DOM lib'i taşımaz.

---

## 4. Eğitsel akış (pedagoji)

Her simülatör aynı öğrenme döngüsünü izler (framework `docs/03-mod-akisi-ve-pedagoji.md`):

1. **İnceleme** (yeşil): konu sistematik okuma rehberiyle, gerçek örnekler üzerinde keşfedilir.
2. **Uygulama** (mavi): vakalarda bulgular işaretlenir; her adımda anında geri bildirim.
3. **Değerlendirme** (mor): rastgele vaka seti; alan bazlı performans raporu.

Bağlayıcı kurallar: **kilit ≠ öneri** (mod sırası önerilir, gönderim hiçbir zaman gizli kilide bağlanmaz); seçenek sırası madde
kimliğinden tohumlanır; stem bulguyu anlatmaz, arayüz ipucu sızdırmaz; geri bildirim doğru/yanlış + çeldirici açıklaması içerir;
çeldiriciler yalnız "yok" olduğu kanıtlanmış bulgulardan seçilir. **Oyunlaştırma** üç simde de vardır: aynı mantık
(`gamification-core`), sim başına farklı rozet ve hedefler; kullanıcı ilerlemesini hem modül içinden hem ana sayfa dashboard'undan
(sim sekmeleri) izler.

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
| `docs/adr/001…007` | Monorepo, yığın (Hono/Postgres), gömme (geçersiz), LRS, kimlik (007 ile güncellendi), tek platform, kullanıcı verisi |

### Alınan önemli kararlar (depo sahibi)
- **K-P1:** simler `packages/sim-<id>` altında.
- **Opaca:** röntgen görselleri yerel kopyadan (git dışı); import/SCORM betik hattı taşınmaz, platform hedefi 153 çalışma zamanı testi.
- **Oyunlaştırma:** üç simde; çekirdek `gamification-core`, rozet/hedef sim başına.
- **ADR-007 kabul;** onaylı bağımlılıklar: `pg`, `node-pg-migrate`, `zod`, `@playwright/test`, `@axe-core/playwright`.
- **Roller:** yalnız admin + kullanıcı. **Görsel dil:** `egemed-sim-ui-ux-framework` bileşenleri ve renk kartelası; yeni renk yok.

### Açık kararlar (insan)
SSO protokolü (OIDC/SAML/CAS); xAPI profili (K2) ve LRS iletim yolu (K3); saklama/imha süreleri; liderlik tablosunda ad/takma ad;
EGEMED logosu; ana sayfadaki "öğretim üyesi denetimi" ifadesinin teyidi; Pulse kaynak deposundaki `nextEvent` hatasının kaynağa da
uygulanması.

---

## 6. Çalışma biçimi (ajanlar ve insanlar)

- **Görev = tek paket, ~400 satır diff.** Her görev kendi worktree'sinde (`.agtx/worktrees/<Txx>`, dal `task/<Txx>`), artefaktlar
  git dışı `.egemed-run/{plan,summary,review}.md`. Aynı pakette eşzamanlı iki görev açılmaz.
- **Kapı:** `pnpm turbo lint typecheck test` + `git diff --check`; kabuk görevlerinde ek olarak `pnpm e2e:mobile`.
- **Review:** yönetici ajan (şu an Claude Code) her diff'i kaynakla karşılaştırır (birebir port için normalize edilmiş karşılaştırma,
  motorlar için bağımsız diferansiyel test), UI'yi gerçek tarayıcıda 360/768/1440'ta görür, güvenliği dener; sonra `dev`'e
  `--no-ff` merge eder. Depo sahibi merge yetkisini yöneticiye vermiştir.
- **İşçi modeller:** OpenCode DeepSeek V4.1 Flash (en fazla 2 eşzamanlı — fazlası yerel veritabanında kilitlenir), Cursor
  Grok 4.7 xhigh ve Composer 2.5, Codex gpt-6-luna. Her işçiye farklı paket verilir.
- **Port disiplini:** davranış birebir; strict TypeScript için yalnız tip daraltma; kaynaktan her bilinçli sapma summary'de gerekçeli
  yazılır ("emekli" testler dahil). Kaynak depolara yazılmaz; büyük veri JSON'ları ve varlıklar ajan bağlamına topluca alınmaz.
- **Gizlilik:** gerçek öğrenci verisi repoya girmez; test verisi sentetik ve tohumlu; sırlar yalnız `.env.local`.

---

## 7. Durum (24 Eylül 2026)

- **Kabuk:** premium görünüm (lacivert üst bar, kahraman alan, "Nasıl çalışır?", sim kartları, "İlerlemem" sekmeleri, footer),
  sahte giriş, `/admin` taslağı, üç sim rotası (şimdilik yer tutucu modül). e2e: 77/77 (axe 0 ihlal).
- **Opaca:** veri + varlıklar; çekirdek S1–S7; UI S8–S11 tamam. Sırada FilmViewer (S12), ekranlar, CSS, SimHost adaptörü, oyunlaştırma.
- **Pulse:** EKG motoru tamam (şekil, atım, sinyal/snapshot — kaynakla binlerce örnekte birebir). Sırada `nextEvent` hata düzeltmesi,
  durum/müfredat, kalıcılık, çizim ve ekranlar.
- **Ausculta:** paket, tipler, suspend tamam; puanlama sürüyor; ses motoru ve ekranlar sırada.
- **Platform API:** sözleşmeler (T60) tamam; migration'lar (T61) sürüyor; oturum/kimlik, admin API ve ekranları sırada.
- Bilinen hata: Pulse'ta "Adım" düğmesi ~30 basıştan sonra yığın taşmasıyla donuyor (kaynakta da var); düzeltme portta yapılıyor.

## CI

`dev` dalına push ve `dev`'i hedefleyen PR'larda GitHub Actions `gates` işi `pnpm turbo run lint typecheck test` kapısını çalıştırır
(`.github/workflows/ci.yml`). Node sürümü `.nvmrc`'den, pnpm sürümü `packageManager`'dan okunur; bağımlılıklar `--frozen-lockfile` ile
kurulur, eylemler commit SHA'sına sabitlidir. Branch protection depo sahibinin adımıdır (`CI / gates` zorunlu). e2e henüz CI'da değil.
