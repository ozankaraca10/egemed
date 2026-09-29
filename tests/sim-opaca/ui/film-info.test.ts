import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FilmCornerBadge,
  FilmInfoPanel,
  LABEL_SOURCE_TEXT,
  sideMarkerFor,
  syntheticDateFor,
} from "../../../packages/sim-opaca/src/index";
import type { ImageRecord } from "../../../packages/sim-opaca/src/index";

/** Film bilgi paneli — E2 §8 S11 kabulü (statik render): kaynak/atıf satırları, kalite beklemede
 *  rozeti (is-pending), uzman okuma kaynağı, köşe rozeti, BT/XR farkı; sentetik görüntü kaydı. */

function xr(over: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: "img_xr_pa",
    sourceDataset: "nih-cxr14",
    sourceFile: "pa.png",
    viewPosition: "PA",
    ageYears: 55,
    sex: "M",
    population: "yetiskin",
    width: 1024,
    height: 1024,
    originalWidth: 1024,
    originalHeight: 1024,
    findings: { pneumothorax: "expert_bbox" },
    negatives: {},
    annotations: [],
    quality: null,
    runtimeUrl: "assets/xray/runtime/img_xr_pa.webp",
    bytes: 1,
    validationStatus: "validated",
    clinicalReview: "onayli",
    issues: [],
    modality: "XR",
    ...over,
  };
}

function ct(over: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: "img_ct_lidc",
    sourceDataset: "tcia-lidc-idri",
    sourceFile: "LIDC-IDRI-0001 series",
    viewPosition: "CT_AXIAL",
    ageYears: 68,
    sex: "F",
    population: "yetiskin",
    width: 512,
    height: 512,
    originalWidth: 512,
    originalHeight: 512,
    findings: { nodule: "expert_bbox" },
    negatives: {},
    annotations: [
      {
        finding: "nodule",
        source: "expert_bbox",
        x: 0.4,
        y: 0.4,
        w: 0.1,
        h: 0.1,
        frameIndex: 1,
        readerCount: 3,
        characteristics: { margin: 4, texture: 3, spiculation: 2 },
      },
      {
        finding: "nodule",
        source: "expert_bbox",
        x: 0.42,
        y: 0.41,
        w: 0.09,
        h: 0.09,
        frameIndex: 3,
        readerCount: 3,
        characteristics: { margin: 4, texture: 3, spiculation: 2 },
      },
    ],
    quality: null,
    runtimeUrl: "assets/ct/runtime/img_ct_lidc_lung_0.webp",
    bytes: 1,
    validationStatus: "validated",
    clinicalReview: "onayli",
    issues: [],
    modality: "CT",
    stack: [
      { window: "lung", label: "Akciğer", frames: ["a.webp", "b.webp", "c.webp", "d.webp"] },
      { window: "mediastinum", label: "Mediasten", frames: ["m0.webp", "m1.webp"] },
    ],
    ...over,
  };
}

describe("FilmInfoPanel (statik render)", () => {
  it("görüntü yoksa kısa mesaj çizilir", () => {
    expect(renderToStaticMarkup(createElement(FilmInfoPanel, { image: undefined }))).toContain("Film seçilmedi.");
  });

  it("XR paneli sentetik banner, projeksiyon ve kalite beklemede rozetini çizilir", () => {
    const html = renderToStaticMarkup(createElement(FilmInfoPanel, { image: xr() }));
    expect(html).toContain('class="film-info-panel"');
    expect(html).toContain('class="film-info-synthetic-banner"');
    expect(html).toContain("ÖRNEK HASTA");
    expect(html).toContain(syntheticDateFor(xr()));
    expect(html).toContain("PA (arka-ön)");
    expect(html).toContain("DICOM meta verisi (ViewPosition)");
    expect(html).toContain('class="is-pending"');
    expect(html.match(/beklemede/g)?.length).toBe(3);
    expect(html).not.toContain("Toraks BT");
  });

  it("doldurulmuş kalite alanları beklemede rozeti taşımaz", () => {
    const html = renderToStaticMarkup(
      createElement(FilmInfoPanel, {
        image: xr({
          quality: { inspiration: "yeterli", rotation: "yok", penetration: "yeterli" },
        }),
      })
    );
    expect(html).toContain("yeterli");
    expect(html).toContain("yok");
    expect(html).not.toContain('class="is-pending"');
    expect(html).not.toContain("beklemede");
  });

  it("kaynak/atıf: uzman okuma satırı NLP metninden ayrılır", () => {
    const html = renderToStaticMarkup(
      createElement(FilmInfoPanel, {
        image: xr({ readingText: "Normal akciğer grafisi" }),
      })
    );
    expect(html).toContain("Radyolog okuması");
    expect(html).toContain("Normal akciğer grafisi");
    expect(html).toContain(`Kaynak: ${LABEL_SOURCE_TEXT.expert_reading}`);
    expect(html).not.toContain(LABEL_SOURCE_TEXT.report_nlp);
  });

  it("nih-cxr14 dışı veri setinde projeksiyon kaynak notu değişir", () => {
    const html = renderToStaticMarkup(
      createElement(FilmInfoPanel, { image: xr({ sourceDataset: "nlm-montgomery" }) })
    );
    expect(html).toContain("veri seti dokümantasyonu / küratör ataması");
    expect(html).not.toContain("DICOM meta verisi");
  });

  it("annotated=false yalnız açıklama katmanı yardımlarını gizler (kalite satırı yardımları kalır)", () => {
    const html = renderToStaticMarkup(createElement(FilmInfoPanel, { image: xr(), annotated: false }));
    expect(html).not.toContain("DICOM meta verisi");
    expect(html).not.toContain("kurşun R/L işareti");
    expect(html).toContain("Arka kot sayımı ile değerlendirilir");
    expect(html).toContain("PA (arka-ön)");
  });

  it("pediatrik popülasyon satırı çizilir", () => {
    const html = renderToStaticMarkup(createElement(FilmInfoPanel, { image: xr({ population: "pediatrik" }) }));
    expect(html).toContain("Pediatrik — yalnız öğrenme/uygulama katmanı");
  });

  it("BT paneli XR sentetik bannerı yerine kesit ve kaynak bilgisini çizilir", () => {
    const html = renderToStaticMarkup(createElement(FilmInfoPanel, { image: ct() }));
    expect(html).not.toContain("film-info-synthetic-banner");
    expect(html).not.toContain("ÖRNEK HASTA");
    expect(html).toContain("Toraks BT — aksiyel kesitler (4 kesit)");
    expect(html).toContain("Akciğer · Mediasten");
    expect(html).toContain("TCIA LIDC-IDRI · LIDC-IDRI-0001");
    expect(html).toContain("Nodül konturu 3/4 radyoloğun");
    expect(html).toContain("kesit 2–4");
    expect(html).toContain("Kenar:");
    expect(html).toContain("patoloji doğrulaması yoktur");
    expect(html).toContain("Yalnız öğrenme modunda");
  });
});

describe("FilmCornerBadge ve sentetik yardımcılar", () => {
  it("köşe rozeti deterministik taraf işaretini çizilir", () => {
    const image = xr({ id: "img_corner_even" });
    const marker = sideMarkerFor(image);
    expect(marker).toBeTruthy();
    const html = renderToStaticMarkup(createElement(FilmCornerBadge, { image }));
    expect(html).toContain(`class="film-corner-badge"`);
    expect(html).toContain(marker!);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Sentetik taraf işareti");
  });

  it("görüntü yoksa köşe rozeti çizilmez", () => {
    expect(renderToStaticMarkup(createElement(FilmCornerBadge, { image: undefined }))).toBe("");
    expect(sideMarkerFor(undefined)).toBeNull();
    expect(syntheticDateFor(undefined)).toBe("—");
  });

  it("sentetik tarih ve taraf işareti id'ye göre deterministik", () => {
    const a = xr({ id: "deterministic_xr_a" });
    const b = xr({ id: "deterministic_xr_b" });
    expect(syntheticDateFor(a)).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(syntheticDateFor(a)).toBe(syntheticDateFor(a));
    expect(sideMarkerFor(a)).toBe(sideMarkerFor(a));
    expect(sideMarkerFor(a)).not.toBe(sideMarkerFor(b));
  });
});
