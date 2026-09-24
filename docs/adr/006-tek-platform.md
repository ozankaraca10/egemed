# ADR-006: Tek platform — simülatörler iç modül (hibrit)

> Ad değişikliği (24 Eyl 2026): platform adı EGEMED.

Durum: Kabul
Kabul eden: depo sahibi (canlı oturum "c yapalım"), 2026-09-23

## Bağlam
ADR-003 simülatörleri bağımsız statik SCORM/HTML paketler + kabukta sandbox iframe
gömme modeli olarak öngörüyordu ve kabul edilmişti. Depo sahibi 23 Eylül 2026'da
yönü değiştirdi: ön yüz tek React platformu olarak tasarlanacak, üç simülatör
platformun içinde ayrı uygulama modülü olacak; SCORM sarmalayıcı şart değil.
Mevcut simülatörler çalışan vanilla JS/TS uygulamalardır (Opaca 119 testli,
Vite+TS; Ausculta Vite+TS; Pulse düz JS, ~30 bin satır toplam).

## Öneri
- EGEMED tek React ürünü; üç simülatör üç rota/modül. Kabuk çerçevesi (üst
  bar/alt sekme, yönlendirme, i18n, erişilebilirlik) React + @egemed/ui ile yazılır.
- Simülatör motorları (EKG üretimi, oskültasyon ses mantığı, görüntü işaretleme)
  davranış değişmeden vanilla/TS modül olarak korunur; React host bileşenlerinden
  mount/unmount edilir (hibrit). Ekranlar sim başına kademeli olarak React'e
  taşınabilir; motor sınırları port planlarında çizilir.
- Port, sim başına görev ailesi halinde yürür; her görev ~400 satır hedefler.
- Veri izolasyonu değişmez: simülatör durumu sim başına ayrık; her xAPI ifadesi
  tek SimulatorId taşır (T06 profili), öğrenci verisi kurum altyapısında kalır
  (ADR-004/005 geçerliliğini korur).
- SCORM paketleme platform dağıtımından çıkar; kurum Moodle entegrasyonu LTI 1.3
  ya da bağlantı yoluyla olur (ADR-005'in kimlik kaynağı LTI'ye yaslanır; sabitleme
  ayrı insan kararıdır).

## Alternatifler
- ADR-003 iframe modeli: sim başına bağımsız build/dağıtım ve SCORM korunurdu;
  3+1 kod tabanı bakımı ve iframe UX kopukluğu sürerdi.
- Tam React yeniden yazımı: doğrulanmış motor mantığının yeniden yazım riski
  yüksek; tek kişilik ekibin süresi için gerçekçi değil.

## Sonuçlar
- ADR-003'ün gömme modeli iç modülle değişir; /sims/<id>/ yolu platform rotasıdır.
  Standalone SCORM dağıtımı sonlanır; kaynak depolar (GitHub) arşiv referansıdır.
- sims/* workspace-dışı kuralı güncellenir; sim kodu workspace içine modül olarak
  taşınır (port planlarında paket yerleşimi belirlenir).
- T10 (subtree taşıma) gereksizleşir; yerine port görevleri açılır.
- Bundle büyür; kademeli lazy chunk ile yönetilir.

## Açık sorular
- Sim başına "motor" (korunur) / "arayüz" (React'e taşınır) sınırı: port planlarında
  dosya bazında çizilir.
- Moodle/LTI entegrasyonu ayrı karar görevidir.

## Astra ikinci görüşü

- Yön uygundur; ancak kaynak envanteri nüansı önemlidir: Opaca ve Ausculta ekranları zaten React+TS, Pulse düz JS/DOM'dur. T15/T17 mevcut React uygulamalarını modül yapıp ortak UI'a uyarlamalı; T18 önce motor/DOM yaşam döngüsünü ayırmalıdır.
- Sim modülleri `packages/sim-<id>` olarak ayrı lazy chunk, durum ve CSS kökü almalı. Host değişiminde listener, timer, RAF, ses bağlamı ve bekleyen yüklemeler temizlenmelidir. Kaynak SCORM otomatik yazımı ve global localStorage anahtarları körlemesine taşınmamalıdır.
- Gerçek asset/base path, 360/768/1440, klavye ve kaynak regresyon testleri port dilimlerinde doğrulanmalıdır. xAPI profili kabul edilmeden sim olaylarını üretim ifadesine bağlamak ADR-004/005 sınırlarını fiilen sabitler.
