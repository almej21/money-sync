import {
  Box,
  Chip,
  CircularProgress,
  Container,
  createTheme,
  CssBaseline,
  ThemeProvider,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useMemo } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { prefixer } from "stylis";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import DashboardBottomNav from "./components/DashboardBottomNav";
import NavBar from "./components/NavBar";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { DashboardFiltersProvider } from "./context/DashboardFiltersContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { AppThemeProvider, useAppTheme } from "./context/ThemeContext";
import AccountPage from "./pages/AccountPage";
import BankCredentialsPage from "./pages/BankCredentialsPage";
import DashboardChartsPage from "./pages/DashboardChartsPage";
import DashboardListPage from "./pages/DashboardListPage";
import DashboardPage from "./pages/DashboardPage";
import DashboardPieChartPage from "./pages/DashboardPieChartPage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ShoppingListsPage from "./pages/ShoppingListsPage";

const ltrCache = createCache({ key: "mui" });
const rtlCache = createCache({
  key: "muirtl",
  stylisPlugins: [prefixer, rtlPlugin],
});

function ScreenSizeDebugBadge() {
  const theme = useTheme();
  const upSm = useMediaQuery(theme.breakpoints.up("sm"));
  const upMd = useMediaQuery(theme.breakpoints.up("md"));
  const upLg = useMediaQuery(theme.breakpoints.up("lg"));
  const upXl = useMediaQuery(theme.breakpoints.up("xl"));

  let label = "xs";
  if (upXl) label = "xl";
  else if (upLg) label = "lg";
  else if (upMd) label = "md";
  else if (upSm) label = "sm";

  return (
    <Chip
      size="small"
      label={`screen: ${label}`}
      sx={{
        position: "fixed",
        bottom: 10,
        right: 10,
        zIndex: 2000,
        fontWeight: 700,
        bgcolor: "rgba(0,0,0,0.8)",
        color: "#fff",
      }}
    />
  );
}

function DashboardSectionLayout() {
  return (
    <>
      <Outlet />
      <DashboardBottomNav />
    </>
  );
}

function ProtectedRoutes() {
  const { user, authLoading } = useAuth();
  const { direction } = useLanguage();

  if (authLoading) {
    return (
      <Container
        component="main"
        maxWidth="sm"
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: { xs: 1.5, sm: 3 },
        }}
        dir={direction}
      >
        <CircularProgress size={22} thickness={5} />
      </Container>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<LoginPage />} />
        <Route path="/forgot-password" element={<LoginPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <NavBar />
      <Container
        component="main"
        maxWidth="md"
        sx={{ py: { xs: 2, sm: 3 }, px: { xs: 1.5, sm: 3 } }}
        dir={direction}
      >
        <Routes>
          <Route element={<DashboardSectionLayout />}>
            <Route path="/" element={<Navigate to="/dashboard/list" replace />} />
            <Route path="/dashboard" element={<DashboardPage />}>
              <Route index element={<Navigate to="/dashboard/list" replace />} />
              <Route path="list" element={<DashboardListPage hideTotal />} />
              <Route path="charts" element={<DashboardChartsPage />} />
              <Route path="pie" element={<DashboardPieChartPage />} />
            </Route>
          </Route>
          <Route path="/shopping-lists" element={<ShoppingListsPage />} />
          <Route path="/bank" element={<BankCredentialsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Container>
    </>
  );
}

function AppContent() {
  const { direction } = useLanguage();
  const { colors, themeColors } = useAppTheme();
  const textFieldHeightScale = 0.75;
  const defaultOutlinedInputHeight = 56;
  const outlinedInputMinHeight = defaultOutlinedInputHeight * textFieldHeightScale;
  const outlinedInputPaddingY = 10 * textFieldHeightScale;
  const theme = useMemo(
    () =>
      createTheme({
        zIndex: {
          modal: 1300,
          snackbar: 100000,
          tooltip: 100100,
        },
        palette: {
          primary: themeColors.primary,
          secondary: themeColors.secondary,
          background: themeColors.background,
          text: themeColors.text,
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily:
            '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              html: {
                backgroundColor: themeColors.background.default,
                "--app-outlined-input-min-height": `${outlinedInputMinHeight}px`,
              },
              body: {
                backgroundColor: themeColors.background.default,
              },
            },
          },
          MuiAppBar: {
            styleOverrides: {
              colorInherit: {
                backgroundColor: themeColors.primary.main,
                color: themeColors.primary.contrastText,
                borderBottom: "none",
              },
            },
          },
          MuiContainer: {
            styleOverrides: {
              root: {
                position: "relative",
                zIndex: 1,
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: {
                backgroundColor: themeColors.background.paper,
                border: `1px solid ${themeColors.background.paper}`,
                boxShadow: `0 10px 24px ${themeColors.primary.main}26`,
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                fontWeight: 700,
                textTransform: "none",
              },
              outlined: {
                borderColor: themeColors.primary.light,
                color: themeColors.primary.main,
              },
            },
          },
          MuiIconButton: {
            styleOverrides: {
              root: {
                color: themeColors.text.primary,
                transition: "background-color 160ms ease, color 160ms ease",
                "&:hover": {
                  backgroundColor: themeColors.text.primary,
                  color: themeColors.secondary.dark,
                },
              },
            },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                backgroundColor: themeColors.background.default,
                minHeight: "var(--app-outlined-input-min-height)",
                "&.MuiInputBase-multiline": {
                  minHeight: "auto",
                },
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: themeColors.primary.light,
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: themeColors.text.secondary,
                },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: themeColors.primary.main,
                  borderWidth: 2,
                },
              },
              input: {
                paddingTop: outlinedInputPaddingY,
                paddingBottom: outlinedInputPaddingY,
              },
            },
          },
          MuiInputLabel: {
            styleOverrides: {
              root: {
                color: colors.text,
                fontWeight: 700,
                "&.Mui-focused": {
                  color: colors.text,
                },
              },
            },
          },
        },
        direction,
      }),
    [colors.text, direction, outlinedInputMinHeight, outlinedInputPaddingY, themeColors],
  );
  const debugScreenSizeEnabled =
    String(import.meta.env.VITE_DEBUG_SCREEN_SIZE || "").toLowerCase() ===
      "true" || window.location.hostname === "localhost";
  const emotionCache = direction === "rtl" ? rtlCache : ltrCache;

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <DashboardFiltersProvider>
            <BrowserRouter>
              <Box
                sx={{
                  minHeight: "100vh",
                  bgcolor: "background.default",
                  width: "100%",
                  overflowX: "hidden",
                }}
                dir={direction}
              >
                <ProtectedRoutes />
                {debugScreenSizeEnabled && <ScreenSizeDebugBadge />}
              </Box>
            </BrowserRouter>
          </DashboardFiltersProvider>
        </AuthProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}

export default function App() {
  return (
    <AppThemeProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </AppThemeProvider>
  );
}
