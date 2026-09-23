# EGEMED CLIX — Codex devir teslim notu (23 Eylül 2026, akşam)

> Bu belge süreci **Codex (gpt-6-astra)**'e devrediyor. Görev: ADR-006 hibrit
> modelini hayata geçirmek — tek React platformu, içinde üç simülatör modülü;
> motorları ayağa kaldır. Bu notta her şey var: ne yapıldı, nasıl koşar,
> bekleyen işler neler. Kuralların tamamı `AGENTS.md` içindedir; okumadan başlama.

## 1. Nerede, hangi dalda, ne durumda
- Repo: `/Users/ozankaraca/Documents/Codex/2026-09-23/egemed-clinical-learning-experience-platform-clix`
- Dal: `dev` (temiz). Devir anındaki uç: `03a9422`. Kapılar: `pnpm turbo lint typecheck test` → 7/7 yeşil (115+ test).
- AGTX pano verisi `.agtx/` altındadır (git-dışı sqlite). Faz geçişleri son oturumlarda
  elle yapıldı; Codex de böyle yürütebilir: worktree + `.egemed-run/` artefakt + kapı + commit + review.

## 2. Localhost haritası (şu an canlı durum)
| Servis | Adres | Nasıl çalışır | Not |
|---|---|---|---|
| Kabuk (React app) | http://localhost:5173 | `pnpm dev` (Vite 8 dev sunucu) | Açtım, HTTP 200; log: `/tmp/egemed-dev.log` |
| LRS (SQL LRS v0.9.8) | http://localhost:8080 | `pnpm infra:up` (docker compose) | `/health` → 200; `/xapi/about` → `{"version":["2.0.0","1.0.3"]}` |
| xAPI Basic auth | `dev-key:dev-secret-egemed` | `.env.local` (git-dışı) | Yalnız geliştirme değeri; sır değildir |
| Postgres 18.4 | localhost:5432 | aynı compose | db: `egemed_clix`, user: `egemed` (değerler `.env.local`) |
| Kapatma | — | `pnpm infra:down` | — |

Docker çalışma zamanı: **colima** (Homebrew). VM kapalıysa: `colima start --cpu 2 --memory 4`.
Compose plugin: `~/.docker/cli-plugins/docker-compose` (brew docker-compose'a symlink).
Compose dosyası `infra/docker-compose.dev.yml`; imajlar digest-pinli
(`postgres:18.4-alpine@sha256:…`, `yetanalytics/lrsql:v0.9.8@sha256:…`).

## 3. Teknoloji yığını (ayrıntı)
- **Node ≥22** (`.nvmrc`: 22.23.2; sistemde 24.20.0 var, ikisi de çalışır), **pnpm 10.34.5**
  (`packageManager` pin; PATH'te `~/.npm-global/bin/pnpm`). Kilit dosyası commit'li, `--frozen-lockfile` kırılmaz.
- **Monorepo:** pnpm workspaces (`apps/*`, `packages/*`) + Turborepo 2.11.3. `sims/*` workspace dışıydı;
  ADR-006 ile sim kodu workspace içine modül olarak taşınacak (yerleşim: T14/T15 planlarında).
- **TypeScript 5.9.3 strict:** `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`. Kök `tsconfig.json` `lib: ["ES2022"]` (DOM/Node lib YOK) — DOM tiplerine
  dokunmadan **yapısal tip deseni** kullan (örnek: `packages/ui/src/Modal.tsx` `Focusable`/`FocusScope`).
- **React 19.3.0** (kök + `packages/ui` aynı sürüm; çift örnek yasak). **Vite 8.3.0** +
  `@vitejs/plugin-react 6.1.1` (`apps/shell`). Yönlendirme: **bağımlılıksız hash yönlendirici**
  (`apps/shell/src/routes.ts` saf fonksiyon + `useHashRoute`).
- **Test:** vitest 3.2.7, kökte `tests/**/*.test.ts`. DOM ortamı yok — işaretleme testleri
  `react-dom/server` `renderToStaticMarkup` + saf fonksiyonlarla. jsdom/testing-library yasak (yeni bağımlılık onaysız).
- **Lint:** eslint 9 flat config + `no-restricted-properties` ile `Date.now` YASAK
  (`now` bağımlılık olarak enjekte edilir).
- **Tasarım tokenları:** `packages/tokens/family-tokens.css` — aile paleti (navy/blue/ink,
  `--fs-*` 7 kademe, `--sp-*`, radius). CSS'te **hex yasak**; yalnız `var(--…)` (aile token'ı veya
  `--eg-*` yerel). Sınıf öneki `eg-`. Bu kuralları testler zorlar (`css-tokens`, `shell-css`).
- **UI paketi:** `@egemed/ui` — Card, Badge, Tabs (segmented), Table (mobil kart listesi), Modal;
  `packages/ui/i18n/tr.ts` Türkçe sözlük (`t(key)`, anahtarlar katı tipli). T07+T07b+T07c'de
  review döngüsüyle cilalandı (58 test).
- **xAPI:** `@egemed/xapi-profile` — 8 ADL fiili, activity IRI üreticisi, opak aktör
  (`account{name}` — e-posta/ad YASAK, KVKK), `istanbulTimestamp` (Europe/Istanbul, `now` enjeksiyonu).
  Profil **Önerildi** durumunda; insan onayı + `PROFILE_IRI` sabitleme bekliyor.
- **Arayüz metinleri Türkçe;** tarih/saat `Europe/Istanbul`; mobil öncelikli, dokunma hedefi ≥44 px,
  `box-sizing: border-box` unutma (T07b/T07c/T08'de üç kez taşma dersi!).

## 4. Bugüne dek ne yapıldı (done)
T01 monorepo iskeleti · T02 CI (GitHub Actions `dev` kapısı) · T03 tasarım tokenları ·
T04 ADR-001…005 taslakları · **T07/T07b/T07c `packages/ui` tamamı** · T13 AGTX faz geçişi teşhisi ·
T08 **Vite+React kabuk** (üst bar/alt sekme, hash rota, 5 boş sayfa; `pnpm dev`/`build` çalışıyor) ·
T05 geliştirme altyapısı (compose + yapı denetim testleri) · T06 xAPI profili v0 (fiil kataloğu,
IRI şeması, ifade üreticileri; insan onayı bekliyor) · T03/T04/T13. ADR-001…005 ve **ADR-006
TEK PLATFORM (KABUL)** — `docs/adr/006-tek-platform.md`. Tur kayıtları: `docs/agentic/KURULUM-NOTLARI.md`,
görev artefaktları `work/<görev>/` altında.

## 5. Mimari yön: ADR-006 (kabul edildi)
Tek React platform; üç simülatör **iç modül**. Motorlar (EKG üretimi, oskültasyon ses mantığı,
görüntü işaretleme) vanilla/TS olarak korunur, React host'tan mount/unmount edilir (hibrit).
SCORM paketleme platform dağıtımından çıkar; kaynak depolar arşiv referansı. Kaynaklar
(henzüported): `~/Documents/EGEMED CLIX/` altında `EGEMED_PULSE` (~7.8k satır, düz JS, test yok),
`egemed-ausculta` (~8.3k, Vite+TS, 1 test dosyası), `egemed-opaca` (~14.4k, Vite+TS, **15 test dosyası / 119 test** — port regresyon ağı budur). Okuma kısıtları: `sims/…/data/*.json`, `…/public/assets/**`,
`**/dist/**`, `**/*.lock` topluca OKUNMAZ (sadece hedefli `head`/`jq`).

## 6. Bekleyen işler (sıralı)
1. **T14 Platform sim-modül altyapısı** — `SimHost` sözleşmesi (mount/unmount, lazy chunk, rota
   bağları); sahte sim ile davranış testleri. Sözleşme görevi: tüketicilerden önce merge.
2. **T15 Opaca port faz 1** — motor+ekran dosyaları platform modülüne taşınır, SimHost'a bağlanır;
   **119 test yeşil kalmalı** (regresyon ağı). 400 satır sınırına dikkat; gerekirse alt görevlere böl.
3. **T16 Opaca port faz 2+** — ekranlar kademeli React'e.
4. **T17 Ausculta port**, **T18 Pulse port** (aynı kalıp; Pulse'ta port sırasında test iskeleti kurulur).
5. **T09 Mobil e2e** — Playwright (E0 spec'te onaylı yeni bağımlılık); kabuk + üç modül 360/768/1440.
6. Astra (sen) ikinci görüşü: ADR-001…006 ve xAPI profili README'sindeki `Astra ikinci görüşü:
   Bekleniyor.` bölümlerini bulgularıyla doldur — bu senin klasik rolün, kota artık senin.
7. **T06 insan onayı:** profil + `PROFILE_IRI` sabitleme + `terminated` fiili kararı insanın;
   README durumunu yalnız insan `Kabul`e çevirir.
8. **T12** legacy belge kopyası — kaynak hâlâ verilmedi. **T11** oyunlaştırma — legacy yol haritası §4 gerekli.
9. E1 taslağı `docs/specs/E1-sim-port.md` **Önerildi** durumda; depo sahibi bu devirle yürürlüğe
   sokuyor — taslak metnini tamamlayıcı bilgi olarak kullan, çelişki görürsen insan onayına getir.

## 7. Süreç kuralları (özet — tam metin AGENTS.md)
- Her görev: kendi worktree'si (branch `task/<kısa-id>-<görev>`), `.egemed-run/` altında
  `research.md`/`plan.md`/`summary.md`/`review.md` artefaktları (git-dışı), `scripts/agtx/gates.sh`
  (lint+typecheck+test) yeşil, sonra commit `[task:<id>]` etiketiyle. Review fazı **senin** (Astra):
  `git diff dev...HEAD`, plan/summary oku; `review.md` ilk satırı `VERDICT: APPROVE` veya
  `VERDICT: CHANGES`; bulgular `dosya:satır` numaralı. Kodu review'da değiştirme. **Merge ve
  insan onayı depo sahibindir** — merge'leri insan isterse yapar ya da sana verir.
- Yeni bağımlılık yalnız onaylı planda. Gerçek öğrenci verisi/sır repoya girmez. Mock veri deterministik.
- 360/768/1440 px doğrulaması T09'a ait; şimdiye kadar statik kontrol + testle yürütüldü.

## 8. Başlangıç önerisi
1. `AGENTS.md`, `docs/specs/E1-sim-port.md`, `docs/adr/006-tek-platform.md`,
   `docs/agentic/KURULUM-NOTLARI.md` oku.
2. `pnpm i` ve `pnpm turbo lint typecheck test` → yeşil teyit; `pnpm dev` → 5173; `pnpm infra:up` → 8080/5432.
3. T14 planını yaz (`.egemed-run/research.md` + `plan.md` ≤60 satır) ve yürüt; sonra T15'te
   Opaca motorunu ayağa kaldır — 119 test senin regresyon ağı.
4. Astra görüşlerini doldur: kritik kararlar (ADR-002/003/006, xAPI profili) için tek tek görüş yaz.
