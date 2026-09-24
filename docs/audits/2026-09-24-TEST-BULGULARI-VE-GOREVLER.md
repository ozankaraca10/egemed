# EGEMED — test bulguları ve düzeltme görevleri

Tarih: 24 Eylül 2026. İncelenen dal/commit: `dev` / `1b25103`.
Temel: güncel README ve çalışan kod. Tarihsel devir notu güncel durum kaynağı olarak kullanılmadı.

## Karar ve kapsam

**Depo sahibinin yönlendirmesi: Pulse, çalışan kaynak runtime esas alınarak bütünüyle yeniden entegre edilecek.**
Kaynak: `~/Documents/EGEMED CLIX/EGEMED_PULSE/cardai/`. `BUILD.md` bu dizini yetkili runtime olarak tanımlıyor.
Platformun `packages/sim-pulse/src/mount.ts` içindeki sadeleştirilmiş ekranları kaynakla davranış bakımından eşdeğer değil.
Motor ve müfredat dosyalarının taşınmış olması, çalışan ürünün taşındığı anlamına gelmiyor.

Bu dosya düzeltmelerin uygulanmış olduğunu bildirmez. Ürün kodu değiştirilmedi.
Kullanıcının süre/kota yönlendirmesi üzerine denetim bu noktada kapatıldı; aşağıdaki liste **doğrulanmış bulguları ve açıkça belirtilmiş inceleme işlerini** içerir, bütün hataların bulunduğu iddiasını taşımaz.

## Yapılan doğrulamalar

| Kontrol | Sonuç ve sınır |
|---|---|
| `pnpm turbo lint typecheck test --force` | 14/14 görev; 158 dosyada 1.294 test geçti. Önbellek kullanılmadı. |
| Mevcut `pnpm e2e:mobile --workers=2` | 116/116 geçti; 360/768/1440 ve üretim önizlemesi. Başlangıçta API kapalıydı. |
| API oturum E2E | API çalıştırıldıktan sonra `api-dev` projesindeki 5/5 test geçti. Aşağıdaki çalışma zamanı geçici bayrağı kullanıldı. |
| PostgreSQL migration | Ayrı `clix_audit_20260924` veritabanında up→down→up ve append-only denetim kontrolü geçti. Mevcut geliştirme veritabanına migration uygulanmadı. |
| Pulse kaynak/platform karşılaştırması | Gerçek Chromium; inceleme, vaka, sınav, sonuç, kayıt, animasyon ve ekran görüntüleri. Her iki sürümde 10 vaka ve 10 soru tamamlandı. |
| Pulse iç ekranları | 360/768/1440; axe, boyut, başlık, klavye, rota ve runtime kontrolleri. Mevcut testlerde bulunmayan hatalar saptandı. |
| Gerçek HTTP + PostgreSQL | Sentetik kullanıcı, giriş/yetki, CSRF/Origin, sim erişimi, attempt yazımı, sim izolasyonu, özet, toplu durum işlemi. |
| API ile bağlı kabuk | Gerçek giriş sonrasında admin/dashboard veri kaynağı ve kullanıcı değişiminde Pulse kaydı incelendi. |

API'nin standart `start` komutu çöktüğü için sonraki API testlerinde yalnız test sürecine `NODE_OPTIONS=--experimental-transform-types` verildi. Bu bir ürün düzeltmesi değildir; standart başlatmanın başarılı olduğunu göstermez.

Yerel kanıtlar (git dışı): `.egemed-run/audit-2026-09-24/` içindeki `gates.log`, `e2e.log`, `migration.log`, `api-e2e.log`, `inspection.json`, `deep-browser.json`, `deep-remaining.json`, `api-audit.json` ve `screenshots/`.
Tekrarlanabilir betikler: `inspect.mjs`, `deep-browser.mjs`, `api-env.mjs`, `api-audit.mjs` aynı dizindedir. Betikler test sunucuları ve yalnız sentetik test verisi gerektirir.
İlk derin karşılaştırma betiğinde kaynak sınav ekranının DOM seçicisi yanlış olduğu için bir test koşumu durdu; seçici düzeltilerek kalan akışlar `deep-remaining.json` içinde tamamlandı. Bu harness hatası ürün bulgusu değildir.

Öncelik: **P0** veri/erişim izolasyonu veya yayın engeli; **P1** temel işlev kaybı; **P2** erişilebilirlik, kullanılabilirlik ve doğrulama borcu. Yeniden entegrasyon alt işleri tek tek değil, aşağıdaki kabul matrisinin tamamı üzerinden kapatılmalı.

## 1. Pulse yeniden entegrasyonu

- [ ] **PULSE-00 · P1 · Kaynak runtime üzerinden yeniden entegrasyonu tamamla.**
  - Ana iş; PULSE-01…11 alt kapsamını kapsar. Mevcut `mount.ts` kaynak uygulamanın tam arayüzü değildir.
  - Kaynak `app.js`, `features.js`, `landing.js`, `index.html`, `styles.css` davranışlarını envanterle; doğrulanmış motor/müfredat kodunu koru. SCORM taşıma katmanını platform kayıt/yaşam döngüsü sözleşmesine uyarla.
  - Ortak platform üst barı, sim kökü/CSS izolasyonu, mount/dispose, kullanıcı kimliği ve veri kaynağı açık sözleşmelerle bağlansın.
  - **Kabul:** kaynak/platform aynı senaryolarda karşılaştırılsın; aşağıdaki alt işler ve 360/768/1440 E2E matrisi eksiksiz geçsin. Yalnız “canvas göründü” veya markup testi yeterli değildir.

- [ ] **PULSE-01 · P1 · Vaka ve sınavdaki EKG ile klinik bağlamı geri getir.**
  - Kanıt: kaynak vaka ve sınavında birer EKG canvas var; platformda ikisinde de sıfır. Platform yalnız soru/seçenek kartını çiziyor; `stem`, vital bulgular ve EKG sahnesi yok.
  - Kaynak: `packages/sim-pulse/src/mount.ts:128` ve `:133`; `ui/sim/itemEcg.ts`, `ui/case.ts` içindeki sahne yardımcıları mevcut ama bağlanmamış.
  - Tekrar: Pulse → Uygulama veya Değerlendirme; “Bu ölçümlerle…” sorusunu aç. Ölçüm/grafi bağlamı görünmüyor.
  - **Kabul:** her madde kendi klinik anlatımı, vital bulguları, doğru EKG/derivasyon/zoom ile çizilsin; 200 vaka ve 200 sorunun veri alanları ekranla eşleşsin.

- [ ] **PULSE-02 · P1 · İnceleme araçlarını ve öğretim akışını bağla.**
  - Kaynakta bulunan oynat/duraklat, sonraki olay, başa al, hız, zaman çizgisi, üç derivasyon seçicisi, AF profili, karşılaştırma, kaliper, metrikler, anatomi katmanları, rehber, sistematik okuma ve klinik kartlar platformda yok.
  - Kanıt: kaynak inceleme ekranında 50 görünür button/input/select/canvas; platformda 21, bunların 20'si gezinme/ritim düğmesi. `mount.ts:126` yalnız kalp, küçük canvas ve özet paragrafı kuruyor.
  - **Kabul:** kaynak kontrol envanterindeki her işlev için gerçek kullanıcı eylemi ve gözlenebilir sonuç; duraklatınca zaman/çizim durmalı, hız/derivasyon/AF seçimi doğru modele yansımalı.

- [ ] **PULSE-03 · P1 · Kalp animasyonunu motorla eşzamanlı çalıştır.**
  - `mount.ts:126` daima `heartMarkup("fill")` kullanıyor. `drawCurrent` kök fazını ve EKG'yi güncelliyor, SVG'yi güncellemiyor.
  - Kanıt: 6 zaman örneğinde kaynak kalp SVG'si 6 farklı durum; platform SVG'si 1 durum. Platformun motor fazı bu sırada değişiyor.
  - **Kabul:** kapaklar, odacıklar, elektriksel uyarı, akış ve ritme özgü görünüm kaynakla eşzamanlı; normal/AF/STEMI/VT/VF dahil 13 mod karşılaştırılsın.

- [ ] **PULSE-04 · P1 · Kaynak yerleşim ve SVG/CSS eşleşmesini onar.**
  - Kanıt: 1440 px'de kaynak EKG genişliği yaklaşık 783 px; platform canvas'ı varsayılan **300×150**. Büyük panelin geri kalanı boş; açıklama üçüncü hücre olarak alta düşüyor; ritim düğmeleri tarayıcı varsayılanı gibi görünüyor, anatomide siyah dolgu ve okunurluk kayıpları var.
  - Kaynak: `mount.ts:126`, `styles/sim.css`, `styles/responsive.css`, `ui/sim/heartMarkup.ts`. CSS `.right-column` ve `.ecg-screen canvas` bekliyor; kurulan DOM bu yapıyı taşımıyor.
  - **Kabul:** ekran görüntüsü karşılaştırması; canvas konteyneri doldursun, DPR/yeniden boyutlandırma doğru olsun, kalp/EKG/açıklama birlikte okunabilsin. Mobilde yalnız yatay taşma yokluğu yeterli değil.

- [ ] **PULSE-05 · P1 · 10 vakalık oturumu gerçek tamamlanma ekranıyla bitir.**
  - Kanıt: her iki sürümde 10 doğru vaka gönderildi. Kaynak “Oturum tamamlandı · 10/10 doğru”, rapor/yanlışlar/tekrar/yeni set gösteriyor. Platform “Vakayı tamamla” sonrasında ilk vakaya dönüyor.
  - Kaynak: `mount.ts:343`; `index === 9 ? 0 : index + 1`. `caseEndMarkup` ve rapor işlevleri bağlanmamış.
  - **Kabul:** bitiş raporu, önceki/sonraki, yanlışları gözden geçirme, aynı seti tekrar, yeni set onayı ve ilgili simülatöre aç/dön işlevleri kaynakla eşdeğer olsun.

- [ ] **PULSE-06 · P1 · Sınav sonuç/tekrar/rapor akışını tamamla.**
  - Kanıt: kaynak 10. gönderimle otomatik sonuç ekranına geçiyor ve alan/soru raporu, “Tekrar dene”, yeni set sunuyor. Platform ayrıca “Sonuçları gör” istiyor; sonuç ekranında yalnız puan/kazanımlar var. Önceki soru/yeniden başlatma/CSV de bağlanmamış.
  - Kaynak: `mount.ts:349`, sonuç fallback'i; `ui/results.ts` mevcut işlevler.
  - **Kabul:** 10/10 tamamlama, mevcut deneme ile en iyi puanın ayrımı, alan bazlı rapor, cevap güncelleme ve tekrar akışları E2E ile doğrulansın.

- [ ] **PULSE-07 · P1 · Yenileme/rota çıkışında gözlem ilerlemesini kaydet.**
  - Kanıt: inceleme çalışırken kalp/ritim fazları ilerliyor; kayıttaki gözlem değeri 0. Yenilemeden sonra da 0. Zaman içindeki değişiklikler save çağrısına bağlanmıyor.
  - Kaynak: `mount.ts:342` ve dispose bloğu; kayıt çoğunlukla click/change sonunda yapılıyor. Mount ayrıca etkin görünümü daima `modes` ile eziyor (`:204`).
  - **Kabul:** gözlem, zaman ve aktif oturum; periyodik kayıt, pagehide/visibility ve dispose ile korunmalı. Depolama hatası kullanıcıya bildirilmeli; test hata enjeksiyonu içermeli.

- [ ] **PULSE-08 · P0 · Kullanıcılar arasında Pulse kaydı paylaşılmasını engelle.**
  - Kanıt: gerçek API ile admin girişinde bir soru gönderildi; çıkış yapılıp öğrenciyle girildiğinde **aynı quiz session ID ve submitted mask=1** yüklendi.
  - Kaynak: `mount.ts:200,210`, `persistence/types.ts` → `egemed-pulse-6.0`, `gamification/repo.ts` → `egemed-pulse-gami-1.0`; anahtarlar kullanıcıya göre ayrılmıyor, SimRoute kimlik geçmiyor.
  - **Kabul:** kullanıcı×sim izolasyonu; logout/hesap değiştirme ve iki sekme senaryoları. Anonim kayıtların yeni hesaba sessizce aktarılması engellensin. Aynı desen diğer sim depolarında ayrıca taransın.

- [ ] **PULSE-09 · P1 · Sonuç güncellemesi ile oyunlaştırma kaydını tutarlı kıl.**
  - Kanıt: 100 puanlık sınavdan sonra son yanıt yanlış yapılıp güncellendi. Sonuç ekranı 90, oyunlaştırma attempt kaydı 100 kaldı. Seçenek değiştirildiği anda, “Yanıtı güncelle”ye basılmadan kayıtta yanıt değişiyor ve gönderilmiş bayrağı korunuyor.
  - Kaynak: `mount.ts:250,349,389`, `gamification/repo.ts` attempt kimliğiyle tekilleştirme; `engine/state.ts` puan türetimi.
  - **Kabul:** taslak/gönderilmiş yanıt sınırı açık olsun; aynı denemenin güncellemesi puan, XP, rozet ve en iyi skorla tutarlı olsun; yinelenen kayıt ödülü çoğaltmasın.

- [ ] **PULSE-10 · P2 · Klavye odağı ve iç ekran erişilebilirliğini tamamla.**
  - Kanıt: sınav radiosuna odaklanıp Space ile seçim sonrası odak `BODY` oluyor. `mount.ts:321` her değişimde tüm kökü `innerHTML` ile yeniden kuruyor.
  - Axe: vaka/sınav seçeneklerinde `nested-interactive`; label `role=radio` içerisine odaklanabilir native input konmuş. Hakkında sayfasında `target-size` hatası. 13 ritim düğmesi 44 px altında; başarı CTA'sı 27 px, liderlik select'i 21 px yüksek.
  - **Kabul:** klavyeyle kesintisiz seçim/gönderim/gezinme; görünür odak korunmalı. Tüm iç ekranlarda 360/768/1440 axe ve 44 px kontrolü. Kaynaktan devralınmış a11y kusurları da düzeltilmeli.

- [ ] **PULSE-11 · P2 · Öğretici/yardım ve oturum yönetimi araçlarını tamamla.**
  - Kanıt: kaynakta yardım, öğretici, CSV indirme, ilerlemeyi sıfırlama ve yeni set onayları var. Platform nav'ında öğreticiye giriş yok; Hakkında yalnız metinsel içerik gösteriyor. İlgili saf yardımcıların export edilmesi kullanıcı akışını oluşturmuyor.
  - **Kabul:** platform içinde yardım/öğreticiye erişim, sıfırlama ve yeni set onayı, CSV ve güvenli geri dönüş; full-screen sahipliği platformla netleştirilsin.

## 2. Platform ve API görevleri

- [ ] **PLATFORM-01 · P1 · Doğrudan sim rotası değişimindeki sonsuz yüklemeyi düzelt.**
  - Tekrar: açık `#/sims/pulse` sayfasında hash'i doğrudan `#/sims/opaca` yap; ardından pulse/ausculta arasında geç.
  - Kanıt: dört geçişte host çocuk sayısı 0, `aria-busy=true`, yükleme bitmiyor. Araya simülatörler liste sayfası koyan mevcut E2E bu yolu test etmiyor.
  - Kaynak: `apps/shell/src/SimRoute.tsx` effect cleanup'ının aynı host'u Promise mikro görevinde dispose etmesi; yeni mount'u da iptal ediyor.
  - **Kabul:** ardışık/geri-ileri/hızlı sim değişimleri, gecikmeli import ve retry; son istenen sim tek kökle açılmalı.

- [ ] **PLATFORM-02 · P1 · Gerçek oturumda admin ve dashboard veri kaynaklarını API'ye bağla.**
  - Kanıt: API ile giriş başarılı; kullanıcılar ekranı “Örnek Kullanıcı 001…” gösteriyor. Ağda yalnız `/auth/me` ve `/auth/dev/login`; `/admin/users` isteği yok. Dashboard yeni hesapta sabit **1450 XP, seviye 4** gösteriyor; `/me/gamification` isteği yok.
  - Kaynak: `apps/shell/src/admin/UsersPage.tsx:610`; diğer admin sayfalarının `defaultSource` işlevleri; `home/ProgressSection.tsx:139`. Sayfalar ayrı mock kaynak kuruyor.
  - **Kabul:** oluştur/düzenle/rol/import/audit ve dashboard gerçek DB'ye uçtan uca bağlı olsun; yenilemede kalıcılık ve sayfalar arası tutarlılık doğrulansın. Demo verisi gerçek oturum ilerlemesi gibi gösterilmesin.

- [ ] **PLATFORM-03 · P1 · Ausculta'nın gerçek modülünü kabuğa bağla.**
  - Doğrulanmış eksik entegrasyon; README de açıkça bildiriyor. `apps/shell/src/sims/loaders.ts` Ausculta için placeholder yüklüyor; paket/adaptör hazır olsa da kullanıcıya ulaşmıyor. Kabuk Vite varlık eklentileri yalnız Opaca/Pulse'u kapsıyor.
  - **Kabul:** lazy loader, ses varlıkları, öğrenci bağlamı, gerçek ses/oturum/sonuç ve dispose testleri birlikte tamamlanmalı. Mevcut placeholder testleri başarı kapısı olarak kullanılmamalı.

- [ ] **API-01 · P0 · API'nin standart Node başlangıcını çalışır hale getir.**
  - Kanıt: `pnpm --filter @egemed/api start` Node 24.20.0 üzerinde `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` ile kapanıyor.
  - Kök: `packages/gamification-core/src/repository.ts:60`, `constructor(readonly method: string)`; Node strip-only parametre property'sini çalıştıramıyor. `apps/api/ts-resolve.mjs` yalnız import çözümlemesi yapıyor.
  - **Kabul:** ilan edilen Node sürümünde gerçek `start` ve `/health/db` duman testi; API runtime import zinciri kontrolü. Vitest/typecheck geçmesi başlangıç doğrulaması sayılmasın.

- [ ] **API-02 · P0 · Üretim Dockerfile'ının çalışma zamanı dosyalarını tamamla.**
  - Statik olarak doğrulanmış: `infra/prod/Dockerfile` bağımlılıkları `deps` aşamasına kuruyor, `runtime` aşamasına `COPY --from=deps` yapmıyor. `ts-register.mjs`/`ts-resolve.mjs` de kopyalanmıyor; CMD eksik dosyayı çağırıyor. Yeni `gamification-core` workspace bağımlılığı da imaj kopyalama kapsamı dışında.
  - Üretim imajı bu denetimde build edilmedi; çalışma başarısı iddia edilmez.
  - **Kabul:** temiz checkout'tan image build, non-root başlangıç, migration ve `/health/db` doğrulaması. Test host'taki node_modules'a bağımlı olmamalı.

- [ ] **API-03 · P0 · Sim erişim yetkisini okuma/yazma ve kabukta uygula.**
  - Kanıt: `simAccess: []` ile oluşturulup giriş yapan sentetik kullanıcı `/me/gamification/pulse/attempts` için **201** aldı.
  - Kaynak: `apps/api/src/me/gamification.ts:796` yalnız aktif kullanıcı/rol kontrol ediyor; simAccess kontrolü yok. `ShellSession` da simAccess bilgisini korumuyor, sim rotasında erişim kapısı yok.
  - **Kabul:** yetkisiz sim için doğrudan HTTP ve UI erişimi reddedilmeli; erişim kaldırma açık oturuma da yansımalı. İzin verilen simler etkilenmemeli.

- [ ] **API-04 · P1 · Attempt idempotency kontrolüne kullanıcı ve sim kapsamını dahil et.**
  - Kanıt: Pulse'a yazılmış aynı attempt gövdesi/ID Opaca endpoint'ine gönderilince **200 ve `simId:"pulse"`** döndü.
  - Kaynak: `me/gamification.ts:307,411`; SQL mevcut kaydı kullanıcıyla filtreliyor ama sim ile filtrelemiyor; `sameAttempt` sim kimliğini karşılaştırmıyor. Bellek uygulamasındaki kullanıcı kapsamı da ayrıca düzeltilmeli.
  - **Kabul:** aynı kullanıcı×sim×attempt tekrarında 200; başka sim/kullanıcı kapsamındaki ID çakışmasında 409; yanıtın simId'si istek yolu ile uyuşmalı.

- [ ] **API-05 · P1 · Oyunlaştırma yazımını profil/XP/seri/rozet güncellemesine bağla.**
  - Kanıt: 80 puan ve `summary.xp=40` ile attempt 201; özetin haftalık XP'si 40 fakat toplam XP 0, seviye 1, seri 0, rozetler boş, liderlik toplamı 0 kaldı.
  - Kaynak: `me/gamification.ts:277` yalnız `gami_attempts` ekliyor. Kullanıcı profili/ödül hesaplama hattı bu yazımda yok.
  - **Kabul:** sunucunun yetkili hesaplama kaynağı tanımlansın; tek transaction/idempotent kayıt profili ve özeti tutarlı güncellesin. İstemciden keyfi XP kabulü kaldırılmalı/sınırlandırılmalı.

- [ ] **API-06 · P1 · Attempt özet ve zaman doğrulamasını güçlendir.**
  - Kanıt: `summary.xp=-100` kabul edildi; GET özetinde `weeklyGoal.currentXp=-60` döndü. Bu yanıt kendi `gamiWeeklyGoalSchema.min(0)` sözleşmesini ihlal ediyor. Bitişi başlangıçtan bir dakika önce olan attempt da 201 aldı.
  - Kaynak: `packages/contracts/src/schemas/gamification.ts` → genel `z.number().int()` özet sözlüğü; başlangıç/bitiş sıralaması refinement'ı yok.
  - **Kabul:** sim/moda göre izinli alanlar, sayı sınırları, zaman sırası ve tutarlı skor/geçme kuralları; yazımdan sonra tüm GET yanıtları gerçek istemci şemasıyla doğrulanmalı.

- [ ] **API-07 · P1 · Toplu durum/birim işlemlerinin dönen kullanıcı kimliklerini düzelt.**
  - Kanıt: bir kullanıcı askıya alındı; API aynı yanıtta `updated:1` ve o kullanıcı için `skipped:[{code:"no_change"}]` döndürdü. Gerçek durum değişmişti.
  - Kaynak: `apps/api/src/admin/bulk.ts:104`: bütün sonuçlar `row.user_id` okunuyor; `set_status` ve `set_unit` sorguları `returning id` kullanıyor. Yanlış kimlik seti audit/oturum iptali hattını da etkiliyor.
  - **Kabul:** her bulk işlemi için gerçek PostgreSQL testi; güncellenen/atlanmış kullanıcılar ayrık ve doğru olmalı; audit hedefi ve iptal edilen session kullanıcıları doğru UUID taşımalı.

- [ ] **PLATFORM-04 · P1 · Üretim kimlik entegrasyonunu ayrı yayın kapısı olarak tamamla.**
  - Bilinen eksik iş: `apiMode.ts:16` üretimde daima null; App API oturum kodunu DEV ile kapatıyor. API `server.ts` SSO adaptörünü daima null geçiriyor. SSO protokol kararı README'de açık.
  - **Kabul:** insanın protokol kararından sonra gerçek üretim giriş/me/logout ve yetki akışı; üretim derlemesinde dev hesabı bulunmaması korunmalı. Yerel dev giriş testinin geçmesi üretim girişinin hazır olduğu anlamına gelmez.

## 3. Test ve kaynak kusurları

- [ ] **TEST-01 · P1 · Geçen kapıları gerçek ürün akışını kapsayacak şekilde genişlet.**
  - Kanıt: yukarıdaki temel kayıplara rağmen 1.294 + 116 test geçti. `e2e/layout.spec.ts` sim host içindeki dokunma hedefi ve görüntüleri açıkça hariç tutuyor; axe yalnız ilk rota ekranlarını geziyor. Pulse testi canvas görünürlüğünü kontrol ediyor, vaka/sınavı bitirmiyor.
  - `playwright.config.ts` API kapalıysa `api-dev` projesini hiç tanımlamıyor. CI yalnız lint/typecheck/test çalıştırıyor; gerçek API start/DB/browser entegrasyonu yayın kapısı değil.
  - **Kabul:** kaynak/platform diferansiyel senaryolar, 10 vaka/10 soru, kayıt/hesap değişimi, canlı API CRUD/import ve iç ekran axe testleri; zorunlu API hazır değilse açık failure. Her koşu commit/browser/sonuç/screenshot artefaktı üretmeli.

- [ ] **KAYNAK-01 · P2 · Kaynaktan devralınan puan/başarı çelişkisini triage et.**
  - Kaynakta doğrudan sınava girip 10/10 doğru yanıt verildiğinde toplam puan **100**, sonuç metni **“Hedefin altında”** çıktı. İnceleme/vaka önkoşulları tamamlanmadığı için `state.passed` farklı semantik taşıyor.
  - Platformun `engine/state.ts:93` de başarıyı inceleme+vaka+puan koşuluyla türetiyor. Kaynak kusuru yeniden entegrasyon sırasında sessizce “referans doğru” kabul edilmemeli.
  - **Kabul:** modül tamamlama koşulu ile sınav puan eşiği ayrı gösterilsin; 100 puan için “80 eşiğinin altında” mesajı çıkmasın. README'nin öneri/kilit ayrımıyla tutarlı karar kaydedilsin.

## Uygulama sırası ve kapanış koşulu

1. PULSE-00 altında çalışan kaynağın kontrol/ekran envanterini ve karşılaştırmalı E2E tabanını sabitle; ardından PULSE-01…11'i entegrasyon dilimleriyle uygula.
2. PULSE-08, API-03 ve API-04 veri/erişim izolasyonunu önceliklendir; gerçek kullanıcı verisiyle deneme yapma.
3. API-01/02 ile çalıştırılabilir sunucu/imajı, API-05…07 ile kalıcı kayıt bütünlüğünü tamamla.
4. PLATFORM-01…04 ve TEST-01 üzerinden bütün ürünü gerçek API ile doğrula.

Yeni işlerde proje kuralı: E2E öncelikli; anlamlı güvenlik/sözleşme/migration/yaşam döngüsü istisnaları korunur. Her düzeltmenin acceptance testi önce bu somut hata yolunu hedeflemeli.

**Henüz derin incelenmeyenler:** Opaca'nın tüm vaka/sonuç akışları; Ausculta'nın bağımsız paket UI/ses doğrulaması; CSV gerçek DB apply yarışı/geri alma; SSO gerçek sağlayıcı; xAPI/LRS iletimi; temiz üretim Docker build ve dağıtım; uzun süreli bellek/performans ve tüm tarayıcılar. Bu alanlar başarılı sayılmadı.

Pulse kaynak/platform ekran görüntüleri ve yeniden üretme adımları, yeniden entegrasyona başlayacak ajan için ilk referanstır. Bu dosyanın görevleri uygulanıp kanıtları doğrulanana kadar “Pulse portu tamam” kabulü yapılmamalıdır.
