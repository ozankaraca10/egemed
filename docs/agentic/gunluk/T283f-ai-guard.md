# T283f-ai-guard

- Tarih: 2026-10-01 07:47
- Commit: T283f: rekabetçi ekranlarda yapay zekâ ajanı uyarısı — 10 sn kapatma süresi, duraklatma, yerel tespit (Claude)
- Dal: task/T283f-ai-guard

---

# T283f — Rekabetçi ekranlarda yapay zekâ ajanı uyarısı

Yazan: Claude. Depo sahibi kararı (30 Eyl 2026): "o sekmelerde kullanılırsa direk uyarı çıkarıp 10 sn zaman verebiliriz kapatması için".

## Ne değişti
- `apps/shell/src/integrity/aiGuard.ts`: işaret listesi (`[id^="claude-agent-"]`, Claude in Chrome kaplaması), `isCompetitiveHash` (değerlendirme + karşılaşma oynanışı), durum makinesi (temiz → uyarı 10 sn → engel; ajan kalkınca temiz).
- `AiGuardOverlay.tsx`: `useAiGuard` (1 sn yoklama, `shellNow`), sim sahnesini kaplayan `alertdialog`; geri sayım, duraklatma, KVKK notu.
- `SimRoute.tsx`: öğrenci kitlesinde etkin; rekabetçi ekran gerçek adresten okunur (sim kendi ekranını değiştirse de doğru).
- i18n `integrity.aiGuard.*`, kabuk CSS (yalnız token), şema notu `docs/sema/urun.md`.
- Testler: `tests/shell/ai-guard.test.ts` (tespit, rekabetçi adres, durum geçişleri, kaplama), `e2e/ai-guard.spec.ts` (canlı: mod seçiminde uyarı yok; değerlendirmede uyarı → engel → açılma).

## Kararlar / sınırlar
- `navigator.webdriver` engel sebebi değil: Playwright'ta ve bazı yardımcı teknolojilerde doğru; haksız engel riski. Ölçümle desteklenen sunucu sinyali olarak T283c'ye bırakıldı.
- Ceza yok, yalnız engel; sunucuya bildirim T283c, yönetici kararı T283b.
- İşaret listesi yalnız doğrulanmış işaretlerle genişletilmeli (ChatGPT Atlas/diğer ajanlar için doğrulanmış DOM işareti yok).

## Doğrulama
Kapı 17/17, 1937 test; e2e `ai-guard.spec.ts` 1440 + 360 yeşil.
