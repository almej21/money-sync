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
import ExpensesPage from "./pages/ExpensesPage";
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
          <Route path="/expenses" element={<ExpensesPage />} />
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
          primary: { main: "#0f766e" },
          secondary: { main: "#0ea5e9" },
          background: { default: "#f1f5f9" },
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily: '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
