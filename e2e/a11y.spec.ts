import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { writeAxeArtifact } from "./artifacts";
import { openRoute, ROUTES } from "./helpers";

test.describe("erişilebilirlik (WCAG 2.2 AA)", () => {
  for (const route of ROUTES) {
    test(`${route.label} (${route.hash})`, async ({ page }, testInfo) => {
      await openRoute(page, route.hash);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      const violations = results.violations.map((violation) => ({
        help: violation.help,
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.flatMap((node) => node.target).slice(0, 5),
      }));
      await writeAxeArtifact(testInfo.project.name, route.hash, violations);
      expect(violations, "axe ihlalleri").toEqual([]);
    });
  }
});
