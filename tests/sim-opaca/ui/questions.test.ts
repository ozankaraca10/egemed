import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeedbackCard, QuestionCard, ZoneChips } from "../../../packages/sim-opaca/src/index";
import type { AbcdeStep, Question, ReadingZone } from "../../../packages/sim-opaca/src/index";

/** Soru + geri bildirim + bölge çipi grubu — E2 §8 S9 kabulü (statik render + saf yardımcılar).
 *  Kaynakta bu bileşenlerin testi yoktu; davranış işaretlemesi render çıktısından doğrulanır. */

const choice: Question = {
  id: "q1",
  type: "single_choice",
  domain: "recognition",
  prompt: "Hangi bulgu izleniyor?",
  help: "Yardım metni",
  options: [
    { id: "a", label: "Pnömotoraks" },
    { id: "b", label: "Konsolidasyon" },
    { id: "c", label: "Efüzyon" },
  ],
  correct: ["a"],
  feedbackCorrect: "Doğru geri bildirim",
  feedbackIncorrect: "Yanlış geri bildirim",
};

const multi: Question = {
  ...choice,
  id: "q2",
  type: "multi_choice",
  prompt: "Hangileri doğru?",
  correct: ["a", "c"],
};

const mark: Question = {
  id: "q3",
  type: "localization",
  domain: "localization",
  prompt: "Bulgunun üzerine tıklayın.",
  options: [],
  correct: [],
  targetFinding: "pneumothorax",
  feedbackCorrect: "İşaret geri bildirimi",
  feedbackIncorrect: "İşaret yanlış geri bildirimi",
};

interface ButtonView {
  readonly attrs: string;
  readonly text: string;
}

/** Statik HTML'deki düğmeleri nitelik + görünür metin olarak çıkarır (iç içe düğme yok). */
function buttons(html: string): ButtonView[] {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    attrs: m[1] ?? "",
    text: (m[2] ?? "").replace(/<[^>]*>/g, "").trim(),
  }));
}

function byText(html: string, text: string): ButtonView {
  const found = buttons(html).find((b) => b.text === text);
  if (!found) throw new Error(`düğme bulunamadı: ${text}`);
  return found;
}

describe("Opaca soru kartı (statik render)", () => {
  it("seçmeli soru radiogroup olarak ve tür etiketiyle çizilir; seçenek sırası deterministiktir", () => {
    const props = { q: choice, caseId: "c1", value: [], onChange: () => undefined, revealed: false };
    const html = renderToStaticMarkup(createElement(QuestionCard, props));
    const again = renderToStaticMarkup(createElement(QuestionCard, props));

    expect(html).toBe(again);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Hangi bulgu izleniyor?"');
    expect(html).toContain('<span class="q-eyebrow">Soru</span>');
    expect(html).toContain('<p class="q-text">Hangi bulgu izleniyor?</p>');
    expect(html).toContain('<p class="q-help">Yardım metni</p>');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    for (const o of choice.options) expect(html).toContain(`<span>${o.label}</span>`);
    expect(buttons(html).every((b) => b.attrs.includes('aria-checked="false"'))).toBe(true);
    expect(html).not.toContain("is-correct");
    expect(html).not.toContain("is-wrong");
  });

  it("seçili ve açıklanmış durumlar sınıf + aria-checked ile işaretlenir; doğru/yanlış ikonları dekoratiftir", () => {
    const selected = renderToStaticMarkup(
      createElement(QuestionCard, { q: choice, caseId: "c1", value: ["a"], onChange: () => undefined, revealed: true })
    );
    expect(byText(selected, "Pnömotoraks").attrs).toContain('aria-checked="true"');
    expect(byText(selected, "Pnömotoraks").attrs).toContain("selected");
    expect(byText(selected, "Pnömotoraks").attrs).toContain("is-correct");
    expect(byText(selected, "Konsolidasyon").attrs).not.toContain("is-correct");

    const wrong = renderToStaticMarkup(
      createElement(QuestionCard, { q: choice, caseId: "c1", value: ["b"], onChange: () => undefined, revealed: true })
    );
    expect(byText(wrong, "Konsolidasyon").attrs).toContain("is-wrong");
    expect(byText(wrong, "Konsolidasyon").attrs).not.toContain("is-correct");
    expect(byText(wrong, "Pnömotoraks").attrs).toContain("is-correct");
    expect(wrong.match(/class="mark" aria-hidden="true"/g)).toHaveLength(2);
  });

  it("çok seçmeli soru group/checkbox olarak onay ikonuyla çizilir", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionCard, { q: multi, caseId: "c1", value: ["a", "c"], onChange: () => undefined, revealed: false })
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('<span class="q-eyebrow">Çok seçmeli</span>');
    expect(html.match(/role="checkbox"/g)).toHaveLength(3);
    expect(html).toContain('<span class="check">');
    expect(html).not.toContain('<span class="radio">');
    expect(byText(html, "Pnömotoraks").attrs).toContain('aria-checked="true"');
    expect(byText(html, "Efüzyon").attrs).toContain('aria-checked="true"');
    expect(byText(html, "Konsolidasyon").attrs).toContain('aria-checked="false"');
  });

  it("soru ilerlemesi noktalarla, yardım metniyle ve sınır durumlarıyla çizilir", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionCard, { q: choice, caseId: "c1", value: [], onChange: () => undefined, revealed: false, index: 1, total: 3 })
    );
    expect(html).toContain('aria-label="Soru 2 / 3"');
    expect(html).toContain("<span>Soru 2 / 3</span>");
    expect(html.match(/<i class="done"><\/i>/g)).toHaveLength(1);
    expect(html.match(/<i class="active"><\/i>/g)).toHaveLength(1);
    expect(html.match(/<i class=""><\/i>/g)).toHaveLength(1);

    const none = renderToStaticMarkup(
      createElement(QuestionCard, { q: choice, caseId: "c1", value: [], onChange: () => undefined, revealed: false, index: 0, total: 0 })
    );
    expect(none).not.toContain("q-progress");
  });

  it("lokalizasyon sorusunda işaret durumu, kaldırma ve kilit korunur", () => {
    const empty = renderToStaticMarkup(
      createElement(QuestionCard, { q: mark, caseId: "c1", value: [], onChange: () => undefined, revealed: false })
    );
    expect(empty).toContain('role="status"');
    expect(empty).toContain("İşaretle aracı açık");
    expect(empty).not.toContain("has-mark");

    const placed = renderToStaticMarkup(
      createElement(QuestionCard, { q: mark, caseId: "c1", value: ["pt:0.7000,0.3000"], onChange: () => undefined, revealed: false })
    );
    expect(placed).toContain("mark-status has-mark");
    expect(placed).toContain("İşaret yerleştirildi.");
    expect(placed).toContain("İşareti kaldır");

    const locked = renderToStaticMarkup(
      createElement(QuestionCard, { q: mark, caseId: "c1", value: ["pt:0.7000,0.3000"], onChange: () => undefined, revealed: true })
    );
    expect(locked).toContain("İşaretiniz kaydedildi.");
    expect(locked).not.toContain("link-btn");

    const lockedEmpty = renderToStaticMarkup(
      createElement(QuestionCard, { q: mark, caseId: "c1", value: [], onChange: () => undefined, revealed: true })
    );
    expect(lockedEmpty).not.toContain("mark-status");

    const invalid = renderToStaticMarkup(
      createElement(QuestionCard, { q: mark, caseId: "c1", value: ["geçersiz"], onChange: () => undefined, revealed: false })
    );
    expect(invalid).not.toContain("has-mark");
  });

  it("disabled seçenek düğmelerini kapatır", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionCard, { q: choice, caseId: "c1", value: [], onChange: () => undefined, revealed: false, disabled: true })
    );
    expect(html.match(/<button[^>]*disabled/g)).toHaveLength(3);
  });
});

describe("Opaca geri bildirim kartı (statik render)", () => {
  it("doğru yanıtta Doğru başlığı ve doğru geri bildirim çizilir", () => {
    const html = renderToStaticMarkup(createElement(FeedbackCard, { correct: true, q: choice, given: ["a"] }));
    expect(html).toContain("feedback-head good");
    expect(html).toContain("<h2>Doğru</h2>");
    expect(html).toContain("Doğru geri bildirim");
    expect(html).not.toContain("Yanlış");
    expect(html).not.toContain("Yanıtınız");
  });

  it("yanlış yanıtta verilen ve doğru etiketler gösterilir", () => {
    const html = renderToStaticMarkup(createElement(FeedbackCard, { correct: false, q: choice, given: ["b"] }));
    expect(html).toContain("feedback-head bad");
    expect(html).toContain("<h2>Yanlış</h2>");
    expect(html).toContain("Yanıtınız: Konsolidasyon");
    expect(html).toContain("Doğru yanıt: Pnömotoraks");
    expect(html).toContain("Yanlış geri bildirim");

    const blank = renderToStaticMarkup(createElement(FeedbackCard, { correct: false, q: choice, given: [] }));
    expect(blank).not.toContain("Yanıtınız");
    expect(blank).toContain("Doğru yanıt: Pnömotoraks");
  });

  it("lokalizasyon geri bildirimi bulgu kısa adıyla verilir", () => {
    const right = renderToStaticMarkup(createElement(FeedbackCard, { correct: true, q: mark, given: [] }));
    expect(right).toContain("İşaretiniz Pnömotoraks için uzman işaretlemesinin içinde.");

    const wrong = renderToStaticMarkup(createElement(FeedbackCard, { correct: false, q: mark, given: [] }));
    expect(wrong).toContain("İşaretiniz uzman işaretlemesinin dışında kaldı.");
    expect(wrong).toContain("Pnömotoraks alanı şimdi kutuyla gösteriliyor.");
  });
});

const zone = (id: string, step: AbcdeStep, label: string): ReadingZone => ({
  id,
  step,
  label,
  fullLabel: label,
  detail: `${label} detayı`,
  rects: [],
});

const zones: ReadingZone[] = [zone("a_trachea", "A", "Trakea"), zone("b_r_upper", "B", "Sağ üst")];

describe("Opaca bölge çipleri (statik render)", () => {
  it("aktif ve incelenmiş çip durumu aria + data ile bildirilir (renk tek başına değil)", () => {
    const html = renderToStaticMarkup(
      createElement(ZoneChips, {
        zones,
        visits: { b_r_upper: { dwellMs: 500 } },
        activeZones: ["a_trachea"],
        minDwellMs: 500,
        onSelect: () => undefined,
      })
    );

    expect(html).toContain('aria-label="Sistematik okuma bölgeleri"');
    expect(byText(html, "Trakea").attrs).toContain('aria-pressed="true"');
    expect(byText(html, "Trakea").attrs).toContain("is-active");
    expect(byText(html, "Trakea").attrs).not.toContain("data-done");
    expect(byText(html, "Sağ üst").attrs).toContain('aria-pressed="false"');
    expect(byText(html, "Sağ üst").attrs).toContain("is-inspected");
    expect(byText(html, "Sağ üst").attrs).toContain('aria-label="Sağ üst · incelendi"');
    expect(byText(html, "Sağ üst").attrs).toContain('data-done="true"');
    expect(byText(html, "Sağ üst").attrs).toContain('title="Sağ üst detayı"');
  });

  it("önerilen çip işaretlenir; eşik altı ziyaret incelenmiş sayılmaz", () => {
    const html = renderToStaticMarkup(
      createElement(ZoneChips, {
        zones,
        visits: { b_r_upper: { dwellMs: 499 } },
        activeZones: [],
        minDwellMs: 500,
        onSelect: () => undefined,
        highlight: ["b_r_upper"],
      })
    );
    expect(byText(html, "Sağ üst").attrs).toContain("is-suggested");
    expect(byText(html, "Sağ üst").attrs).not.toContain("is-inspected");
    expect(byText(html, "Trakea").attrs).not.toContain("is-suggested");
  });

  it("tamamlanan ABCDE adımı işaretlenir, boş adım çizilmez", () => {
    const html = renderToStaticMarkup(
      createElement(ZoneChips, {
        zones,
        visits: { a_trachea: { dwellMs: 500 }, b_r_upper: { dwellMs: 500 } },
        activeZones: [],
        minDwellMs: 500,
        onSelect: () => undefined,
      })
    );
    expect(html.match(/class="zone-step is-complete"/g)).toHaveLength(2);
    expect(html).toContain('<span class="zone-step-title">Hava yolu</span>');
    expect(html).toContain('<span class="zone-step-title">Akciğerler ve plevra</span>');
    expect(html).not.toContain('class="zone-step "');
  });

  it("değerlendirmede gizleme sınıfı korunur", () => {
    const html = renderToStaticMarkup(
      createElement(ZoneChips, { zones, visits: {}, activeZones: [], minDwellMs: 500, onSelect: () => undefined, hideUntilFocus: true })
    );
    expect(html).toContain("zone-chips sr-only-until-focus");
  });
});
