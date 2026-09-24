import { createContext, useContext, type JSX, type ReactNode } from "react";

/** Platform kabuğu içinde gömülü mod; ekran başlıkları h2 olarak çizilir (kabuk h1 tek kalır). */
const EmbeddedContext = createContext(false);

export function EmbeddedProvider({
  embedded,
  children,
}: {
  readonly embedded: boolean;
  readonly children: ReactNode;
}): JSX.Element {
  return <EmbeddedContext.Provider value={embedded}>{children}</EmbeddedContext.Provider>;
}

export function useEmbedded(): boolean {
  return useContext(EmbeddedContext);
}

export interface ScreenHeadingProps {
  readonly className?: string;
  readonly id?: string;
  readonly children: ReactNode;
}

/** Ekran ana başlığı: gömülü modda h2, bağımsız modda h1 (aynı sınıf/id). */
export function ScreenHeading({ className, id, children }: ScreenHeadingProps): JSX.Element {
  const embedded = useEmbedded();
  if (embedded) {
    return (
      <h2 className={className} id={id}>
        {children}
      </h2>
    );
  }
  return (
    <h1 className={className} id={id}>
      {children}
    </h1>
  );
}
