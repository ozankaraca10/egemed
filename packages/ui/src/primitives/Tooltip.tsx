import type { JSX, ReactElement, ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

export interface TooltipProps {
  readonly content: ReactNode;
  /** Tetikleyici tek bir öğe olmalı (ör. `IconButton`); ref ve olaylar ona aktarılır. */
  readonly children: ReactElement;
  readonly side?: "top" | "right" | "bottom" | "left";
}

/** Klavye odağında ve üzerine gelindiğinde açılan kısa ipucu (Radix; kendi sağlayıcısıyla). */
export function Tooltip({ content, children, side = "top" }: TooltipProps): JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="eg-tooltip" side={side} sideOffset={6} collisionPadding={8}>
            {content}
            <TooltipPrimitive.Arrow className="eg-tooltip__arrow" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
