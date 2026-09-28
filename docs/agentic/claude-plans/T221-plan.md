# T221 — Meydan Okuma rozetleri (sunucuda, sim başına) (Z3)

Karar (depo sahibi, 28 Eylül 2026): "Katmanlı galibiyet seti". Her sim (Pulse, Ausculta, Opaca) için AYRI düello rozetleri; sunucuda hesaplanır (ADR-008); öğretim üyesi ve uzmanlık öğrencisi zaten katılmaz (gamified=false).

Rozetler (her sim için aynı set; kimlik önekli: `duel-…`):
| Kimlik | Ad | Katman | Koşul |
|---|---|---|---|
| `duel-first` | İlk düello | bronz | Sonuçlanmış (iki taraf bitirmiş, kazanan/beraberlik belirlenmiş) ilk düello |
| `duel-first-win` | İlk galibiyet | bronz | İlk galibiyet (beraberlik galibiyet SAYILMAZ) |
| `duel-wins-3` | Düello serisi | bronz | Toplam 3 galibiyet |
| `duel-wins-10` | Düello serisi | gümüş | Toplam 10 galibiyet |
| `duel-wins-25` | Düello serisi | altın | Toplam 25 galibiyet |
| `duel-rematch` | Rövanş | gümüş | Daha önce KAYBETTİĞİ aynı rakibe karşı sonraki bir düelloyu kazanmak (aynı sim) |
| `duel-rivals-3` | Farklı rakipler | bronz | 3 FARKLI kişiyle sonuçlanmış düello (kazanmak gerekmez) |
| `duel-rivals-10` | Farklı rakipler | gümüş | 10 farklı kişiyle sonuçlanmış düello |
| `duel-rivals-25` | Farklı rakipler | altın | 25 farklı kişiyle sonuçlanmış düello |

"Galibiyet serisi" ardışık değil, TOPLAM galibiyettir (isim "Düello serisi" ama açıklama "toplam N galibiyet" der).

ÖRNEK/yerler:
- Kataloglar: `packages/gami-catalogs/src/{pulse,ausculta,opaca}.ts` (`BadgeDef`, katman, `evaluators.ts` `SIM_BADGE_EVALUATORS`), `packages/gamification-core` (`evaluateBadges`).
- Rozet yazımı: `apps/api/src/me/gamification.ts` (`gami_badges` insert, `on conflict do nothing`).
- Düello sonucu: `apps/api/src/me/challenges.ts` + `apps/api/src/me/simSessions.ts` (`onFinished` kancası; iki taraf bitince kazanan belirlenir).
- Rozet ikonları/katman sıralaması: kabuk ve `packages/gami-ui` mevcut rozet gösterimi; yeni rozetlerin adı/açıklaması `packages/ui/i18n/tr.ts` ya da katalog metni (mevcut desen hangisiyse).

## Tasarım
- Düello istatistiği deneme özetlerinden DEĞİL, `challenges` tablosundan türetilir: kullanıcının o simdeki sonuçlanmış düelloları (rol: inviter/opponent, kazanan, rakip kimliği, bitiş zamanı). Yeni saf fonksiyon `duelStatsFrom(rows, userId)` → `{ completed, wins, rematchWin, distinctOpponents }` (`distinctOpponents` = sonuçlanmış düellolardaki farklı rakip kimliği sayısı); `rematchWin` = aynı rakibe karşı önce kaybedilmiş bir düellodan SONRA biten bir galibiyet var mı.
- Değerlendirme anı: bir düello sonuçlandığında (kazanan yazıldığında) İKİ taraf için de o simin düello rozetleri değerlendirilir ve yeni kazanılanlar `gami_badges`'e yazılır (sim_id = düellonun simi). Mevcut sim rozet değerlendirmesiyle aynı tablo; `badge_key` çakışmaz (önek).
- Rozet listeleri (İlerlemem, sim içi başarılar) yeni rozetleri kendi simlerinde gösterir; katman sıralaması (kolaydan zora) mevcut kurala uyar.
- Oyunlaştırma dışı roller için hiçbir yazım yapılmaz.

## Rozet ekranında "Meydan Okuma" kategorisi ve filtresi (depo sahibi, 28 Eylül 2026)
- Yeni rozetlerin hepsi yeni `BadgeCategory` değeri `challenge` taşır; kategori etiketi **"Meydan Okuma"** (`packages/gamification-core` `BadgeCategory` birleşimine ekle; `gami-ui` kategori rengi/ikonu mevcut kategori desenine uygun, token renklerinden).
- Rozet listelerinin gösterildiği her yerde (kabuk İlerlemem rozetleri, her simin başarılar/rozetler ekranı — `packages/gami-ui` başarı görünümü) kategoriye göre FİLTRE: "Tümü" + mevcut kategoriler + "Meydan Okuma" (seçilebilir çipler ya da segment; klavye ile erişilebilir, `aria-pressed`, 44 px hedef). Filtre yalnız o anda listede bulunan kategorileri gösterir; seçim URL/depoya yazılmaz (yerel durum).
- Test: kategori filtresi "Meydan Okuma" seçilince yalnız `duel-…` rozetleri listelenir; "Tümü" hepsini gösterir; axe ihlali yok (ilgili e2e/birim).

## Testler
- `duelStatsFrom`: farklı rakip sayımı (aynı kişiyle 5 düello = 1; sonuçlanmamış/süresi dolmuş düello sayılmaz); beraberlik galibiyet değil; toplam galibiyet sayımı; rövanş (önce kayıp sonra aynı rakibe galibiyet → true; farklı rakip → false; önce galibiyet sonra kayıp → false).
- API: iki öğrenci düellosu sonuçlanınca kazanana `duel-first` + `duel-first-win`, kaybedene `duel-first`; tekrarlanan sonuçta ikinci kez yazılmaz; 3 galibiyette `duel-wins-3`; rövanş senaryosu; öğretim üyesi/uzmanlık öğrencisi hiç rozet almaz.
- Kabuk/gami-ui: yeni rozetler katalogda ve doğru katmanda listelenir.

## Kabul
`pnpm turbo lint typecheck test` yeşil. `.egemed-run/summary.md`. COMMIT/MERGE/PUSH YOK.
