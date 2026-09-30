import { describe, expect, it } from "vitest";
import {
  ageYearsOf,
  diagnosisToTurkish,
  parsePatientSummaryCsv,
  sexOfKauh,
  sexOfSprsound,
  siteToTurkish,
} from "../../packages/sim-ausculta/tools/patient-info.mjs";

/** T259 — hasta kartı alanlarının eşlemesi; plan tablosu birebir doğrulanır (tıbbi veri). */

describe("KAUH tanı eşlemesi (plan tablosu)", () => {
  it("tanıları Türkçeye çevirir", () => {
    expect(diagnosisToTurkish("kauh-v3", "N")).toBe("Tanı yok (normal)");
    expect(diagnosisToTurkish("kauh-v3", "Asthma")).toBe("Astım");
    expect(diagnosisToTurkish("kauh-v3", "asthma")).toBe("Astım");
    expect(diagnosisToTurkish("kauh-v3", "heart failure")).toBe("Kalp yetersizliği");
    expect(diagnosisToTurkish("kauh-v3", "Heart Failure")).toBe("Kalp yetersizliği");
    expect(diagnosisToTurkish("kauh-v3", "COPD")).toBe("KOAH");
    expect(diagnosisToTurkish("kauh-v3", "copd")).toBe("KOAH");
    expect(diagnosisToTurkish("kauh-v3", "pneumonia")).toBe("Pnömoni");
    expect(diagnosisToTurkish("kauh-v3", "Lung Fibrosis")).toBe("Akciğer fibrozisi");
    expect(diagnosisToTurkish("kauh-v3", "Plueral Effusion")).toBe("Plevral efüzyon");
    // BRON: veri kümesi makalesi (Data in Brief 2021, Tablo 1) bronşit der; bronşektazi yok.
    expect(diagnosisToTurkish("kauh-v3", "BRON")).toBe("Bronşit");
  });

  it("birleşik tanıları parça parça çevirir", () => {
    expect(diagnosisToTurkish("kauh-v3", "Heart Failure + COPD")).toBe("Kalp yetersizliği + KOAH");
    expect(diagnosisToTurkish("kauh-v3", "Asthma and lung fibrosis")).toBe("Astım + Akciğer fibrozisi");
  });

  it("eşlenmeyen tanıyı ham haliyle korur; boş/`-` null döner", () => {
    expect(diagnosisToTurkish("kauh-v3", "Cystic Fibrosis")).toBe("Cystic Fibrosis");
    expect(diagnosisToTurkish("kauh-v3", "  ")).toBeNull();
    expect(diagnosisToTurkish("kauh-v3", "-")).toBeNull();
  });
});

describe("SPRSound tanı eşlemesi (plan tablosu)", () => {
  it("tanıları Türkçeye çevirir", () => {
    expect(diagnosisToTurkish("sprsound", "Pneumonia (non-severe)")).toBe("Pnömoni (ağır olmayan)");
    expect(diagnosisToTurkish("sprsound", "Pneumonia (severe)")).toBe("Ağır pnömoni");
    expect(diagnosisToTurkish("sprsound", "Bronchitis")).toBe("Bronşit");
    expect(diagnosisToTurkish("sprsound", "Asthma")).toBe("Astım");
    expect(diagnosisToTurkish("sprsound", "Control Group")).toBe("Kontrol grubu (hastalık yok)");
    expect(diagnosisToTurkish("sprsound", "Control group")).toBe("Kontrol grubu (hastalık yok)");
    expect(diagnosisToTurkish("sprsound", "Acute upper respiratory infection")).toBe(
      "Akut üst solunum yolu enfeksiyonu",
    );
    expect(diagnosisToTurkish("sprsound", "Bronchiectasia")).toBe("Bronşektazi");
    expect(diagnosisToTurkish("sprsound", "Bronchiolitis")).toBe("Bronşiolit");
    expect(diagnosisToTurkish("sprsound", "Other respiratory diseases")).toBe("Diğer solunum hastalıkları");
  });
});

describe("dinleme yeri, yaş ve cinsiyet normalizasyonu", () => {
  it("KAUH bölgesini uygulama terminolojisiyle Türkçeleştirir", () => {
    expect(siteToTurkish("kauh-v3", "PRU")).toBe("Sağ üst bölge (posterior)");
    expect(siteToTurkish("kauh-v3", "P L L")).toBe("Sol alt bölge (posterior)");
    expect(siteToTurkish("kauh-v3", "PRM")).toBe("Sağ orta bölge (posterior)");
  });

  it("SPRSound p1/p3 için taraftan yeri verir (seviye kaynakta yok)", () => {
    expect(siteToTurkish("sprsound", "p1")).toBe("Sol bölge (posterior)");
    expect(siteToTurkish("sprsound", "p3")).toBe("Sağ bölge (posterior)");
  });

  it("yaşı aralık içinde sayıya çevirir; geçersiz değer null", () => {
    expect(ageYearsOf("70")).toBe(70);
    expect(ageYearsOf("5.6")).toBe(5.6);
    expect(ageYearsOf("")).toBeNull();
    expect(ageYearsOf("abc")).toBeNull();
    expect(ageYearsOf("200")).toBeNull();
  });

  it("cinsiyet kodlarını plan kuralıyla eşler (0 = erkek, 1 = kadın)", () => {
    expect(sexOfKauh("F")).toBe("F");
    expect(sexOfKauh("m")).toBe("M");
    expect(sexOfKauh("x")).toBeNull();
    expect(sexOfSprsound("0")).toBe("M");
    expect(sexOfSprsound("1")).toBe("F");
    expect(sexOfSprsound("2")).toBeNull();
  });
});

describe("hasta özeti CSV çözümleme", () => {
  it("patient_num (baştaki sıfırlar dahil) ve disease sütunlarını okur", () => {
    const csv =
      "\ufeff,patient_num,disease,age,gender\n" +
      '0,00014365,"Control group",4.3,F\n' +
      "1,65044484,Pneumonia (non-severe),6.1,F\n" +
      "2,65044484,Pneumonia (severe),9,M\n";
    const summaries = parsePatientSummaryCsv(csv);
    expect(summaries.get("14365")).toBe("Control group");
    expect(summaries.get("65044484")).toBe("Pneumonia (non-severe)");
    expect(summaries.size).toBe(2);
  });

  it("beklenen sütunlar yoksa boş harita döner", () => {
    expect(parsePatientSummaryCsv("a,b\n1,2\n").size).toBe(0);
  });
});
