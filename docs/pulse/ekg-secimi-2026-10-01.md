# Pulse gerçek EKG — referans seçimi (1. tur)

- Değerlendiren: Doç. Dr. Evrim Şimşek (Kardiyoloji AD); kaynak: seçim sayfası çıktısı `Pulse EKG Seçimiv evrim.pdf` (1 Eki 2026).
- Veri: PhysioNet ecg-arrhythmia 1.0.0 (CC BY 4.0), MIMIC-IV-ECG 1.0 (ODbL). Dışa aktarma: `egemed-tools/pulse-ecg/export_refs.py` → `packages/sim-pulse/src/data/realEcg.json` + `public/assets/ecg/*.bin`.
- "Bekliyor": hoca karar vermedi; öğrenme moduna alınmaz. "Elendi": "Referans alma".

| Patern | Acil | Referans | Elendi | Bekliyor | Hoca notu |
|---|---|---|---|---|---|
| Normal sinüs ritmi | Hayır | JS00277, JS00401, JS00448 | — | JS00155 |  |
| Sinüs taşikardisi | Hayır | JS00633, JS00795, JS00871 | — | JS00428 | 2 ve 3 te iyi |
| Sinüs bradikardisi | Hayır | JS00006, JS00062, JS00082, JS00193 | — | — | diğer örnekler de ok |
| Atriyal erken atım (PAC) | Hayır | JS20621, JS20673 | — | JS02102, JS20906 |  |
| Ventriküler erken atım (PVC) | Hayır | JS00356, JS00587, JS02545, JS04635 | — | — |  |
| Junctional kaçış | Hayır | JS02871 | — | JS12441, JS20241, JS22356 |  |
| Atriyal fibrilasyon | Evet | JS00318, JS00643, JS01253 | — | JS00048 | taşikardi değil ekg ler af doğru . ama kalp hızı 100 üstü olanlar daha iyi olabilir |
| Atriyal flutter | Evet | JS03425, JS05124 | JS06726, JS19252 | JS06905 |  |
| Atriyal taşikardi (PAT) | Evet | JS10173, JS10219 | — | JS10037, JS10174 |  |
| SVT | Evet | JS09916, JS10000 | — | JS09919, JS09935 | süt iki çeşit atriyovientriküler nodul reentran taşikardi. atriyovientriküler taşikardi |
| 1. derece AV blok | Hayır | JS12320 | — | JS00517, JS00683, JS01260 |  |
| 2. derece AV blok, Mobitz I | Evet | JS12426, JS12429 | JS12427 | JS12428 |  |
| 2. derece AV blok, Mobitz II | Evet | JS12438 | JS12440 | — | daha yavaş olup 2:1 örnekler bakayım |
| Tam (3. derece) AV blok | Evet | JS12509, JS12521, JS12523, JS12525 | — | — |  |
| Sağ dal bloğu (RBBB) | Hayır | JS01905, JS02855, JS03449 | — | JS04199 |  |
| Sol dal bloğu (LBBB) | Hayır | JS02492, JS22458 | — | JS03129, JS22457 |  |
| WPW paterni | Hayır | JS24893, JS36156 | — | JS15016, JS45372 |  |
| Ventriküler taşikardi | Evet | JS45509, JS45533, JS45534 | — | JS45511 |  |
| Ventriküler fibrilasyon | Evet | JS45442, JS45450 | — | JS45451, JS45455 |  |
| Anterior STEMI (V1–V4) | Evet | JS23000, JS23037, JS23055 | — | JS23049 |  |
| Lateral STEMI (I, aVL, V5–V6) | Evet | JS04210 | — | JS06163, JS31491, JS36128 | 1. örnek olabilir ama o da parazitli başka örnek lazım diğer örnekler hiç değil |
| Inferior STEMI (II, III, aVF) | Evet | JS07153, JS12503 | — | JS23020, JS23023 |  |
| Posterior MI (V1–V3 ST çökmesi, belirgin R) | Evet | — | — | JS02027 | idare eder bir örnek başka olsa daha iyi olur |
| NSTE-AKS / subendokardiyal iskemi | Evet | JS20638 | — | JS22855, JS41637, JS43489 |  |
| aVR'de ST yükselmesi + yaygın ST çökmesi | Evet | JS06105 | — | — |  |
| Wellens paterni (V2–V3 derin T negatifliği) | Evet | JS26258, JS30720 | — | JS22919, JS30903 |  |
| Eski MI (patolojik Q dalgaları) | Hayır | JS06393, JS28591 | — | JS09385, JS32957 |  |
| Akut perikardit | Hayır | s48234769 | — | s41059901, s43891638 |  |
| Hiperkalemi (sivri T) | Hayır | s41449382 | — | s40886920, s47736751, s48433792 |  |

## Yeni aday gerekenler (2. tur)

- Posterior MI: referans yok; JS02027 "idare eder", başka örnek aranacak.
- Lateral STEMI: JS04210 gürültülü; daha temiz örnek; diğer adaylar uygun değil.
- Mobitz II: daha yavaş, 2:1 iletili örnekler.
- Atriyal fibrilasyon: hızı >100/dk örnekler.
- SVT: AVNRT ve AVRT ayrı örnekler.
- Tek referanslı paternler: Junctional kaçış, 1. derece AV blok, NSTE-AKS, aVR, Akut perikardit, Hiperkalemi.
