# T297-pulse-ecg-data

- Tarih: 2026-10-01 15:32
- Commit: T297: Pulse gerçek EKG — Evrim Hoca'nın 60 referans kaydı pakete işlendi (Claude)
- Dal: task/T297-pulse-ecg-data

---

# T297 — Pulse gerçek EKG referansları (1. tur) pakete işlendi

Yazan: Claude.
- Kaynak: Evrim Hoca seçim PDFi (docs içinde); kararlar PDF metin katmanından kimlik bazlı çıkarıldı, karışık sıralı son bölüm görsellerle düzeltildi.
- 60 referans kayıt: `packages/sim-pulse/public/assets/ecg/<id>.bin` (int16 µV, 12×2500, 250 Hz) + `src/data/realEcg.json` (patern, grup, acil, kaynak/lisans).
- Betik: `egemed-tools/pulse-ecg/export_refs.py` (kalıcı); kararlar `egemed-tools/pulse-ecg/decisions-2026-10-01.json`.
- Karar günlüğü: `docs/pulse/ekg-secimi-2026-10-01.md` (hoca notları, 2. tur ihtiyaçları).
- Test: `tests/sim-pulse/real-ecg.test.ts`.
- Arayüz entegrasyonu (öğrenme modu gerçek EKG) ayrı görev.
