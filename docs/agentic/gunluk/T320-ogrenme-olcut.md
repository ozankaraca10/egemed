# T320-ogrenme-olcut

- Tarih: 2026-10-03 13:46
- Commit: T320: öğrenme tamamlama ölçütü (Opaca film başı 15 sn) mod kartlarında; Opaca orta çerçeve sadeleşti, denetimler sıkılaştı

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Dal: task/T320-ogrenme-olcut

---

# T320 — öğrenme tamamlama ölçütü ve Opaca orta çerçeve
- Opaca: konu, her filmi (1–4) ≥15 sn (film yüklü + sayfa görünür) incelenince tamamlanır; kayıt opaca.learn.viewed {konu#sıra: sn}. Eski opaca.learn.opened okunmaz.
- Üç simde öğrenme kartında "Tamamlama ölçütü" (Pulse 23×60 sn, Ausculta tüm örnekler 5 sn, Opaca film başı 15 sn).
- Opaca orta çerçeve: başlık altı etiketler (konu rozeti/Referans, Gerçek hasta verisi) kaldırıldı; sayaç metni eklendi; örnek düğmelerinde süre/✓.
- Görüntü altı denetimler pointer:fine iken sıkı (32/28/36 px); dokunmatikte 44 px. a11y testi: .learn-grid içinde fare kipinde 24 px (WCAG 2.5.8).
- Hasta kartı: çekim kodu Türkçe etikete çevrilir (CT_AXIAL → BT aksiyel).
