import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeedbackCard, QuestionCard, nextOptionIndex, toggleOptionValues } from "../../packages/sim-ausculta/src/index";
import type { Question } from "../../packages/sim-ausculta/src/index";

/** Soru kartı ve geri bildirim — statik işaretleme, DOM kütüphanesi yok. */

const choice: Question = {
  id: "q1",
  type: "single_choice",
  domain: "recognition",
  prompt: "Hangi ses duyuluyor?",
  help: "Odağı dinleyin",
  options: [
    { id: "a", label: "Üfürüm" },
    { id: "b", label: "Sürtünme" },
    { id: "c", label: "Normal S1" },
  ],
  correct: ["a"],
  feedbackCorrect: "Üfürüm doğru",
  feedbackIncorrect: "Tekrar dinleyin",
};

const multi: Question = {
  ...choice,
  id: "q2",
  type: "multi_choice",
  prompt: "Hangileri patolojik?",
  correct: ["a", "b"],
};

function buttons(html: string): { attrs: string; text: string }[] {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({
    attrs: match[1] ?? "",
    text: (match[2] ?? "").replace(/<[^>]*>/g, "").trim(),
  }));
}

function byLabel(html: string, label: string): string {
  const found = buttons(html).find((button) => button.attrs.includes(`aria-label="${label}`));
  if (!found) throw new Error(`seçenek yok: ${label}`);
  return found.attrs;
}

describe("seçenek yardımcıları", () => {
  it("tek seçimde değiştirir, çok seçimde ekler ve çıkarır", () => {
    expect(toggleOptionValues(false, ["b"], "a")).toEqual(["a"]);
    expect(toggleOptionValues(true, ["a"], "b")).toEqual(["a", "b"]);
    expect(toggleOptionValues(true, ["a", "b"], "a")).toEqual(["b"]);
  });

  it("ok tuşlarında sarar, diğer tuşlarda durur", () => {
    expect(nextOptionIndex(0, "ArrowDown", 3)).toBe(1);
    expect(nextOptionIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextOptionIndex(0, "ArrowUp", 3)).toBe(2);
    expect(nextOptionIndex(2, "ArrowLeft", 3)).toBe(1);
    expect(nextOptionIndex(1, "Enter", 3)).toBeNull();
    expect(nextOptionIndex(0, "ArrowDown", 0)).toBeNull();
  });
});

describe("soru kartı (statik render)", () => {
  it("radiogroup, tür etiketi ve seçenekleri çizer", () => {
    const props = { q: choice, caseId: "c1", value: [], onChange: () => undefined, revealed: false };
    const html = renderToStaticMarkup(createElement(QuestionCard, props));
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Hangi ses duyuluyor?"');
    expect(html).toContain('<span class="q-eyebrow">Soru</span>');
    expect(html).toContain("<p class=\"q-help\">Odağı dinleyin</p>");
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(buttons(html).every((button) => button.attrs.includes('aria-checked="false"'))).toBe(true);
    expect(html).not.toContain("radio-dot");
    expect(html).not.toContain("is-correct");
    expect(html).toContain("min-width:44px");
  });

  it("seçili, doğru ve yanlış durumları im ve etiketle ayırır", () => {
    const selected = renderToStaticMarkup(
      createElement(QuestionCard, { q: choice, caseId: "c1", value: ["a"], onChange: () => undefined, revealed: true }),
    );
    expect(byLabel(selected, "Üfürüm, doğru")).toContain('aria-checked="true"');
    expect(byLabel(selected, "Üfürüm, doğru")).toContain("is-correct");
    expect(byLabel(selected, "Üfürüm, doğru")).toContain("selected");
    expect(selected).toContain("radio-dot");
    expect(selected.match(/class="mark" aria-hidden="true"/g)).toHaveLength(1);

    const wrong = renderToStaticMarkup(
      createElement(QuestionCard, {
        q: choice,
        caseId: "c1",
        value: ["b"],
        onChange: () => undefined,
        revealed: true,
        correctIds: ["c"],
      }),
    );
    expect(byLabel(wrong, "Sürtünme, yanlış")).toContain("is-wrong");
    expect(byLabel(wrong, "Normal S1, doğru")).toContain("is-correct");
    expect(wrong.match(/class="mark" aria-hidden="true"/g)).toHaveLength(2);
  });

  it("çok seçmeli onay imini yalnız seçili kutuda gösterir", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionCard, { q: multi, caseId: "c1", value: ["a"], onChange: () => undefined, revealed: false }),
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('<span class="q-eyebrow">Çok seçmeli</span>');
    expect(html.match(/role="checkbox"/g)).toHaveLength(3);
    expect(byLabel(html, "Üfürüm, seçili")).toContain('aria-checked="true"');
    expect(html.match(/<span class="check">/g)).toHaveLength(3);
    expect(html.match(/<svg /g)?.length).toBe(1);
  });

  it("ilerleme noktalarını çizer ve kaş satırını kapatabilir", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionCard, {
        q: { ...choice, type: "bell_diaphragm" },
        caseId: "c1",
        value: [],
        onChange: () => undefined,
        revealed: false,
        index: 1,
        total: 3,
      }),
    );
    expect(html).toContain('<span class="q-eyebrow">Stetoskop kafası</span>');
    expect(html).toContain('aria-label="Soru 2 / 3"');
    expect(html.match(/<i class="done"><\/i>/g)).toHaveLength(1);
    expect(html.match(/<i class="active"><\/i>/g)).toHaveLength(1);

    const hidden = renderToStaticMarkup(
      createElement(QuestionCard, {
        q: choice,
        caseId: "c1",
        value: [],
        onChange: () => undefined,
        revealed: false,
        showEyebrow: false,
        index: 0,
        total: 0,
      }),
    );
    expect(hidden).not.toContain("q-eyebrow");
    expect(hidden).not.toContain("q-progress");
  });

  it("kapalı seçenekleri devre dışı bırakır", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionCard, { q: choice, caseId: "c1", value: [], onChange: () => undefined, revealed: false, disabled: true }),
    );
    expect(html.match(/<button[^>]*disabled/g)).toHaveLength(3);
  });
});

describe("geri bildirim kartı", () => {
  it("doğru yanıtta başlık ve doğru metni gösterir", () => {
    const html = renderToStaticMarkup(createElement(FeedbackCard, { correct: true, q: choice, given: ["a"] }));
    expect(html).toContain("feedback-head good");
    expect(html).toContain("<h2>Doğru!</h2>");
    expect(html).toContain("Üfürüm doğru");
    expect(html).not.toContain("Yanıtınız");
  });

  it("yanlış yanıtta verilen ve doğru etiketleri yazar", () => {
    const html = renderToStaticMarkup(createElement(FeedbackCard, { correct: false, q: multi, given: ["c", "yok"] }));
    expect(html).toContain("<h2>Yanlış</h2>");
    expect(html).toContain("Yanıtınız: Normal S1");
    expect(html).toContain("Doğru yanıt: Üfürüm, Sürtünme");
    expect(html).toContain("Tekrar dinleyin");
    expect(html).toContain("good-text");

    const blank = renderToStaticMarkup(createElement(FeedbackCard, { correct: false, q: choice, given: [] }));
    expect(blank).not.toContain("Yanıtınız");
    expect(blank).toContain("Doğru yanıt: Üfürüm");
  });
});
