import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable, type DataTableColumn, type DataTableSort } from "../../packages/ui/src/primitives/DataTable";

interface Row {
  readonly id: string;
  readonly ad: string;
  readonly durum: string;
}

const columns: readonly DataTableColumn<Row>[] = [
  { key: "ad", header: "Ad", cell: (row) => row.ad, sortable: true },
  { key: "durum", header: "Durum", cell: (row) => row.durum },
];

const rows: readonly Row[] = [
  { id: "1", ad: "Ayşe", durum: "Bekliyor" },
  { id: "2", ad: "Mehmet", durum: "Onaylandı" },
];

function render(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(DataTable<Row>, {
      caption: "Başvurular",
      columns,
      rows,
      rowKey: (row: Row) => row.id,
      ...props,
    }),
  );
}

describe("DataTable işaretlemesi", () => {
  it("caption görsel gizli sınıfla üretilir", () => {
    const html = render();
    expect(html).toContain("<caption");
    expect(html).toMatch(/<caption[^>]*class="eg-visually-hidden"[^>]*>Başvurular<\/caption>/);
  });

  it("sıralanabilir sütun th'de aria-sort taşır, sıralanamayan taşımaz", () => {
    const sort: DataTableSort = { key: "ad", direction: "asc" };
    const html = render({ sort });
    expect(html).toMatch(/<th[^>]*aria-sort="ascending"[^>]*>[\s\S]*?Ad/);
    const durumTh = /<th[^>]*>(?:(?!<\/th>)[\s\S])*Durum[\s\S]*?<\/th>/.exec(html)?.[0] ?? "";
    expect(durumTh).not.toContain("aria-sort");
  });

  it("sıralanmamış sıralanabilir sütun aria-sort='none' taşır; sıralanamayan sütun hiç taşımaz", () => {
    const html = render();
    expect(html).toMatch(/<th[^>]*aria-sort="none"[^>]*>[\s\S]*?Ad/);
    const durumTh = /<th[^>]*>(?:(?!<\/th>)[\s\S])*Durum[\s\S]*?<\/th>/.exec(html)?.[0] ?? "";
    expect(durumTh).not.toContain("aria-sort");
  });

  it("seçim başlığında tümünü seç onay kutusu üretir", () => {
    const html = render({
      selection: {
        selected: new Set<string>(),
        onToggle: () => undefined,
        onToggleAll: () => undefined,
        label: (row: Row) => `${row.ad} satırını seç`,
      },
    });
    expect(html).toContain("eg-dtable__select-col");
    expect((html.match(/eg-check__control/g) ?? []).length).toBe(rows.length + 1);
  });

  it("yükleniyor durumunda aria-busy ve iskelet satırlar üretir", () => {
    const html = render({ loading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("eg-skeleton");
    expect(html).not.toContain("Ayşe");
  });

  it("boş liste varsayılan olarak boş durum bileşenini gösterir", () => {
    const html = render({ rows: [] });
    expect(html).toContain("eg-empty");
    expect(html).toContain("Kayıt bulunamadı");
  });
});
