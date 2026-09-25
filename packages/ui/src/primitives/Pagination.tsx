import type { JSX } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { cx } from "./props";
import { t } from "../../i18n/tr";

export interface PaginationProps {
  /** 1 tabanlı geçerli sayfa. */
  readonly page: number;
  readonly pageCount: number;
  readonly onPageChange: (page: number) => void;
  readonly total: number;
  readonly pageSize: number;
  readonly className?: string;
}

/** Sayfalama: "1–20 / 240 kayıt" özeti (aria-live), Önceki/Sonraki, 44 px hedefler. */
export function Pagination({ page, pageCount, onPageChange, total, pageSize, className }: PaginationProps): JSX.Element {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const summary = total === 0 ? t("pagination.empty") : `${from}–${to} / ${total} ${t("pagination.records")}`;
  return (
    <nav className={cx("eg-pagination", className)} aria-label={t("pagination.label")}>
      <Button
        variant="secondary"
        icon={<ChevronLeft aria-hidden="true" />}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t("pagination.prev")}
      </Button>
      <span className="eg-pagination__summary" aria-live="polite">
        {summary}
      </span>
      <Button
        variant="secondary"
        iconEnd={<ChevronRight aria-hidden="true" />}
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        {t("pagination.next")}
      </Button>
    </nav>
  );
}
