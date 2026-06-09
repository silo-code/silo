import { createContext, useContext } from "react";

export interface ThemeContextValue {
  reloadThemes: () => Promise<void>;
}

export const ThemeContext = createContext<ThemeContextValue>({
  reloadThemes: () => Promise.resolve(),
});

export const useThemeContext = () => useContext(ThemeContext);
