import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Box, Container } from "@mui/material";
import { AuthProvider, useAuth } from "./context/AuthContext";
import NavBar from "./components/NavBar";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ExpensesPage from "./pages/ExpensesPage";
import ShoppingListsPage from "./pages/ShoppingListsPage";
import BankCredentialsPage from "./pages/BankCredentialsPage";

function ProtectedRoutes() {
  const { user } = useAuth();

  if (!user) return <LoginPage />;

  return (
    <>
      <NavBar />
      <Container component="main" maxWidth="md" sx={{ py: 3 }}>
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
          <ProtectedRoutes />
        </Box>
      </BrowserRouter>
    </AuthProvider>
  );
}
