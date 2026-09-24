import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Table, type TableColumn } from "../../packages/ui/src/Table";
import { describe, expect, it } from "vitest";

interface Row {
  readonly id: string;
  readonly ad: string;
  readonly durum: string;
}

const columns: readonly TableColumn<Row>[] = [
  { key: "ad", header: "Ad", cell: (row) => row.ad },
  { key: "durum", header: "Durum", cell: (row) => row.durum },
];

const rows: readonly Row[] = [
  { id: "1", ad: "Ayşe", durum: "Bekliyor" },
  { id: "2", ad: "Mehmet", durum: "Onaylandı" },
];

function render(rowList: readonly Row[]): string {
  return renderToStaticMarkup(
    createElement(Table<Row>, { caption: "Başvurular", columns, rows: rowList, rowKey: (row) => row.id }),
  );
}
describe("Table işaretlemesi", () => {
  it("caption ve th scope=col başlıklarını üretir", () => {
    const html = render(rows);
    expect(html).toContain("<caption");
    expect(html).toContain("Başvurular");
    expect((html.match(/<th[^>]*scope="col"[^>]*>/g) ?? []).length).toBe(columns.length);
  });

  it("her hücre data-label ile sütun başlığını taşır", () => {
    const cells = render(rows).match(/<td[^>]*>/g) ?? [];
    expect(cells.length).toBe(rows.length * columns.length);
    for (const cell of cells) {
      expect(cell).toMatch(/data-label="(Ad|Durum)"/);
    }
  });
});
