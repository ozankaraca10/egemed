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
| A3 | İçerik doğruluğu | Pulse iki çelişkili beyan taşıyor. Mod ekranı: "Tüm sinyaller sentetik öğretim şemalarıdır" (bugün **doğru**, gerçek EKG verisi henüz Pulse'a girmedi). Hakkında/sınırlılık metni: "EKG'ler gerçek hasta kayıtlarından seçilmiş ve Doç. Dr. Evrim Şimşek tarafından doğrulanmıştır" (commit 24983f0; bugün **yanlış**, adı geçen öğretim üyesine atfedilmiş bir doğrulama iddiası). | `git grep` sim-pulse: PhysioNet verisi yok | Gerçek EKG yeniden yazımı yayına girene dek Hakkında metni "gerçek EKG geçişi sürüyor" biçimine çekilmeli; geçiş tamamlanınca mod ekranı beyanı güncellenir | **Depo sahibi kararı bekliyor** |
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

## Dalga sırasında ortaya çıkan ek bulgular

| # | Bulgu | Sonuç |
|---|---|---|
| D1 | **e2e soğuk derleme yarışı:** Paralel tam e2e'de Vite, tembel yüklenen sim parçasını (Opaca ≈ 1,25 MB + veri) ilk istekte derliyordu; yük altında 5 sn beklemeyi aşıp "sim kökü bulunamadı" hatası veriyordu. `opaca-isolation` dev'de de 2 koşudan 1'inde düştü. Merge kapısında rastgele kırmızılar üretip T271a'yı (ve büyük olasılıkla T253a'yı) haksız yere geri aldırdı. | **Düzeltildi** (T271a: `server.warmup` ile sim girişleri açılışta önceden derleniyor; tam e2e 0 kırmızı) |
| D2 | **Ajan okuma sınırı desenleri işlemiyordu:** `.ignore`, `.cursorignore`, `.claude/settings.json` gerçek veri dosyalarını (`packages/sim-*/src/data`) değil, boş eski `sims/*` yolunu engelliyordu. | **Düzeltildi** (T270) |
| D3 | **Hız sınırı kampüs NAT'ını kesecekti:** İlk nginx taslağında `/api/auth/` (her rota değişiminde çağrılan `/auth/me` dahil) IP başına 10 istek/dk'ya sınırlanmıştı. | **Düzeltildi** (T269 incelemesi: auth yalnız giriş başlatan uçlarda; api/media oturum çerezine göre sayılıyor) |
| D4 | **Ausculta öğrenme örneğinde yanıltıcı etiket:** Ronküs örneklerinden biri SPRSound "Kontrol grubu (hastalık yok)" etiketliydi. | **Düzeltildi** (T259 incelemesi: anormal bulgu konularında kontrol grubu elenir; ronküs 4 gerçek + 1 manken) |
| D5 | KAUH ral kayıtlarında ince/kaba ayrımı kaynakta yok (`Crep`/`C`); araç tanıya göre sınıflıyor (kalp yetersizliği/fibrozis → ince; pnömoni/bronşit → kaba). | T261 hasta kartında belirtilecek; hekim onayına sunulacak |

## Kapsam dışı / sınırlar
- API modlu 11 e2e testi demo veritabanını değiştireceği için koşulmadı.
- Gerçek cihaz, ekran okuyucu ile elle test, yük testi ve gerçek IdP ile SSO akışı yapılmadı.

## Dağıtım ve durum (30 Eyl akşamı)

| Görev | İşçi | Durum |
|---|---|---|
| T268 | Claude | ✅ dev (rapor + C6) |
| T269 | DeepSeek | ✅ dev (A2, A4, B6; D3 düzeltmesiyle) |
| T270 | DeepSeek | ✅ dev (B5 görseller, C2; D2) |
| T271a | Luna | ✅ dev (A1 sözleşme + kabuk; D1) |
| T272 | Luna | ✅ dev (B1, C1; e2e ön ısıtma) |
| T273 | Luna | ✅ dev (B5: ana paket 764→488 KB; B7) — API kaynaklarını DEV'e bağlayan değişiklik incelemede geri alındı |
| T259 | DeepSeek | ✅ dev (D4 düzeltmesiyle) |
| T260 | DeepSeek | ✅ dev (CirCor; yaklaşık eşleme öğrenmeden çıkarıldı) |
| T253a | Luna | ✅ dev (Opaca ödül kanalı; ödül bağlantısı 44 px) |
| T271b | Luna | ✅ dev (A1 kapandı: sim içi adres, geri/ileri, derin bağlantı; kilitli ekran güvenli düşüş doğrulandı) |
| Sıradaki | — | A3 (depo sahibi kararı), B2 ortak Hakkında/Yardım, B3 rozet sınıflaması, B4 Pulse SCORM katmanı, C4 sim CSS renk literalleri, T271b için birim testleri |

## İlk dağıtım planı

| Görev | İşçi | Kapsam |
|---|---|---|
| T269 | DeepSeek | A2, A4, B6: nginx sertleştirme, AI tarayıcı engeli, robots.txt, CSP LRS şablonu |
| T270 | DeepSeek | B5 (görseller), B7, C1, C2: hijyen + dev metinlerini üretimden çıkarma |
| T271a | Luna | A1: sim-host gezinme sözleşmesi + kabuk hash alt rotası/history |
| T272 | Luna | B1, B2: ortak terim sözlüğü, ortak Hakkında/Yardım |
| — | Claude | A3 (Pulse beyanı), T253a (Opaca ödül), T259 inceleme, CirCor |
