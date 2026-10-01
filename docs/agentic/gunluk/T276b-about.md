# T276b-about

- Tarih: 2026-10-01 09:57
- Commit: T276b: Hakkında tek sayfa (#/hakkinda, sim sekmeli, eski ayrıntılı içerik); sim içi Hakkında kaldırıldı; Pulse hikâye bölümü kaldırıldı (Claude + Sonnet)
- Dal: task/T276b-about

---

# T276b — Hakkında ekranlarını hizala, Pulse hikâye bölümünü kaldır

## Yaklaşım
1. Üç simin "Hakkında" ekranını bulup karşılaştırdım:
   - Pulse: `packages/sim-pulse/src/runtime/vendor/markup.js` (`#aboutView` iskeleti, HTML) + `packages/sim-pulse/src/runtime/vendor/features.js` (`renderAbout()` — bölümleri JS ile birleştirip `#aboutContent`'e basar) + `packages/sim-pulse/src/runtime/vendor/styles.js` (CSS).
   - Opaca: `packages/sim-opaca/src/screens/SourcesScreen.tsx`.
   - Ausculta: `packages/sim-ausculta/src/screens/SourcesScreen.tsx` + `packages/sim-ausculta/src/ui/ScreenHeading.tsx`.
2. Opaca ve Ausculta zaten aynı bölüm sırasındaydı (tanım → Geliştiriciler → Kurum → Veri Setleri/Görsel Varlıklar → Validasyon/Uyarı) ve aynı paylaşılan CSS sınıflarını kullanıyordu (`credit-groups`, `inst-card`, `ds-grid`, `src-disclaimer`...). Pulse'ın vendor HTML'i de **aynı** sınıf adlarını kullanıyor (`credit-groups`, `inst-card`, `ds-grid`...) — üç sim zaten ortak bir token'lı tasarım dili paylaşıyor. Tek gerçek sapma: Pulse'ın `renderAbout()` fonksiyonunda Geliştiriciler/Kurum ile Kaynaklar arasına eklenmiş, diğer iki simde karşılığı olmayan **"Pulse'ın Geliştirilme Hikayesi"** (`story`) bölümüydü.
3. **Pulse:** `features.js` içinde `renderAbout()`'tan `aboutSection('story', 'Pulse'ın Geliştirilme Hikayesi', storyFlow())` çağrısını kaldırdım; kalan sıra artık Geliştiriciler → Kurum → Kaynaklar → Validasyon/Uyarı (üç simle birebir aynı bölüm sırası). Yalnız bu bölümde kullanılan `storyFlow()` fonksiyonunu ve `ICO.story` ikon girdisini (başka hiçbir yerde kullanılmıyordu) kaldırdım — kendi değişikliğimin yetim bıraktığı kod. `styles.js`'teki yalnızca `.story*` seçicilerine ait 19 CSS kuralını (ve bunları saran, başka hiçbir şey içermeyen `@media(max-width:720px){.story-stats{...}.story-hero{...}}` bloğunu) node betiğiyle çıkarıp dosyayı aynı minified-tek-satır biçimde yeniden yazdım; `node --input-type=module` ile `import()` edip doğru ayrıştığını ve "story" dizgisinin kalmadığını doğruladım.
4. **Ausculta hizalaması:** Ausculta'nın `SourcesScreen.tsx`'i bölüm başlıklarını (Geliştiriciler/Kurum/Ses Veri Setleri/Görsel Varlıklar/Validasyon) ham `<h2>` ile çiziyordu; Opaca aynı başlıklar için gömülü/bağımsız moda göre h3/h2'ye düşen paylaşılan `SectionHeading` bileşenini kullanıyordu (Ausculta'nın `ScreenHeading.tsx` dosyasında bu bileşen hiç yoktu). Opaca'daki `SectionHeading`'i birebir Ausculta'ya da ekledim ve `SourcesScreen.tsx`'teki 5 başlığı `SectionHeading`'e çevirdim — artık iki ekran da aynı bileşen/aynı hiyerarşi davranışını paylaşıyor. İçerik metinleri, kaynak listeleri, kişi adları değişmedi.
5. Klinik doğrulama iddialarına (Pulse Kurum bölümündeki "gerçek EKG doğrulaması", Ege Üniversitesi Tıp Fakültesi Kardiyoloji ABD onayı vb.) dokunulmadı; aşağıda konumu raporlanıyor.

## Klinik doğrulama iddiası — konum (dokunulmadı, depo sahibi kararı bekliyor)
- `packages/sim-pulse/src/runtime/vendor/features.js` → `institutionCard()` (aboutData.module.evidence/description) ve `limitationsBox()`.
- Kaynak veri: `packages/sim-pulse/src/data/sources.json` (`module.description`, `module.evidence`) — okuma sınırı gereği toplu okunmadı, yalnız ekranda render edilen metin görüldü (bkz. ekran görüntüsü): "Simülatörün tüm tıbbi içerik ve sinyal validasyonları Ege Üniversitesi Tıp Fakültesi Kardiyoloji Anabilim Dalı öğretim üyelerince yapılmıştır." + "Yapılandırılmış, göreve özgü EKG yorumlama eğitiminin... gösterilmiştir.[1]" atıf kutusu.
- Aynı türde klinik doğrulama ifadeleri Opaca/Ausculta `SourcesScreen.tsx`'teki `data.module.validationStatement` / `data.module.validation.full` alanlarında da var; bunlar zaten her iki sim arasında ortaktı, bu görevde değiştirilmedi.

## Değişen dosyalar
- `packages/sim-pulse/src/runtime/vendor/features.js` — hikâye bölümü çağrısı, `storyFlow()` fonksiyonu, `ICO.story` kaldırıldı.
- `packages/sim-pulse/src/runtime/vendor/styles.js` — yalnız `.story*` CSS kuralları (19 kural + 1 medya sorgusu) kaldırıldı; başka hiçbir kural dokunulmadı.
- `packages/sim-ausculta/src/ui/ScreenHeading.tsx` — Opaca ile birebir aynı `SectionHeading` bileşeni eklendi (gömülü modda h3, bağımsız modda h2).
- `packages/sim-ausculta/src/screens/SourcesScreen.tsx` — 5 bölüm başlığı (`credits-h`, `inst-h`, `ds-h`, `assets-h`, `disclaimer-h`) ham `<h2>`'den `SectionHeading`'e çevrildi; metinler/id'ler/aria-labelledby aynen korundu.
- `packages/sim-opaca/**` değişmedi (zaten referans/hedef düzendeydi).

## Kapı sonuçları
- `pnpm turbo lint typecheck test` → **tam yeşil**: 17/17 turbo görevi başarılı (lint, typecheck x her paket, test). Test: 231 dosya, 1937 geçti / 1 atlandı (önceden var olan, ilgisiz bir atlama), 0 başarısız. Süre ~1m25s.
- Hedefli ön-doğrulama (tam koşumdan önce): `tsc --noEmit` (sim-pulse, sim-opaca, sim-ausculta) ayrı ayrı yeşil; `eslint` değişen dosyalarda hatasız (vendor dosyaları `eslint.config.js`'de ignore edilmiş — beklenen); `vitest run tests/sim-ausculta/sources.test.ts tests/sim-opaca/screens/sources.test.ts tests/sim-opaca/ui/screen-heading.test.ts` ve `vitest run tests/sim-pulse` ayrı ayrı yeşil.
- Test zayıflatma yok; yeni test eklenmedi (TEST-POLİTİKASI dört sorusu: mevcut `sources.test.ts`/`screen-heading.test.ts` testleri zaten bölüm sırasını `aria-labelledby` sırasıyla ve h2/h3 geçişini doğruluyor, yeni bir gözlemlenebilir davranış eklenmedi — yalnız hizalama/temizlik).

## Ekran görüntüsü gözlemi
- Playwright, `E2E_PORT_BASE=5697`, geçici spec (`e2e/_tmp-t276b-about-screens.spec.ts`, iş bitince silindi).
- **Pulse — desktop 1440:** `.egemed-run/screenshots/pulse-hakkinda-desktop-1440.png`. Üst bardaki "Hakkında" eylemiyle açıldı. Bölüm sırası görsel olarak doğrulandı: Geliştiriciler -> Kurum -> Kaynaklar (-> aşağıda Uyarı/Validasyon, ekran dışı). "Pulse'ın Geliştirilme Hikayesi" bölümü artık yok.
- **Pulse — mobile 360:** zaman aşımına uğradı (kök seçici `.egemed-pulse-runtime` 5 sn içinde görünür olmadı; başarısızlık ekran görüntüsünde içerik aslında render olmuş görünüyor — muhtemelen mobil genişlikte ilk-kullanım öğreticisi/animasyon nedeniyle bir zamanlama yarışı, benim değişikliğimle ilgisiz). Tekrar denenmedi (yaklaşım değiştirme zamanı kalmadı); **360 px'te doğrulanamadı**.
- **Opaca/Ausculta — doğrulanamadı:** Üst bardaki "Hakkında" eylemi, `SourcesScreen.tsx` yerine kabuğun (shell) genel/kısa yedek "Hakkında" penceresini açıyor (`apps/shell/src/SimBar.tsx`: "Sim 'Hakkında' vermezse kabuk standart Hakkında penceresini açar"). `SourcesScreen`'e giden gerçek yol, sim'in kendi `StartScreen.tsx`'indeki "Hakkında ve kaynaklar" bağlantısı (`dispatch({type:'goto', screen:'sources'})`); ama gömülü (shell içi) modda varsayılan ekran doğrudan "Mod Seçimi" (`modlar`) açılıyor, `StartScreen`'e hiç uğramıyor gibi görünüyor — bu nedenle `SourcesScreen`'in gömülü/kabuk akışında bugün hiç UI yolu yok gibi duruyor. **Bu, benim değişikliğimden önce de var olan, kapsam dışı bir navigasyon boşluğu** (plan yalnız mevcut Hakkında ekranlarının içerik/sıra hizalamasını istiyordu, navigasyon kablolamasını değil); repo sahibine ayrıca bildirilmeli. Bölüm sırası/düzen hizalaması bunun yerine birim testleriyle (render edilen HTML'de `aria-labelledby` sırası) doğrulandı — bkz. Kapı sonuçları.

## Kapsam dışı gözlemler (değiştirilmedi, yalnız rapor)
- Ausculta'nın Kurum kartında logo `<img src="brand/ege-tip-logo.png">` olarak göreli yol kullanıyor; Opaca aynı logoyu `assetUrl('brand/ege-tip-logo.png')` ile asset-base önekiyle çözüyor. Görsel yolu/varlık taşıma farkı, bu görevin "bölüm sırası/düzen" kapsamı dışında — dokunmadım.
- Opaca/Ausculta `SourcesScreen`'inin kabuk (shell) içinde bugün UI'dan erişilebilir bir yolu yok gibi görünüyor (yukarıda ayrıntılı).

## Commit/merge
Yapılmadı (talimat gereği).

## Claude eki (1 Eki 2026)
- Kök bulgu: Opaca/Ausculta'nın Hakkında ekranına kabuktan erişilemiyordu (bar kabuğun mini penceresini açıyordu); Opaca'da `sources` ekranı hiç bağlanmamıştı (yer tutucu).
- Opaca/Ausculta birleşik bara kendi "Hakkında" eylemini verir → `sources` ekranı (Pulse ile aynı); çalışma ekranında kabuk penceresi kalır (oturum bölünmez).
- Opaca `App.tsx`: `SourcesScreen` bağlandı. Üç Hakkında ekranı 1440'ta görsel olarak aynı düzende.
- Not: Opaca/Ausculta "Tıbbi içerik validasyonu" grubunda adsız "Doç. Dr." yer tutucuları görünüyor (veri; depo sahibinin radyolog/kardiyolog listesi bekleniyor).

## Depo sahibi kararıyla yön değişikliği (1 Eki 2026, Claude)
"Eski Hakkımızda sayfalarını ana sayfaya tek sayfa olarak ekleyelim; simülatör içindeki Hakkında'lar kalksın."
- Kabuk `#/hakkinda` (üst menüde "Hakkında"): Pulse | Ausculta | Opaca sekmeleri; her sekme eski ayrıntılı içerik (Geliştiriciler, Kurum, Veri setleri/Kaynaklar, Validasyon/uyarı). Tembel yüklenir.
- `OpacaAbout`, `AuscultaAbout` (mağazasız içerik bileşenleri, SourcesScreen de bunları kullanır), `PulseAbout` (kaynak `renderAbout` birebir; gölge kökte Pulse stilleriyle).
- Sim barından Hakkında kaldırıldı (Pulse eylemi + kabuğun basit penceresi). Önceki "barda simin kendi Hakkında'sı" değişikliği geri alındı.
- Pulse'ın sim içi Hakkında görünümündeki "Yerel veriler" (CSV indir / yerel ilerlemeyi sıfırla) artık erişilemez; SCORM kaldırma (T278) ile birlikte değerlendirilmeli.
- Şema: urun.md rota + diyagram. Kapı 17/17, 1943 test; 1440/360 ekran görüntüleri kontrol edildi.
