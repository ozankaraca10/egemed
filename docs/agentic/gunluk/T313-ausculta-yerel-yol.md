# T313-ausculta-yerel-yol

- Tarih: 2026-10-02 17:52
- Commit: T313: Ausculta — ADR-009 sonrası yerel puanlama/oturum yolu söküldü; puanlama testleri bankaya taşındı
- Dal: task/T313-ausculta-yerel-yol

---

# T313 özet (şekil değişikliği)
Önce: sunucu oturumunun yanında yerel puanlama yolu yaşıyordu — reducer `finishCase` (scoreCase + practiceAdjusted),
`startSession` (hep boş listeyle gönderiliyordu), `setResults`; birincil eylem planı sahte `finishCase` eylemi
üretip ekran onu süzüyordu; `isAnswerCorrect` istemcide doğruluk hesaplayıp sunucu yanıtıyla eziliyordu.
Sonra: tek akış — plan açık alanlarla (submitQid / advance / finish) ne yapılacağını söyler, doğruluk ve vaka sonucu
sunucudan gelir (`serverChecked`, `serverCaseResult`, `serverFinished`). Telemetri değişmedi (case_completed zaten
yalnız yerel dalda yayılıyordu ve sunucu modunda hiç çalışmıyordu).
Silinen: scoreCase, practiceAdjusted, HINT_PENALTY_PRACTICE (istemci), isAnswerCorrect, sessionSeed, 3 reducer eylemi.
Testler: puanlama kuralları (8 test) bankaya taşındı ve banka kaynağına bağlandı; O9 ipucu cezası bankanın gradeCase'ine
karşı yeniden yazıldı (önceden sunucu tarafında sınanmıyordu); nextCase ve en iyi puan testleri sunucu akışıyla kuruldu.
Kapsam dışı bırakılan (sonraki aday): askıya alma/geri yükleme (`buildSuspend`, `restore`, `state.session`,
`sampleSession`) — sim-host sözleşmesi ve yenileme e2e'siyle bağlı; ayrı değerlendirilmeli. Opaca'daki eşdeğer yol ayrı görev.
