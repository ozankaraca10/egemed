import type { ReactNode } from "react";

export function GamiSyncErrorBanner({ message, onDismiss, icon }: { message: string; onDismiss: () => void; icon: ReactNode }) {
  return (
    <div className="eg-gami-sync-error" role="alert">
      {icon}
      <span>{message}</span>
      <button type="button" className="btn outline small" onClick={onDismiss}>Kapat</button>
    </div>
  );
}
