# AGTX kurulum notları

## DOĞRULA sonuçları
- AGTX 1.0.6 kurulu. Kaynak: https://github.com/fynnfluegge/agtx. `supported_agents`, `copy_files`, `cyclic`, `artifacts`, `commands` alanları geçerli.
- AGTX özel eklentide yalnız `skills/agtx-research`, `agtx-plan`, `agtx-execute`, `agtx-review` yollarını override eder. Önerilen `skills/egemed-*` ve `/egemed:*` çalışmaz; eklentiler `/agtx:*` komutlarına kendi becerilerini bağlar.
- `clear_context_on_advance = true` fazlar arası bağlamı sıfırlar. Faz geçişleri artefakt algılama ve pano hareketiyle olur; tam otomatik geçiş varsayılmamalı.
- `[agents]` proje düzeyindedir. Çalışan görevler üzerindeki config değişimi deneyle doğrulanmadı; kısa süreli şerit değişimi uygulanmaz.
- AGTX ajan ayar dizinlerini worktree'ye kopyalar. `.claude/settings.json` Opus seçer. Ayrı ucuz orkestratör modeli doğrulanmadığından orkestratör kapalı.
- `.cursorignore` Cursor için, `.ignore` arama araçları için. Codex'in güvenilir okuma yasağı veya review yazma sınırı proje config ile garanti edilmez.

## KARAR BEKLİYOR
- Cursor CLI / Sonnet 5 erişimi ve Claude Opus 5.5 hesap erişimi doğrulanmalı.
- OpenCode düşük maliyetli sağlayıcı/model kullanıcı tarafından seçilmeli.
- Review için teknik yazma kısıtı gerekiyorsa ayrı sandbox/izin profili seçilmeli.
- `docs/legacy/` belgeleri sağlanmadı; T12 kaynaklar gelince yürütülmeli.

## Kabul testi — 23 Eylül 2026
1. **Kısmi geçiş:** AGTX TUI açıldı ve proje panoda göründü; eklentiler kaynak düzeyinde doğrulandı, seçim menüsü etkileşimli olarak teyit edilemedi.
2. **Başarısız / çalıştırılamadı:** Dört fazlı deneme görevi yürütülmedi. Cursor CLI yok; Sonnet 5 ve Opus 5.5 oturumları doğrulanamadı. AGTX artefaktı algılar, fakat faz hareketi otomatik değil; insan veya orkestratör taşır.
3. **Kısmi geçiş:** `.egemed-run/` gitignore içinde; init script mevcut. T01 henüz pnpm lockfile üretmediğinden `pnpm install --frozen-lockfile` başarılı çalışamaz.
4. **Doğrulanmadı:** Yasaklı Opaca dosyası henüz mevcut değil; Claude deny kuralı gerçek oturumda test edilemedi.
5. **Kısmi geçiş:** Codex MCP kaydı görüldü; Claude `mcp add` başarılı dedi fakat `mcp list` boş döndü. OpenCode proje config kaydı var; Cursor yok. `/agtx:sweep` oturum testi yapılmadı.
6. **Başarısız / çalıştırılamadı:** Deneme görevi olmadığı için `maliyet.csv` yalnız başlık içeriyor.
7. **Geçti:** DOĞRULA sonuçları ve KARAR BEKLİYOR maddeleri bu dosyada.

AGTX günlük/veri dizinini `AGTX_CONFIG_DIR=$PWD/.agtx/local-config` ve `AGTX_DATA_DIR=$PWD/.agtx/local-data` ile yönlendirince pano açıldı. Varsayılan kullanıcı dizininde bu çalışma ortamı `Operation not permitted` hatası verdi. Pano bu değişkenlerle yeniden başlatılmalı.

AGTX proje MCP sunucusu için `scripts/agtx/mcp.sh` kullanılabilir; CLI kayıtları bu komuta çevrilmelidir.

## 23 Eylül 2026 — Running ajanı değişikliği
Kullanıcı isteğiyle `[agents].running = "opencode"` yapıldı. `opencode.json` model kimliği `opencode-go/deepseek-v4.1-flash`. [OpenCode Go model listesi](https://dev.opencode.ai/docs/go/) bu kimliği doğruluyor. Bu ortamda `opencode models` yalnız ücretsiz modelleri gösterdi; Go aboneliği/kimlik doğrulaması teyit edilmedi. Bu nedenle gerçek DeepSeek çağrısı ve Running fazı çalıştırılamadı. Önceki Cursor bekleme kararı geçersiz; yapılandırılmış Running ajanı OpenCode'dur.

## Claude Code Opus planlama
Kullanıcı tercihi: Planning ve yeniden planlama Claude Code içindeki Opus ile yapılır. `.claude/settings.json` içindeki `model = opus` proje seçicisi korunur; AGTX `[agents].planning = claude` olarak kalır. Belirli Opus 5.5 sürümüne erişim, gerçek Claude oturumunda doğrulanmalıdır.

## DeepSeek varyantı
OpenCode `agent.build` ayarında `model = opencode-go/deepseek-v4.1-flash`, `variant = max` seçildi. Kurulu OpenCode 1.18.30 üzerinde `opencode debug agent build` çıktısı bu model kimliğini ve `max` varyantını doğruladı. Sağlayıcıya gerçek çağrı henüz yapılmadı. AGTX OpenCode oturumunda build ajanını kullanır; bu ayar hem Research hem Running fazına uygulanır.

## Cursor CLI sonradan kuruldu
`cursor` komut adı yok; AGTX 1.0.6 Cursor için `agent` binary'sini kullanıyor. `cursor-agent --version` = `2026.09.18-9a7762b`, `agent` PATH'te. Proje `.cursor/mcp.json` dosyasına AGTX MCP kaydı eklendi. Running tercihi kullanıcı isteğiyle OpenCode DeepSeek V4.1 Flash max olarak kalıyor. Cursor MCP ve Sonnet oturumu çalıştırılarak doğrulanmadı. Önceki "Cursor CLI yok" notu ilk kurulum anının tespitidir, güncel durum değildir.
Cursor `agent mcp enable agtx` sonrası `agent mcp list` çıktısı `agtx: ready` gösterdi.

## Yüksek bağlam istisnası
Kullanıcı Grok 4.7 kullanımına izin verdi. [Cursor Grok 4.7 belgesi](https://prod.cursor.com/docs/models/grok-4-7) `high` çabayı varsayılan olarak tanımlar; `max` çaba varyantı yok (`xhigh` var). Bu nedenle `scripts/agtx/cursor-grok.sh` modeli `grok-4.7` seçer ve varsayılan `high` kullanır. AGTX per-task ajan seçemediğinden, istisna görev ayrı worktree'de manuel Cursor oturumudur. `agent models` bu ortamda kimlik doğrulaması istedi; gerçek Grok çağrısı doğrulanmadı.

T01 bootstrap: pnpm-lock.yaml ilk görevde üretileceğinden init script kilit dosyası yokken kurulumu atlar; sonraki iş ağaçlarında frozen install çalışır.

Astra kullanımı: `.codex/config.toml` `model = "gpt-6-astra"`. Kritik ADR/xAPI/güvenlik/sözleşme kararlarında ikinci görüş ve Review denetimi; insan kararı yerine geçmez.

AGTX beceri yolu düzeltmesi: 1.0.6 `resolve_skill_content` eklenti kökünde `<ad>/SKILL.md` arıyor; `skills/<ad>/SKILL.md` yalnız başına okunmuyor. İstenen `skills/` kaynak düzeni korundu ve eklenti köküne `agtx-*` sembolik bağlantıları eklendi. T01'in ilk worktree'si bu düzeltmeden önce yaratıldığı için varsayılan AGTX becerisi kopyalanmıştı; plan Claude Code'a doğrudan görev talimatıyla yazdırıldı.

AGTX 1.0.6 iş ağacındaki `opencode.json`, `.codex/config.toml` ve MCP dosyalarını tekrar yazıp proje modeli/yerel DB yönlendirmesini siliyor. Eklenti `init_script` artık `scripts/agtx/patch-worktree-config.sh` çalıştırır; AGTX beceri/MCP dağıtımından sonra model seçimi ve proje-scoped MCP yeniden uygulanır.

## T01 başlangıç doğrulaması
`claude auth status` oturumu doğruladı. AGTX T01'i Planning sütununa taşıdı; worktree ve tmux penceresi oluştu. Claude Code oturum başlığı `Opus 5.5 · Claude Pro` gösterdi; `.egemed-run/plan.md` üretildi. İlk geçiş, güven değişimi nedeniyle Backlog'da kalmıştı; `agtx trust` ve pano yeniden başlatma sonrası ikinci geçiş tamamlandı. T01 Running başlamadı; E0 taslağının insan onayı bekleniyor.

Kullanıcı E0 ve T01 planını 23 Eylül 2026 tarihinde onayladı; T01 Running aşamasına geçebilir. Node 22 / pnpm 10 sürüm ailesi uygulanır.

## T13 — faz geçişi teşhisi (23 Eylül 2026)

Üç uyumsuzluk AGTX 1.0.6 ikilisinde. Proje betikleri durumu yazmıyor; bu repoda dar betik yaması yok. Kaynak: ana depo `work/agtx-source`.

### Exited, OpenCode tmux canlı (T01)

Kanıt: `f9391938-T01-Monorepo-iskeleti/.agtx/status/f9391938-aab3-4d39-b9d6-28c30b9dfe64.json` içinde `state=ended`, `agent=claude`, `ts=1790160487` (13:48:07). Aynı saniye `transition_requests.ac75d06d` `move_to_running`, `processed_at=2026-09-23T10:48:07Z`, `claimed_by=57dbc7da`. Pencere `tmux -L agtx` üzerinde `egemed-clinical-learning-experience-platform-clix:task-f9391938-T01-Monorepo-iskeleti`, `pane_dead=0`, `pane_current_command=node`.

Kaynak: `src/agent/hook_status.rs` `read_status` yalnız `Working` kaydını süreli düşürür; `Ended` kalır. `src/agent/spec.rs` OpenCode `hook_config: None`, bu dosyayı yenilemez. `src/tui/app.rs` oturum yenilemesi `HookState::Ended` iken kartı `Exited` yapar; pencere listede olsa da.

Geçici işletim: OpenCode kartı Exited iken pencereyi `tmux -L agtx list-windows` ve `display -p -t <hedef> '#{pane_dead} #{pane_current_command}'` ile doğrula. Pencere canlı ve status dosyası önceki ajanın (`claude`) `ended` kaydıysa o json dosyasını sil. Sonraki yenileme pane özetine döner.

### Running → Review: veritabanı codex, pencere geride

Kanıt: T01 satırı `status=review`, `agent=codex`, `phase_entered_at=2026-09-23T11:39:08Z`. Bu an `move_to_review` (`2a97a7e6`) `processed_at` ile aynı. Daha erken `move_forward` (`8ed7c960`, 10:57:06Z) ikinci TUI `eaa2fe3d` tarafından ~170 ms içinde kapatıldı; o sürecin günlüğünde `Processing transition request` satırı yok. Görev metni 11:08:30Z'de yazıldı: pencere OpenCode kaldı. Teşhis anındaki kaydırma tamponu 11:39 denemesinde `codex --sandbox workspace-write '$agtx-review …'` satırını ve canlı Codex oturumunu gösterdi. `agent=codex` anahtarın bittiğini kanıtlamaz.

Kaynak: `src/tui/app.rs` `mcp_transition_to_review` durumu ve ajanı yazar, `spawn_send_to_agent` işini arka planda bırakır. `switch_agent_in_tmux` OpenCode çıkışını `/exit` olarak birleşik `send_keys` ile yollar (`SendStrategy::OpenCodePicker`). `is_pane_at_shell` `node` sürecini ajan saymaz; kuyrukta `Ask anything` yoksa kabuk varsayar ve `codex` satırını OpenCode içine yazabilir.

Geçici işletim: Tek `agtx` TUI açık kalsın (`claimed_by` iki kimlik görürse ikinciyi kapat). Geçişten sonra pencereyi oku. Hâlâ OpenCode ise komut oraya gitmiştir. OpenCode kabuğa düşünce aynı pencerede Codex'i başlat veya görevi Running'e alıp canlı TUI'den yeniden Review'a taşı.

### void `move_to_running` completed, satır Backlog (T13)

Kanıt: `3f1822d3-faed-4884-84a7-a7a915b32662` `plugin=void`, `status=backlog`, `session_name` ve `worktree_path` boş. İstek `ad369f0a` `move_to_running` `requested_at=2026-09-23T11:09:03.767Z`, `processed_at=…03.938Z`, `error` boş, `claimed_by=eaa2fe3d`. Diskte `.agtx/worktrees/3f1822d3-T13-AGTX-faz-geçişi-ve-Exited` 14:09:04'te oluştu (`.egemed-run`, `.agtx/skills`); tmux penceresi yok.

Kaynak: `src/mcp/server.rs` `get_transition_status` — `processed_at` dolu ve `error` yoksa `completed`. `src/tui/app.rs` `try_start_next_queued_setup`, `move_backlog_to_running_by_id` `Ok` dönünce `resolve_queued_request` ile isteği kapatır. Bu `Ok`, kurulum iş parçacığı bitmeden döner. Hata yalnız kısa TUI uyarısıdır; satır Backlog kalır. `plugins/void/plugin.toml` komut ve prompt tanımlamaz; `WorkflowPlugin::phase_accepts_task` bu yüzden Backlog çıkışını engellemez.

Geçici işletim: MCP `completed` sonrası `tasks.status` ve `worktree_path` oku. Backlog duruyorsa ve yetim iş ağacı varsa `git worktree remove` ile kaldır, sonra geçişi panodan tekrarla. `get_transition_status` fazın değiştiğini söylemez.

## Claude kotası sonrası geçici planlama — 23 Eylül 2026
Kullanıcının açık yönlendirmesiyle Claude Code kotası bitince `[agents].planning = "cursor"` seçildi. AGTX 1.0.6 Cursor'ı `agent` ikilisiyle başlatır ve faz başına `--model` alanı yoktur. `scripts/agtx/board.sh`, proje içindeki `scripts/agtx/bin/agent` sarmalayıcısını PATH başına koyar; bu sarmalayıcı gerçek Cursor CLI'yi `--model grok-4.7-high` ile çalıştırır. `agent models` bu tam model kimliğini Grok 4.7 High olarak listeledi. Eklentilerin `supported_agents` listesine Cursor eklendi. Bu ayar, yeni açılacak Planning oturumları içindir; mevcut T01/T02 artefaktları değiştirilmez. Kritik kararlar yine Astra ikinci görüşü ve insan onayı bekler.

## 23 Eylül 2026 — OpenCode manuel orkestrasyon (Codex kotası sonrası)
Kullanıcı yönlendirmesi: Codex kotası bitince planlama, ajan koşturma ve review EGEMED
CLIX ana OpenCode oturumunda yürür. Bu oturumda uygulanan geçici işletim biçimi:
- Faz geçişleri AGTX kuyruğu yerine doğrudan görev veritabanında (`tasks.status`) güncellendi;
  tmux ajan doğurulmadı. Neden: tmux sunucusu ölüydü, T02'nin yetim OpenCode süreci
  (PID 30493) kapatıldı; T02 insan tarafından zaten merge edilmişti (f264644), veritabanı
  `done`'a catch-up yapıldı, worktree/branch'ı temizlendi.
- T04: mevcut Cursor Grok planı kullanıldı; execute OpenCode DeepSeek alt ajanıyla
  (worktree içinde) yürütüldü; commit `af27a1c`.
- T03: "kaynak belgeler bekleniyor" koşulu çözüldü — `egemed-sim-ui-ux-framework/tokens/
  family-tokens.css` ve `egemed-opaca/src/styles.css` `:root` blokları diskte bulundu;
  plan ana oturumda yazıldı; execute DeepSeek alt ajanıyla yürütüldü; commit `b7d3fc5`.
- Review Astra yerine ana oturumda yapıldı (bulgular worktree `.egemed-run/review.md`
  içinde, `VERDICT: APPROVE`); Astra ikinci görüşü hâlâ `Bekleniyor.` ve ADR kabulü
  yalnız insana aittir. Kapılar her iki worktree'de `--force` ile 5/5 yeşil doğrulandı.
- Merge'ler depo sahibinin açık talimatıyla aynı oturumda yürütüldü (T03/T04). T12 hâlâ
  kaynak bekliyor; T13'nin kök neden analizi ve geçici işletim talimatları yukarıdaki
  T13 bölümünde.

## Claude Code kotası döndü — 23 Eylül 2026
Kullanıcı talimatıyla Planning ve review işleri tekrar Claude Code'a verilir;
`[agents].planning = "claude"` geri alındı. ADR/xAPI/güvenlik/sözleşme kararlarında
Astra ikinci görüşü kotası dönene dek `Bekleniyor.` kalır; review ikinci görüşü bu
araçta Claude Opus verir, insan onayının yerini tutmaz.
