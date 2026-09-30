# T281a-challenge-in-sim

- Tarih: 2026-10-01 01:40
- Commit: T281a: Meydan Okuma simin 4. modu — #/sims/<id>/meydan-okuma sim barıyla, sim seçici yok, üst menüden kaldırıldı, eski adresler yönlendirilir; openChallenges sözleşmesi (DeepSeek; review: Claude)
- Dal: task/T281a-challenge-in-sim

---

# T281a — Meydan Okuma'yı simin içine taşı: sözleşme + kabuk (özet)

## Ne yapıldı

- **Sözleşme (`packages/sim-host/src/SimHost.ts`):** `SimMountContext` ve
  `SimMountOptions`'a opsiyonel `openChallenges?: () => void` eklendi ve
  `mountContext` üzerinden bağlama geçirildi; `SIM_SCREEN_KEYS`'e
  `"meydan-okuma"` eklendi.
- **Rotalar (`apps/shell/src/routes.ts`):** `RouteId`'den `challenges` çıktı,
  `ROUTES` ikiye indi. Sim içi `#/sims/<id>/meydan-okuma` ve
  `#/sims/<id>/meydan-okuma/<uuid>` çözülür (`kind: "sim"`, `screenKey:
  "meydan-okuma"`, ayrıntıda `challengeDetailId`). Eski adresler için
  `redirect` ve `challengeDetail` türleri korundu;
  `challengeHref(simId, challengeId)` ve `simScreenHref(simId, screen)` eklendi.
- **Kabuk (`apps/shell`):** `App.contentFor`, `screenKey === "meydan-okuma"`
  iken sim modülünü mount etmez; aynı birleşik barın altında `ChallengesPage`
  (merkez) ya da `ChallengeDetailPage` (ayrıntı) çizilir. `#/meydan-okuma`
  adresi `window.location.replace` ile `#/simulatorler`e gider. `ShellLayout`
  gezinmesinden ve `NAV_ICONS`'tan Meydan Okuma kaldırıldı; `pages.tsx`
  challenges sayfası düşürüldü.
- **SimRoute:** `openChallenges` kanalı verilir (ziyaretçide ve düello modunda
  verilmez); gerçek hash değişimi yapar. `onChallengeFinished` yeni
  `challengeHref(simId, id)` imzasını kullanır.
- **ChallengesPage (sim içi merkez):** sim seçici ve `challengeSimOptions`
  kaldırıldı; sabit `simId` ile oluşturma, liste `challengesForSim` ile o sime
  süzülür; öğrenme kilidi oluşturma **ve** katılmayı pasifler; "Mod seçimine
  dön" bağlantısı `#/sims/<id>/modlar`; sim yerleşiminde başlık `h2`.
- **ChallengeDetailPage:** `simId`/`headingLevel` propları; geri bağlantısı sim
  merkezine; eski adres (`#/meydan-okuma/<uuid>`) kaynaktan simi çözünce
  `location.replace` ile sim içi ayrıntıya geçer.
- **Metinler:** `shell.nav.challenges` kaldırıldı, `challenges.backToModes`
  eklendi (`packages/ui/i18n/tr.ts`).
- **CSS:** `.eg-shell-main--sim > .eg-shell-duel` ile sim barı altındaki içerik
  sayfasına normal dolgu/genişlik verildi.
- **Testler:** `tests/shell/routes.test.ts`, `tests/shell/challenges-lock.test.ts`,
  `tests/sim-host/sim-host.test.ts` güncellendi; `e2e/sims.spec.ts`'e yeni koşu
  eklendi; `e2e/auth-api.spec.ts` düello akışı yeni adreslere taşındı.

## Yönlendirme tablosu

| Adres | Davranış | Hedef |
| --- | --- | --- |
| `#/meydan-okuma` | App efekti, `location.replace` | `#/simulatorler` |
| `#/meydan-okuma/<uuid>` | Ayrıntı sayfası kaynaktan simi çözer, `replace` | `#/sims/<sim>/meydan-okuma/<uuid>` |
| `#/meydan-okuma/<uuid-dışı>` | Bulunamadı | — |
| `#/sims/<id>/duello/<uuid>` | Değişmedi (düello oynama) | — |
| `#/sims/<id>/meydan-okuma` | Yeni: sim barı + düello merkezi | — |
| `#/sims/<id>/meydan-okuma/<uuid>` | Yeni: sim barı + düello ayrıntısı | — |

## Değişen bağlantılar

- `challengeHref(simId, challengeId)`: katılma sonrası yönlendirme, liste satırı,
  rövanş, düello bitişi (`SimRoute`).
- Düello merkezi geri bağlantısı: `#/sims/<id>/modlar`.
- Düello ayrıntısı geri bağlantısı: sim içi → `#/sims/<id>/meydan-okuma`; eski
  adres → `#/simulatorler`.
- `apps/api/src/mail/` şablon veri tiplerinde (`ChallengeInviteData`,
  `ChallengeResultData`) `simId` **yok**; plan gereği bağlantılar eski biçimde
  bırakıldı, yönlendirme çözer. Bu klasörde değişiklik yapılmadı.

## T281b notu: simler `openChallenges`'i nasıl kullanacak

Sim modülleri mount bağlamındaki `context.openChallenges` alanını kontrol
etmeli; alan varsa mod ekranına 4. kartı ("Meydan Okuma") çizmeli ve tıklamada
`context.openChallenges()` çağırmalı. Alan **ziyaretçide ve düello modunda
verilmez** (kart çizilmez). Öğretim üyesi/admin oturumunda alan verilir; kartın
yalnız öğrenciye çizilmesi simin sorumluluğundadır (kabuktaki karşılığı
`audienceShowsGamification`). Kabuk kart metnini/görselini sağlamaz; çağrı
gerçek hash değişimi yapar (`#/sims/<id>/meydan-okuma`), tarayıcı geri tuşu mod
seçimine döner.

## Doğrulama

- `pnpm turbo lint typecheck test`: **17/17 başarılı** (lint + typecheck + test;
  223 test dosyası, 1869 geçti / 1 atlandı).
- E2E kabulü (plan):
  `EGEMED_E2E_API_URL=http://127.0.0.1:9 E2E_PORT_BASE=8485 pnpm e2e:mobile --grep "challenge|meydan|duello|düello|nav|home|ana sayfa|app-frame|uat|sims"`
  → son koşu **173 geçti, 4 atlandı, 0 başarısız** (3,2 dk).
  Not: İlk koşular makinede eşzamanlı başka ajan e2e koşuları varken yapıldı ve
  yalnız sim modülü yükleme zaman aşımları (5 sn) biçiminde ilgisiz dalgalanma
  gösterdi; tek tek yeniden koşulduklarında geçtiler. Son koşu, makine sakin ve
  Vite dev sunucusu ısıtılmışken alındı.
- Yeni e2e (`e2e/sims.spec.ts`): `#/sims/opaca/meydan-okuma` açılır, sim barı
  görünür, h1 "Opaca" + h2 "Meydan Okuma" çizilir, "Sayfa bulunamadı" yoktur,
  sim modülü mount edilmez, yatay kaydırma yoktur ve `#/meydan-okuma` →
  `#/simulatorler` yönlenir.
- `e2e/auth-api.spec.ts` (yalnız API ayaktayken koşar) yeni adreslere ve
  katılma kilidi sırasına göre güncellendi; bu ortamda API olmadığı için
  koşturulamadı.

## Varsayımlar

- Eski `#/meydan-okuma/<uuid>` bağlantısında sim, URL'den bilinemediği için
  planın "bilinmiyorsa" dalı uygulandı: sayfa kaynaktan çözer ve `replace` eder.
- Plan "öğrenme kilidi ... oluştur/katıl pasif" dediği için katılma düğmesi de
  öğrenme kaydına bağlandı (önceden yalnız sunucu `learn_required` ile
  reddediyordu). `e2e/auth-api` akışında öğrenme kaydı sayfa yüklenmeden önce
  yazılacak biçimde sıra güncellendi.
- Sim içi merkez/ayrıntı sayfalarının başlıkları `h2`'dir; tek `h1` birleşik
  bardadır (SimRoute ile aynı kural). Karşılaştırma için `headingLevel` propu
  eklendi (SimCard deseni).
- `openChallenges` öğretim üyesinde de verilir; kart görünürlüğü T281b'de simin
  kitle kontrolünde.
- Ayrıntı sayfasında "Şimdi oyna" rotası (`#/sims/<id>/duello/<uuid>`) aynen
  korundu.

## Açık sorular / riskler

- Eski ayrıntı bağlantısı, sim çözülene dek kısa süre ayrıntı iskeletini
  gösterip `replace` eder; ürün açısından kabul edilebilir mi?
- Her simin merkezinde "Kodla katıl" görünür; katılınca kod hangi sime aitse o
  simin merkezine gidilir. Opaca/pulse için kod alanının gizlenmesi istenirse
  T281b ya da ayrı bir görev konusu.
- `challenges.create.sim` ("Simülatör") ve `challenges.create.soon` ("yakında")
  i18n anahtarları artık kullanılmıyor; plan yalnız `shell.nav.challenges`
  kaldırmayı söylediği için bırakıldı (T281b 4. kart "yakında" etiketi
  kullanabilir).

## Test yazım kapısı (TEST-POLITIKASI §1)

1. **Korunan sözleşme:** sim içi merkez listesi sabit sime süzülür; sim seçici
   yoktur; eski adres yönlendirilir; öğrenme kilidi oluştur+katıl düğmelerini
   pasifler; `openChallenges` bağlama taşınır ve verilmezse alan yoktur.
2. **Kıracak gerçekçi hata:** süzgecin kaldırılması (başka simin düellosu
   merkezde görünür), seçicinin geri gelmesi, yönlendirmenin kaybolması,
   kilidin düşmesi, kanalın ziyaretçiye/düelloya sızması.
3. **Mevcut testler neden yakalamıyor:** kaldırılan `challengeSimOptions`
   testleri yalnız eski seçiciyi kapsıyordu; sim içi merkez ve yönlendirme
   davranışı yeni.
4. **Test-only açıklık:** yok; `challengesForSim` üretimde kullanılan işlevdir.

## Kapsam dışı gözlemler

- `apps/api/src/mail/preview.ts` örnek bağlantıları (`/meydan-okuma/katil?...`)
  hash biçiminde değil; bu görevin kapsamı dışında.
- E2E `auth-api` değişiklikleri API gerektirdiğinden bu ortamda koşulamadı.
