# Pulse — Patern 14–23 tıbbi validasyon kaydı (EKG motoru)

- Durum: Motor uygulandı (T204); **Kardiyoloji ABD öğretim üyesi onayı bekliyor.**
- Kapsam: 10 yeni EKG paterni için sinyal motoru ve kalp/iletim animasyonu. Soru havuzu ve açıklama metinlerinin madde düzeyi kaydı ayrı görevde bu dosyaya eklenir.
- Karar: Pulse runtime'ı platform kaynağıdır (ADR-011).
- Kod: `packages/sim-pulse/src/runtime/vendor/model.js` (`PATTERN_MODES`, `patternFiducials`, `patternRR`, `atrialEvents`, `patternSignal`, `patternState`), `app.js` (`renderConduction`, içerik kartları), `markup.js` (iletim katmanı öğeleri).
- Otomatik QC: `tests/sim-pulse/patterns-14-23.test.ts`.

> **Önemli ayrım:** Aşağıdaki "simülasyon parametresi" sütunundaki sayılar öğretici görünürlük için seçilmiş **tasarım değerleridir**, tanı ölçütü değildir. Örneğin "PAC arası 5–8 sinüs atımı" bir tanı kriteri değildir; yalnız simülasyonun erken atımı ne sıklıkla gösterdiğidir.

## Ortak ilkeler

- **Tek küresel zaman çizelgesi.** Atriyal olaylar (P) ve ventriküler olaylar (QRS–T) tek bir zaman çizelgesinde üretilir.
  - D1 ve D2 bu olaylardan hesaplanır.
  - D3, aVR, aVL ve aVF, Einthoven/Goldberger bağıntılarıyla D1 ve D2'den türetilir.
  - V1–V6 aynı olayların prekordiyal projeksiyonlarıdır.
  - Bu nedenle bir derivasyonda düşen bir atım, başka bir derivasyonda QRS olarak görünemez (testle korunur).
- **Mevcut 13 ritim değişmedi.** Eski ve yeni motor 13 mod × 12 derivasyonda 360.048 örnekte karşılaştırıldı; fark 0.
- **Kalp ve iletim animasyonu** `snapshot().conduction` üzerinden aynı zaman çizelgesini okur. Gösterdiği olaylar:
  - AV düğümde bekleme (PR boyunca ışıma)
  - İletilmeyen P (kırmızı "AV blok")
  - Ventriküler kaçış odağı
  - Ektopik atriyal odak
  - Kavşak odağı ve retrograd atriyal aktivasyon
  - Aksesuar yol (şematik; yolun gerçek yerleşimini EKG'den kesin belirlediği izlenimi verilmez)

## Patern tabloları

### 14 · Sinüs Bradikardisi — Sinus Bradycardia (`sinbrady`)

| Alan | İçerik |
|---|---|
| Temel EKG kriteri | Sinüs kaynaklı P, P:QRS 1:1, hız <60/dk |
| Simülasyon parametresi | R–R 1,25 s (±0,02 s sinüs değişkenliği) ≈ 48/dk; PR 160 ms sabit; QRS 80 ms |
| Ayırıcı özellik | Her QRS'in önünde sinüs P'si ve sabit PR. Kavşak ritminde önde sinüs P'si yoktur; tam AV blokta P ile QRS ilişkisizdir. |
| Kaynak | Kusumoto ve ark. 2018 ACC/AHA/HRS, DOI 10.1161/CIR.0000000000000628 |

### 15 · 1. Derece AV Blok — First-degree AV Block (`avb1`)

| Alan | İçerik |
|---|---|
| Temel EKG kriteri | PR >200 ms, her P iletilir (1:1) |
| Simülasyon parametresi | ≈63/dk; PR 260 ms sabit; QRS 80 ms; iletilmeyen P yok |
| Ayırıcı özellik | P:QRS 1:1 korunur. PR uzayıp bir P düşüyorsa Mobitz I'dir. |
| Kaynak | Kusumoto 2018 (DOI 10.1161/CIR.0000000000000628); Mason 2007, DOI 10.1016/j.jacc.2007.01.025 |

### 16 · 2. Derece AV Blok – Mobitz Tip I (Wenckebach) — Second-degree AV Block, Mobitz I (`mobitz1`)

| Alan | İçerik |
|---|---|
| Temel EKG kriteri | Düzenli P; iletilen atımlarda PR giderek uzar, bir P iletilmez; düşüşten sonra PR kısalır |
| Simülasyon parametresi | P–P 750 ms (80/dk); 4:3 döngü, PR 160 → 220 → 260 ms, ardından iletilmeyen P. R–R: 810, 790, 1400 ms (düşen atımı içeren duraklama < 2×P–P). QRS 80 ms. |
| Ayırıcı özellik | Düşüş öncesi PR en uzun, sonrası en kısa. Mobitz II'de iletilen atımlarda PR sabittir. |
| Kaynak | Kusumoto 2018 (DOI 10.1161/CIR.0000000000000628) |

### 17 · 2. Derece AV Blok – Mobitz Tip II — Second-degree AV Block, Mobitz II (`mobitz2`)

| Alan | İçerik |
|---|---|
| Temel EKG kriteri | Düzenli P; iletilen atımlarda PR sabit; önceden uzama olmadan iletilmeyen P |
| Simülasyon parametresi | P–P 800 ms (75/dk); 4:3 döngü; PR 180 ms sabit; QRS 120 ms. QRS genişliği tanı ölçütü olarak kullanılmaz; dar QRS Mobitz II'yi dışlamaz. |
| Ayırıcı özellik | Sabit PR ve beklenmedik iletilmeyen P. Yalnız 2:1 iletim varsa Mobitz I ve II yüzey EKG'sinden kesin ayrılamaz. Bu pakete 2:1 AV blok eklenmedi. |
| Kaynak | Kusumoto 2018 (DOI 10.1161/CIR.0000000000000628); Glikson ve ark. 2021 ESC, DOI 10.1093/eurheartj/ehab364 |

### 18 · 3. Derece AV Blok (Tam AV Blok) — Third-degree (Complete) AV Block (`chb`)

| Alan | İçerik |
|---|---|
| Temel EKG kriteri | AV dissosiyasyon: atriyal hız ventriküler hızdan yüksek, P ile QRS arasında sabit ilişki yok |
| Simülasyon parametresi | İki bağımsız saat. Atriyum P–P 720 ms (≈83/dk); ventriküler kaçış R–R 1600 ms (≈38/dk). Oranları tam sayı değildir, bu yüzden P'ler QRS ve T'ye göre kayar. Kaçış QRS'i 140 ms, T uyumsuz. PR tanımsızdır (ölçülmez). |
| Ayırıcı özellik | Hiçbir P sistematik olarak QRS'i izlemez; P'ler QRS veya T içine gömülebilir. Kavşak kaçış ritminde bağımsız sinüs P treni yoktur. |
| Kaynak | Kusumoto 2018 (DOI 10.1161/CIR.0000000000000628); Glikson 2021 (DOI 10.1093/eurheartj/ehab364) |

### 19 · Atriyal Erken Atım (PAC) — Premature Atrial Contraction (`pac`)

| Alan | İçerik |
|---|---|
| Temel EKG kriteri | Beklenen sinüs P'sinden erken, sinüs dışı biçimli P; çoğunlukla dar iletilen QRS |
| Simülasyon parametresi | Temel sinüs 72/dk. Erken atımlar arası 5, 6, 7, 6, 8, 5 sinüs atımlık döngü (tasarım parametresi). Bağlaşım ≈560 ms. Ektopik P: V1'de negatif, D2'de basık; PR 150 ms; QRS 80 ms. Erken atım sonrası R–R 900–970 ms, yani tam kompansatuvar değil (sinüs düğümü sıfırlanır). |
| Ayırıcı özellik | Önde farklı biçimli P ve dar QRS. PVC'de ilişkili P olmadan erken, geniş QRS görülür. İletilmeyen ve aberran PAC varyantları temel örnekte kullanılmadı. |
| Kaynak | Mond ve Haqqani 2019, DOI 10.1016/j.hlc.2019.03.005; Mason 2007, DOI 10.1161/CIRCULATIONAHA.106.180201 |

### 20 · AV Kavşak Kaçış Ritmi — Junctional Escape Rhythm (`junctional`)

| Alan | İçerik |
|---|---|
| Temel EKG kriteri | Düzenli, 40–60/dk, dar QRS; önde normal sinüs P'si yok |
| Simülasyon parametresi | R–R 1280 ms (≈47/dk); QRS 80 ms. Tek fenotip seçildi: retrograd P, QRS bitiminden ≈75 ms sonra (ST segmentinde). Retrograd P eksenindeki üst-sol yönelim nedeniyle D2, D3 ve aVF'de negatif, aVR'de pozitiftir. |
| Ayırıcı özellik | Retrograd P kendi QRS'ine bağlıdır; tam AV bloktaki bağımsız P treni üretilmez. |
| Kaynak | Mason 2007 (DOI 10.1161/CIRCULATIONAHA.106.180201); Kusumoto 2018 |

### 21 · Ventriküler Preeksitasyon (WPW Paterni) — Ventricular Pre-excitation (WPW Pattern) (`wpw`)

| Alan | İçerik |
|---|---|
| Temel EKG kriteri | PR <120 ms; QRS başlangıcında delta (eğimli başlangıç); QRS >120 ms; sekonder ST–T değişikliği |
| Simülasyon parametresi | ≈72/dk; PR 100 ms; QRS 140 ms. QRS'in ilk ≈%36'sı yavaş eğimli, ardından hızlı bileşen gelir (füzyon); delta ayrı bir dalga değildir. R tepesi atım çapasına hizalı. Atımdan atıma ±%3 genlik değişkenliği var. |
| Ayırıcı özellik | Dal bloğunda PR normaldir ve delta yoktur. İstirahat EKG'sindeki patern tek başına "WPW sendromu" değildir. |
| Kaynak | Surawicz ve ark. 2009, DOI 10.1161/CIRCULATIONAHA.108.191095; Brugada ve ark. 2019 ESC, DOI 10.1093/eurheartj/ehz467 |

### 22 · Akut Perikardit EKG Paterni — Acute Pericarditis ECG Pattern (`pericarditis`)

| Alan | İçerik |
|---|---|
| Temel EKG kriteri | Birden çok anatomik bölgede konkav ST yükselmesi; PR segment çökmesi; aVR'de karşıt değişiklik |
| Simülasyon parametresi | ≈88/dk sinüs ritmi. ST: D1 +0,16, D2 +0,20, D3 +0,04, aVF +0,12, aVL +0,06, V2–V6 +0,14 ile +0,22 mV; aVR −0,18, V1 −0,02 mV. PR: D2 −0,08, V3–V5 −0,06 mV; aVR +0,065 mV. J noktasından T'ye konkav geçiş. |
| Ayırıcı özellik | Koroner bölgeye sınırlı değil; aVR ve V1 dışında karşılıklı ST çökmesi yok; patolojik Q yok. Klasik bulgular her hastada görülmez; tanı klinik bağlamla konur. |
| Kaynak | Schulz-Menger ve ark. 2025 ESC, DOI 10.1093/eurheartj/ehaf192 |

### 23 · Hiperkalemiye Bağlı EKG Paterni — Hyperkalemia-associated ECG Pattern (`hyperk`)

| Alan | İçerik |
|---|---|
| Temel EKG kriteri | Sivri, dar tabanlı, simetrik T; P amplitüdünde azalma; PR uzaması; QRS genişlemesi (öğretici klasik fenotip) |
| Simülasyon parametresi | ≈63/dk; PR 240 ms; P genliği sinüs örneğinin yarısı; QRS 120 ms; T tabanı 160 ms ve sivri (tent). T en belirgin V2–V4'tedir; aVR'de negatif. Sinüs dalgası, VF ve asistoli varsayılan profilde yok. |
| Ayırıcı özellik | EKG potasyum düzeyinin kusursuz göstergesi değildir. Belirli bir K düzeyine sabit EKG bulgusu eşlenmez; ciddi hiperkalemi normal EKG ile de görülebilir. |
| Kaynak | Sandau ve ark. 2017 AHA, DOI 10.1161/CIR.0000000000000527 |

## Terminoloji notu: "2. derece Tip I / Tip II" ve "2:1 AV blok"

- **Mobitz I ve II**, ardışık iletilen atımlarda PR davranışına göre ayrılır:
  - Mobitz I'de PR giderek uzar.
  - Mobitz II'de PR sabittir.
- **2:1 AV blokta** her iletilen atımı bir iletilmeyen P izler. Bu yüzden ardışık iki iletilen PR karşılaştırılamaz ve patern yalnız yüzey EKG'siyle otomatik olarak Mobitz I ya da II'ye sınıflanamaz (Kusumoto 2018).
- Hocanın notundaki "2-1 AV blok" ifadesi **Mobitz Tip I** olarak yorumlandı. 2:1 AV blok bu pakete ayrı bir patern olarak eklenmedi.

## Otomatik QC sonuçları (T204)

`tests/sim-pulse/patterns-14-23.test.ts`: 14/14 test geçti. Kapsanan kontroller:
- Sinüs bradikardisinde P:QRS 1:1.
- 1. derece AV blokta tüm P'ler iletiliyor ve PR >200 ms.
- Mobitz I'de PR uzuyor ve iletilmeyen P var.
- Mobitz II'de PR sabit ve PR uzamadan P düşüyor.
- Tam AV blokta P–P ve R–R bağımsız, P–QRS ilişkisi sabit değil.
- PAC'de prematürite, farklı P, dar QRS ve tam kompansatuvar olmayan duraklama.
- Kavşak ritminde hız, darlık, retrograd P polaritesi ve P'nin kendi QRS'ine bağlı olması.
- WPW'de PR, QRS, delta'nın monoton başlangıcı ve eğim oranı.
- Perikarditte yaygın ST, aVR karşılığı, PR çökmesi ve bölgesel karşılığın olmaması.
- Hiperkalemide T/P/PR/QRS ve derivasyon farklılığı; sinüs dalgası olmaması.
- 12 derivasyonun senkronu, Einthoven/Goldberger türetmesi ve animasyon olaylarının yalnız ilgili paternde görülmesi.

## Soru havuzu 14–18 (T210)

- Kapsam: Patern 14–18 için 50 uygulama + 50 değerlendirme maddesi. Havuz 200+200'den **250+250'ye (500 madde)** büyüdü; yeni maddeler mevcut kimliklerin arkasına eklenir, eski kimlikler değişmez.
- Kimlik aralığı: uygulama `C201–C250`, değerlendirme `Q201–Q250`. Her patern 10 + 10 madde alır.
- Bankalar: `p14_…`–`p18_…` önekli 50 bank; her bank bir uygulama ve bir değerlendirme maddesinde (toplam en fazla 2 satır, farklı kök ve soru) kullanılır. İlk satır doğru seçenektir; `seededPermutation` ile karıştırılır.
- Motor tutarlılığı: kök ve ölçüm soruları motor parametreleriyle uyumludur — sinüs bradikardisi ≈48/dk, PR 160 ms; 1. derece AV blok ≈63/dk, PR 260 ms sabit; Mobitz I P–P 750 ms, 4:3, PR 160→220→260 ms, duraklama 1400 ms; Mobitz II P–P 800 ms, PR 180 ms sabit, QRS 120 ms; tam AV blok atriyum ≈83/dk, ventrikül ≈38/dk, kaçış QRS 140 ms, PR ölçülemez.
- `itemMeta` (PulseCurriculum.meta): her bank için `bloom`, `difficulty`, `objective` ve `refs` (`BRADY2018`, `ECG2007`, `ESCPACE2021`; ESCPACE2021 = Glikson 2021, DOI 10.1093/eurheartj/ehab364, `sources.json`'a eklendi).
- Zorunlu ayrımlar içerikte kapsanır: sinüs bradikardisi vs AV blok; 1. derece AV blok vs normal PR; Mobitz I vs Mobitz II; Mobitz II vs 2:1 iletim; Mobitz II vs tam AV blok; tam AV blokta AV dissosiyasyon; P:QRS ilişkisi, PR davranışı ve düşen atım mekanizması. 2:1 iletim yalnız çeldirici/ayırıcı olarak geçer ve "yalnız 2:1 iletimde tip ayrımı yüzey EKG'sinden kesin yapılamaz" biçiminde doğru tanımlanır.
- 12 derivasyon senkronu, düşen atımın başka derivasyonda görünmemesi ve türetme ilişkileri T204 kayıtlarındaki gibidir; motor ve kartlar bu görevde değişmedi.

### Patern başına madde sayıları

| # | Patern | Mode | Uygulama | Değerlendirme | Banka |
|---|---|---|---|---|---|
| 14 | Sinüs bradikardisi | `sinbrady` | 10 (C201–C210) | 10 (Q201–Q210) | `p14_*` (10) |
| 15 | 1. derece AV blok | `avb1` | 10 (C211–C220) | 10 (Q211–Q220) | `p15_*` (10) |
| 16 | Mobitz Tip I | `mobitz1` | 10 (C221–C230) | 10 (Q221–Q230) | `p16_*` (10) |
| 17 | Mobitz Tip II | `mobitz2` | 10 (C231–C240) | 10 (Q231–Q240) | `p17_*` (10) |
| 18 | Tam AV blok | `chb` | 10 (C241–C250) | 10 (Q241–Q250) | `p18_*` (10) |

### Bloom dağılımı (yeni 100 madde)

| Bloom | sinbrady | avb1 | mobitz1 | mobitz2 | chb | Toplam | Hedef |
|---|---|---|---|---|---|---|---|
| Bilgi/anlama | 4 | 4 | 4 | 4 | 4 | 20 | ≈%20 |
| Uygulama | 10 | 10 | 10 | 10 | 10 | 50 | ≈%50 |
| Analiz/ayırt etme | 6 | 6 | 6 | 6 | 6 | 30 | ≈%30 |

Her bank iki maddede (bir uygulama + bir değerlendirme) kullanıldığı için Bloom sayıları patern başına 2'şer banka karşılık gelir.

### Otomatik QC sonuçları (T210)

`tests/sim-pulse/questions-14-18.test.ts`: 12/12 test geçti. Kapsanan kontroller:

- Patern başına 10 uygulama + 10 değerlendirme; toplam 100 yeni madde.
- Mevcut 400 madde kimliği değişmez; yeni kimlikler C201–C250 / Q201–Q250.
- Her maddede 5 benzersiz seçenek ve gerekçe; doğru indeks bankın ilk satırını gösterir.
- Bankalar `p14_`–`p18_` önekli, benzersiz ve en fazla iki satırda kullanılır.
- Kök+soru tam kopyası yok; aynı patern içinde kök kelime Jaccard < 0,8.
- Yasaklı ifadelerin hiçbiri madde metinlerinde geçmez; "hepsi/hiçbiri" seçeneği yok; kökte tanı kelimesi yok.
- Doğru seçeneğin en uzun olduğu madde oranı patern başına ≤ %40 (ölçülen: sinbrady/avb1/mobitz1/mobitz2 %0, chb %10).
- `itemMeta` her yeni bank için dolu; `refs` kayıtları `sources.json`'da; Bloom dağılımı hedefin ±10 puanında.
- Eski oturumlar (C001–C200 / Q001–Q200) `state.js` doğrulamasından aynen geçer; sınır kimlikleri (C200/C250) kabul edilir, sınır dışı numara yeniden örneklemeye düşer.
- Sınırlılık metni madde sayısını dinamik taşır ("500 sentetik madde … 23 EKG sonucu").

> Not: Yeni maddelerin motorla tutarlılığı ve ayırıcı tanı örüntüleri Kardiyoloji ABD onayı bekleyen T204 kaydının kapsamındadır.
