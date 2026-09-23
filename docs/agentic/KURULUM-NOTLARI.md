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
