# T288-wording

- Tarih: 2026-10-01 08:11
- Commit: T288: kullanıcıya görünen 'düello' ifadeleri 'karşılaşma' oldu — rozetler, sim sonuç düğmeleri, e-postalar (Luna; review: Claude)
- Dal: task/T288-wording

---

# T288 — Özet

## Uygulama

Kullanıcıya görünen “düello” ifadeleri “karşılaşma” olarak güncellendi: sim sonuç düğmeleri ve sunucu hata iletileri, karşılaşma rozetlerinin ad/açıklama/kural metinleri, e-posta konu/içerik/CTA/önizleme metinleri ve Pulse hikâye metni. E2E görünen rakip adı ve değişen ürün metinlerini bekleyen test fikstürleri güncellendi. Görünen rozetlerde `Medal`/`Trophy` kullanımı zaten vardı; `Swords` görünümü bulunmadı. Kimlikler, rotalar, i18n anahtarları, CSS adları ve yorumlar değiştirilmedi.

Değişiklikler yalnız bu worktree’de yapıldı. Commit veya merge yapılmadı.

## Kabul ve doğrulama

- `pnpm turbo lint typecheck test`: başarılı, 17/17 görev.
- Vitest: 231 dosya geçti; 1.937 test geçti, 1 test atlandı.
- `git diff --check`: temiz.
- `git grep -n -i -E 'düello|arena'` taramasında ürün arayüzü/e-posta metinlerinde eski ifade kalmadı. Kalan eşleşmeler:
  - Teknik yorumlar ve ADR/günlük/işletim belgeleri (`apps/api/migrations`, `apps/api/src/me`, `apps/shell/src`, `packages/sim-*`, `packages/sim-host`, `packages/assessment-bank`, `docs/**`, `tests/**`, `e2e/**`).
  - İç adlandırmalar: `duel*` sembolleri ve `duel-*` rozet kimlikleri; `/duello/` rotası; `eg-shell-arena__*`/`eg-arena-*` CSS adları; `challenges.arena.*` i18n anahtarları.
  - `apps/api/src/seed/demoMain.ts` içindeki `düello=` geliştirici seed özeti.
- Turbo çıktısında bazı görevlerde `IO error: Operation not permitted` uyarısı görüldü; buna rağmen tüm görevler başarılı sonuçlandı.

## Devir notu

İstenen `docs/agentic/CODEX-DEVIR.md` worktree’de yoktu. Mevcut `docs/agentic/CLAUDE-DEVIR.md` okundu; localhost notlarına ihtiyaç olmadığından dış worktree veya ana depo kullanılmadı.
