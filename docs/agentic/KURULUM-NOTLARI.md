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
