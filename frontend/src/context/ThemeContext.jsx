import { createContext, useContext, useMemo, useState } from "react";
import {
  COLOR_SCHEMES,
  DEFAULT_COLOR_SCHEME_KEY,
  getThemeColorsByScheme,
} from "../constants/colors";

const THEME_STORAGE_KEY = "app_color_scheme";
const ThemeContext = createContext(null);

function getInitialSchemeKey() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved && COLOR_SCHEMES[saved]) return saved;
  return DEFAULT_COLOR_SCHEME_KEY;
}

export function AppThemeProvider({ children }) {
  const [schemeKey, setSchemeKey] = useState(getInitialSchemeKey);

  const value = useMemo(() => {
    const safeKey = COLOR_SCHEMES[schemeKey]
      ? schemeKey
      : DEFAULT_COLOR_SCHEME_KEY;
    const colors = COLOR_SCHEMES[safeKey];
    const themeColors = getThemeColorsByScheme(safeKey);

    function updateSchemeKey(nextKey) {
      const normalizedKey = String(nextKey || "").trim();
      if (!COLOR_SCHEMES[normalizedKey]) return;
      setSchemeKey(normalizedKey);
      localStorage.setItem(THEME_STORAGE_KEY, normalizedKey);
    }

    return {
      schemeKey: safeKey,
      schemeKeys: Object.keys(COLOR_SCHEMES),
      colors,
      themeColors,
      setSchemeKey: updateSchemeKey,
    };
  }, [schemeKey]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used inside AppThemeProvider");
  }
  return context;
}
