import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilmViewer, createNoopFilmEnv } from "../../../packages/sim-opaca/src/index";
import type { FilmViewerProps, ImageRecord, ReadingZone } from "../../../packages/sim-opaca/src/index";

/** FilmViewer statik render — E2 §8 S12 kabulü: XR/BT kaydı, işaretleme, HUD, erişilebilir
 *  etiketler (role/aria), işaret düğmesi; saf mantık film-core testlerinde. */

const noopEnv = createNoopFilmEnv();

const ZONES: ReadingZone[] = [
  {
    id: "zone_ru",
    step: "A",
    label: "RU",
    fullLabel: "Sağ üst zon",
    detail: "Sağ üst akciğer alanı",
    rects: [{ x: 0.55, y: 0.05, w: 0.35, h: 0.3 }],
  },
];

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
    annotations: [
      {
        finding: "pneumothorax",
        source: "expert_bbox",
        x: 0.6,
        y: 0.15,
        w: 0.12,
        h: 0.18,
      },
    ],
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
      },
      {
        finding: "nodule",
        source: "expert_bbox",
        x: 0.42,
        y: 0.41,
        w: 0.09,
        h: 0.09,
        frameIndex: 3,
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

function renderViewer(props: Partial<FilmViewerProps> = {}): string {
  return renderToStaticMarkup(
    createElement(FilmViewer, {
      image: xr(),
      zones: ZONES,
      showZones: false,
      showAnnotations: false,
      env: noopEnv,
      ...props,
    }),
  );
}

describe("FilmViewer (statik render)", () => {
  it("görüntü yoksa boş mesaj çizilir", () => {
    const html = renderToStaticMarkup(
      createElement(FilmViewer, {
        image: undefined,
        zones: ZONES,
        showZones: false,
        showAnnotations: false,
        env: noopEnv,
      }),
    );
    expect(html).toContain("film-empty");
    expect(html).toContain("Bu vaka için görüntü kaydı bulunamadı.");
  });

  it("XR kaydında erişilebilir sahne etiketi ve araç çubuğu çizilir", () => {
    const html = renderViewer({ label: "Test grafisi" });
    expect(html).toContain("film-viewer");
    expect(html).toContain('role="application"');
    expect(html).toContain('aria-label="Test grafisi"');
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Görüntüleyici araçları"');
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="İmleç aracı"');
    expect(html).toContain('aria-label="Yakınlaştırma"');
    expect(html).toContain("Kaydır");
    expect(html).toContain("Ölç");
    expect(html).toContain('alt="Akciğer grafisi"');
    expect(html).toContain("film-hud");
    expect(html).toContain("100%");
  });

  it("işaretleme etkinken işaret düğmesi ve ipucu çizilir", () => {
    const html = renderViewer({
      markEnabled: true,
      mark: { x: 0.42, y: 0.55 },
    });
    expect(html).toContain("İşaretle");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("film-mark-hint");
    expect(html).toContain("Bulguyu görüntü üzerinde işaretleyin");
    expect(html).toContain("film-mark-circle");
    expect(html).toContain("film-mark");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("işaretleme kapalıyken işaret düğmesi devre dışıdır", () => {
    const html = renderViewer({ markEnabled: false });
    expect(html).toContain("İşaretle");
    expect(html).toContain("disabled");
    expect(html).toContain("İşaretleme yalnız lokalizasyon sorusunda açılır");
  });

  it("uzman işaretlemesi ve bölge katmanı açıkken SVG overlay çizilir", () => {
    const html = renderViewer({
      showAnnotations: true,
      showZones: true,
      annotationFinding: "pneumothorax",
    });
    expect(html).toContain("film-overlay");
    expect(html).toContain("anno-rect");
    expect(html).toContain("zone-rect");
    expect(html).toContain("anno-label");
  });

  it("öğretim overlay'i açıkken statik renderda yükleme beklenir (rozet film-info testinde)", () => {
    const html = renderViewer({ showInfoOverlay: true });
    expect(html).toContain("film-viewer");
    expect(html).not.toContain("film-corner-badge");
  });

  it("BT kaydında kesit HUD'u, kaydırıcı ve BT aria etiketi çizilir", () => {
    const html = renderViewer({
      image: ct(),
      showAnnotations: true,
      annotationFinding: "nodule",
    });
    expect(html).toContain('alt="Toraks BT — kesit');
    expect(html).toContain("film-hud-slice");
    expect(html).toContain("Kesit 1/4");
    expect(html).toContain("film-slice-slider");
    expect(html).toContain('aria-label="BT kesiti"');
    expect(html).toContain(
      'aria-label="Toraks BT görüntüleyici. Fare tekerleği veya yukarı/aşağı ok tuşlarıyla kesit gezinin, artı/eksi ile yakınlaştırın, 0 ile sıfırlayın."',
    );
    expect(html).not.toContain("Okuma bölgeleri");
  });

  it("strict modda bölge katmanı ve uzman etiketleri gizlenir", () => {
    const html = renderViewer({
      strict: true,
      showAnnotations: true,
      showZones: true,
    });
    expect(html).toContain("is-strict");
    expect(html).not.toContain("zone-rect");
    expect(html).not.toContain("anno-label");
  });

  it("inert modda sahne odaklanamaz", () => {
    const html = renderViewer({ inert: true, markEnabled: true });
    expect(html).toContain("is-inert");
    expect(html).toContain('tabindex="-1"');
    expect(html).not.toContain("film-mark-hint");
  });

  it("fitContent kapalıyken sahne en-boy oranı taşımaz (diğer ekranlar değişmez)", () => {
    const html = renderViewer();
    expect(html).not.toContain("aspect-ratio");
  });

  it("fitContent açıkken sahne görüntünün en-boy oranıyla çizilir (T207)", () => {
    const html = renderViewer({ fitContent: true });
    // xr() 1024×1024 → oran 1; öğrenme düzeni sahneyi bu orana sabitler.
    expect(html).toContain("aspect-ratio:1");
  });
});
