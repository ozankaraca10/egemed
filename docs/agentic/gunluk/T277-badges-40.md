# T277-badges-40

- Tarih: 2026-10-01 01:40
- Commit: T277: her simde 39 rozet kolaydan zora + 40. Gerçek Rozet (capstone, Dekanlık bilgisi); kazanılamayan Podyum geçici rozetle değişti (DeepSeek; review: Claude)
- Dal: task/T277-badges-40

---

# T277 — Her simde 39 rozet + 40. "Gerçek Rozet" (capstone) — Özet

Durum: **tamam**. `pnpm turbo lint typecheck test` yeşil; plandaki e2e kabul komutu yeşil koştu.
Commit/merge/push yapılmadı (talimat gereği). Yalnız bu worktree içindeki dosyalar düzenlendi.

## Yapılanlar (plana göre)

1. **Çekirdek — `packages/gamification-core`**
   - `BadgeDef`'e `capstone?: true` alanı eklendi.
   - `capstoneRequiredBadges(catalog)`: capstone olmayan **kazanılabilir** (predicate ya da progress taşıyan)
     rozetler. Hiç kazanılamayan bir rozet (ör. Opaca'da `podium`) capstone'u kilitlemez.
   - `evaluateBadges`: önce capstone-dışı rozetler, sonra capstone değerlendirilir; aynı çağrıda son
     normal rozetle birlikte capstone verilebilir, kazanılmış capstone yeniden verilmez.
   - `badgeViews`: capstone için `value` = kazanılan kazanılabilir capstone-dışı rozet sayısı,
     `max` = kazanılabilir capstone-dışı rozet sayısı; `state` kazanım/kısmi/kilitli.
   - `sortBadgesByDifficulty`: capstone her zaman en sonda.
2. **Kataloglar — `packages/gami-catalogs`**: üç katalog tam **40** öğe (39 + capstone, son öğe).
   Eski kimlikler korundu; yeni rozetler yalnız mevcut istatistik alanlarından türetildi; düello
   rozetleri kendi kademe bandına karıştırıldı; sıra kolaydan zora. Geçici rozetler dosya başındaki
   yorumda listeli. Capstone: `{ id: "gercek-rozet", category: "milestone", tier: "gold", icon: "Medal",
   name: "Gerçek Rozet", rule: "39/38 rozetin tümü", capstone: true }`.
3. **Arayüz — `packages/gami-ui`**
   - `GamiBadgeModel.capstone?: boolean`; `buildAchievementsModel` katalogdan doldurur.
   - Capstone kartı: altın çerçeve (token `--orange-500`/`--amber-700`), "Gerçek Rozet" etiketi,
     sağ üstte **44 px** bilgi düğmesi (ⓘ). Düğme `aria-label="Gerçek Rozet hakkında"`,
     `aria-expanded`, `aria-controls` taşır; metin kapalıyken `hidden`.
   - Rozet ayrıntı penceresi de aynı bilgi düğmesini ve metni taşır.
   - Metin `GAMI_CAPSTONE_INFO` / etiket `GAMI_CAPSTONE_LABEL` olarak gami-ui'de; stiller
     `styles.css` + `styles-inline.ts` (ikisi birebir aynı).
4. **Sunucu / demo — `apps/api/src/me/gamification.ts`**: katalog değerlendirmesi capstone'u da
   veriyor (mevcut `evaluateBadges` yolu). Opaca `badgeProgress` haritasına capstone ilerlemesi
   eklendi (aksi hâlde API oturumunda Opaca kartı kalıcı 0/38 görünürdü). `seed:demo` beklentileri
   otomatik uyumlu (rozet anahtarları katalogdan doğrulanıyor); ek güncelleme gerekmedi.
5. **Kabuk — `apps/shell`**: `BadgeCatalogEntry.capstone` ve son rozet görünümüne capstone bayrağı
   (`ProgressSection.recentBadges`), böylece kazanıldığında bilgi düğmesi çizilir.

Sim paketlerine (`packages/sim-*`) dokunulmadı: katalogları yeniden dışa aktardıkları için yeni
rozetler/capstone otomatik yayılıyor; canlı ekranlar `@egemed/gami-ui` bileşenlerini kullanıyor.

## Testler (TEST-POLITIKASI yazım kapısı)

- **Capstone çekirdeği** (`tests/gamification-core/badges.test.ts`): 38/39 kazanılmışken verilmez;
  39. ile **aynı çağrıda** verilir; tekrar verilmez; kazanılamayan rozet capstone'u kilitlemez;
  capstone-dışı kazanılabilir rozet yoksa verilmez.
  - Korunan sözleşme: 40. rozetin açılma koşulu. Gerçekçi hata: capstone'un normal rozetlerden önce
    değerlendirilip son rozetle aynı çağrıda verilmemesi. Mevcut testler bunu yakalamıyordu (capstone yoktu).
    Test-only üretim açıklığı gerekmedi.
- **Görünüm** (`tests/gamification-core/badgeView.test.ts`): capstone ilerlemesi kazanılan
  listesinden; kazanılamayan rozet paydaya girmez; sıralamada capstone en sonda.
- **Kataloglar** (`tests/gami-catalogs/capstone.test.ts`, yeni): her katalog 40 öğe, son öğe capstone,
  kimlikler tekil, **eski kimlik listeleri** (uyumluluk sözleşmesi) korunmuş (29/29/37 → tümü mevcut),
  capstone gereksinimleri 39/39/38.
- **gami-ui** (`tests/gami-ui/views.test.ts`): capstone kartı ayırt edici sınıfla çizilir, bilgi düğmesi
  erişilebilir adı/`aria-expanded` doğru, Dekanlık metni bağlı ve kapalıyken gizli; ayrıntı penceresi de
  düğmeyi taşır.
- **Sunucu** (`tests/api/gami-badge-progress.test.ts`): Opaca özetinde `gercek-rozet` ilerlemesi
  `{ value: 1, max: 38 }` (kazanılan kazanılabilir rozet sayısı, Podyum hariç).
- **e2e** (`e2e/sims.spec.ts`, Opaca İlerlemem testi): karttaki bilgi düğmesi tıklanınca
  `aria-expanded="true"` ve Dekanlık metni görünür; ardından rozet ayrıntı penceresi açılıp aynı
  düğmeyle metin açılır ve Esc pencereyi kapatır (gerçek açılma davranışı yalnız burada
  doğrulanabiliyor; birim katmanı SSR).
- Düello sırası iddiaları 3 testte küme karşılaştırmasına çevrildi (rozetler artık zorluk sırasına
  karışıyor); "aynı düello kimlik+katman seti" anlamı korundu.

## Doğrulama çıktıları

- `pnpm turbo lint typecheck test` → **17/17 görev başarılı**; `224 test dosyası, 1876 test geçti, 1 atlandı`.
- Kabul e2e: `EGEMED_E2E_API_URL=http://127.0.0.1:9 E2E_PORT_BASE=8385 pnpm e2e:mobile --grep
  "ilerleme|progress|rozet|badge|home|ana sayfa|a11y"` → **116 geçti, 4 atlandı (beklenen), 0 kaldı** (2,3 dk;
  son koşu kart + ayrıntı penceresi doğrulaması dahil).
- Axe artefaktları (`e2e-artifacts/fac79d4/axe/...`): `#/dashboard-ilerleme`, `#/sims/{pulse,ausculta,opaca}/ilerlemem`
  → 0 ihlal; 44 px kontrolü capstone kartının bulunduğu ekranlarda geçti.
- Not (ortam): Makinede paralel worktree koşuları yüzünden yük ortalaması 20–110 arasındayken ilk denemelerde
  **ilgisiz** sim kökü görünürlük zaman aşımları (audit 30 Eyl D1 sınıfı) ve bir kez `color-contrast | .ok`
  kararsızlığı görüldü; aynı testler tek başına ve sakin makinede geçti, son tam koşu yeşil.

## Varsayımlar ve kararlar

1. **"TÜM capstone-dışı rozetler" ifadesi ile kazanılamayan `podium` çelişkisi (en önemli karar).**
   Plan capstone kazanımını "capstone olmayan TÜM kimlikler kazanılmışsa" diye tanımlıyor; ancak Opaca'da
   `podium` rozeti predicate/progress'siz tanımlı ve simde "sunucu bağlantısı gelince kazanılabilir" notuyla
   kilitli (testler de bunu böyle doğruluyor). Harfi harfine uygulansaydı Opaca'da "Gerçek Rozet" **asla**
   açılamazdı — depo sahibinin "40. rozet yalnız diğer 39'un tamamı kazanılınca açılır" kararına aykırı.
   Bu yüzden koşul **kazanılabilir** capstone-dışı rozetler olarak uygulandı: Pulse/Ausculta'da payda 39,
   Opaca'da 38 (Podyum hariç) ve Opaca capstone açıklaması "38 rozetin tamamını topla" yazıyor.
   Alternatif yorum (harfi harfine 39 ve capstone'un hiç açılmaması) uygulanmadı; karar insan onayına açık.
2. **Capstone metni `tr.ts` yerine gami-ui'de.** `packages/ui/i18n/tr.ts` kapsamda listelenmişti; ancak gami-ui
   `@egemed/ui`'ye bağımlı değil ve yeni bağımlılık onaysız. Planın "gami-ui orada metin tutmuyorsa kendi
   metin düzenine uy" hükmü gereği metin gami-ui sabiti olarak tutuldu (`GAMI_CAPSTONE_INFO`); `tr.ts`
   değiştirilmedi (tüketicisiz anahtar olurdu).
3. **Katalog sırası ile görünüm sırası.** Plan "katalog dizisi sırası = görünüm sırası" diyor; mevcut
   `sortBadgesByDifficulty` görünümü kademe+eşiğe göre yeniden sıralıyor. Kataloglar kolaydan zora dizildi,
   ayrıca capstone'un her durumda **en sonda** görünmesi için sıralamaya capstone kuralı eklendi (küçük,
   geriye uyumlu dokunuş).
4. **Düello rozetleri zorluk sırasına karıştırıldı** (plan gereği); bu üç testte sıra iddiasını küme
   karşılaştırmasına çevirdi. DUEL_BADGES dizisinin kendisi değişmedi.
5. **Geçici rozetler yalnız mevcut istatistik alanlarından** türetildi (yeni ölçüm yok): Pulse'da
   leads/caliper/streak zincir uzantıları + "Tüm ritim örüntüleri" (modeMastery); Ausculta'da
   listen/systematic/diagnosis zincirleri + konu eşiği uzantıları + "Tüm kalp/akciğer konuları";
   Opaca'da assessments-10 ve practice-50. Tam liste ve kural/geçicilik durumu aşağıda.
6. **Opaca'da capstone değil ama kazanılamayan tek rozet `podium`**; yeni "tümü" tipi rozetler ve
   capstone kazanılabilir alanlardan beslendi.

## Kapsam dışı bulgular / açık sorular

- **Karar bekleyen:** (1) numaralı varsayım — Opaca'da 38 mi, yoksa Podyum kazanılır hâle mi getirilecek
  (sunucu sıralaması bağlanınca)? İkincisi seçilirse capstone koşulu kendiliğinden 39'a döner; katalog
  açıklaması 38'den 39'a güncellenmeli.
- `packages/sim-opaca`'daki `applyServerBadgeProgress`, sunucu haritasında olmayan rozetleri "0/kilitli"e
  çekiyor; API artık capstone ilerlemesini gönderdiği için Opaca API oturumunda doğru görünür. (Pulse/Ausculta
  sunucuda `badgeProgress` göndermiyor; onlar yerel `badgeViews` ile hesaplıyor, sorun yok.)
- `packages/sim-pulse/src/gamification/ui.ts` içindeki eski HTML `achievementsMarkup` (test/vendor yüzeyi)
  bilgi düğmesini çizmiyor; canlı Pulse İlerlemem ekranı gami-ui `GamiAchievementsView` kullandığı için
  capstone kartı orada tam. Vendor koduna plan gereği dokunulmadı.
- `packages/sim-*` paketlerine hiç dokunulmadı.

## Ek — Her sim için 40 rozetin sıralı listesi (kimlik · ad · kural · geçici mi)

### Pulse (40)
```
 1. mode-normal · Normal sinüs ritmi ustalığı · 1 başarılı oturum · kalıcı
 2. mode-af · Atriyal fibrilasyon ustalığı · 1 başarılı oturum · kalıcı
 3. mode-stemi · Anterior ST yükselmesi örneği ustalığı · 1 başarılı oturum · kalıcı
 4. mode-pvc · Ventriküler erken atım ustalığı · 1 başarılı oturum · kalıcı
 5. mode-svt · Düzenli dar kompleks taşikardi ustalığı · 1 başarılı oturum · kalıcı
 6. mode-inferior · İnferior ST yükselmesi örneği ustalığı · 1 başarılı oturum · kalıcı
 7. mode-vt · Monomorfik ventriküler taşikardi örneği ustalığı · 1 başarılı oturum · kalıcı
 8. mode-vf · Ventriküler fibrilasyon örüntüsü ustalığı · 1 başarılı oturum · kalıcı
 9. mode-pat · Fokal atriyal taşikardi ustalığı · 1 başarılı oturum · kalıcı
10. mode-flutter · Atriyal flutter ustalığı · 1 başarılı oturum · kalıcı
11. mode-sintach · Sinüs taşikardisi ustalığı · 1 başarılı oturum · kalıcı
12. mode-lbbb · Sol dal bloğu örneği ustalığı · 1 başarılı oturum · kalıcı
13. mode-rbbb · Sağ dal bloğu örneği ustalığı · 1 başarılı oturum · kalıcı
14. rhythm-streak-3 · Ritim izleyicisi · 3 doğru yanıt · kalıcı
15. caliper-1 · Kaliper başlangıcı · 3 doğru ölçüm · kalıcı
16. leads-3 · Üç derivasyon okuru · 3 doğru derivasyon · GEÇİCİ
17. rhythm-streak-5 · Ritim gözlemcisi · 5 doğru yanıt · GEÇİCİ
18. caliper-5 · Kaliper alışkanlığı · 5 doğru ölçüm · GEÇİCİ
19. duel-first · İlk düello · 1 düello · kalıcı
20. duel-first-win · İlk galibiyet · 1 galibiyet · kalıcı
21. duel-wins-3 · Düello serisi · 3 galibiyet · kalıcı
22. duel-rivals-3 · Farklı rakipler · 3 rakip · kalıcı
23. leads-6 · Altı derivasyon okuru · 6 doğru derivasyon · GEÇİCİ
24. caliper-2 · Kaliper ustalığı · 10 doğru ölçüm · kalıcı
25. rhythm-streak-10 · Ritim yorumcusu · 10 doğru yanıt · kalıcı
26. rhythm-streak-15 · Ritim çözümleyicisi · 15 doğru yanıt · GEÇİCİ
27. caliper-15 · Kaliper düzeni · 15 doğru ölçüm · GEÇİCİ
28. duel-wins-10 · Düello serisi · 10 galibiyet · kalıcı
29. duel-rematch · Rövanş · 1 rövanş · kalıcı
30. duel-rivals-10 · Farklı rakipler · 10 rakip · kalıcı
31. leads-9 · Dokuz derivasyon okuru · 9 doğru derivasyon · GEÇİCİ
32. twelve-leads · 12 derivasyon okuru · 12 doğru derivasyon · kalıcı
33. caliper-3 · Hassas ölçüm · 25 doğru ölçüm · kalıcı
34. caliper-40 · Kaliper virtüözü · 40 doğru ölçüm · GEÇİCİ
35. rhythm-streak-25 · Ritim ustası · 25 doğru yanıt · kalıcı
36. rhythm-streak-40 · Ritim şampiyonu · 40 doğru yanıt · GEÇİCİ
37. duel-wins-25 · Düello serisi · 25 galibiyet · kalıcı
38. duel-rivals-25 · Farklı rakipler · 25 rakip · kalıcı
39. mode-all · Tüm ritim örüntüleri · 13 mod ustalığı · GEÇİCİ
40. gercek-rozet · Gerçek Rozet · 39 rozetin tümü · capstone (kalıcı)
```

### Ausculta (40)
```
 1. systematic-1 · Sıralı muayene · 1 vaka · kalıcı
 2. heart-normal · S1 ve S2 · 3 vaka · kalıcı
 3. heart-extra · Ek kalp sesleri · 3 vaka · kalıcı
 4. rhythm-findings · Ritim ile uyumlu sesler · 3 vaka · kalıcı
 5. lung-vesicular · Veziküler solunum · 3 vaka · kalıcı
 6. pleural-rub · Plevral frotman · 3 vaka · kalıcı
 7. mixed-sounds · Kalp ve akciğer birlikte · 3 vaka · kalıcı
 8. listen-3 · Kısa dinleme · 3 vaka · kalıcı
 9. diagnosis-3 · Tanı eşleştirmesi · 3 doğru tanı · kalıcı
10. cardiac-foci · Dört kapak odağı · 5 muayene · kalıcı
11. posterior-lung · Arka akciğer alanları · 5 muayene · kalıcı
12. murmur-timing · Üfürüm zamanı · 5 vaka · kalıcı
13. lung-continuous · Sürekli ek sesler · 5 vaka · kalıcı
14. lung-crackles · Kesintili raller · 5 vaka · kalıcı
15. pediatric · Pediatrik vakalar · 5 vaka · kalıcı
16. head-choice · Bell ve diyafram · 5 doğru · kalıcı
17. duel-first · İlk düello · 1 düello · kalıcı
18. duel-first-win · İlk galibiyet · 1 galibiyet · kalıcı
19. duel-wins-3 · Düello serisi · 3 galibiyet · kalıcı
20. duel-rivals-3 · Farklı rakipler · 3 rakip · kalıcı
21. systematic-5 · Sistematik oskültasyon · 5 vaka · kalıcı
22. listen-8 · Süreli dinleme · 8 vaka · kalıcı
23. diagnosis-5 · Tanı deneyimi · 5 doğru tanı · GEÇİCİ
24. duel-wins-10 · Düello serisi · 10 galibiyet · kalıcı
25. duel-rematch · Rövanş · 1 rövanş · kalıcı
26. duel-rivals-10 · Farklı rakipler · 10 rakip · kalıcı
27. systematic-15 · Düzenli odak sırası · 15 vaka · kalıcı
28. listen-20 · Dinleme disiplini · 20 vaka · kalıcı
29. listen-30 · Dinleme ustası · 30 vaka · GEÇİCİ
30. systematic-25 · Sistematik ustalık · 25 vaka · GEÇİCİ
31. murmur-timing-10 · Üfürüm ustalığı · 10 vaka · GEÇİCİ
32. lung-crackles-10 · Rali ustalığı · 10 vaka · GEÇİCİ
33. posterior-lung-10 · Arka alan ustalığı · 10 muayene · GEÇİCİ
34. head-choice-10 · Bell ve diyafram ustalığı · 10 doğru · GEÇİCİ
35. diagnosis-10 · Tanı uzmanı · 10 doğru tanı · GEÇİCİ
36. duel-wins-25 · Düello serisi · 25 galibiyet · kalıcı
37. duel-rivals-25 · Farklı rakipler · 25 rakip · kalıcı
38. heart-topics · Tüm kalp konuları · 4 konu · GEÇİCİ
39. lung-topics · Tüm akciğer konuları · 4 konu · GEÇİCİ
40. gercek-rozet · Gerçek Rozet · 39 rozetin tümü · capstone (kalıcı)
```

### Opaca (40)
```
 1. first-step · İlk Adım · İlk değerlendirme · kalıcı
 2. systematic · Sistematik Okuyucu · 1 tam ABCDE · kalıcı
 3. ct-explorer · BT Kaşifi · 1 BT serisi · kalıcı
 4. fast-accurate · Hızlı ve Doğru · 90+ · yarı süre · kalıcı
 5. vascular · Damar Yolu · 3 vaka · kalıcı
 6. pleura · Plevra Dedektifi · 5 vaka · kalıcı
 7. pediatric · Pediatri · 5 vaka · kalıcı
 8. cardiac · Kalp Gölgesi · 5 vaka · kalıcı
 9. diaphragm · Diyafram Bilgesi · 5 vaka · kalıcı
10. bone · Kemik Gözü · 5 kırık · kalıcı
11. film-quality · Film Kalitesi · 10 doğru · kalıcı
12. sharp-eye-1 · Keskin Göz · 10 isabet · kalıcı
13. duel-first · İlk düello · 1 düello · kalıcı
14. duel-first-win · İlk galibiyet · 1 galibiyet · kalıcı
15. duel-wins-3 · Düello serisi · 3 galibiyet · kalıcı
16. duel-rivals-3 · Farklı rakipler · 3 rakip · kalıcı
17. interpreter · Klinik Yorumcu · 10 doğru · kalıcı
18. streak-3 · 3 Günlük Seri · 3 gün · kalıcı
19. explorer · Öğrenme Kaşifi · 10 konu · kalıcı
20. nodule · Nodül Avcısı · 10 vaka · kalıcı
21. tb · Tüberküloz Okuru · 10 vaka · kalıcı
22. no-hints · İpucusuz · İpucusuz oturum · kalıcı
23. assessments-10 · Düzenli Okur · 10 oturum · GEÇİCİ
24. practice-grit · Uygulama Azmi · 20 vaka · kalıcı
25. sharp-eye-2 · Keskin Göz · 25 isabet · kalıcı
26. streak-7 · 7 Günlük Seri · 7 gün · kalıcı
27. duel-wins-10 · Düello serisi · 10 galibiyet · kalıcı
28. duel-rematch · Rövanş · 1 rövanş · kalıcı
29. duel-rivals-10 · Farklı rakipler · 10 rakip · kalıcı
30. practice-50 · Uygulama Ustası · 50 vaka · GEÇİCİ
31. threshold · Eşik Aşıldı · 80 puan · kalıcı
32. all-topics · Tüm Konular · Tüm konular · kalıcı
33. perfect · Kusursuz Oturum · 100 puan · kalıcı
34. streak-30 · Ay Boyu Seri · 30 gün · kalıcı
35. marathon · Maraton · 50 oturum · kalıcı
36. duel-wins-25 · Düello serisi · 25 galibiyet · kalıcı
37. duel-rivals-25 · Farklı rakipler · 25 rakip · kalıcı
38. sharp-eye-3 · Keskin Göz · 50 isabet · kalıcı
39. podium · Podyum · Aylık ilk 3 · kalıcı (şu an kazanılamıyor; capstone koşuluna girmez)
40. gercek-rozet · Gerçek Rozet · 38 rozetin tümü · capstone (kalıcı)
```

## Değişen/yeni dosyalar

`packages/gamification-core/src/{badges,badgeView,index}.ts`;
`packages/gami-catalogs/src/{pulse,ausculta,opaca}.ts`;
`packages/gami-ui/src/{types,model,GamiBadge,index,styles.css,styles-inline}.ts(x)`;
`apps/api/src/me/gamification.ts`; `apps/shell/src/home/{badgeCatalog.ts,ProgressSection.tsx}`;
`e2e/sims.spec.ts`;
`tests/gamification-core/{badges,badgeView}.test.ts`; `tests/gami-catalogs/{capstone.test.ts(yeni),duel.test.ts}`;
`tests/gami-ui/views.test.ts`; `tests/sim-pulse/gamification.test.ts`;
`tests/sim-opaca/gamification/badges.test.ts`; `tests/api/gami-badge-progress.test.ts`.
