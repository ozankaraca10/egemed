import { type JSX, type ReactNode } from "react";
import { t } from "../i18n/tr";

export interface TableColumn<Row> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
}
export interface TableProps<Row> {
  readonly caption: string;
  readonly columns: readonly TableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
}

/** Veri tablosu: `<caption>`, `th scope="col"`, her hücrede `data-label`;
 * 768px altında CSS kart listesine çevirir (mobilde `role` açıkça yazılır). */
export function Table<Row>({ caption, columns, rows, rowKey }: TableProps<Row>): JSX.Element {
  return (
    <table className="eg-table" role="table">
      <caption className="eg-table__caption">{caption}</caption>
      <thead>
        <tr role="row">
          {columns.map((column) => (
            <th key={column.key} role="columnheader" scope="col">
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr role="row">
            <td className="eg-table__empty" colSpan={columns.length} role="cell">
              {t("table.empty")}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)} role="row">
              {columns.map((column) => (
                <td data-label={column.header} key={column.key} role="cell">
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
