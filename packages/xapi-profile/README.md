# @egemed/xapi-profile — xAPI profili v0

Durum: **Önerildi.** "Kabul" durumuna yalnız insan geçirir
(`docs/specs/E0-temel.md`). **İnsan xAPI profilini onaylar (KARAR görevi:
T06).** Onay gelmeden bu profilin tüketicileri (xapi-client, T10, T11)
Running'e alınmaz.

Kapsam: fiil kataloğu, etkinlik tipleri, extension IRI'leri, activity IRI
üreticisi, opak aktör, Europe/Istanbul damgası ve saf `build*Statement`
üreticileri. Ağ/gönderim yoktur (ADR-004; gönderim `packages/xapi-client`
işidir). Simülatör-bağımsızdır; `sims/*` içe aktarılmaz.

## Fiil kataloğu (ADL, xAPI 1.0.3)

| Anahtar | IRI (`http://adlnet.gov/expapi/verbs/…`) | tr-TR | en-US |
|---|---|---|---|
| `initialized` | `initialized` | başlattı | initialized |
| `experienced` | `experienced` | deneyimledi | experienced |
| `answered` | `answered` | yanıtladı | answered |
| `progressed` | `progressed` | ilerledi | progressed |
| `completed` | `completed` | tamamladı | completed |
| `passed` | `passed` | geçti | passed |
| `failed` | `failed` | başarısız oldu | failed |
| `terminated` | `terminated` | sonlandırdı | terminated |

`terminated` v0'a öneriyle girer (research.md açık soru 2).

## Etkinlik tipleri (ADL)

| Anahtar | IRI (`http://adlnet.gov/expapi/activities/…`) |
|---|---|
| `simulation` | simülatör kökü |
| `module` | ekran |
| `interaction` | nesne/etkileşim |
| `assessment` | değerlendirme |

Extension anahtarları mutlak IRI'dir ve `PROFILE_IRI`
(`https://xapi.egemed.example/clix/v0`, yer tutucu — insan kararı) altındadır;
kurum LRS tabanı değildir.

## Activity IRI kuralı

`activityIri(base, path)` → `${base}${simulator}/${screen}/${object}`

- `base`: `https`, yetki dolu, sonda `/` zorunlu; sorgu ve fragment yasak.
- Segment: `^[a-z0-9][a-z0-9-]{0,62}$` (büyük harf, boşluk, `..`, `/` yasak).
- `object` yalnız `screen` varken kullanılabilir.
- Aynı girdi → aynı IRI; `id` üretilmez (determinizm için LRS'e bırakılır).

## KVKK kuralı (ADR-005)

- Aktör yalnız `account{homePage,name}` taşır; `name` opak kurum kimliğidir.
- E-posta, ad ve öğrenci numarası ifadeye girmez. `mbox`, `mbox_sha1sum`,
  `openid` ve ad alanları tiplerde bile yoktur.
- Opak kimlik biçimi `^[A-Za-z0-9._:-]{8,128}$`; `@` ve boşluk yasaktır.
  Biçim tek noktadan (`packages/xapi-profile/src/actor.ts`) ayarlanır
  (research.md açık soru 4).
- Kimliğin KAYNAĞI (LTI 1.3 / SCORM `cmi.learner_id`) bu profilde
  sabitlenmez; yalnız biçim kısıtlanır.

## Simülatör izolasyonu (ADR-003)

Her ifade tam olarak bir `SimulatorId` (`pulse`, `ausculta`, `opaca`) taşır:
`context.extensions[EXTENSIONS.simulatorId]`. Çoklu simülatör kabul eden veya
toplayan API yoktur.

## Zaman

`now: () => Date` enjekte edilir; `Date.now` yasaktır (lint). Damga
Europe/Istanbul, ofsetli ISO 8601'dir: `2026-09-23T14:05:00.000+03:00`.

## Ortam değişkenleri

`.env.example` içinde `XAPI_ACTIVITY_BASE_IRI=` ve `XAPI_ACTOR_HOMEPAGE=`
(değersiz) bulunur. Gerçek değer ve sırlar yalnız yerel `.env` dosyasındadır.

## Kapsam dışı (v0)

Activity `definition`, `id` üretimi, registration, attachments, JSON-LD profil
belgesi ve şema doğrulama kütüphanesi.

## Astra ikinci görüşü

Bekleniyor.
