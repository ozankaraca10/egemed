# ADR-007: Kimlik, kullanıcı kaydı ve oyunlaştırma verisi

Durum: **Önerildi** — "Kabul" satırını yalnız insan yazar.
Kabul eden: (insan onayı bekleniyor)
Tarih: 2026-09-23
İlişkili: ADR-002, ADR-004, ADR-005, ADR-006; E2 K1 kapısı; ayrıntılı tasarım
`docs/specs/E3-kullanici-yonetimi.md`.

## Bağlam

ADR-005 "CLIX hesap, oturum kaydı ve not tutmaz" diyordu; ADR-002 de "öğrenci
veritabanı yoktur" diyerek bunu destekliyordu. Depo sahibi 23 Eylül 2026 canlı
oturumunda yönü değiştirdi:

- CLIX kendi kullanıcı kaydını tutar. Kullanıcılar admin tarafından tek tek ve
  toplu olarak kaydedilir. Kayıt sırasında kullanıcının **giriş tipi** seçilir;
  üretimde giriş tipi **SSO**'dur (kurum kimlik sağlayıcısı). CLIX parola
  saklamaz.
- Oyunlaştırma verisi (XP, seviye, seri, rozet, deneme özeti) **CLIX
  veritabanında, kullanıcı başına ve sim başına** saklanır. Simler arası
  birleştirme yoktur; her kayıt tek `sim_id` taşır. Oyunlaştırma üç simde de
  vardır (Opaca, Pulse, Ausculta); ortak kurallar, sim başına farklı rozet
  kataloğu ve hedefler geçerlidir.
- Kullanıcı ilerlemesini hem her modülün içinden hem de ana platform
  **dashboard'undan sim sekmeleriyle** (Opaca | Pulse | Ausculta) takip eder;
  dashboard simler arası toplam puan göstermez.
- xAPI ifadeleri kurum LRS'sine gitmeye devam eder; aktör opak kalır
  (ADR-005'in xAPI kısmı geçerlidir).

Bu karar E2 K1 kapısını ("kimlik ve admin verisi") ADR-007 olarak yeniden
tanımlar. ADR-005 dosyası tarihsel kayıt olarak değiştirilmez; hangi
maddelerinin kaldığı aşağıda açıkça listelenir.

## ADR-005 ile ilişki (madde madde)

| ADR-005 maddesi | Durum | Gerekçe |
|---|---|---|
| "CLIX hesap, oturum kaydı ve not tutmaz." | **Kısmen kalktı** | Hesap ve sunucu tarafı oturum kaydı CLIX'e geldi (bu ADR). "Not tutmaz" korunur: ders, ödev, not defteri ve notlar Moodle'da kalır. |
| "Tanımlayıcı, Moodle başlatma bağlamından gelen opak kurum kimliğidir." | **xAPI için korundu** | İfade aktörü opak kalır. CLIX hesabının eşleme anahtarı (kurum kullanıcı adı veya e-posta) ifadeye girmez; ilk SSO girişinde `sso_subject` bağlanır. |
| "E-posta, ad ve öğrenci numarası ifadeye girmez." | **Korundu** | `packages/xapi-profile` v0 aktör kuralı aynen sürer. |
| "Kaynak (LTI 1.3 veya SCORM `cmi.learner_id`) açık soru olarak kalır." | **Kapsam dışı kaldı** | ADR-006 ile SCORM gömme yolu kapandı. CLIX hesabının kaynağı kurum SSO'sudur; SSO protokolü açık insan kararıdır. xAPI aktörünün üretimi ve yaşam döngüsü açık soru olarak sürer. |
| "Eşleme yalnız kurum tarafında çözülebilir biçimde tasarlanır." | **Korundu** | CLIX kurum altyapısında çalışır; eşleme kurum kapsamındadır, kurumlar arası birleştirme yoktur. |
| Açık soru: "Opak kimliğin üretimi ve yaşam döngüsü kimin sorumluluğunda?" | **Açık** | E3 kullanıcı kaydında `xapi_actor_id` opaktır; üretim/yaşam döngüsü sorumluluğu insan kararı olarak sürer. |
| Açık soru: "Kurum eşleme tablosunu hangi sistemde tutacak?" | **Kısmen yanıtlandı** | Kurum kapsamlı eşlemeyi CLIX kullanıcı kaydı tutar; kurumun kendi tarafındaki eşleme insan kararıdır. |

Komşu ADR'lerde etkilenen maddeler (dosyaları bu görevde değiştirilmedi):

- **ADR-002:** "Veritabanı: Öğrenci veritabanı yoktur; CLIX öğrenci kaydı
  tutmaz." satırı ve "API ... öğrenci verisi barındırmaz." sonucu artık geçerli
  değildir. PostgreSQL 18 (T05 altyapısı) CLIX kullanıcı ve oyunlaştırma
  verisini barındırır.
- **ADR-004:** "CLIX ifade saklamaz; hiçbir veritabanı veya kuyruk ifade
  tutmaz." kuralı **korunur**. Oyunlaştırma kayıtları xAPI ifadesi değildir;
  ham ifade hiçbir tabloda tutulmaz.
- **ADR-006:** Veri izolasyonu korunur; oyunlaştırma kayıtları tek `sim_id`
  taşır, simler arası birleştirme yapılmaz.

## Öneri

1. **Kullanıcı kaydı CLIX'te:** `users` tablosu kurum, birim, eşleme anahtarı
   (kurum kullanıcı adı veya e-posta), görünen ad, giriş tipi, durum, opak
   `xapi_actor_id` ve zaman damgalarını taşır. Admin tek tek ve toplu (CSV)
   kaydeder; kendi kendine kayıt yoktur.
2. **Giriş tipi (`auth_method`):** üretimde `sso`; `dev` yalnız geliştirme
   ortamında. CLIX hiçbir koşulda parola saklamaz.
3. **SSO sağlayıcıdan bağımsız tasarlanır:** protokol (OIDC / SAML 2.0 / CAS)
   insan kararıdır. Kullanıcı eşleme anahtarı kurum kullanıcı adı veya
   e-postadır; ilk girişte IdP `subject` değeri `sso_subject` alanına bağlanır.
   Bilinmeyen SSO kullanıcısı, askıya alınmış ve silinmiş kullanıcı reddedilir.
4. **Oturum sunucu tarafındadır:** httpOnly çerez taşır; süreler E3'te önerilir
   ve insan kararıdır. Çerezde rol veya kimlik bilgisi taşınmaz.
5. **Roller (depo sahibi kararı, 23 Eyl 2026):** yalnız iki rol vardır:
   `admin` ve `kullanici`. Admin kullanıcı yönetiminin tamamını kullanır;
   kullanıcı yalnız yetkili simleri ve kendi oyunlaştırma verisini görür.
   Yetki her istekte sunucuda doğrulanır; arayüzde menü gizleme güvenlik sınırı
   değildir. Ek roller ve kurum/birim kapsamlı yetki **park edildi** (aşağıdaki
   "Park edilenler"); şemada, API'de ve ekranlarda uygulanmaz.
   `institutions`/`units` yalnız sınıflandırma ve filtre amaçlıdır (ör.
   dönem/grup), yetki kapsamı değildir; tek kurum varsayımı geçerlidir.
6. **Oyunlaştırma:** `gami_profiles` (`user_id` + `sim_id` PK), `gami_badges`
   ve `gami_attempts` (yalnız özet; ham yanıt yok) üç simin tümü için kayıt
   taşır. `badge_key` sim kapsamlıdır; rozet kataloğu ve hedefler sim başına
   farklıdır. Liderlik tablosu sim kapsamındadır. Kullanıcı ilerlemesini modül
   içinden ve platform dashboard'undan sim sekmeleriyle görür; simler arası
   toplam yoktur.
7. **xAPI:** ifadeler kurum LRS'sine gider; CLIX ifade saklamaz; aktör opaktır
   (ADR-004/005 korunur).
8. **KVKK:** aşağıdaki bölüm geçerlidir.

Ayrıntılı akış, rol matrisi, şema, API, ekranlar, CSV ve uygulama dilimleri
`docs/specs/E3-kullanici-yonetimi.md` içindedir.

## Park edilenler (gelecek genişleme — bu ADR kapsamında uygulanmaz)

Depo sahibi 23 Eylül 2026 kararıyla kapsam iki rolle sınırlandı. Aşağıdakiler
gelecek genişleme olarak park edilmiştir; şemada, API'de ve ekranlarda yer
almaz:

- Ek roller: `platform_admin`, `kurum_admin`, `egitmen`, `denetci` ve içerik
  yöneticisi.
- Kurum ve birim kapsamlı yetki: `user_roles.scope_unit_id`, birim bazlı
  `sim_access` kayıtları ve "kendi kurumu/birimi" görünürlük kuralları.
- Kurumlar arası izolasyon ve çok kurumlu sıralama; bugün tek kurum varsayımı
  geçerlidir (`institutions`/`units` yalnız sınıflandırma/filtre amaçlıdır).
- Liderlik tablosunda takma ad ve kurum geneli görünürlük.

## Alternatifler

- **Yalnız SSO/rol eşlemesi (roster yok):** CLIX yalnız IdP grup→rol eşlemesi
  tutar; kullanıcı listesi kurumdan gelir. Oyunlaştırma kullanıcı+sim bazında
  saklanamaz veya ayrı bir depo gerekir; admin toplu kayıt, sim erişimi ve
  denetim akışı zayıflar. Depo sahibi kararı bunu dışlar.
- **Yerel parola:** CLIX parola özeti saklar. Parola yönetimi, sıfırlama, MFA ve
  ihlal riski CLIX'e geçer; "CLIX parola saklamaz" kararıyla çelişir. Reddedildi.
- **LTI-only:** kimlik yalnız Moodle/LTI başlatmasından gelir. Öğrenci akışı
  için yeterli olabilir; admin girişi, platform yönetimi ve sim başına erişim
  için bağımsız oturum gerekir. Admin akışı için yetersiz; LTI bir entegrasyon
  yolu olarak insan kararına açık kalır.

## Sonuçlar

- CLIX, kullanıcı ve oyunlaştırma verisi barındıran bir uygulama olur. Veri
  sorumlusu/işleyen rolü ve hukuki dayanak **insan/hukuk kararıdır**.
- Yeni uygulama görevleri doğar: contracts, migration, API, admin UI, kullanıcı
  dashboard'u ve e2e (E3 §Uygulama dilimleri, T60…).
- Admin yetkisi sunucuda doğrulanır (ADR-002 Astra notu); oturum ve çerez
  güvenliği (CSRF, `Secure`, `SameSite`) uygulama gereksinimidir.
- Denetim günlüğü, yumuşak silme ve imha işi zorunlu hale gelir.
- Sim erişimi ve oyunlaştırma sim başına ayrık kalır; ADR-006 izolasyonu korunur.
- Moodle ders/ödev/not akışı değişmez; CLIX not tutmaz.

## KVKK

- **Veri minimizasyonu:** kayıt yalnız eşleme anahtarı (kullanıcı adı veya
  e-posta), görünen ad, kurum/birim, rol, giriş tipi, `sso_subject`, durum, son
  giriş zamanı ve opak `xapi_actor_id` taşır. Parola, öğrenci numarası, telefon,
  doğum tarihi, sağlık verisi ve ham sınav yanıtı saklanmaz.
- **Amaç:** kimlik doğrulama, yetkilendirme ve sim erişimi; oyunlaştırma
  ilerlemesi; güvenlik ve denetim. Amaç dışı kullanım yasaktır.
- **Özel nitelikli sağlık verisi işlenmez:** simülasyon içeriği ve senaryolar
  sentetiktir; öğrenci yanıtları yalnız kodlu özet olarak saklanır, ham yanıt
  tutulmaz.
- **Aydınlatma:** KVKK m.10 aydınlatma metni gereklidir. Metni hangi tarafın
  (kurum / CLIX) sunduğu ve hukuki dayanak insan/hukuk kararıdır.
- **Saklama ve imha (öneri — süreler insan kararı):** oturum kayıtları süre
  sonunda silinir; içe aktarma ham satırları kısa süre sonra imha edilir; silinen
  kullanıcının erişimi anında kesilir ve saklama penceresi sonunda
  anonimleştirilir; denetim günlüğü yasal süre boyunca tutulur.
- **Silme/anonimleştirme akışı:** yumuşak silme → oturum iptali ve erişim kesme
  → saklama penceresi → anonimleştirme işi (eşleme anahtarı, görünen ad ve
  `sso_subject` temizlenir; `xapi_actor_id` yeni rastgele değerle döndürülür;
  oyunlaştırma kayıtları silinir veya anonimleştirilir — insan kararı) → denetim
  kaydı.
- **Veri sahipliği:** kayıtlar kurum altyapısında çalışan CLIX'te kalır;
  kurumlar arası birleştirme ve dışa aktarım yoktur.

## Açık sorular / insan kararları

- SSO protokolü (OIDC / SAML 2.0 / CAS) ve kurum IdP bilgileri.
- Saklama ve imha süreleri (oturum, staging, denetim, hesap, oyunlaştırma).
- Öğrencinin kendi oyunlaştırma verisini silme hakkı ve kapsamı.
- Liderlik tablosunda ad mı, takma ad mı; öğrenciye açık mı, yalnız admin mi.
- İlk `admin` kaydının oluşturulması (kurulum tohumu / acil erişim).
- KVKK rolü: veri sorumlusu mu, veri işleyen mi; aydınlatma metni sahibi.
- Oturum süreleri (boşta kalma / mutlak üst sınır).

## Astra ikinci görüşü

Bekleniyor. Kritik ADR (kimlik, KVKK, paketler arası sözleşme); bulgular
gelene kadar karar kaydı tamamlanmış sayılmaz ve "Kabul" durumuna geçmez.
