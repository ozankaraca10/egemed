# Test politikası

Kaynak: [openclaw test-audit](https://github.com/openclaw/openclaw/blob/main/.agents/skills/test-audit/SKILL.md) becerisinin EGEMED uyarlaması. Amaç: az ama değerli test; uygulama ayrıntısına bağlanan, daha güçlü bir testi tekrarlayan ya da yalnız test için üretim koduna açıklık isteyen testleri önlemek.

## 1. Yazım kapısı
Yeni bir test ancak şu dört soruyu yanıtlıyorsa eklenir (yanıtlar `.egemed-run/summary.md`'de kısaca yazılır):
1. Hangi gözlemlenebilir davranışı ya da sözleşmeyi koruyor?
2. Hangi gerçekçi hata bu testi kırar?
3. Mevcut testler bu hatayı neden yakalamıyor?
4. Yalnız test için üretim koduna açıklık (export, bayrak, kanca) gerektiriyor mu? Gerektiriyorsa yazma.

Hata düzelten test, düzeltme öncesi kodda kırılmalı, sonrasında geçmelidir. Aynı senaryoyu her katmanda (birim + API + e2e) tekrar etme; hatayı en ucuz yakalayan katmanda bir kez yaz.

**Şemalara danış (1 Eki 2026):** Test yazmadan önce `docs/sema/` altındaki ilgili şemayı (veritabani, urun, mimari, akislar) oku; testin iddiası şemadaki kurala dayanmalı. Şema ile kod çelişiyorsa testi koda göre değil, doğru kurala göre yaz ve çelişkiyi summary'de bildir. Değişikliğin şemayı etkiliyorsa şemayı aynı görevde güncelle.

## 2. Çöp desenler (kapıdan geçmez; denetimde kaldırılır ya da güçlendirilir)
- Hiçbir şeyi doğrulamayan ya da yalnız "hata fırlatmadı"yı doğrulayan test.
- Kendini kendisiyle karşılaştıran test (aynı fonksiyonun çıktısını beklenen değer olarak kullanma).
- Beklenen değeri fikstürden/kaynaktan kopyalayan test; test edilen davranışı sahtesinde (mock) yeniden yazan test.
- Arayüz metnini, açıklama cümlesini ya da kaynak kodunu birebir sabitleyen test (ürün kararı değişince anlamsızca kırılır).
- Bir bayrağın/yeteneğin varlığını yeniden ifade eden test; yalnız test altyapısını ayakta tutmak için var olan test.
- Aynı senaryoyu birden çok katmanda tekrar eden test (en güçlüsü kalır).

## 3. Bilinçli tutulan testler (çöp desenine benzese de DOKUNULMAZ)
- Güvenlik ve sızıntı taramaları: üretim çıktısında cevap anahtarı/gerekçe olmaması (T220 vb.), kaldırılmış istemci puan yolu kalıntısı taraması (T226), sırların repoya girmemesi.
- API yetki, rol, CSRF, hız sınırı ve oturum testleri.
- Sözleşme ve şema testleri (`packages/contracts`, API yanıt şemaları).
- Tıbbi veri doğrulama testleri: kayıt alanları, KVKK (yaş/ad/hasta no yok), eşleme ve kapsam sayıları, banka vakalarının cevaplanabilirliği.
- Migration, veritabanı (`test:db`) ve erişilebilirlik (axe, 44 px, yatay kaydırma) testleri.
- Taban kodda kırılan testler: silinmez, ürün hatası olarak raporlanır.

## 4. Denetim ve kampanya
- **Denetim:** mevcut testleri bölüm 2'ye göre tara; her bulgu için karar: kaldır / güçlendir (davranışa bağla) / birleştir / tut (gerekçe). Bölüm 3'tekilere dokunma.
- **Kampanya:** bir alt sistemin (ör. `tests/sim-ausculta`) test yüzeyini baştan sona ayıkla; kapsamı düşürmeden tekrar ve kırılganlığı azalt.
- Doğrulama: önce en dar kapsamda koş, sonra `pnpm turbo lint typecheck test` ve ilgili e2e. Üretim kodu yalnız test-only açıklığı kaldırmak için değişir; değişiklik özetinde test ve üretim satırlarını ayrı raporla.
- **Kapsam ölçümü:** `pnpm test:coverage` (vitest v8; özet `coverage/coverage-summary.json`, git dışı). Toplu test azaltmada test başına kapsam ölçülür, önce kapsama tek başına satır katmayan testler seçilir, bölüm 3 dosya ve test adıyla korunur; kayıp satır kapsamında en fazla 2 puan (29 Eyl 2026: 258 test kaldırıldı, satır −0,17, dal −1,81 puan; araçlar `egemed-tools/test-azaltma/`).
