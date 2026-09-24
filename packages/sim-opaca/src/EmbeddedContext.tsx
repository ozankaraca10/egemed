import { createContext, type JSX, type ReactNode, useContext } from "react";

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
