import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import {
  Box,
  Container,
  CssBaseline,
  ThemeProvider,
  createTheme,
} from "@mui/material";
import { useMemo } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import NavBar from "./components/NavBar";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ShoppingListsPage from "./pages/ShoppingListsPage";
import BankCredentialsPage from "./pages/BankCredentialsPage";

function ProtectedRoutes() {
  const { user } = useAuth();
  const { direction } = useLanguage();

  if (!user) return <LoginPage />;

  return (
    <>
      <NavBar />
      <Container component="main" maxWidth="md" sx={{ py: 3 }} dir={direction}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/shopping-lists" element={<ShoppingListsPage />} />
          <Route path="/bank" element={<BankCredentialsPage />} />
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
          primary: {
            main: "#718355",
            light: "#97a97c",
            dark: "#87986a",
            contrastText: "#ffffff",
          },
          secondary: {
            main: "#b5c99a",
            light: "#e9f5db",
            dark: "#97a97c",
            contrastText: "#2f3a24",
          },
          background: {
            default: "#ffffff",
            paper: "#e9f5db",
          },
          text: {
            primary: "#2f3a24",
            secondary: "#5b6c43",
          },
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily: '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                backgroundColor: "#ffffff",
              },
            },
          },
          MuiAppBar: {
            styleOverrides: {
              colorInherit: {
                backgroundColor: "#718355",
                color: "#ffffff",
                borderBottom: "1px solid #87986a",
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
                backgroundColor: "#e9f5db",
                border: "1px solid #cfe1b9",
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
                borderColor: "#97a97c",
                color: "#718355",
              },
            },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                backgroundColor: "#ffffff",
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
          <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }} dir={direction}>
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
