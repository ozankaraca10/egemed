import { expect, type Locator } from "@playwright/test";
import opacaCasesCore from "../packages/sim-opaca/src/data/cases.json" with { type: "json" };
import opacaCasesAuto from "../packages/sim-opaca/src/data/cases-auto.json" with { type: "json" };
import auscultaCasesCore from "../packages/sim-ausculta/src/data/cases.json" with { type: "json" };
import auscultaCasesAuto from "../packages/sim-ausculta/src/data/cases-auto.json" with { type: "json" };

/**
 * Opaca/Ausculta ortak sim akışları (T143): öğrenme → konu uygulaması → oturum sonu.
 * sims-a11y (iç ekran erişilebilirliği) ve auth-api (API oturumunda sunucu kaydı)
 * aynı akışı kullanır; spec dosyası başka spec'ten içe aktarılmaz (testler iki kez kaydolur).
 */
export type SimId = "opaca" | "ausculta";

/** Konu uygulamasındaki soruların doğru seçenekleri vaka havuzundan okunur
 *  (emsalin curriculum içe aktarımı gibi; yalnız prompt/etiket alanları). */
interface RawOption {
  id: string;
  label: string;
}

interface RawQuestion {
  prompt: string;
  correct: string[];
  options: RawOption[];
}

interface RawCase {
  modes: string[];
  questions: RawQuestion[];
}

function practiceQuestions(...sources: readonly { cases: unknown[] }[]): Map<string, Set<string>> {
  const byPrompt = new Map<string, Set<string>>();
  for (const source of sources) {
    for (const raw of source.cases) {
      const caseDef = raw as RawCase;
      if (!caseDef.modes?.includes("practice")) continue;
      for (const question of caseDef.questions ?? []) {
        if (!question.prompt || !Array.isArray(question.correct)) continue;
        let correct = byPrompt.get(question.prompt);
        if (correct === undefined) {
          correct = new Set<string>();
          byPrompt.set(question.prompt, correct);
        }
        for (const id of question.correct) {
          const option = question.options?.find((item) => item.id === id);
          if (option) correct.add(option.label.trim());
        }
      }
    }
  }
  return byPrompt;
}

const OPACA_CORRECT_BY_PROMPT = practiceQuestions(
  opacaCasesCore as unknown as { cases: unknown[] },
  opacaCasesAuto as unknown as { cases: unknown[] },
);
const AUSCULTA_CORRECT_BY_PROMPT = practiceQuestions(
  auscultaCasesCore as unknown as { cases: unknown[] },
  auscultaCasesAuto as unknown as { cases: unknown[] },
);

/**
 * Öğrenme ekranından konu uygulaması başlatır (kütüphane öğeleri sırayla
 * denemez; "uygulama yap" eylemi olan ilk konu veri tarafında sabittir).
 */
export async function startTopicPractice(root: Locator): Promise<void> {
  await root.locator(".mode-card.learn button.btn").first().click();
  await expect(root.locator(".tabbar.info-tabs")).toBeVisible();
  const items = root.locator(".lib-item");
  const count = await items.count();
  for (let index = 0; index < count; index += 1) {
    await items.nth(index).click();
    await root.locator(".tabbar.info-tabs button").nth(2).click();
    const startButton = root.getByRole("button", { name: /uygulama yap/ });
    if ((await startButton.count()) > 0) {
      await startButton.first().click();
      await expect(root.locator(".q-card-dark").first()).toBeVisible();
      return;
    }
  }
  throw new Error("Uygulama başlatan konu bulunamadı");
}

/**
 * "Bir yanıt verilmiş" durumu kararlı kılar: görüntüdeki soru metniyle vaka
 * havuzundan doğru seçenek etiketleri bulunur ve bilinen yanlış bir seçenek
 * tıklatılır. Geri bildirim her koşuda "Yanlış" görünür (doğru yanıt satırı
 * `.good-text` daima vardır); ekran içeriği örneklemeye göre değişmez.
 */
export async function giveAnswer(root: Locator, sim: SimId): Promise<void> {
  const prompt = (await root.locator(".q-text").innerText()).trim();
  const labels = (await root.locator(".opt").allInnerTexts()).map((label) => label.trim());
  const correctLabels =
    (sim === "opaca" ? OPACA_CORRECT_BY_PROMPT : AUSCULTA_CORRECT_BY_PROMPT).get(prompt) ?? new Set<string>();
  const wrongIndex = labels.findIndex((label) => label.length > 0 && !correctLabels.has(label));
  const options = root.locator(".opt");
  if ((await options.count()) > 0) {
    await options.nth(wrongIndex >= 0 ? wrongIndex : labels.length - 1).click();
    return;
  }
  if (sim === "opaca") {
    await root.locator(".film-stage").click();
    return;
  }
  throw new Error("Cevaplanabilir soru öğesi yok");
}

/** Birincil eylem düğmesini tıklatıp uygulama geri bildirimini bekler. */
export async function submitAnswer(root: Locator): Promise<void> {
  await root.locator(".q-nav button.btn.primary").click();
  await expect(root.locator(".feedback-head").first()).toBeVisible();
}

/** 5 vakalık konu oturumunu uçtan uca çözüp sonuç ekranına getirir. */
export async function completeTopicPractice(root: Locator, sim: SimId): Promise<void> {
  const page = root.page();
  const resultsHeading = page.getByRole("heading", { name: "Vaka Raporu", exact: true });
  const endCard = root.locator(".case-end-card");
  const options = root.locator(".opt");
  const filmStage = root.locator(".film-stage");
  for (let round = 0; round < 80; round += 1) {
    if ((await resultsHeading.count()) > 0) return;
    // Ekranlar arası tek karelik render boşlukları beklenir; dört durumdan biri
    // görünür olana dek otomatik yeniden denenir.
    const anyState = resultsHeading.or(endCard).or(options.first()).or(filmStage.first()).first();
    await expect(anyState, `konu oturumunda beklenmeyen ekran durumu (tur ${round})`).toBeVisible();
    // expect ile dal seçimi arasında ekran değişebilir (ör. son vakadan sonuca
    // geçiş); hiçbir dal eşleşmezse kısa bekleyip aynı turda yeniden bakılır.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await resultsHeading.count()) > 0) return;
      if ((await endCard.count()) > 0) {
        await endCard.locator(".q-nav button.btn.primary").click();
        break;
      }
      if ((await options.count()) > 0) {
        await options.first().click();
        await submitAnswer(root);
        await root.locator(".q-nav button.btn.primary").click();
        break;
      }
      if (sim === "opaca" && (await filmStage.count()) > 0) {
        await filmStage.click();
        await submitAnswer(root);
        await root.locator(".q-nav button.btn.primary").click();
        break;
      }
      await page.waitForTimeout(150);
    }
  }
  throw new Error("Konu oturumu sürede tamamlanamadı");
}
