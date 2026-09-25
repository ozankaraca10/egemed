import { createContext, useCallback, useContext, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import { Toast as ToastPrimitive } from "radix-ui";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { t } from "../../i18n/tr";

export type ToastTone = "success" | "error" | "info";

export interface ToastInput {
  readonly title: string;
  readonly description?: string;
  readonly tone?: ToastTone;
}

interface ToastItem extends ToastInput {
  readonly id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

/** Bildirim göstermek için; sağlayıcı yoksa sessizce yok sayılır (statik render, testler). */
export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext);
}

const TONE_ICON: Readonly<Record<ToastTone, ReactNode>> = {
  success: <CheckCircle2 size={20} aria-hidden="true" />,
  error: <AlertCircle size={20} aria-hidden="true" />,
  info: <Info size={20} aria-hidden="true" />,
};

/** Geçici bildirimler (Radix Toast): canlı bölge duyurusu, kaydırarak kapatma, F8 ile odak. */
export function ToastProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const next = useRef(0);
  const show = useCallback((toast: ToastInput) => {
    next.current += 1;
    const id = next.current;
    setItems((current) => [...current.slice(-2), { ...toast, id }]);
  }, []);
  const remove = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000} label={t("toast.label")}>
        {children}
        {items.map((item) => {
          const tone = item.tone ?? "info";
          return (
            <ToastPrimitive.Root
              key={item.id}
              className={`eg-toast eg-toast--${tone}`}
              type={tone === "error" ? "foreground" : "background"}
              onOpenChange={(open) => {
                if (!open) remove(item.id);
              }}
            >
              <span className="eg-toast__icon">{TONE_ICON[tone]}</span>
              <div className="eg-toast__text">
                <ToastPrimitive.Title className="eg-toast__title">{item.title}</ToastPrimitive.Title>
                {item.description !== undefined ? (
                  <ToastPrimitive.Description className="eg-toast__desc">{item.description}</ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close className="eg-icon-btn eg-icon-btn--ghost eg-toast__close" aria-label={t("modal.close")}>
                <X size={18} aria-hidden="true" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="eg-toast__viewport" label={t("toast.region")} />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
