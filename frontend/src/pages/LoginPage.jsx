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
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 8 }, px: { xs: 1.5, sm: 3 } }}>
      <Card>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography
            variant="h4"
            gutterBottom
            sx={{ fontSize: { xs: "1.5rem", sm: "2.125rem" } }}
          >
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
              <Button type="submit" variant="contained" size="large" fullWidth>
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
