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

Bekleniyor.
