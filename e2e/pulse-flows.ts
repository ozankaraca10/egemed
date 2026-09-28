import { expect, type Locator } from "@playwright/test";
import pulseBank from "../packages/assessment-bank/data/pulse/items.json" with { type: "json" };

/**
 * A3.3 — Pulse vaka/sınav akışları sunucu oturumundan (ADR-009) beslenir: madde
 * kimliği ve cevap anahtarı istemciye gitmez, seçenekler oturuma özel opak
 * jetonlarla KARIŞTIRILIR. Doğru seçenek bu yüzden yalnız bankadan
 * (`packages/assessment-bank/data/pulse/items.json`) bulunabilir ve ekrandaki
 * seçenek ETİKETİYLE işaretlenir (Ausculta `sim-flows` deseni). Anahtar metin,
 * sunucu maddesinde de aynen görünen olgu (stem) + sorudur; çift benzersizdir.
 */
interface PulseBankItem {
  readonly id: string;
  readonly stem: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly correct: number;
}

const BANK = (pulseBank as { items: readonly PulseBankItem[] }).items;

/** Ekranda görünen olgu + soru metninden doğru seçeneğin etiketini bulur. */
export function pulseCorrectLabel(stem: string, question: string): string {
  const wantedStem = stem.trim();
  const wantedQuestion = question.trim();
  const item = BANK.find((entry) => entry.stem.trim() === wantedStem && entry.question.trim() === wantedQuestion);
  if (item === undefined) throw new Error(`Pulse bankasında madde yok: ${wantedQuestion.slice(0, 60)}`);
  const label = item.options[item.correct];
  if (label === undefined) throw new Error(`Pulse bankasında doğru seçenek yok: ${item.id}`);
  return label;
}

/** Seçeneği etiketiyle işaretler (görünen sıra sunucuda karıştırılmıştır). */
export async function selectPulseOption(card: Locator, label: string): Promise<void> {
  const options = card.locator(".opt");
  const texts = await options.allInnerTexts();
  const index = texts.findIndex((text) => text.trim() === label.trim());
  expect(index, `seçenek etiketi bulunamadı: ${label}`).toBeGreaterThanOrEqual(0);
  await options.nth(index).locator("input").check();
}

/**
 * Madde kartındaki görünen olgu/soruyla doğru seçeneği bulur ve işaretler.
 * Olgu metni GÖRÜNÜR bölümün kartından okunur (`#caseCard` / `#quizCaseCard`);
 * gizli bölümün kartı da DOM'da durduğu için kök taraması yanlış eşleşir.
 */
export async function selectCorrectPulseOption(card: Locator, caseCard: Locator): Promise<void> {
  const stem = await caseCard.locator(".case-stem").innerText();
  const question = await card.locator("legend").first().innerText();
  await selectPulseOption(card, pulseCorrectLabel(stem, question));
}

/**
 * Uygulama (vaka) akışında görünen maddeyi doğru yanıtlar: "Yanıtla" sunucuda
 * kontrol edilir ve geri bildirim gelene dek beklenir.
 */
export async function answerPulseCase(root: Locator): Promise<void> {
  await selectCorrectPulseOption(root.locator("#caseQuestionCard"), root.locator("#caseCard"));
  await root.locator("#caseCheck").click();
  await expect(root.locator("#caseFeedback .feedback-head")).toBeVisible({ timeout: 20_000 });
}

/** Değerlendirme akışında görünen soruyu yanıtlar ve sunucuya gönderir. */
export async function answerPulseQuizItem(root: Locator): Promise<void> {
  await selectCorrectPulseOption(root.locator(".quiz-card"), root.locator("#quizCaseCard"));
  await root.locator("#quizSubmit").click();
  await expect(root.locator("#quizSubmit")).toHaveCount(0, { timeout: 20_000 });
}

/** 10 maddelik vaka oturumunu uçtan uca çözer ve oturum sonu kartını bekler. */
export async function completePulseCases(root: Locator): Promise<void> {
  await expect(root.locator("#caseView")).toBeVisible({ timeout: 20_000 });
  for (let index = 0; index < 10; index += 1) {
    await answerPulseCase(root);
    await root.locator("#caseContinue").click();
    if (index < 9) await expect(root.locator("#caseDots")).toHaveText(`${index + 2} /10`, { timeout: 20_000 });
  }
  await expect(root.locator("#caseEnd")).toBeVisible({ timeout: 20_000 });
}

/** 10 soruluk değerlendirmeyi çözer ve sonuç ekranını bekler. */
export async function completePulseQuiz(root: Locator): Promise<void> {
  await expect(root.locator("#quizView")).toBeVisible({ timeout: 20_000 });
  for (let index = 0; index < 10; index += 1) {
    await answerPulseQuizItem(root);
    if (index < 9) {
      await root.locator("#quizItemNext").click();
      await expect(root.locator("#quizPage")).toHaveText(`${index + 2} /10`, { timeout: 20_000 });
    }
  }
  await expect(root.locator("#resultsView")).toBeVisible({ timeout: 20_000 });
}
