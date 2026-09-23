# ADR-001: Monorepo

Durum: Kabul
Kabul eden: depo sahibi (canlı oturum), 2026-09-23
Tarih: 2026-09-23

## Bağlam
EGEMED CLIX; web kabuğu, API, paylaşılan paketler ve üç bağımsız simülatörden
oluşur. T01 iskeleti pnpm + Turborepo monorepo kurdu. Simülatörlerin veri ve
sunum bağımsızlığı korunmalı; buna karşın kabuk, API ve paylaşılan paketler tek
sürüm çizgisinde ilerlemelidir.

## Öneri
Tek depo kullanılır.
- pnpm workspace kapsamı `apps/*` ve `packages/*` ile sınırlıdır.
- Görev yürütme ve önbellekleme Turborepo ile yapılır.
- `sims/*` workspace üyesi değildir; bağımsız statik artefakt olarak kalır (T01
  ile aynı).
- Kabuk ve API sürümleri tek kilit dosyasından yönetilir.

## Alternatifler
- **Çoklu depo:** uygulama ve paketler ayrı depolara bölünür. Sözleşme
  senkronizasyonu ve sürüm uyumu elle yürütülür.
- **Simülatörün workspace paketi olması:** `sims/*` `packages/*` gibi bağımlılık
  grafiğine girer; bağımsızlık ve tek başına SCORM/HTML çalışma yeteneği zayıflar.
- **Nx:** Turborepo yerine Nx. Daha güçlü üreteçler, daha ağır yapılandırma.

## Sonuçlar
- Tek kurulum ve tek kapı komutu (`pnpm turbo lint typecheck test`).
- Ortak bağımlılık sürümleri tek yerden yönetilir.
- Simülatörler workspace dışında kaldığı için bağımsız sürümlenir ve dağıtılır.
- Depo büyüdükçe tek kilit dosyası ve tek CI akışı darboğaz olabilir.

## Açık sorular
- Simülatörlerin sürüm ve dağıtım akışı hangi araçla yürütülecek?
- CI süresi büyüdükçe uzak önbellek (remote cache) kullanılacak mı?
- `sims/*` için workspace dışı kuralı nasıl otomatik denetlenecek?

## Astra ikinci görüşü

Bekleniyor.
