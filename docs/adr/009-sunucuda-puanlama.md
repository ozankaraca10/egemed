# ADR-009 — Değerlendirme sunucuda puanlanır; cevap anahtarı istemciye gitmez

- Durum: Kabul
- Kabul eden: depo sahibi (canlı oturum), 2026-09-27 ("9-10 onaylıyorum").
- Yönlendirme: depo sahibi, 2026-09-26. Yapay zekâya karşı önlemlerde ilk adım olarak "Doğru cevap istemciye gitmesin, sunucu puanlasın" seçildi.
- Astra ikinci görüşü: Bekleniyor.
- İlgili: ADR-008 (bu ADR onun kalan riskini kapatır), ADR-010 (Meydan Okuma bu yola dayanır)

## Bağlam

Bugün üç simin vaka bankası cevap anahtarıyla birlikte tarayıcı paketine giriyor:
- Ausculta: `questions[].correct`.
- Opaca: `isAnswerCorrect` ve okuma bölgeleri.
- Pulse: vendored runtime içinde.

Puan istemcide `scoreCase` ile hesaplanıyor ve sunucuya kodlu özet olarak gidiyor (ADR-008). Bundan iki risk doğuyor:
- **Hile:** geliştirici araçları ya da bir yapay zekâ eklentisi, doğru cevabı paketten okuyabilir. Sahte özetle puan ve rozet üretilebilir.
- **Yapay zekâ ajanları:** DOM ve JS paketini okuyan bir ajan, cevabı görseli yorumlamadan kaynaktan çıkarabilir.

Ausculta ve Opaca'daki `scoreCase` saf ve deterministiktir, DOM kullanmaz; sunucuda aynen çalışabilir.

## Karar

1. **Sunucuya özel vaka bankası:**
   - `packages/assessment-bank` anahtarlı tanımları tutar: doğru seçenekler, bölge poligonları, ağırlıklar.
   - Bu paketi yalnız `apps/api` içe aktarır.
   - Kabuk ve sim paketlerinden bu pakete import yapılmasını bir sözleşme testi yasaklar.
2. **Genel vaka görünümü** (`contracts` → `PublicCase`):
   - İçerik: görsel, ses ya da EKG kimliği, soru metni ve seçenekler. Seçenek kimlikleri oturuma özel olarak karıştırılmış ve opaktır.
   - `correct`, bölge ve ağırlık alanları hiç gönderilmez.
3. **Oturum akışı:**
   - `POST /me/assessments/:simId/sessions`: sunucu havuzdan 10 vaka seçer, sırayı ve seçenek karışımını oturuma bağlar, vaka başı süreyi belirler.
   - `POST …/sessions/:id/answers`: süreyi sunucu kendi saatiyle ölçer, süresi dolmuş cevabı reddeder.
   - Kapanış: sunucu `scoreCase`'i anahtarla çalıştırır, kodlu özeti ve denemeyi kendisi yazar. Değerlendirme modunda istemci özeti artık kabul edilmez.
4. **Geri bildirim ve modlar:**
   - Değerlendirme modunda doğru cevap ve açıklama yalnız kapanış yanıtında gelir.
   - Öğrenme ve uygulama modları istemcide kalır. Bu modlarda anahtar öğretimin parçasıdır ve puan kaydedilmez; uygulama modundaki XP bir tavanla sınırlanır.
5. **Aşamalar:**
   - A1: iskelet, sözleşme ve oturum uçları (Ausculta).
   - A2: Opaca. Bölge isabeti sunucuda `geometry` fonksiyonlarıyla hesaplanır.
   - A3: Pulse. Host katmanı değerlendirme akışını sunucu oturumuna yönlendirir, gerekirse PATCHES ile.
   - A4: eski yol kapatılır. `attempts` değerlendirme modunda 410 döner.
6. **Ek sertleştirmeler** (ayrı görevler):
   - Vaka başı süre sınırı.
   - Görselde hafif rastgele kırpma, parlaklık ve kontrast; EKG'de hız ve derivasyon çeşitlemesi.
   - Sekme değiştirme, odak kaybı ve gerçek dışı hızlı yanıtlar "doğrulanmamış" olarak işaretlenir. Ceza verilmez; liderlik ve ödülde işaret olarak kullanılır.

## Sonuçlar

- **Olumlu:**
  - Paketten cevap okumak ve sahte özet göndermek işe yaramaz.
  - ADR-008'in kalan riski değerlendirme modunda kapanır.
  - Meydan Okuma aynı altyapıyı kullanır.
- **Olumsuz:**
  - Değerlendirme modu çevrimdışı çalışmaz.
  - 10 vakalık bir oturum yaklaşık 12 istek gerektirir.
  - Banka güncellemesi API sürümüne bağlanır.
- **Açık kalan:** bir yapay zekâ görseli doğrudan yorumlayabilir. Karşılığı süre sınırı, çeşitleme, davranış sinyalleri ve gerekirse gözetimli ödül oturumudur. Tam engel mümkün değildir; hedef maliyeti artırmak ve hileyi görünür kılmaktır.
- **KVKK:** sunucu yalnız seçenek kimliklerini ve süreyi saklar, serbest metin almaz.
