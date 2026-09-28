/**
 * T220 (A3.4, ADR-009): Pulse istemci müfredat aynası. Madde içeriği (vaka/soru
 * gövdeleri, seçenekler, doğru yanıt, gerekçeler, geri bildirim, vitals, EKG)
 * istemciden kaldırıldı; tek doğruluk kaynağı sunucu bankasıdır
 * (`packages/assessment-bank/data/pulse/items.json`). Burada yalnız etiketler,
 * sınırlılık metni ve bankayla birebir eşit sayılar tutulur.
 */

export interface PulseCurriculumPatternCount {
  readonly case: number;
  readonly quiz: number;
}

export interface PulseCurriculumData {
  readonly version: number;
  readonly sessionSize: number;
  readonly caseCount: number;
  readonly quizCount: number;
  readonly patterns: Readonly<Record<string, PulseCurriculumPatternCount>>;
  readonly labels: Readonly<Record<string, string>>;
  readonly limitations: string;
}

export const curriculum: PulseCurriculumData = {
  version: 8,
  sessionSize: 10,
  caseCount: 300,
  quizCount: 300,
  patterns: {
    af: { case: 15, quiz: 16 },
    avb1: { case: 10, quiz: 10 },
    chb: { case: 10, quiz: 10 },
    flutter: { case: 16, quiz: 15 },
    hyperk: { case: 10, quiz: 10 },
    inferior: { case: 15, quiz: 16 },
    junctional: { case: 10, quiz: 10 },
    lbbb: { case: 15, quiz: 16 },
    mobitz1: { case: 10, quiz: 10 },
    mobitz2: { case: 10, quiz: 10 },
    normal: { case: 16, quiz: 15 },
    pac: { case: 10, quiz: 10 },
    pat: { case: 15, quiz: 15 },
    pericarditis: { case: 10, quiz: 10 },
    pvc: { case: 16, quiz: 15 },
    rbbb: { case: 16, quiz: 15 },
    sinbrady: { case: 10, quiz: 10 },
    sintach: { case: 15, quiz: 15 },
    stemi: { case: 16, quiz: 15 },
    svt: { case: 15, quiz: 15 },
    vf: { case: 15, quiz: 16 },
    vt: { case: 15, quiz: 16 },
    wpw: { case: 10, quiz: 10 },
  },
  labels: {
    normal: "Normal sinüs ritmi",
    af: "Atriyal fibrilasyon",
    stemi: "Anterior ST yükselmesi örneği",
    pvc: "Ventriküler erken atım",
    svt: "Düzenli dar kompleks taşikardi",
    inferior: "İnferior ST yükselmesi örneği",
    vt: "Monomorfik VT örneği",
    vf: "VF elektriksel örneği",
    pat: "Fokal atriyal taşikardi",
    flutter: "2:1 flutter örneği",
    sintach: "Sinüs taşikardisi",
    lbbb: "LBBB örneği",
    rbbb: "RBBB örneği",
    sinbrady: "Sinüs bradikardisi",
    avb1: "1. derece AV blok",
    mobitz1: "2. derece AV blok – Mobitz Tip I",
    mobitz2: "2. derece AV blok – Mobitz Tip II",
    chb: "3. derece AV blok – Tam AV blok",
    pac: "Atriyal erken atım (PAC)",
    junctional: "AV kavşak kaçış ritmi",
    wpw: "Ventriküler preeksitasyon (WPW paterni)",
    pericarditis: "Akut perikardit EKG paterni",
    hyperk: "Hiperkalemiye bağlı EKG paterni",
  },
  limitations:
    "600 sentetik madde ve 23 EKG sonucu: Simülatörün ilk 13 EKG sonucunun tüm tıbbi içerik ve sinyal validasyonları Ege Üniversitesi Tıp Fakültesi Kardiyoloji Anabilim Dalı öğretim üyelerince yapılmıştır. Patern 14–23 (T204) sinyal ve içerikleri Kardiyoloji ABD onayı bekliyor. Olgu vinyetleri ve vitaller sentetik öğretim örnekleridir. 16 s gözlem yalnız akış kuralıdır.",
};
