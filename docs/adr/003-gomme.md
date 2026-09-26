# ADR-003: Simülatör gömme modeli

Durum: Kabul
Kabul eden: depo sahibi (canlı oturum), 2026-09-23
Tarih: 2026-09-23

## Bağlam
Pulse, Ausculta ve Opaca bağımsız simülatörlerdir. Her biri tek başına
SCORM/HTML olarak çalışabilmelidir. Verileri hiçbir yüzeyde birleştirilmez.
Kabuk, kullanıcıya tek seferde tek simülatör sunar.

## Öneri
- Her simülatör bağımsız statik SCORM/HTML paketi olarak dağıtılır.
- Kabuk, tek seferde yalnız bir simülatörü sandbox iframe ile açar.
- Simülatör verileri birleştirilmez; ortak veri katmanı kurulmaz.
- `sims/*` kabuk veya paketler tarafından içe aktarılmaz.
- Yol önerisi: `/sims/<pulse|ausculta|opaca>/`.
- iframe `sandbox` ile sınırlanır; simülatör kendi kapsamı dışına çıkmaz.

## Alternatifler
- **npm paketi:** simülatörler derlenip paket olarak tüketilir; bağımsız
  SCORM/HTML dağıtımı ve tek başına çalışma yeteneği kaybolur.
- **Birleşik oynatıcı:** üç simülatörü tek yüzeyde birleştiren oynatıcı; veri
  birleştirme yasağıyla çelişir.
- **Yalnız harici sistem üzerinden gömme:** gömme yalnız harici bir sistem üzerinden
  yapılır; kurumsal bağımsız dağıtım esnekliği kaybolur.

## Sonuçlar
- Simülatörler kendi sürüm çizgisinde ilerler; biri diğerini etkilemez.
- Kabuk ince kalır, simülatör koduyla birlikte derlenmez.
- Ortak gezinme ve ilerleme görünümü sınırlı kalır.
- iframe iletişimi (yükseklik, olay) için sözleşme gerekir.

## Açık sorular
- Simülatörlerle kabuk arasındaki mesajlaşma sözleşmesi ne olacak?
- SCORM paketleri hangi ortamda barındırılacak ve nasıl sürümlenecek?
- iframe yüksekliği ve mobil davranışı nasıl yönetilecek?

## Astra ikinci görüşü

- ADR-006 bu ADR'nin SCORM paketi, iframe, `sims/*` içe aktarmama ve iframe mesajlaşması kararlarını geçersiz kıldı. Bu metin tarihsel karar olarak kalabilir; yeni görevler buradaki gömme kabul ölçütlerini kullanmamalıdır.
- Korunan değişmez, aynı anda bir sim deneyimi ve sim başına ayrı durumdur. İç modül modelinde bunu SimHost mount/dispose, lazy rota ve CSS/asset kapsamı testleri kanıtlamalıdır.
