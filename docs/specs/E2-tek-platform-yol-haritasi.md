# E2 — Tek platform uygulama yol haritası

Durum: Uygulama planı. ADR-006 kabul edildi; kimlik, xAPI profil sabitlemesi ve üretim LRS bağlantısı için aşağıdaki karar kapıları geçerlidir.

## Ürün sınırları

- Tek React kabuğu; Pulse, Ausculta ve Opaca ayrı rotalar, ayrı durum ve ayrı lazy modüllerdir. Motorları davranışları korunarak taşınır. Simler kendi başlarına başlatılıp sonlandırılabilir; bir simin durumu diğerine aktarılmaz.
- Kabuk, sim ekranları ve admin ekranları `@egemed/ui` ile `@egemed/tokens` ailesini kullanır. Simülatörün klinik etkileşimleri kendine özgü kalabilir; tipografi, navigasyon, kart, diyalog, odak ve erişilebilirlik kuralları ortaktır. Referans: `egemed-sim-ui-ux-framework`.
- Öğrenci deneyimi kurum Moodle/LTI bağlamında çalışır. Not, ödev ve ders yönetimi Moodle'da kalır. xAPI ifadesi tek `SimulatorId` taşır ve kurum LRS'sine gider; CLIX ifade depolamaz.
- Admin alanı öğrenci simlerinden ayrıdır. Yetki sunucuda doğrulanır; arayüzde menü gizleme güvenlik sınırı sayılmaz. Kurum kimliği ve rol kaynağı kararı ADR-005 güncellemesiyle sabitlenir.

## Karar kapıları

1. **K1 Kimlik ve admin verisi:** ADR-005'teki “CLIX hesap/oturum tutmaz” kuralıyla kullanıcı yönetimi isteğini uzlaştır. Öneri: kurum SSO/Moodle kimliği, CLIX'te yalnız kurumca yönetilen rol/erişim eşlemesi; ham öğrenci profilini tutma. Depo sahibi farklı bir hesap modeli seçerse ayrı ADR ve veri şeması gerekir.
2. **K2 xAPI profili:** `PROFILE_IRI`, activity base, `terminated` fiili, opak aktör kaynağı ve olay sözlüğü insan tarafından kabul edilir. K2 geçmeden üretim xAPI istemcisi/sim olay eşlemesi Running'e alınmaz.
3. **K3 LRS yolu:** tarayıcıdan doğrudan iletim veya API vekili; sır dağıtımı, token süresi, CORS ve kurum LRS yetkileri kararlaştırılır. Öneri: kısa ömürlü kurum yetkisiyle API vekili; CLIX veritabanında ifade/yeniden deneme kuyruğu yok.
4. **K4 Admin yetkileri:** kurum yöneticisi, içerik yöneticisi, eğitmen ve salt okunur denetçi yetki matrisi; kimlerin kullanıcı rolü atayacağı ve hangi kurum verisini göreceği kurumca onaylanır.

## İş sırası ve görev sınırları

Her kod görevi tek paket/uygulama ve yaklaşık 400 satır diff hedefler. Sözleşmeler tüketicilerinden önce review ve depo sahibinin merge kapısından geçer. Aynı pakette eşzamanlı Running açılmaz.

| Aşama | Görev | Çıktı / kabul | Bağımlılık |
|---|---|---|---|
| 0 | T14a SimHost sözleşmesi | `mount(root, context) → dispose`, id, durum ömrü ve kaynak temizliği; sahte simle davranış testleri | ADR-006 |
| 0 | T14b Kabuk sim rotaları | Üç lazy rota, React host, yükleme/hata/çıkış durumları; mount/unmount testi | T14a merge |
| 1 | T20 Ortak sim çerçevesi | Sim başlığı, geri/çıkış, mod kartı, soru, geri bildirim, sonuç; token ve i18n; 360/768/1440 | T14b |
| 1 | T21 Sim olay sözlüğü | Sim başlatma, mod, etkileşim, yanıt, tamamlama için tipli olaylar; sim başına tek id; ağ yok | T14a, K2 taslağı |
| 2 | T15a Opaca envanter ve motor sınırı | Dosya/asset haritası; 119 kaynak testinin portta nasıl koşacağı; kopya lisans/atıf | T14b |
| 2 | T15b… Opaca port dilimleri | Motoru ve ekranları ayrı modülde başlat/temizle; 119 regresyon testi yeşil; ilk çalışan rota | T15a, T20 |
| 2 | T16a… Opaca React ekranları | Ekran ekran ortak çerçeveye uyum; klinik motor sonuçları değişmez | T15b |
| 3 | T17a… Ausculta portu | Ses motoru/asset ömrü, kullanıcı etkileşimi ve temizleme; çalışan rota, kaynak regresyonu | T14b, T20 |
| 3 | T18a… Pulse portu | EKG motoru, animasyon/zamanlayıcı temizliği, test iskeleti; çalışan rota | T14b, T20 |
| 4 | T22 xAPI istemcisi | Yapılandırılmış endpoint/kimlik, gönderim, ağ hatası ve tekrar deneme politikası; sır sızdırma testi | K2, K3 |
| 4 | T23 Sim xAPI adaptörleri | Her simin olaylarını profildeki fiillere ayrı eşle; kodlu yanıt, opak aktör, tek `SimulatorId` | T21, T22, çalışan simler |
| 4 | T24 LRS entegrasyon testi | Geliştirme LRS'sine gerçek ifade; başarılı ve hatalı iletim; CLIX'te kayıt tutulmadığını doğrula | T23 |
| 5 | T25 Kimlik ve yetki sözleşmesi | Kurum bağlamı, roller, yetki matrisi, API kontrolü; rol değişimi ve erişim reddi testleri | K1, K4 |
| 5 | T26 Admin kabuğu | Ayrı `/admin` alanı, yetkili rota, gezinme, ortak UI; öğrenci kabuğundan ayrım | T25, T20 |
| 5 | T27 Kullanıcı ve rol ekranları | Arama/filtre, kullanıcı ayrıntısı, rol atama/geri alma, onay/hata/boş durum; her mutasyonda sunucu yetkisi | T25, T26 |
| 5 | T28 Kurum ve erişim ekranları | Kurum/birim kapsamı, sim erişimi, eğitimci yetkisi; kurumlar arası izolasyon | T27 |
| 5 | T29 İçerik ve sim yönetimi | Sim görünürlüğü, sürüm/sağlık, içerik ataması; klinik içerik onay akışı ayrı | T26, çalışan simler |
| 5 | T30 xAPI/LRS işletim ekranı | Bağlantı sağlığı, gönderim hatası, yapılandırma durumu; ham öğrenci ifadesi göstermeden | T24, T26 |
| 5 | T31 Denetim ve ayarlar | Admin eylem günlüğü, erişim reddi, kurum ayarları; saklama/maskeleme kararı | T25–T30 |
| 6 | T09 Mobil e2e | Öğrenci ve admin temel akışları 360/768/1440, klavye, 44 px, yatay taşma, WCAG 2.2 AA | Çalışan rotalar |
| 6 | T32 Yayın hazırlığı | `build`, dağıtım yapılandırması, ortam değişkeni doğrulaması, yedekleme/sürüm geri alma ve işletim kılavuzu | T09, K1–K4 |

## Admin ekran haritası

- **Özet:** kurum/sim erişilebilirliği, son entegrasyon hataları, bekleyen yönetim işleri; bireysel öğrenci puanı yok.
- **Kullanıcılar:** kurum dizininden gelen kullanıcıları arama, rol ve kapsam görüntüleme; seçilen kimlik modeline göre davet/etkinleştirme.
- **Roller ve erişim:** rol matrisi, sim bazlı erişim, birim kapsamı, yetki değişikliği onayı.
- **Simülatörler ve içerik:** modül durumu, sürüm, görünürlük, içerik ataması.
- **Entegrasyonlar:** Moodle/LTI ve LRS bağlantı sağlığı, anahtarların yalnız durumu; sır değeri ekranda gösterilmez.
- **Denetim ve ayarlar:** yönetici eylemleri, kurum ayarları, saklama ve erişim politikası.

## Önerilen ilk yetki matrisi

Bu matris K1/K4 kararı verilene dek uygulama yetkisi değildir. CLIX'te yerel parola, öğrenci listesi ve ifade okuma API'si öngörmez.

| Rol | Görür / yapar | Göremez |
|---|---|---|
| Öğrenci | Moodle/LTI bağlamında yetkili sim | Admin alanı |
| Eğitmen | Ders/ödev/not için Moodle; ileride kurum LRS raporu ayrı karar | CLIX admin ve başka ders/kurum |
| Kurum yöneticisi | Kendi kurum entegrasyon sağlığı, IdP grup→rol eşlemesi, sim erişimi | Ham öğrenci ifadesi, başka kurum, sırların açık değeri |
| Platform operasyonu | Dağıtım/sim sürümü ve anonim sağlık ölçümleri | Varsayılan olarak öğrenci/ifade içeriği |
| Destek | Salt okunur sağlık ve anonim hata kimliği | Konfigürasyon yazma ve öğrenme verisi |

Admin UI rolü yalnız sunum için kullanır; her API isteği rol ve kurum kapsamını sunucuda yeniden doğrular. İlk API taslağı: `GET /admin/health`, `GET/PUT /admin/integrations/:id`, `GET/PUT /admin/modules/:simId`, `GET/PUT /admin/role-mappings`, `GET /admin/audit`. Gizli değerler yalnız yazılır, okuma yanıtında dönmez. Kurum dizini bağlantısı kabul edilirse kullanıcı araması kuruma vekâlet eden uç noktadan yapılır; CLIX roster veritabanı tutulmaz.

## Doğrulama ve denetim

- Her dilimde `pnpm turbo lint typecheck test`; çalışan sim portlarında kaynak davranış testleri; etkilenen rotalarda mobil e2e.
- Grok 4.7 High kod yürütür; Codex kod diff'ini, görev planını, test kanıtını ve riskleri bağımsız review eder. Luna mimari ikinci görüş verir.
- Review `VERDICT: APPROVE` veya `VERDICT: CHANGES` ile `.egemed-run/review.md` içine yazılır. Depo sahibi onayı olmadan merge yapılmaz.
