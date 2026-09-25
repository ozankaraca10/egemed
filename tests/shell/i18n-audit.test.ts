import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * T121 — kabuk yüzeyinde JSX düz metni ya da metin taşıyan öznitelik sabiti
 * olamaz; tüm görünür arayüz metni `packages/ui/i18n/tr.ts` sözlüğünden gelir
 * (AGENTS.md). Kaynak veri (mock adlar, birim adları, API hata kodları) bu
 * denetimin dışındadır: yalnız JSX metin düğümleri ve metin/erişilebilirlik
 * öznitelikleri taranır.
 */

const TEXT_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "label",
  "placeholder",
  "title",
]);

const LETTER = /\p{L}/u;

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Yalnız doğrudan çizilen metni toplar: dize, şablon (ifade parçaları hariç),
 * koşulun seçilen dalı, `+` birleştirmesi ve dizi öğeleri. Değişken, veri
 * alanı ve `t(...)` çağrısı metin kaynağı sayılmaz (sözlük ya da veri).
 */
function renderedTexts(
  expression: ts.Expression,
  add: (node: ts.Node, text: string) => void,
): void {
  let node: ts.Expression = expression;
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    add(node, node.text);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    add(node.head, node.head.text);
    for (const span of node.templateSpans) add(span.literal, span.literal.text);
    return;
  }
  if (ts.isConditionalExpression(node)) {
    renderedTexts(node.whenTrue, add);
    renderedTexts(node.whenFalse, add);
    return;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    renderedTexts(node.left, add);
    renderedTexts(node.right, add);
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      if (!ts.isSpreadElement(element)) renderedTexts(element, add);
    }
  }
}

function collect(file: string, source: ts.SourceFile): Finding[] {
  const findings: Finding[] = [];
  const add = (node: ts.Node, text: string): void => {
    if (!LETTER.test(text)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push({ file, line: line + 1, text });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      add(node, node.text);
    } else if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(source))) {
      const initializer = node.initializer;
      if (initializer !== undefined && ts.isStringLiteral(initializer)) add(initializer, initializer.text);
      if (initializer !== undefined && ts.isJsxExpression(initializer) && initializer.expression !== undefined) {
        renderedTexts(initializer.expression, add);
      }
    } else if (ts.isJsxExpression(node) && node.expression !== undefined && !ts.isJsxAttribute(node.parent)) {
      renderedTexts(node.expression, add);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

// `src/dev/` yalnız geliştirme vitrinidir (T151, üretim paketine girmez); denetim dışıdır.
const SHELL_TSX_FILES = ts.sys.readDirectory("apps/shell/src", [".tsx"], ["**/node_modules/**", "**/dev/**"]);

describe("T121 — kabuk i18n sabit metin denetimi", () => {
  it("apps/shell/src içindeki .tsx dosyalarında düz JSX metni ya da metin özniteliği sabiti kalmaz", () => {
    expect(SHELL_TSX_FILES.length).toBeGreaterThan(15);
    const findings = SHELL_TSX_FILES.flatMap((file) => {
      const content = ts.sys.readFile(file);
      if (content === undefined) throw new Error(`Dosya okunamadı: ${file}`);
      const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      return collect(file, source);
    });
    expect(findings.map((finding) => `${finding.file}:${finding.line}: ${JSON.stringify(finding.text)}`)).toEqual([]);
  });
});
