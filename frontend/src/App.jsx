import {
  Box,
  CircularProgress,
  Container,
  CssBaseline,
  ThemeProvider,
  Typography,
  createTheme,
} from "@mui/material";
import { useMemo } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import NavBar from "./components/NavBar";
import { COLORS, THEME_COLORS } from "./constants/colors";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import AccountPage from "./pages/AccountPage";
import BankCredentialsPage from "./pages/BankCredentialsPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ShoppingListsPage from "./pages/ShoppingListsPage";

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <CircularProgress size={22} thickness={5} />
          <Typography variant="body1">Loading...</Typography>
        </Box>
      </Container>
    );
  }

  if (!user) return <LoginPage />;

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
          <Route path="/" element={<DashboardPage />} />
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
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          primary: THEME_COLORS.primary,
          secondary: THEME_COLORS.secondary,
          background: THEME_COLORS.background,
          text: THEME_COLORS.text,
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily:
            '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                backgroundColor: THEME_COLORS.background.default,
              },
            },
          },
          MuiAppBar: {
            styleOverrides: {
              colorInherit: {
                backgroundColor: THEME_COLORS.primary.main,
                color: THEME_COLORS.primary.contrastText,
                borderBottom: `1px solid ${THEME_COLORS.primary.dark}`,
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
                backgroundColor: THEME_COLORS.background.paper,
                border: `1px solid ${THEME_COLORS.background.paper}`,
                boxShadow: "0 10px 24px rgba(113, 131, 85, 0.15)",
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
                borderColor: THEME_COLORS.primary.light,
                color: THEME_COLORS.primary.main,
              },
            },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                backgroundColor: THEME_COLORS.background.default,
              },
            },
          },
          MuiInputLabel: {
            styleOverrides: {
              root: {
                color: COLORS.neutral.gray900,
                fontWeight: 700,
                "&.Mui-focused": {
                  color: COLORS.neutral.gray900,
                },
              },
            },
          },
        },
        direction,
      }),
    [direction],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
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
          </Box>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
