export const COLOR_SCHEMES = {
  forest: {
    primary: "#718355",
    secondary: "#97a97c",
    accent: "#cfe1b9",
    background: "#f4f6f3",
    text: "#2f3a24",
    white: "#ffffff",
  },
  ocean: {
    primary: "#2a6f97",
    secondary: "#468faf",
    accent: "#89c2d9",
    background: "#edf6fb",
    text: "#10334a",
    white: "#ffffff",
  },
  sunset: {
    primary: "#c44536",
    secondary: "#dd6b4d",
    accent: "#f4b183",
    background: "#fff3eb",
    text: "#4a1f18",
    white: "#ffffff",
  },
  slate: {
    primary: "#4a5568",
    secondary: "#718096",
    accent: "#cbd5e0",
    background: "#f7fafc",
    text: "#1a202c",
    white: "#ffffff",
  },
  pink: {
    primary: "#c2185b",
    secondary: "#e91e63",
    accent: "#f8bbd0",
    background: "#fff0f6",
    text: "#4a0f2d",
    white: "#ffffff",
  },
  lavender: {
    primary: "#6a4c93",
    secondary: "#8e7cc3",
    accent: "#d7c7f5",
    background: "#f7f3ff",
    text: "#2f2245",
    white: "#ffffff",
  },
  mint: {
    primary: "#2d6a4f",
    secondary: "#40916c",
    accent: "#b7e4c7",
    background: "#f1fff7",
    text: "#1b4332",
    white: "#ffffff",
  },
  amber: {
    primary: "#b7791f",
    secondary: "#d69e2e",
    accent: "#f6e05e",
    background: "#fffbea",
    text: "#5f370e",
    white: "#ffffff",
  },
};

export const DEFAULT_COLOR_SCHEME_KEY = "forest";
export const COLORS = COLOR_SCHEMES[DEFAULT_COLOR_SCHEME_KEY];

export function createThemeColors(base) {
  return {
    primary: {
      main: base.primary,
      light: base.secondary,
      dark: base.text,
      contrastText: base.white,
    },
    secondary: {
      main: base.accent,
      light: base.white,
      dark: base.accent,
      contrastText: base.text,
    },
    background: {
      default: base.background,
      paper: base.accent,
    },
    text: {
      primary: base.text,
      secondary: base.text,
    },
    menu: {
      background: base.text,
      text: base.white,
      selectedBackground: "rgba(255, 255, 255, 0.14)",
      selectedText: base.white,
      hoverBackground: "rgba(255, 255, 255, 0.1)",
    },
  };
}

export function getThemeColorsByScheme(schemeKey = DEFAULT_COLOR_SCHEME_KEY) {
  const base = COLOR_SCHEMES[schemeKey] || COLORS;
  return createThemeColors(base);
}

export const THEME_COLORS = getThemeColorsByScheme(DEFAULT_COLOR_SCHEME_KEY);
