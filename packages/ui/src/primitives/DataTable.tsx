import type { JSX, ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Checkbox } from "./Choice";
import { EmptyState, Skeleton } from "./Display";
import { cx } from "./props";
import { t } from "../../i18n/tr";

export interface DataTableColumn<Row> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly align?: "start" | "center" | "end";
  readonly width?: string;
  readonly sortable?: boolean;
}

export interface DataTableSort {
  readonly key: string;
  readonly direction: "asc" | "desc";
}

export interface DataTableSelection<Row> {
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly onToggleAll: () => void;
  /** Satırın onay kutusu için erişilebilir ad (ör. "Ayşe Yılmaz satırını seç"). */
  readonly label: (row: Row) => string;
}

export interface DataTableProps<Row> {
  /** Görsel olarak gizlenir; ekran okuyucu için tablonun amacını söyler. */
  readonly caption: string;
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly sort?: DataTableSort;
  readonly onSortChange?: (next: DataTableSort | undefined) => void;
  readonly selection?: DataTableSelection<Row>;
  /** Yükleniyor: gövde iskelet satırlarıyla değişir, tabloya `aria-busy` eklenir. */
  readonly loading?: boolean;
  /** Boş liste durumunda gösterilir (varsayılan: EmptyState). */
  readonly empty?: ReactNode;
  readonly density?: "comfortable" | "compact";
  readonly className?: string;
}

const SKELETON_ROW_COUNT = 5;

/** Sıralanabilir sütuna tıklanınca bir sonraki durum: yok → artan → azalan → yok. */
function nextSort(current: DataTableSort | undefined, key: string): DataTableSort | undefined {
  if (current === undefined || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return undefined;
}

function ariaSortOf(current: DataTableSort | undefined, key: string): "ascending" | "descending" | "none" {
  if (current === undefined || current.key !== key) return "none";
  return current.direction === "asc" ? "ascending" : "descending";
}

function sortIconOf(state: "ascending" | "descending" | "none"): JSX.Element {
  if (state === "ascending") return <ArrowUp size={16} aria-hidden="true" />;
  if (state === "descending") return <ArrowDown size={16} aria-hidden="true" />;
  return <ArrowUpDown size={16} aria-hidden="true" />;
}

function sortStatusText(state: "ascending" | "descending" | "none"): string {
  if (state === "ascending") return t("table.sort.asc");
  if (state === "descending") return t("table.sort.desc");
  return t("table.sort.none");
}

/**
 * Premium veri tablosu: sıralama, satır seçimi, yapışkan başlık, yükleniyor iskeleti ve
 * boş durum. 768 px altında yatay kaydırma yapmaz; satırlar kart olur (`.eg-dtable--stack`).
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  sort,
  onSortChange,
  selection,
  loading = false,
  empty,
  density = "comfortable",
  className,
}: DataTableProps<Row>): JSX.Element {
  const columnCount = columns.length + (selection !== undefined ? 1 : 0);
  const allSelected = selection !== undefined && rows.length > 0 && rows.every((row) => selection.selected.has(rowKey(row)));
  const someSelected = selection !== undefined && !allSelected && rows.some((row) => selection.selected.has(rowKey(row)));

  return (
    <table
      className={cx("eg-dtable", "eg-dtable--stack", density === "compact" && "eg-dtable--compact", className)}
      aria-busy={loading ? true : undefined}
    >
      <caption className="eg-visually-hidden">{caption}</caption>
      <thead className="eg-dtable__head">
        <tr>
          {selection !== undefined ? (
            <th className="eg-dtable__select-col" scope="col">
              <Checkbox
                hideLabel
                label={t("table.selectAll")}
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={() => selection.onToggleAll()}
                disabled={rows.length === 0}
              />
            </th>
          ) : null}
          {columns.map((column) => {
            const state = column.sortable === true ? ariaSortOf(sort, column.key) : undefined;
            const style = column.width !== undefined ? { width: column.width } : undefined;
            return (
              <th
                key={column.key}
                scope="col"
                className={cx("eg-dtable__th", column.align !== undefined && `eg-dtable__th--${column.align}`)}
                {...(state !== undefined ? { "aria-sort": state } : {})}
                {...(style !== undefined ? { style } : {})}
              >
                {column.sortable === true ? (
                  <button
                    type="button"
                    className="eg-dtable__sort"
                    onClick={() => onSortChange?.(nextSort(sort, column.key))}
                  >
                    <span>{column.header}</span>
                    <span className="eg-dtable__sort-icon" aria-hidden="true">{sortIconOf(state ?? "none")}</span>
                    <span className="eg-visually-hidden">{sortStatusText(state ?? "none")}</span>
                  </button>
                ) : (
                  column.header
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <tr key={`eg-dtable-skeleton-${index}`}>
              {selection !== undefined ? (
                <td className="eg-dtable__select-col">
                  <Skeleton width={20} height={20} radius={6} />
                </td>
              ) : null}
              {columns.map((column) => (
                <td key={column.key} data-label={column.header}>
                  <Skeleton height={16} />
                </td>
              ))}
            </tr>
          ))
        ) : rows.length === 0 ? (
          <tr>
            <td className="eg-dtable__empty" colSpan={Math.max(columnCount, 1)}>
              {empty ?? <EmptyState title={t("table.empty")} />}
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const key = rowKey(row);
            const selected = selection !== undefined && selection.selected.has(key);
            return (
              <tr key={key} className={cx(selected && "eg-dtable__row--selected")}>
                {selection !== undefined ? (
                  <td className="eg-dtable__select-col">
                    <Checkbox hideLabel label={selection.label(row)} checked={selected} onCheckedChange={() => selection.onToggle(key)} />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-label={column.header}
                    className={cx(column.align !== undefined && `eg-dtable__td--${column.align}`)}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
