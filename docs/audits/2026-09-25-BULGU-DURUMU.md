# EGEMED — bulgu durumu (25 Eylül 2026 eki)

Bu belge, `docs/audits/2026-09-24-TEST-BULGULARI-VE-GOREVLER.md` (Astra'nın 24 Eylül 2026 denetim belgesi)
için hazırlanmış bir **durum ekidir**; kaynak belgeyi değiştirmez. Tarih: 25 Eylül 2026.

Durum, `dev` dalındaki `git log --oneline dev` çıktısı ve ilgili commit'lerin gövde/diff içeriği
taranarak derlendi. Denetimin baz aldığı commit `1b25103` (24 Eylül, 21:12) idi; bu ekte incelenen
tüm kapatma commit'leri o noktadan sonra `dev`'e birleşmiştir.

## Tablo

| Bulgu | Öncelik | Başlık (kısa) | Durum | Kapatan görev(ler) / commit | Not |
|---|---|---|---|---|---|
| PULSE-00 | P1 | Kaynak runtime üzerinden yeniden entegrasyon | Kapandı | T88 · `89e373d` | Şemsiye iş; kaynak `EGEMED_PULSE/cardai` betikleri değiştirilmeden gölge DOM'da çalıştırılıyor (`tools/sync-runtime.mjs`, yamalar `vendor/manifest.json`). Audit metninde "PULSE-01…11 alt kapsamını kapsar" deniyor. |
| PULSE-01 | P1 | EKG ve klinik bağlam | Kapandı (lider bilgisi) | T88 · `89e373d` (dolaylı) | Doğrudan "PULSE-01" etiketli commit yok; kaynak uygulama birebir çalıştığı için EKG sahneleri PULSE-00 kapsamında geliyor. Commit doğrudan eşlenemedi. |
| PULSE-02 | P1 | İnceleme araçları / öğretim akışı | Kapandı (lider bilgisi) | T88 · `89e373d` (dolaylı) | Aynı gerekçe: kaynak `app.js`/`features.js` birebir çalıştığından inceleme kontrolleri PULSE-00 ile geliyor. Doğrudan etiketli commit eşlenemedi. |
| PULSE-03 | P1 | Kalp animasyonu motorla eşzamanlı | Kapandı | T88 · `89e373d` | Commit başlığında açıkça "PULSE-03" etiketli. |
| PULSE-04 | P1 | Kaynak yerleşim / SVG-CSS eşleşmesi | Kapandı (lider bilgisi) | T88 · `89e373d` (dolaylı) | Kaynak `styles/sim.css`/`styles/responsive.css` gölge DOM'da birebir yüklendiği için yerleşim sorunu PULSE-00 ile kapanıyor. Doğrudan etiketli commit eşlenemedi. |
| PULSE-05 | P1 | 10 vakalık oturum tamamlanma ekranı | Kapandı | T88 · `89e373d` | Commit başlığında açıkça "PULSE-05" etiketli. |
| PULSE-06 | P1 | Sınav sonuç/tekrar/rapor akışı | Kapandı | T88 · `89e373d` | Commit başlığında açıkça "PULSE-06" etiketli. |
| PULSE-07 | P1 | Gözlem ilerlemesinin kaydı (yenileme/çıkış) | Kapandı (lider bilgisi) | T88 · `89e373d`; T95 · `7eb6877`, `5964732` (dolaylı) | T95 "tamamlanan vaka/sınav → deneme, İlerlemem diyaloğu" oyunlaştırma köprüsünü ekliyor; doğrudan "PULSE-07" etiketli commit yok, eşleme dolaylı. |
| PULSE-08 | P0 | Kullanıcılar arası kayıt paylaşımı | Kapandı | T88 · `89e373d` | Commit başlığında açıkça "PULSE-08" etiketli: kayıt kullanıcı×sim ad alanında. Aynı desen Opaca/Ausculta'da da uygulandı: T93 · `43af586`, T94 · `780db31`. |
| PULSE-09 | P1 | Sonuç güncelleme ↔ oyunlaştırma tutarlılığı | Kapandı (lider bilgisi) | T95 · `7eb6877`, `5964732` (dolaylı) | Commit gövdesinde "PULSE-09" etiketi yok; "Pulse oyunlaştırma köprüsü" başlığı bulgunun kapsamıyla örtüşüyor. Doğrudan etiketli commit eşlenemedi. |
| PULSE-10 | P2 | Klavye odağı / iç ekran erişilebilirliği | Kısmen (lider bilgisi: kapandı) | T88 · `4743cf2` (kısmi); T102 · `c952917`, `9f84f64`; T107 · `936f24a` (kısmi); T113 · `8a7e589`; ayrıca denetim sonrası T130 · `e1921ba7`, T131 · `633ad18`, T135 · `05ad8271`, T136 · `4dc950b` | Birden çok küçük dilimde ilerlemiş; commit gövdelerinde "PULSE-10" veya "kısmi" ibaresi açık. İç ekran axe testleri `e2e/pulse-a11y.spec.ts` (T102) ve `e2e/sims-a11y.spec.ts` (T116 · `afc8981`, Opaca/Ausculta) ile eklendi. |
| PULSE-11 | P2 | Öğretici/yardım ve oturum yönetimi | Kapandı (lider bilgisi) | T88 · `89e373d` (dolaylı) | Kaynak `landing.js`/`index.html` birebir çalıştığı için yardım/öğretici/CSV/sıfırlama kontrolleri PULSE-00 ile platforma geldi. Doğrudan "PULSE-11" etiketli commit eşlenemedi. |
| PLATFORM-01 | P1 | Sim rota değişiminde sonsuz yükleme | Kapandı | T88 · `89e373d` | Commit başlığında açıkça "PLATFORM-01" etiketli: SimHost `release(token)` ile gecikmeli dispose'un yeni mount'u iptal etmesi giderildi. |
| PLATFORM-02 | P1 | Admin/dashboard verisinin API'ye bağlanması | Kapandı | T89 · `6d14943`; T99 · `442a042` (docs) | Commit başlığında açıkça "PLATFORM-02" etiketli. |
| PLATFORM-03 | P1 | Ausculta'nın gerçek modülünün kabuğa bağlanması | Kapandı | T14e · `abcc4e3` (merge `1991372`) | Görev numarası "T14e" olsa da bu commit `1b25103`'ten (21:12) sonra, 21:32'de `dev`'e girdi — denetimden sonraki kapatma. `apps/shell/src/sims/loaders.ts` artık üç simi de gerçek modüle bağlıyor. |
| API-01 | P0 | API standart Node başlangıcı | Kapandı | T85 · `a3d1382` | Commit başlığında açıkça "API-01" etiketli; `docs/ops/ISLETIM.md` güncellemesi (T90) de teyit ediyor. |
| API-02 | P0 | Üretim Dockerfile çalışma zamanı dosyaları | Kapandı | T86 · `3c813e0`; T132 · `5f473a0`/`ed9bdf0` (doğrulama betiği + CI) | Commit başlığında açıkça "API-02" etiketli; T132 kabul doğrulamasını ekliyor. |
| API-03 | P0 | Sim erişim yetkisi (okuma/yazma/kabuk) | Kapandı | T92 · `13e1666`; T106 · `cc7f4c3` (UI) | Commit başlığında açıkça "API-03" etiketli. |
| API-04 | P1 | Attempt idempotency kullanıcı×sim kapsamı | Kapandı | T92 · `13e1666` | Aynı commit API-03 ile birlikte "API-04" etiketini de taşıyor. |
| API-05 | P1 | Oyunlaştırma yazımı ↔ profil/XP/seri/rozet | Kapandı | T96 · `ff7e7ca` | Commit başlığında açıkça "API-05" etiketli; migration 005. |
| API-06 | P1 | Attempt özet ve zaman doğrulaması | Kapandı | T87 · `ea02e4a` | Commit başlığında açıkça "API-06" etiketli. |
| API-07 | P1 | Toplu durum/birim işlem kimlikleri | Kapandı | T87 · `ea02e4a` | Aynı commit API-06 ile birlikte "API-07" etiketini de taşıyor. |
| PLATFORM-04 | P1 | Üretim kimlik entegrasyonu (SSO) | **AÇIK** | — | Kapatan commit yok; SSO protokol kararı kullanıcıda (depo sahibinde) bekliyor. `apiMode.ts`/`server.ts` üretimde hâlâ DEV/null adaptörle kapatılmış durumda olabilir; bu ek bunu tekrar doğrulamadı. |
| TEST-01 | P1 | Test kapılarını gerçek ürün akışına genişlet | Büyük ölçüde kapandı | T91 · `44cf3b8`; T98 · `bb58405`; T102 · `9f84f64`; T116 · `afc8981`; T143 | Kapsanan: iç ekran axe + 44 px kapıları (`e2e/pulse-a11y.spec.ts`, `e2e/sims-a11y.spec.ts`); Pulse 10 vaka/10 soru uçtan uca (`e2e/pulse-runtime.spec.ts` PULSE-05/06) ve API oturumunda sınav yazımı (`e2e/auth-api.spec.ts`); hesap değişimi/kayıt izolasyonu (`pulse-runtime` PULSE-08, `opaca-isolation`, `ausculta-isolation`); canlı API CRUD (kullanıcı oluşturma, erişim kaldırma) ve CSV içe aktarma (T143); Opaca denemesinin sunucuya yazımı (T143); `E2E_REQUIRE_API=1` ile API yoksa açık hata (`playwright.config.ts`); CI'da `e2e`, `api-e2e`, `api-db`, `prod-image` işleri; koşu başına `e2e-artifacts/<run-id>/`. Eksik: kaynak uygulama ile platformun otomatik yan yana (diferansiyel) karşılaştırması. |
| KAYNAK-01 | P2 | Kaynaktan devralınan puan/başarı çelişkisi | Kapandı | T105 · `1356372` | Commit başlığında açıkça "KAYNAK-01" etiketli: Pulse sınav durumu puan eşiğine bağlandı, modül tamamlama ayrı notla ayrıştırıldı. |

## Açık kalanlar

- **PLATFORM-04** tamamen açık: üretim SSO/kimlik entegrasyonu için protokol kararı depo sahibinden bekleniyor;
  kapatan görev yok.
- **TEST-01**'in eksik kısmı: kaynak uygulama ile platformun otomatik diferansiyel karşılaştırması
  (aynı senaryoyu iki sürümde koşup ekran/sonuç kıyaslayan test) yok; karşılaştırma Astra denetiminde elle yapıldı.
  Diğer kabul maddeleri (10 vaka/10 soru, hesap değişimi, canlı API CRUD/içe aktarma, zorunlu API hatası,
  koşu artefaktları) kapsandı — tabloya bakın.

## Bu belgeden sonra yapılanlar (T130–T143)

- **T130** (`e1921ba7`) — Opaca erişilebilirlik borcu küçültüldü (ihlal 11→5, küçük hedef 37→4).
- **T131** (`633ad18`) — Ausculta erişilebilirlik borcu küçültüldü (ihlal 7→2, küçük hedef 8→3).
- **T132** (`5f473a0`/`ed9bdf0`) — Üretim imajı doğrulama betiği ve CI işi (API-02 kabulü).
- **T133** (`c965827`) — Ausculta'ya kaynağın responsive kuralları taşındı (S17d).
- **T134/T137/T138** — Opaca, Ausculta ve Pulse'ta gömülü modda SCORM ifadesi metinlerden kaldırıldı.
- **T135** (`05ad8271`) — gami-ui rozet metni kontrastı ve 44 px sekme/segment düzeltmesi; sim izin
  listeleri boşaldı.
- **T136** (`4dc950b`) — Pulse seçenek etiketinden `role=radio` kaldırıldı (nested-interactive 5→0).
- **T139** (`9afacb2`) — Simlerde zorla tam ekran önerisi kaldırıldı; tam ekran yalnız bardaki ikonla.
- **T140** (`465c48c`) — Opaca konu/öğrenme sayaçları sunucu özetine taşındı (ADR-008 S4).
- **T141/T142** — bu durum eki ve README olgusal düzeltmeleri.
- **T143** — canlı API e2e: Opaca denemesinin sunucuya yazımı (öğrenme sayaçlarıyla) ve CSV içe aktarma; ortak sim akış yardımcıları (`e2e/sim-flows.ts`).

## Yöntem notu

Yukarıdaki eşlemeler `/Applications/Xcode.app/Contents/Developer/usr/bin/git log --oneline dev` ve
`git log dev --grep=<ID>` taramasıyla derlendi. Commit gövdesinde veya başlığında bulgu kimliği açıkça
geçenler "doğrudan etiketli" sayıldı; PULSE-00'ın kapsam ifadesinden ("PULSE-01…11 alt kapsamını kapsar")
ve ilgili commit içeriğinden çıkarılan eşlemeler "dolaylı" olarak işaretlendi. Hiçbir satır, git log'da
karşılığı bulunmayan bir commit kimliğiyle doldurulmadı.
