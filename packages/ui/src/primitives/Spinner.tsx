import type { JSX } from "react";

/** Dönen yükleme göstergesi; süsleyicidir — durum metni çağıran bileşende verilir. */
export function Spinner({ size = 18 }: { readonly size?: number }): JSX.Element {
  return <span className="eg-spinner" style={{ inlineSize: size, blockSize: size }} aria-hidden="true" />;
}
