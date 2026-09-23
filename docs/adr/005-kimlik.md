# ADR-005: Kimlik ve öğrenci tanımlayıcısı

Durum: Kabul
Kabul eden: depo sahibi (canlı oturum), 2026-09-23
Tarih: 2026-09-23

## Bağlam
xAPI ifadeleri bir aktör tanımlayıcısı taşır. KVKK kapsamında özel nitelikli
sağlık verisi işleyen bu platformda öğrenci kimliği asgari düzeyde tutulmalıdır.
CLIX hesap ve not tutmaz; ders, ödev ve not defteri Moodle'dadır.

## Öneri
- CLIX hesap, oturum kaydı ve not tutmaz.
- Tanımlayıcı, Moodle başlatma bağlamından gelen **opak kurum kimliğidir**.
- E-posta, ad ve öğrenci numarası ifadeye girmez.
- Kaynak (LTI 1.3 veya SCORM `cmi.learner_id`) açık soru olarak kalır; bu
  ADR'de seçilmez.
- Eşleme yalnız kurum tarafında çözülebilir biçimde tasarlanır.

## Alternatifler
- **Anonim oturum:** her oturum rastgele kimlik alır; bireysel ilerleme ve
  raporlama kırılır.
- **Ham kullanıcı adı:** Moodle kullanıcı adı doğrudan ifadeye yazılır; kimlik
  ifşa olur ve KVKK ile çelişir.
- **E-posta:** doğrudan tanımlayıcı olarak kullanılır; gereksiz kişisel veri
  işlenir.

## Sonuçlar
- İfadelerde kişisel veri asgaridir; kurum dışına ham kimlik çıkmaz.
- Raporlama kurum tarafındaki eşleme tablosuna bağlıdır.
- Kaynak protokol netleşene kadar profil v0 tanımlayıcıyı sabitlemez.

## Açık sorular
- Tanımlayıcı kaynağı LTI 1.3 mü, SCORM `cmi.learner_id` mi olacak?
- Opak kimliğin üretimi ve yaşam döngüsü kimin sorumluluğunda?
- Kurum eşleme tablosunu hangi sistemde tutacak?

## Astra ikinci görüşü

- Opak `account.name` biçim denetimi kişisel veriden arınmayı tek başına kanıtlamaz; Moodle/kurum kaynağı ham ad, e-posta veya öğrenci numarasını göndermemelidir. Eşleme kurum tarafında kalmalıdır.
- Yeni admin ve kullanıcı yönetimi isteği bu ADR'deki “CLIX hesap/oturum tutmaz” kuralıyla uzlaştırılmalıdır. Öneri: kurum SSO/Moodle kimliği, sunucuda kurum kapsamlı rol/grup eşlemesi ve CLIX'te öğrenci roster'ı olmaması. Yerel kullanıcı/parola veritabanı istenirse ayrı ADR ve veri sahipliği kararı gerekir.
- Test öğrenci girişi yalnız sentetik geliştirme akışı olmalı; üretim aktör/oturum kaynağı sayılamaz. LTI/OIDC akışı, admin rol kaynağı ve kimlik yaşam döngüsü insan kararı olarak açık kalır.
