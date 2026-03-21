import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await login(
        form.email,
        form.password,
        mode === "register" ? form.name : "",
      );
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Card>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" gutterBottom>
            {mode === "login" ? t("login") : t("createAccount")}
          </Typography>
          <Box component="form" onSubmit={submit}>
            <Stack spacing={2}>
        {mode === "register" && (
          <TextField
            label={t("name")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
          />
        )}
        <TextField
          label={t("email")}
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          fullWidth
        />
        <TextField
          label={t("password")}
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          fullWidth
        />
              <Button type="submit" variant="contained" size="large">
                {mode === "login" ? t("login") : t("register")}
              </Button>
            </Stack>
          </Box>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          <Button
        sx={{ mt: 2 }}
        variant="text"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? t("switchToRegister") : t("switchToLogin")}
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
}
