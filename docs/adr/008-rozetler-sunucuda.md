# ADR-008 — Rozetler sunucuda değerlendirilir

- Durum: Öneri — depo sahibi yönlendirmesi (24 Eylül 2026): "rozet olayını sunucuya taşıyacağız". `Kabul` satırını insan yazar.
- Astra ikinci görüşü: Bekleniyor.
- İlgili: ADR-006 (tek platform), ADR-007 (kullanıcı verisi EGEMED DB'de), Astra denetimi API-05

## Bağlam

XP, düzey ve seri sunucuda hesaplanıyor (T96, migration 005). Rozetler ise her simin tarayıcı
deposunda (`packages/sim-*/src/gamification`) `evaluateBadges` ile hesaplanıyor. Sonuçlar:
cihaz/tarayıcı değişince rozetler kaybolur, istemci rozet üretebilir, dashboard gerçek rozeti bilmez.

Rozet motoru (`@egemed/gamification-core` `evaluateBadges`) geneldir. Sime özgü olan üç şey vardır:
katalog (`BadgeDef<Stats>[]`), istatistik türetimi (`computeStats(attempts)`) ve istatistiğin
dayandığı deneme alanları (Pulse: ritim serisi, doğru okunan derivasyon, kaliper isabeti, mod
ustalığı; Opaca/Ausculta: kendi alanları).

## Karar

1. **Sime özgü saf katalog paketi:** `packages/gami-catalogs` (DOM yok, yan etki yok) her sim için
   `{ catalog, rules, encodeSummary(attempt), statsFromSummaries(summaries) }` dışa aktarır. Simler
   yerel ekranları için bu paketi kullanır; API aynı paketi değerlendirme için kullanır.
2. **Kodlu özet sözleşmesi:** deneme gövdesindeki `summary` (kod → sınırlı tam sayı; serbest metin
   yok) rozet istatistiğinin tek kaynağıdır. Kodlar sim başına sabittir ve `encodeSummary` /
   `statsFromSummaries` çiftiyle sürümlenir. Ham öğrenci yanıtı gönderilmez (KVKK).
3. **Sunucu değerlendirmesi:** yeni deneme yazıldığında (idempotent tekrarda değil) sunucu
   kullanıcı×sim denemelerinin özetlerinden istatistiği türetir, `evaluateBadges` ile yeni rozetleri
   bulur ve `gami_badges`e `on conflict do nothing` ile yazar. Değerlendirme idempotenttir; kaçan bir
   yazım sonraki denemede tamamlanır. İstemcinin rozet iddiası kabul edilmez.
4. **Okuma:** API oturumunda simlerin rozet ekranları ve dashboard rozetleri sunucudan okur
   (`GET /me/gamification/:simId` rozet listesi; gerekirse tam liste ucu). API oturumu yoksa (sahte
   dev oturumu, yerel geliştirme) yerel değerlendirme sürer.
5. **Geçiş:** mevcut yerel rozetler sunucuya taşınmaz (istemci iddiası güvenilmez); sunucu, deneme
   geçmişinden yeniden hesaplar. Yeni eklenen rozet tanımları geçmiş denemelere de uygulanır.

## Dilimler

- S1: `packages/gami-catalogs` + Pulse kataloğu/istatistik/kodlu özet; sim-pulse bu paketi kullanır
  (eski `computePulseStats` ile altın eşitlik testi).
- S2: Opaca ve Ausculta katalogları aynı desene taşınır.
- S3: API değerlendirmesi (yazımda), rozet okuma ucu, PostgreSQL doğrulaması.
- S4: API oturumunda sim rozet ekranları ve dashboard sunucu rozetlerini gösterir; `reportAttempt`
  (T97) özetini `encodeSummary` ile üretir.

## Sonuçlar

- Rozetler hesap ve cihazlar arası kalıcıdır; istemci rozet üretemez.
- Katalog değişikliği hem sim hem API sürümünü etkiler; paket tek kaynaktır.
- Değerlendirme maliyeti kullanıcı×sim deneme sayısıyla doğrusal; deneme sayısı sınırlı tutulur.
