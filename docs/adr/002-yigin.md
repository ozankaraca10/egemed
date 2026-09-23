# ADR-002: Yığın (kabuk ve API)

Durum: Kabul
Kabul eden: depo sahibi (canlı oturum), 2026-09-23
Tarih: 2026-09-23

## Bağlam
Kabuk, simülatörleri iframe içinde gömen hafif bir web uygulamasıdır; ağır
sunucu tarafı işlev, kullanıcı hesabı veya öğrenci veritabanı gerektirmez.
API ise xAPI ifadelerini kurum LRS'sine ileten ince bir katmandır. T07 ve T08
bu seçime bağlıdır.

## Öneri
- **Kabuk:** Vite + React. Sunucu tarafı render (SSR) yoktur; uygulama statik
  olarak derlenir ve iframe gömme ile çalışır.
- **API:** Hono, Node 22 üzerinde.
- **Veritabanı:** Öğrenci veritabanı yoktur; CLIX öğrenci kaydı tutmaz.
- Yeni bağımlılık eklenmez; seçim T01'de onaylanan araç zinciriyle sınırlıdır.
- `exactOptionalPropertyTypes` gevşetilmez; sürtünme çıkarsa çözüm ADR ile
  aranır, bayrak düşürülmez.

## Alternatifler
- **Next.js:** SSR ve dosya tabanlı yönlendirme sunar; kabuğun statik ve
  bağımsız dağıtım hedefi için gereğinden ağırdır.
- **Astro:** İçerik ağırlıklı siteler için güçlü; etkileşimli kabuk için ada
  (island) modeli ek karmaşıklık getirir.
- **Fastify:** API için olgun ve hızlı; Hono'nun taşınabilir çalışma zamanı
  hedefi ve küçük yüzeyi tercih edilir.
- **Çerçevesiz HTTP:** Node `http` ile elle yönlendirme; bakım maliyeti yüksek.

## Sonuçlar
- Kabuk statik dosya olarak dağıtılır; simülatörlerle aynı gömme modelini paylaşır.
- API küçük ve taşınabilir kalır; öğrenci verisi barındırmaz.
- SSR'a bağlı SEO ve oturum desenleri kapsam dışıdır.
- Çerçeve yükseltmeleri ayrı görevler gerektirir.

## Açık sorular
- API'nin kimlik doğrulama ve CORS politikası nasıl olacak?
- Kabuk statik barındırma ortamı (kurum içi/CDN) kim tarafından sağlanacak?
- Hono çalışma zamanı hedefi Node mu, kenar (edge) mı olacak?

## Astra ikinci görüşü

- Vite+React tek kabuk kararı ADR-006 ile uyumludur; iframe gömme ve “ince kabuk” gerekçesi geçmiş kapsamdır. Opaca/Ausculta zaten React ekranları taşır, Pulse düz JS'dir; port planı bu farkı yansıtmalıdır.
- Admin kimliği, rol kontrolü ve olası LRS vekili API sorumluluğunu büyütür. `apps/api` şu an yalnız iskelet olduğundan Hono/kimlik/CORS uygulaması ayrı onaylı görev olmalı; yeni bağımlılık kararı mevcut satırdan çıkarılamaz.
- Statik kabukta menü/rota gizleme yetki sınırı değildir. Admin işlemleri kurum kapsamını sunucuda her istekte doğrulamalıdır.
