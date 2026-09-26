# E2 — Tek platform uygulama yol haritası

Durum: Uygulama planı. ADR-006 ve ADR-007 kabul edildi; K2 (xAPI profili) ve K3 (LRS yolu) 25 Eylül 2026'da kabul edildi (aşağıda). Açık kapı: üretim SSO protokolü (PLATFORM-04, ertelendi).

## Ürün sınırları

- Tek React kabuğu; Pulse, Ausculta ve Opaca ayrı rotalar, ayrı durum ve ayrı lazy modüllerdir. Motorları davranışları korunarak taşınır. Simler kendi başlarına başlatılıp sonlandırılabilir; bir simin durumu diğerine aktarılmaz.
- Kabuk, sim ekranları ve admin ekranları `@egemed/ui` ile `@egemed/tokens` ailesini kullanır. Simülatörün klinik etkileşimleri kendine özgü kalabilir; tipografi, navigasyon, kart, diyalog, odak ve erişilebilirlik kuralları ortaktır. Referans: `egemed-sim-ui-ux-framework`.
- Öğrenci deneyimi bağımsız platform olarak çalışır; not, ödev ve ders yönetimi platform kapsamı dışındadır. xAPI ifadesi tek `SimulatorId` taşır ve kurum LRS'sine gider; EGEMED ifade depolamaz.
- Admin alanı öğrenci simlerinden ayrıdır. Yetki sunucuda doğrulanır; arayüzde menü gizleme güvenlik sınırı sayılmaz. Kurum kimliği ve rol kaynağı ADR-007 (Önerildi) ile yeniden tanımlanır; ayrıntı `docs/specs/E3-kullanici-yonetimi.md`.

## Karar kapıları

1. **K1 Kimlik ve admin verisi:** **ADR-007 ile yeniden tanımlandı** (Önerildi). EGEMED kendi kullanıcı kaydını tutar; kullanıcılar admin tarafından tek tek ve toplu kaydedilir; üretim girişi kurum SSO'sudur ve EGEMED parola saklamaz. Rol modeli yalnız `admin` ve `kullanici`'dir; ek roller ve kurum/birim kapsamlı yetki park edildi (E3 §b). Oyunlaştırma verisi kullanıcı+sim başına EGEMED veritabanındadır ve üç simde de vardır (Opaca, Pulse, Ausculta); rozet kataloğu ve hedefler sim başına farklıdır. Kullanıcı ilerlemesini modül içinden ve platform dashboard'undan sim sekmeleriyle görür; simler arası toplam yoktur. xAPI ifadeleri kurum LRS'sine gitmeye devam eder ve aktör opak kalır (ADR-005'in xAPI kısmı geçerli). Ayrıntı ve açık insan kararları: `docs/specs/E3-kullanici-yonetimi.md`. ADR-007 kabul edilmeden kimlik uygulama görevleri Running'e alınmaz.
2. **K2 xAPI profili — KABUL (25 Eylül 2026):** `PROFILE_IRI`, activity base, `terminated` fiili, opak aktör kaynağı ve olay sözlüğü insan tarafından kabul edilir. K2 geçmeden üretim xAPI istemcisi/sim olay eşlemesi Running'e alınmaz.
3. **K3 LRS yolu — KABUL (25 Eylül 2026, öneri seçildi):** tarayıcıdan doğrudan iletim veya API vekili; sır dağıtımı, token süresi, CORS ve kurum LRS yetkileri kararlaştırılır. Öneri: kısa ömürlü kurum yetkisiyle API vekili; EGEMED veritabanında ifade/yeniden deneme kuyruğu yok.
4. **K4 Admin yetkileri:** iki rollü yetki matrisi (`admin`, `kullanici`) E3 §b'dedir; kimlerin kullanıcı rolü atayacağı ve ilk `admin` kurulum tohumu kurumca onaylanır. `platform_admin`, `kurum_admin`, `egitmen`, `denetci` ve içerik yöneticisi rolleri ile kurum/birim kapsamlı yetki park edildi; şemada/API'de/ekranda uygulanmaz.

## Alınan kararlar (23 Eylül 2026)

Depo sahibinin canlı oturumda verdiği kararlar; dilim etkileri envanterlerde (E2-opaca/pulse/ausculta
port envanterleri) işlendi.

- **K-P1 Paket yerleşimi:** Simülatör kodu `packages/sim-<id>` altına taşınır (sim-opaca, sim-ausculta,
  sim-pulse); `sims/*` arşiv/boş kalır.
- **Opaca varlıkları:** `public/assets/xray/runtime` (621 dosya / ~20 MB, kaynakta git-dışı) yerel
  kopyadan kopyalanır; import betikleriyle yeniden üretim yolu kullanılmaz.
- **Opaca test hedefi:** Platform hedefi **153 çalışma zamanı testi** (66 core + 87 gamification); `scripts/`
  hattı (veri üretimi + SCORM paketleme) ve 56 betik testi taşınmaz, kaynak depoda arşiv kalır; `jszip`/`sharp`
  eklenmez. Vaka seti yeniden üretilecekse kaynak depoda üretilip çıktı kopyalanır.
- **Oyunlaştırma:** Üç simde de (Opaca, Pulse, Ausculta) zorunlu dilimler halinde aktarılır — koşullu değil;
  ortak mantık (XP, seviye, seri, hedef, zaman, sıralama, ödül, grafik) `packages/gamification-core`'a, sim
  başına farklı rozet kataloğu/hedefler ve ekranlar sim paketine. Sim verileri birleşmez: her sim kendi
  oyunlaştırma deposunu tutar.
- **T11:** `packages/gamification-core` — sim-bağımsız oyunlaştırma çekirdeği; Opaca portuyla birlikte
  yürür, Pulse ve Ausculta da tüketicisidir (sim başına farklı rozet/hedef); sime özgü konfig ve ekranlar
  sim paketinde kalır.
- **Açık (insan onayı):** oyunlaştırma ve `bestScore` verisinin localStorage'da tutulması ADR-005 ile
  gerilimli; K-P3 kararına kadar depolama bir port arkasında kalır.

## Alınan kararlar (25 Eylül 2026)

Depo sahibi canlı oturumda bekleyen kararların hepsini kabul etti ("hepsi kabul"); SSO protokolü ertelendi.

- **ADR-008 Kabul:** rozetler sunucuda değerlendirilir; S1–S4 uygulandı.
- **K2 xAPI profili Kabul:** `packages/xapi-profile` v0 — `PROFILE_IRI` `https://egemed.ege.edu.tr/xapi/v0`, activity
  tabanı bu IRI altında, `terminated` fiili v0'da, aktör opak (ADR-005), olay sözlüğü sim olaylarından (T21). Üretim xAPI
  istemcisi ve sim olay eşlemesi (T22/T23) artık Running'e alınabilir.
- **K3 LRS yolu Kabul:** kısa ömürlü kurum yetkisiyle **API vekili**; tarayıcıya LRS sırrı verilmez; EGEMED veritabanında
  ifade/yeniden deneme kuyruğu yok; vekil ifade gövdesini kalıcı kayda veya uygulama günlüğüne yazmaz (ADR-004 Astra notu).
  Kurum LRS uç noktası ve kimlik bilgisi yapılandırmayla gelir; bilinene kadar geliştirme LRS'si kullanılır.
- **Pulse kaynak düzeltmesi:** `nextEvent` özyineleme düzeltmesi (sync yaması `PULSE-NEXTEVENT-RECURSION`) kaynak depoya da
  uygulanır; kaynağa uygulanınca yama listeden düşer.
- **Pulse T04 içerik tekrarı:** kaynak müfredattaki yinelenen VF içeriği çözülür (bkz. `E2-pulse-port-inventory.md` T04 kapısı).
- **"CLIX" adı:** klasör ve veritabanı adlarındaki eski ad değiştirilir.
- **SSO protokolü:** ertelendi (PLATFORM-04 açık).

## İş sırası ve görev sınırları

Her kod görevi tek paket/uygulama ve yaklaşık 400 satır diff hedefler. Sözleşmeler tüketicilerinden önce review ve depo sahibinin merge kapısından geçer. Aynı pakette eşzamanlı Running açılmaz.

| Aşama | Görev | Çıktı / kabul | Bağımlılık |
|---|---|---|---|
| 0 | T14a SimHost sözleşmesi | `mount(root, context) → dispose`, id, durum ömrü ve kaynak temizliği; sahte simle davranış testleri | ADR-006 |
| 0 | T14b Kabuk sim rotaları | Üç lazy rota, React host, yükleme/hata/çıkış durumları; mount/unmount testi | T14a merge |
| 1 | T20 Ortak sim çerçevesi | Sim başlığı, geri/çıkış, mod kartı, soru, geri bildirim, sonuç; token ve i18n; 360/768/1440 | T14b |
| 1 | T21 Sim olay sözlüğü | Sim başlatma, mod, etkileşim, yanıt, tamamlama için tipli olaylar; sim başına tek id; ağ yok | T14a, K2 taslağı |
| 2 | T15a Opaca envanter ve motor sınırı | Dosya/asset haritası; 153 kaynak testinin portta nasıl koşacağı; kopya lisans/atıf | T14b |
| 2 | T15b… Opaca port dilimleri | Mevcut React+TS uygulamasını ayrı modülde başlat/temizle; 153 regresyon testi yeşil; ilk çalışan rota | T15a, T20 |
| 2 | T16a… Opaca ortak UI uyumu | Mevcut React ekranlarını ekran ekran ortak çerçeveye/tokenlara uyarla; klinik motor sonuçları değişmez | T15b |
| 3 | T17a… Ausculta portu | Mevcut React ekranlarını modüle al; ses motoru/asset ömrü, kullanıcı etkileşimi ve temizleme; çalışan rota, kaynak regresyonu; oyunlaştırma dilimi Opaca sonrası (`packages/gamification-core` tüketicisi, kendi rozet/hedefleri) | T14b, T20 |
| 3 | T18a… Pulse portu | EKG motoru, animasyon/zamanlayıcı temizliği, test iskeleti; çalışan rota; oyunlaştırma dilimi Opaca sonrası (`packages/gamification-core` tüketicisi, kendi rozet/hedefleri) | T14b, T20 |
| 4 | T22 xAPI istemcisi | Yapılandırılmış endpoint/kimlik, gönderim, ağ hatası ve tekrar deneme politikası; sır sızdırma testi | K2, K3 |
| 4 | T23 Sim xAPI adaptörleri | Her simin olaylarını profildeki fiillere ayrı eşle; kodlu yanıt, opak aktör, tek `SimulatorId` | T21, T22, çalışan simler |
| 4 | T24 LRS entegrasyon testi | Geliştirme LRS'sine gerçek ifade; başarılı ve hatalı iletim; EGEMED'de kayıt tutulmadığını doğrula | T23 |
| 5 | T25 Kimlik ve yetki sözleşmesi | İki rollü (`admin`, `kullanici`) kimlik/yetki sözleşmesi, API kontrolü; rol değişimi ve erişim reddi testleri. Ayrıntı: E3 §a–§b, §d; dilim T60 | K1, K4 |
| 5 | T33a Giriş metinleri | Admin ve test öğrenci girişinin Türkçe i18n anahtarları; ortak hata/yardım metni | T20 |
| 5 | T33b Giriş ekranları | Masaüstü 50/50 sol logo/marka/slogan, sağ form; mobil dikey, 360/768/1440 ve klavye; gerçek auth iddiası yok | T33a merge |
| 5 | T33c Giriş bağlama | Admin kurum kimliği, geliştirmeye özel test öğrenci girişi, oturum/rol API kontrolü. Ayrıntı: E3 §a | T25, T33b, K1 |
| 5 | T26 Admin kabuğu | Ayrı `/admin` alanı, yetkili rota, gezinme, ortak UI; öğrenci kabuğundan ayrım. Ayrıntı: E3 §e | T25, T20 |
| 5 | T27 Kullanıcı ve rol ekranları | Arama/filtre, kullanıcı ayrıntısı, rol atama/geri alma (`kullanici`; `admin` elle), onay/hata/boş durum; her mutasyonda sunucu yetkisi. Ayrıntı: E3 §e–§f; dilimler T69–T71 | T25, T26 |
| 5 | T28 Rol ve erişim ekranları | İki rollü erişim matrisi, kişi bazlı sim erişimi, birim sınıflandırması (dönem/grup); park edilen kapsamlar. Ayrıntı: E3 §b–§c; dilim T71 | T27 |
| 5 | T29 İçerik ve sim yönetimi | Sim görünürlüğü, sürüm/sağlık, içerik ataması; klinik içerik onay akışı ayrı | T26, çalışan simler |
| 5 | T30 xAPI/LRS işletim ekranı | Bağlantı sağlığı, gönderim hatası, yapılandırma durumu; ham öğrenci ifadesi göstermeden | T24, T26 |
| 5 | T31 Denetim ve ayarlar | Admin eylem günlüğü, erişim reddi, kurum ayarları; saklama/maskeleme kararı | T25–T30 |
| 6 | T09 Mobil e2e | Öğrenci ve admin temel akışları 360/768/1440, klavye, 44 px, yatay taşma, WCAG 2.2 AA | Çalışan rotalar |
| 6 | T32 Yayın hazırlığı | `build`, dağıtım yapılandırması, ortam değişkeni doğrulaması, yedekleme/sürüm geri alma ve işletim kılavuzu | T09, K1–K4 |

E3 §h uygulama dilimleri **T60…T75** olarak numaralandı (T38…T52 aralığı premium kabuk hattında kullanılıyor); T25–T28 satırları bu dilimlerle beslenir. Kullanıcı dashboard'u (E3 §e.8) dilim **T74**'tür; E2'de ayrı görev açılmaz.

## Opaca port dilimleri — T15/T16 ayrıntısı

Opaca kaynağı zaten React+TS'tir. T15 ekranları yeniden React'e yazmaz; mevcut uygulamayı modül yapar. Gamification dilimleri Opaca portuyla birlikte zorunlu olarak aktarılır (Karar 23 Eyl 2026) ancak bayrak kapalı tutulur; kaynakta SCORM öğrenci adı ve localStorage profil/deneme verisi kullanımı ADR-005 ile uyumsuzdur.

1. `core/types.ts`, `geometry.ts`, `answers.ts` saf alan tipleri; ardından `flow.ts`, `scoring.ts`, `validation.ts`, `session.ts` ve kaynak testlerini küçük sentetik fixture'lara ayır.
2. Görüntü/veri sınırını ayrı işle: `images.ts`, `pool.ts`, ölçüm/bölge/terminoloji; JSON ve büyük varlıkları içerik topluca okunmadan kontrollü taşı. Mutlak `/assets` yollarını platform taban yolunda doğrula.
3. `events.ts`, `suspend.ts`, `scorm.ts` için önce runtime arayüzü çiz. SCORM parent/opener ve CMI yazımını doğrudan taşımadan xAPI olaylarına eşleme kararı K2/K3 sonrası verilir.
4. `store.tsx` dosyasını reducer ile provider/runtime yaşam döngüsü olarak böl. `Date.now()` çağrılarını enjekte edilen saate geçir; mount başına event bus, pagehide/listener/auto-flush cleanup ve idempotent dispose kur.
5. `ui/chrome.tsx`, ikonlar, diyaloglar, soru ve film bileşenlerini küçük gruplarla taşı. 651 satırlık `FilmViewer.tsx` pointer/etkileşim ve görünüm/kontrol parçalarına ayrılır.
6. Start/Mode/Tutorial ekranlarını birlikte; Results, Sources, Learn ekranlarını ayrı dilimlerde taşı. 458 satırlık Simulation ekranını oturum durumu ve görünüm parçalarına ayır. DevPanel üretim rotasına girmez.
7. Opaca `App.tsx`/StoreProvider için SimHost adaptörü yaz. Çift üst bar/footer oluşmasını engelle. Global `:root`, `body`, `button` ve genel sınıfları sim kökü altında kapsamlandır; CSS değişimi ayrı görevlerdir.
8. Kaynak 153 çalışma zamanı testini (66 core + 87 gamification) port boyunca semantik gruplarda yeşil tut; route mount→unmount→remount, StrictMode, listener/timer/ses temizliği ve iki opak aktör arasında yerel durum sızıntısı senaryolarını ekle.

## Ausculta ve Pulse port dilimleri — T17/T18 ayrıntısı

- **Ausculta** zaten React+TS'tir. Alan tipleri/akış; puanlama/oturum/çözücü; ses motoru; store reducer/provider; UI; ekranlar; CSS ve SimHost adaptörü ayrı dilimlerdir. Global AudioEngine singleton'ı modül oturumuna indirgenir; geç `fetch/decode` sonrası ses başlatma engellenir. `store.tsx`, `PatientStage`, `SimulationScreen` ve 1000+ satır CSS tek görevde taşınmaz. SCORM, localStorage ve `Date.now()` kullanımı portta ayrı karara bağlanır. Oyunlaştırma dilimi Opaca portu ve `packages/gamification-core` sonrası eklenir; Ausculta kendi rozet kataloğunu/hedeflerini taşır.
- **Pulse** düz JS/DOM uygulamasıdır. Önce `model.js` ve deterministik motor testleri; ardından curriculum/state ayrıştırma; root-parametreli controller ve RAF/interval/listener temizliği; özellik ekranları ve React giriş; CSS kapsamlandırma gelir. `app.js` fiziksel satır sayısı düşük ama yoğun kod taşır, görev boyutu mantıksal değişimle ölçülür. Global `window.CardAI*` ve belge çapı DOM aramaları modül oturumuna kapatılır. Oyunlaştırma dilimi Opaca portu ve `packages/gamification-core` sonrası eklenir; Pulse kendi rozet kataloğunu/hedeflerini taşır.

## Admin ekran haritası

- **Özet:** kurum/sim erişilebilirliği, son entegrasyon hataları, bekleyen yönetim işleri; bireysel öğrenci puanı yok.
- **Kullanıcılar:** EGEMED kullanıcı kaydında arama/filtreleme, rol görüntüleme, davet/etkinleştirme, toplu içe aktarma; ayrıntı E3 §e.
- **Roller ve erişim:** iki rollü matris (`admin`, `kullanici`), kişi bazlı sim erişimi, birim sınıflandırması (dönem/grup), yetki değişikliği onayı.
- **Simülatörler ve içerik:** modül durumu, sürüm, görünürlük, içerik ataması.
- **Entegrasyonlar:** LTI ve LRS bağlantı sağlığı, anahtarların yalnız durumu; sır değeri ekranda gösterilmez.
- **Denetim ve ayarlar:** yönetici eylemleri, kurum ayarları, saklama ve erişim politikası.
- **Giriş:** admin ve test öğrencisi için aynı marka ailesinde ayrı giriş yolları. Geniş ekranda sol yarı kurum logosu/EGEMED markası/slogan, sağ yarı form; mobilde dikey akış. Test öğrenci oturumu yalnız geliştirme ortamında sunulur. Kimlik doğrulama ADR-007/K1 ve E3 §a'ya bağlıdır.

## Yetki matrisi (ADR-007 ile güncellendi)

Bu matris K4 insan onayına dek uygulama yetkisi değildir. Tam matris ve kurallar `docs/specs/E3-kullanici-yonetimi.md` §b'dedir. EGEMED'de yerel parola ve ifade okuma API'si yoktur; kullanıcı listesi EGEMED kullanıcı kaydındadır (ADR-007).

| Rol | Görür / yapar | Göremez |
|---|---|---|
| `kullanici` | Yetkili simler ve kendi oyunlaştırma özeti (sim başına; dashboard sekmeleri) | Admin alanı, başka kullanıcı verisi |
| `admin` | Kullanıcı kaydı, rol/erişim ataması (`admin` yalnız elle), toplu içe aktarma/düzenleme, denetim günlüğü | Varsayılan olarak kullanıcı oyunlaştırma ayrıntısı, sırların açık değeri |

`platform_admin`, `kurum_admin`, `egitmen`, `denetci`, içerik yöneticisi, platform operasyonu ve destek rolleri ile kurum/birim kapsamlı yetki park edildi (E3 §b "Park edilenler"); şemada/API'de/ekranda uygulanmaz. `institutions`/`units` yalnız sınıflandırma/filtredir (dönem/grup); tek kurum varsayımı geçerlidir.

Admin UI rolü yalnız sunum için kullanır; her API isteği rolü sunucuda yeniden doğrular. Kimlik/kullanıcı API taslağı E3 §d'dedir. Entegrasyon odaklı API taslağı: `GET /admin/health`, `GET/PUT /admin/integrations/:id`, `GET/PUT /admin/modules/:simId`, `GET/PUT /admin/role-mappings`, `GET /admin/audit`. Gizli değerler yalnız yazılır, okuma yanıtında dönmez. Kurum dizini vekâleti isteğe bağlı entegrasyondur; kullanıcı kaydı EGEMED'dedir (ADR-007).

## Doğrulama ve denetim

- Her dilimde `pnpm turbo lint typecheck test`; çalışan sim portlarında kaynak davranış testleri; etkilenen rotalarda mobil e2e.
- Grok 4.7 High kod yürütür; Codex kod diff'ini, görev planını, test kanıtını ve riskleri bağımsız review eder. Luna mimari ikinci görüş verir.
- Review `VERDICT: APPROVE` veya `VERDICT: CHANGES` ile `.egemed-run/review.md` içine yazılır. Depo sahibi onayı olmadan merge yapılmaz.
