# ADR-010 — Meydan Okuma: eşzamansız, süreli düello

- Durum: Öneri
- Yönlendirme: depo sahibi, 2026-09-26. Önerilen biçim seçildi: "Eşzamansız düello; kod veya bağlantıyla davet, aynı 10 vaka aynı sırayla, süre sınırı; önce ADR". Öğretim üyesi katılamaz ve seçilemez.
- Astra ikinci görüşü: Bekleniyor.
- İlgili: ADR-006 (simler arası birleşik puan yok), ADR-007 (kullanıcı verisi), ADR-009 (sunucuda puanlama)

## Bağlam

Öğrenci bir arkadaşına meydan okuyup değerlendirme modunu onunla sınırlı süre içinde yapmak istiyor. Adil bir karşılaştırma için şunlar gerekir:
- İki taraf aynı vakaları aynı sırayla çözmeli.
- Süreyi ve puanı istemci değil sunucu ölçmeli.

KVKK gereği kullanıcı arama ya da öğrenci listesi olmamalı. Rakibin adı yalnız iki taraf arasında görünmeli.

## Karar

1. **Tek sim, eşzamansız:** bir düello tek bir sime aittir. Simler arası düello ya da birleşik puan yoktur (ADR-006). İki taraf farklı zamanlarda oynayabilir.
2. **Davet:**
   - Değerlendirme sonucu ekranında ya da simin "Meydan Oku" girişinde, sunucu 6 haneli bir kod ve imzalı bir bağlantı üretir.
   - Davet tek kullanımlıktır, 24 saat geçerlidir, en fazla bir rakip kabul eder.
   - Kullanıcı arama ve liste yoktur. Kodu paylaşmak davet edenin kendi eylemidir.
   - İsteğe bağlı olarak `challengeInvite` e-postası gönderilebilir (T170). Bunun için rakibin kurumsal kullanıcı adı yazılır; sunucu ad ya da e-posta bilgisini davet edene geri göstermez.
3. **Katılım kuralları:**
   - İki taraf da aynı kurumda ve o sime erişimi olan öğrenci olmalı.
   - `ogretim_uyesi` rolü ve ziyaretçiler davet oluşturamaz, kabul edemez. Kod girildiğinde 403 `role_not_permitted` döner.
   - Kişi kendi davetini kabul edemez.
   - Bir kullanıcının aynı anda en fazla 3 açık daveti olabilir, günde en fazla 10 düello yapılabilir (hız sınırı).
4. **Oturum:**
   - Düello, ADR-009'daki değerlendirme oturumunu kullanır. Vaka seti ve seçenek karışımı düelloya bağlıdır; her iki tarafa da aynısı verilir.
   - Süre: vaka başı sınır ve toplam 8 dakika. Süreyi sunucu ölçer.
   - Başlanıp bırakılan düello, süre dolunca kalan vakalar yanlış sayılarak kapanır.
5. **Sonuç:**
   - Önce doğru sayısı, eşitlikte toplam süre karşılaştırılır.
   - Sonuç ekranında iki tarafın vaka vaka sonucu ve açıklamalar yer alır. Açıklamalar yalnız iki taraf da bitirdikten sonra açılır.
   - Rövanş, aynı sim için yeni bir davettir.
   - Taraflara `challengeResult` e-postası ve uygulama içi bildirim gider.
6. **Oyunlaştırma:**
   - Düello puanı aylık liderliğe ve aylık ödüle girmez; hile teşviki oluşmaz.
   - Normal değerlendirme XP'sinin yarısı verilir.
   - "Düellocu" rozet ailesi eklenir (ilk düello, 5 galibiyet, 3'lük galibiyet serisi). Kolaydan zora sıralama kuralına uyar.
7. **Veri:**
   - Yeni tablolar: `challenges` (id, sim_id, inviter_id, code_hash, expires_at, status, case_set_seed) ve `challenge_participants` (challenge_id, user_id, session_id, score, duration_ms, finished_at).
   - Kod düz metin saklanmaz; hash olarak tutulur. Silinen kullanıcının kaydı anonimleşir.
8. **Aşamalar:**
   - M1: sözleşme ve migration.
   - M2: API uçları (oluştur, kabul et, durum, sonuç) ve testler.
   - M3: sim ve kabuk arayüzü (davet, kod girişi, bekleme ekranı, sonuç).
   - M4: rozetler ve e-posta bağlantısı.
   - M1'e başlamadan önce ADR-009'un A1 aşaması birleşmiş olmalı.

## Sonuçlar

- **Olumlu:**
  - İki tarafın aynı anda çevrimiçi olması gerekmez; gerçek zamanlı altyapı gerekmez.
  - Adillik sunucuda sağlanır.
  - KVKK uyumludur (arama yok).
- **Olumsuz:**
  - "Canlı" heyecanı yoktur. Canlı düello ileride WebSocket ile ikinci bir aşama olarak eklenebilir.
  - ADR-009'a bağımlıdır.
- **Risk:** iki kişi aynı ortamda birlikte oynayıp birbirine cevap söyleyebilir. Düello aylık ödüle girmediği için etkisi sınırlıdır.
