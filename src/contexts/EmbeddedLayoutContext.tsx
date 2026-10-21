import { createContext, useContext, ReactNode } from "react";

const EmbeddedLayoutContext = createContext<boolean>(false);

export const EmbeddedLayoutProvider = ({ children }: { children: ReactNode }) => (
  <EmbeddedLayoutContext.Provider value={true}>{children}</EmbeddedLayoutContext.Provider>
);

export const useEmbeddedLayout = () => useContext(EmbeddedLayoutContext);
