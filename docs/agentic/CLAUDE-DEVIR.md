# Claude Code devir notu (28 Eylül 2026)

Bu belge, başka bir Claude Code hesabının (ya da oturumunun) işi kaldığı yerden sürdürmesi içindir. Önce bunu, sonra `AGENTS.md`'yi oku. Kullanıcıya **her zaman Türkçe** yanıt ver.

## 1. Rol dağılımı ve iş akışı (depo sahibi kararları)

- **Claude = planlayıcı, dağıtıcı, gözden geçiren, test eden ve merge eden.** Her göreve Z1–Z5 zorluk etiketi ver. **Z1–Z4 → DeepSeek 4.1 Flash (OpenCode, `--variant max`, aynı anda 2 ajan)**. Yalnız **Z5** işleri Claude kendisi yazar (ör. Pulse EKG motoru ve kalp/iletim animasyonu — kullanıcı özellikle "sen yap" dedi).
- Tıbbi içerik (soru havuzu, açıklama kartları, validasyon) DeepSeek'e taslak olarak verilebilir ama **Claude madde madde tıbbi review yapar** ve düzeltir.
- Her görev: `.agtx/worktrees/<T>` altında `task/<T>` dalı, `.egemed-run/plan.md` (Claude yazar), `.egemed-run/summary.md` (işçi yazar). İşçi commit/merge/push YAPMAZ.
- **Merge yalnız kapılı betikle:** `zsh scripts/agtx/claude/merge-gated.sh <worktree-adı> "<mesaj>" <yollar...>` — kapılar (`pnpm turbo lint typecheck test`) N/N değilse merge etmez; shell/sim/ui/e2e değişikliğinde post-merge `e2e:mobile` koşar ve yeni kırmızıda dev'i geri alır.
- **git push YOK, force/history rewrite YOK.** Git: `/Applications/Xcode.app/Contents/Developer/usr/bin/git`.
- Büyük UI/UX çözümlerini önce kullanıcıyla paylaş (AskUserQuestion). Gerçek öğrenci verisi repoya girmez; sırlar yalnız `.env.local` (asla okuma/yazdırma; yalnız `source`). `~/Documents/EGEMED CLIX` kaynak depolarına YAZMA.

## 2. Araçlar (`scripts/agtx/claude/`)

| Betik | Ne yapar |
|---|---|
| `merge-gated.sh` | Kapılı merge (yukarıda). `FORCE_COLOR=0` ve e2e sırasında `EGEMED_E2E_API_URL=http://127.0.0.1:9` (demo API'yi görmezden gelir). |
| `oc-queue-m.sh <kuyruk>` | OpenCode DeepSeek kuyruğu; satır biçimi `worktree|log|prompt`; global en fazla 2 `opencode run`. Worktree yolu betikte sabit. Log: `~/Documents/Codex/2026-09-23/egemed-tools/w-deepseek.log` (betiği yeni yere taşırsan `W=` ve log yolunu güncelle). |
| `api-dev-e2e.sh <repo-ya-da-worktree>` | Geçici Postgres DB + 3100'de API ile `api-dev` e2e projesi; sonunda API'yi kapatır ve DB'yi siler (**demo API'yi de kapatır**, sonra yeniden başlat). |
| `demo-env.sh` | `source` edilir: `.env.local`'ı yazdırmadan yükler, DB'yi `egemed_local_demo`'ya çevirir. |

**Kritik tuzaklar**
1. `oc-queue` bitince Claude'a bildirim GELMEZ. Her dağıtımdan sonra log'daki `bitti|BAŞARISIZ` satır sayısını izleyen arka plan izleyicisi başlat; bir iş biter bitmez boşalan yere yeni iş ver, sonra review et. (Bir kez 45 dk boşta kaldı.)
2. İki kuyruk betiğini aynı anda "boş yer bekler" halde bırakma (yarış → 3 ajan). Öncelikli olanı başlat, diğerini o başladıktan sonra kuyruğa koy.
3. Demo API (3100) açıkken e2e `api-dev` projesi ona bağlanır → sahte kırmızı. Betik artık engelliyor; API değiştiren merge'ten sonra `api-dev-e2e.sh` ile ayrıca doğrula.
4. Farklı tabanlardan dallanan görevler `packages/contracts/src/schemas/simSession.ts`, `apps/shell/src/sims/{devLocalSessions,sessionSources}.ts` ve `e2e/auth-api.spec.ts`'te sık çakışır; merge öncesi worktree'de `git merge dev` yapıp çakışmayı çöz, kapıları koş, sonra merge-gated.
5. Worktree'de çalışırken mutlak yol kullan; ana ağaç (`dev`) temiz kalmalı.
6. Bilgisayar uykuya geçerse OpenCode "Cannot connect to API" ile düşer; görevi yeniden kuyruğa koy.

## 3. Yerel demo

- Kabuk: `http://127.0.0.1:5180` (API modu; `VITE_API_BASE_URL=/api`, `VITE_API_PROXY_TARGET=http://127.0.0.1:3100`, ana depodan `apps/shell` vite). Hesaplar `ogrenci`, `ogrenci2`, `admin` — parola `egemed` (yalnız DEV).
- API: `cd apps/api && source scripts/agtx/claude/demo-env.sh && pnpm -s migrate:up && nohup node --import ./ts-register.mjs src/server.ts &` (3100). DB: `egemed_local_demo` (kalıcı).
- Her API/migration merge'ünden sonra demo API'yi yeniden başlat.

## 4. Bugüne kadar (dev'de)

- **ADR-009 sunucuda puanlama:** Ausculta (A1, T196), Opaca (A2: T200 banka, T202 API+görüntü vekili, T212a/b istemci), Pulse (A3: T215 banka `packages/assessment-bank/data/pulse/items.json`, T216 API, T217 istemci). Üç simde uygulama/değerlendirme yalnız sunucu oturumuyla; cevap anahtarı sunucuda.
- **ADR-010 Meydan Okuma** (eşzamansız düello). **ADR-011** Pulse runtime'ı platform sahiplendi (`packages/sim-pulse/src/runtime/vendor/*.js` doğrudan düzenlenir, kompakt tek satır stilini koru; kaynak depo artık yetkili değil).
- **Pulse 10 yeni patern (14–23):** sinbrady, avb1, mobitz1, mobitz2, chb, pac, junctional, wpw, pericarditis, hyperk. Motor + kalp/iletim animasyonu (T204, Claude), kategori çerçeveli 23 sekme (T208), soru havuzu 600 madde (T210, T211 — Claude tıbbi review'lu), tıbbi parametre kaydı `docs/specs/pulse-patern-14-23-tibbi-validasyon.md` (**Kardiyoloji ABD onayı bekliyor**).
- **Öğrenme kilidi:** üç simde öğrenme bitmeden uygulama/değerlendirme kapalı ve o simde düello yok (T205 altyapı + sunucu kaydı `sim_learn_completions`; Ausculta T209, Pulse T208/T213; Opaca T218 sürüyor). "Bitti" tanımı: Pulse 23 paternin her biri ≥16 s izlendi; Ausculta kütüphanedeki her ses ≥1 dinlendi; Opaca kütüphanedeki her konu açıldı.
- Ausculta/Opaca öğrenme ekranı dikey uzama düzeltildi (T206/T207); Ausculta zayıf konu odağı sunucudan (T214).

## 5. Sürenler ve sıradakiler (öncelik sırasıyla; 28 Eylül 2026 13:10)

Tamamlanan (dev): T217 Pulse istemcisi sunucu oturumunda, **T219** uzmanlık öğrencisi rolü (`uzmanlik_ogrencisi`, migration 012; oyunlaştırmada öğretim üyesi gibi) + admin/öğretim üyesi/uzmanlık öğrencisinde öğrenme kilidi yok, **T220** Pulse cevap anahtarı istemciden kaldırıldı + üretim sızıntı testi. **Pulse Astra denetimine teslim edildi** (dev `3e3e1c9`).

1. **Astra Pulse denetimi (kullanıcı yürütüyor).** Çıktılar depo dışına: `~/Documents/Codex/2026-09-23/egemed-tools/astra-pulse-denetim.md`, `astra-pulse-maddeler.csv` (600 madde: tut/düzelt/çıkar, rafine 200+200 sete dahil mi), `astra-pulse-ekranlar/`. Gelince: bulguları Z etiketiyle görevlere böl, tıbbi olanları kendin incele, 200+200 set kararını kullanıcıya sor, düzelt ve merge et. Denetim sürerken demo API'yi (5180/3100) yeniden başlatma.
2. Düzeltmelerden SONRA **kardiyoloji öğretim üyesi için validasyon belgesi** (önceden taslak YOK).
3. **T218** Opaca öğrenme kilidi — DeepSeek bitirdi, review + merge bekliyor (`.agtx/worktrees/T218-opaca-learn-lock`).
4. **T222** Ausculta'da "Sesi kıs/aç" kaldırma — DeepSeek çalışıyor.
5. **T221** Düello rozetleri + "Farklı rakipler" 3/10/25 + rozet ekranında "Meydan Okuma" kategori filtresi — DeepSeek çalışıyor (plan: `docs/agentic/claude-plans/T221-plan.md`).
6. **Ausculta posterior ses kayıtları:** bugün tüm akciğer kayıtları anterior (HLS-CMDS v3); posterior 6 noktada yedek çalınıyor. Önerilen açık veri: **KAUH** (CC BY 4.0, bölge etiketli), gerekirse **HF_Lung** (CC BY 4.0). RespiratoryDatabase@TR CC BY-NC; ICBHI lisansı belirsiz. **Kullanıcı onayı bekliyor**; seçilen kayıtlar öğretim üyesi validasyonu ister.
7. Takip: Pulse "ritim serisi" rozetleri sunucu oturumunda üretilmiyor (T217 notu) — sunucuda türetilmeli; bilinen sınır: Pulse `ecg.mode` tarayıcıya gidiyor (tanı sorularında cevabı ele verebilir).

## 6. Bekleyen kullanıcı girdileri
SMTP bilgileri; SSO protokolü; Ausculta posterior veri kümesi onayı.
