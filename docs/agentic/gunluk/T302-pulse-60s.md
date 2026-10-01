# T302-pulse-60s

- Tarih: 2026-10-01 20:38
- Commit: T302: Pulse patern başına inceleme 60 sn; ölçütlere kılavuz DOI bağlantıları
- Dal: task/T302-pulse-60s

---

# T302 — Pulse: patern başına inceleme 60 s; ölçütlere kılavuz DOI bağlantıları (Opus 5.5)

Kullanıcı (1 Eki 2026): "pulsede vaka başı süreyi 16 sn'den 1 dakikaya çıkart öğrenciler için"; "ölçüt olarak referans verilen kılavuz veya kaynakların linklerini ekle veya DOI'lerine link ver".

- Kilit süresi tek sabit: vendor `state.js` `LEARN_S=60` (`PulseState.LEARN_S`); app.js ilerleme halkası/çubuğu, aria-valuemax, izlenen sayısı, öneri metni ("1 dakika inceleyin"), sayaç sınırı; kayıt kodlama sınırı 60 000 ms. Öğrenme alanı `PULSE_LEARN_SECONDS=60`, oyunlaştırma `STUDY_SECONDS=60`. Öğretim üyesi/admin muafiyeti ve sunucuda tamamlanmış öğrenme (host) değişmez; yerelde 16 s ile tamamlanmış kayıtlar 60 s'ye tamamlanana dek açık sayılmaz (sunucu kaydı varsa kilit açık kalır).
- 12 kılavuz/standart (Crossref ile doğrulanmış DOI): AHA/ACCF/HRS EKG standartları I, III, IV, VI; 4. UDMI 2018; ESC 2023 AKS; ESC 2019 SVT; ESC 2024 AF; ACC/AHA/HRS 2018 bradikardi; ESC 2022 VA; ESC 2025 miyokardit/perikardit (2015'in yerine); Levis 2013 hiperkalemi. Her paternin ölçüt kartında "Kaynak:" bağlantıları (doi.org, yeni sekme, 44 px hedef); alt satırda temel üç kaynak.
- Testler: kilit süresinin vendor ile öğrenme alanında eşit (60) olduğu; her paternin ≥1 DOI kaynağı; e2e'de DOI bağlantısı; tohumlar 60 000 ms.
