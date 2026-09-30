# Platform audit — 30 Eylül 2026

Kapsam: kabuk + 3 simülatör + API + üretim altyapısı. Temel: `dev` @ b17336d (T267 sonrası).
Yöntem: tam e2e (3 genişlik), çalışan demo API'ye kimliksiz sondalar, üretim derlemesi incelemesi,
`pnpm audit`, sır taraması, knip (ölü kod), simler arası ekran karşılaştırması (1440/360), nginx/Docker incelemesi.

## Özet

| Alan | Durum |
|---|---|
| e2e (360/768/1440) | **345 geçti, 0 kırmızı**, 11 atlandı (API gerektirenler) |
| Bağımlılık açıkları (`pnpm audit --prod`) | 0 |
| Repoda sır / izlenen `.env` | Yok (yalnız `.env.example`, `.env.prod.example`) |
| Kimliksiz erişim (30+ uç) | Tüm `/admin/*` ve `/me/*` GET + mutasyonlar **401**; Origin'siz mutasyon 403 |
| Cevap anahtarı istemci paketinde | **Yok** — Pulse/Opaca/Ausculta değerlendirme verisi sunucuda |
| xAPI kişisel veri | Yok (`mbox`/ad alanı kasten yok) |
| Kod hijyeni | `console.log`, `any`, `@ts-ignore`, TODO: 0. `Date.now()` yalnız Pulse vendor'da |

## Bulgular

Önem: **Y** yüksek · **O** orta · **D** düşük. "Görev" sütunu dağıtımı gösterir.

### Yüksek

| # | Alan | Bulgu | Kanıt | Öneri | Görev |
|---|---|---|---|---|---|
| A1 | UX | Sim içi ekranlar URL'e yansımıyor. Geri tuşu simden tamamen çıkar (mobil/Android'de ilerleme kaybı hissi); yenileme sim başına döner; `#/sims/<id>/<ekran>` bağlantıları "Sayfa bulunamadı". | Üç simde ölçüldü: tıklama sonrası URL `/sims/<id>` kalıyor, `goBack` → `/simulatorler` | sim-host sözleşmesine ekran değişimi + gezinme; kabuk hash alt rotası ve history yönetimi; rota adları tek sözlük | T271a (sözleşme+kabuk), T271b (simler) |
| A2 | Güvenlik / AI koruma | Lisanslı görüntü ve ses dosyaları (`/sims/`) kimliksiz ve hız sınırsız indirilebilir. nginx'te `limit_req` yok. `robots.txt` ve AI tarayıcı engeli yok. `server_tokens`, `Permissions-Policy` yok. | `infra/prod/nginx-egemed.conf` | nginx hız bölgeleri (`/api/`, `/api/auth/`, `/sims/`), AI UA engeli (GPTBot, ClaudeBot, anthropic-ai, CCBot, Google-Extended, PerplexityBot, Bytespider, Applebot-Extended, Meta-ExternalAgent), `robots.txt` Disallow, `X-Robots-Tag: noindex, nofollow, noai, noimageai`. 2. aşama: medya için oturum çerezi kontrolü (`auth_request`) | T269 |
| A3 | İçerik doğruluğu | Pulse mod ekranı "Tüm sinyaller sentetik öğretim şemalarıdır; gerçek hasta kaydı değildir" diyor. Pulse'a gerçek PhysioNet EKG'leri eklendi; ifade yanlış ve yasal/etik bir beyan. | Pulse mod seçimi ekran görüntüsü | Hangi içeriğin gerçek, hangisinin şema olduğu netleştirilip beyan düzeltilir (tıbbi içerik) | Claude (Z5) |
| A4 | Güvenlik / işletim | Üretim CSP `connect-src` alanında yer tutucu `https://lrs.ornek-kurum.edu.tr` var; gerçek LRS çağrıları üretimde engellenir. | `nginx-egemed.conf:89` | LRS kökünü env'den şablonla (`envsubst`) | T269 |

### Orta

| # | Alan | Bulgu | Öneri | Görev |
|---|---|---|---|---|
| B1 | Simler arası tutarlılık | Terimler farklı: Pulse "İnceleme / Vaka / Sınav", diğerleri "Öğrenme / Uygulama / Değerlendirme". Pulse kilit düğmesi "Önce **öğrenme** modunu tamamlayın" derken mod adı "İnceleme". Başlık Ausculta/Pulse "Çalışma Modunu Seçin", Opaca "Çalışma modunu seçin". İlerleme birimleri: "patern izlendi" / "ses dinlendi" / "konu açıldı". | Ortak terim sözlüğü `tr.ts`'de; üç sim aynı anahtarları kullanır | T272 |
| B2 | Simler arası tutarlılık | Yardım: Pulse uzun metin + kısayol tablosu; Ausculta/Opaca numaralı adım kartları. Hakkında: Pulse tam sayfa (ekip, kurum, kaynak, hikâye); Ausculta/Opaca küçük modal, ekip ve kaynak yok. | Ortak Hakkında (ekip, kurum, kaynaklar, lisans) ve ortak yardım biçimi (adımlar + kısayollar) | T272 |
| B3 | Oyunlaştırma | Rozet sınıflaması farklı: Ausculta 29 rozet (Konu/Beceri/Meydan Okuma), Opaca 37 (Konu/Beceri/Seri/Öğrenme/Kilometre taşı/Meydan Okuma). Aylık ödül satırı yalnız Opaca mod ekranında (o da T253a'da kırık). | Ortak kategori kümesi; ödül satırı üç simde | Sonraki dalga (T253a sonrası) |
| B4 | Bakım | Pulse runtime'ı ~300 KB vendor JS (`eslint-disable`, `Date.now`, arayüz metinleri `tr.ts` dışında). İçinde ölü SCORM katmanı (ADR-006 SCORM'u kaldırdı; LMS bulunamayınca localStorage'a düşüyor) ve DOM'da gizli ikinci bir başlık düğme seti var. | SCORM katmanını kaldır (yerel kalıcılık korunur), gizli eski başlığı sök; metinleri kademeli `tr.ts`'ye taşı | Sonraki dalga |
| B5 | Performans | Ana paket `index` 764 KB (sıkıştırmasız), Opaca parçası 1,25 MB. `ege-tip-logo.png` 4 kopya (264–328 KB), `icon-512.png` 300 KB. | Logoları optimize et (hedef ≤ 60 KB); yönetim sayfalarını ana paketten ayır (lazy) | T270 (görseller), sonraki dalga (kod bölme) |
| B6 | Güvenlik | Giriş hız sınırı bellek içi ve yalnız kullanıcı adı anahtarlı; IP başına sınır yok, 4096 anahtar dolunca eskiler silinir (püskürtmeyle atlatılabilir). Üretim girişi SSO olduğundan etkisi sınırlı. | nginx `limit_req` ile IP başına `/api/auth/` sınırı (A2 ile) | T269 |
| B7 | Güvenlik (bilgi) | Geliştirme metinleri ("Parola: egemed", `/auth/dev/login` yolu, "Geliştirme hesabı") üretim paketinde duruyor. Sunucu üretimde ucu 404 ile kapatıyor. | Dev kutusu ve metinleri `import.meta.env.DEV` arkasında dinamik yükle | T270 |

### Düşük / hijyen

| # | Bulgu | Öneri | Görev |
|---|---|---|---|
| C1 | Ölü dosya: `packages/sim-ausculta/src/audio/createEngine.ts` (hiçbir yerden içe aktarılmıyor) | Sil | T270 |
| C2 | Boş eski iskelet `sims/{ausculta,opaca,pulse}/.gitkeep`; AGENTS.md okuma sınırı hâlâ `sims/*` yolunu gösteriyor | Klasörü sil, AGENTS.md yollarını `packages/sim-*` yap | T270 |
| C3 | knip: 120 kullanılmayan dışa aktarım, 192 kullanılmayan tip (çoğu yalnız testte kullanılan API sabitleri); Opaca `assetUrl` = `resolveAssetUrl` takma adı | Düşük öncelik; dokunulan dosyada temizlenir | — |
| C4 | Sim CSS'lerinde renk literali: Opaca 85, Ausculta 68, Pulse 28 (kural: renkler token'dan) | Token'a taşı | Sonraki dalga |
| C5 | 1000+ satırlık dosyalar: `api-client/src/index.ts` 1662, `me/gamification.ts` 1411, `admin/imports.ts` 1347, `admin/users.ts` 1017 | Bölme adayı; acil değil | — |
| C6 | Hakkında modalında Ausculta/Opaca logosu lacivert kutuda görünmüyordu (T263/T264 renkli logo regresyonu) | **Düzeltildi** (T268: açık zemin) | T268 |

## Doğrulanan, işlem gerekmeyen kontroller
- Oturum çerezi, CSRF double-submit + Origin, rol kontrolü, üretimde dev-login kapalı (2026-09-24 audit'i geçerli).
- API güvenlik başlıkları: CSP `default-src 'none'`, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.
- nginx: HSTS, CSP (index.html), gzip; Docker `USER node`.
- Değerlendirme soruları ve doğru cevaplar istemci paketinde yok (örnek soru metinleriyle arandı).
- Kaynak haritası (`.map`) üretim çıktısında yok.

## Kapsam dışı / sınırlar
- API modlu 11 e2e testi demo veritabanını değiştireceği için koşulmadı.
- Gerçek cihaz, ekran okuyucu ile elle test, yük testi ve gerçek IdP ile SSO akışı yapılmadı.

## Dağıtım (bu dalga)

| Görev | İşçi | Kapsam |
|---|---|---|
| T269 | DeepSeek | A2, A4, B6: nginx sertleştirme, AI tarayıcı engeli, robots.txt, CSP LRS şablonu |
| T270 | DeepSeek | B5 (görseller), B7, C1, C2: hijyen + dev metinlerini üretimden çıkarma |
| T271a | Luna | A1: sim-host gezinme sözleşmesi + kabuk hash alt rotası/history |
| T272 | Luna | B1, B2: ortak terim sözlüğü, ortak Hakkında/Yardım |
| — | Claude | A3 (Pulse beyanı), T253a (Opaca ödül), T259 inceleme, CirCor |
