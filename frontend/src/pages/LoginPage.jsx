import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  IconButton,
  InputAdornment,
  Stack,
  Typography,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useLocation, useNavigate } from "react-router-dom";
import israelFlagIcon from "../assets/icons/israel.png";
import usaFlagIcon from "../assets/icons/united-states.png";
import AppTextField from "../components/AppTextField";
import AppSnackbar from "../components/AppSnackbar";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { requestPasswordReset } from "../services/authService";

export default function LoginPage() {
  const { login } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingForgotEmail, setSendingForgotEmail] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const nextLanguage = language === "en" ? "he" : "en";
  const nextLanguageFlagIcon = nextLanguage === "en" ? usaFlagIcon : israelFlagIcon;
  const isForgotPasswordMode = location.pathname === "/forgot-password";

  useEffect(() => {
    if (isForgotPasswordMode) return;
    setMode(location.pathname === "/register" ? "register" : "login");
  }, [isForgotPasswordMode, location.pathname]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
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

  async function submitForgotPassword(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const email = String(forgotEmail || "").trim();
    if (!email) {
      setError(t("forgotPasswordEmailRequired"));
      return;
    }

    setSendingForgotEmail(true);
    try {
      const result = await requestPasswordReset({ email });
      setSuccess(result?.message || t("forgotPasswordEmailSent"));
      setForgotEmail("");
    } catch (err) {
      setError(err?.message || t("forgotPasswordRequestFailed"));
    } finally {
      setSendingForgotEmail(false);
    }
  }

  return (
    <Container
      maxWidth="sm"
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        transform: "translateY(-15%)",
        py: { xs: 3, sm: 6 },
        px: { xs: 1.5, sm: 3 },
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <Button
          onClick={() => setLanguage(nextLanguage)}
          aria-label={t("language")}
          title={nextLanguage === "en" ? t("english") : t("hebrew")}
          sx={{ minWidth: 0, px: 1, py: 0.6, borderRadius: 2 }}
        >
          <Box
            component="img"
            src={nextLanguageFlagIcon}
            alt={nextLanguage === "en" ? t("english") : t("hebrew")}
            sx={{ width: 20, height: 20, display: "block" }}
          />
        </Button>
      </Box>
      <Card>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography
            variant="h4"
            gutterBottom
            sx={{ fontSize: { xs: "1.5rem", sm: "2.125rem" } }}
          >
            {isForgotPasswordMode
              ? t("forgotPasswordTitle")
              : mode === "login"
                ? t("login")
                : t("createAccount")}
          </Typography>
          {isForgotPasswordMode ? (
            <Box component="form" onSubmit={submitForgotPassword}>
              <Stack spacing={2}>
                <Typography color="text.secondary">
                  {t("forgotPasswordSubtitle")}
                </Typography>
                <AppTextField
                  label={t("email")}
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  fullWidth
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={sendingForgotEmail}
                >
                  {sendingForgotEmail ? t("loading") : t("sendResetLink")}
                </Button>
                <Button
                  variant="text"
                  onClick={() => navigate("/login", { replace: true })}
                >
                  {t("backToLogin")}
                </Button>
              </Stack>
            </Box>
          ) : (
            <>
              <Box component="form" onSubmit={submit}>
                <Stack spacing={2}>
                  {mode === "register" && (
                    <AppTextField
                      label={t("name")}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      fullWidth
                    />
                  )}
                  <AppTextField
                    label={t("email")}
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    fullWidth
                  />
                  <AppTextField
                    label={t("password")}
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment
                          position="end"
                          sx={{
                            position: "absolute",
                            right: 0,
                            top: "50%",
                            transform: "translateY(-50%)",
                            m: 0,
                            height: "100%",
                            maxHeight: "none",
                          }}
                        >
                          <IconButton
                            edge="end"
                            aria-label={
                              showPassword ? t("hidePassword") : t("showPassword")
                            }
                            onClick={() => setShowPassword((prev) => !prev)}
                            onMouseDown={(event) => event.preventDefault()}
                            sx={{
                              m: 0,
                              height: "100%",
                              px: 1.25,
                              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                            }}
                          >
                            {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        </InputAdornment>
                      ),
                      sx: {
                        "& .MuiOutlinedInput-input": {
                          paddingRight: "64px",
                        },
                      },
                    }}
                    fullWidth
                  />
                  <Button type="submit" variant="contained" size="large" fullWidth>
                    {mode === "login" ? t("login") : t("register")}
                  </Button>
                </Stack>
              </Box>
              {mode === "login" && (
                <Button
                  sx={{ mt: 1 }}
                  variant="text"
                  onClick={() => navigate("/forgot-password", { replace: true })}
                >
                  {t("forgotPasswordButton")}
                </Button>
              )}
              <Button
                sx={{ mt: 1 }}
                variant="text"
                onClick={() =>
                  navigate(mode === "login" ? "/register" : "/login", {
                    replace: true,
                  })
                }
              >
                {mode === "login" ? t("switchToRegister") : t("switchToLogin")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      <AppSnackbar
        open={Boolean(error)}
        message={error}
        severity="error"
        onClose={() => setError("")}
      />
      <AppSnackbar
        open={Boolean(success)}
        message={success}
        severity="success"
        onClose={() => setSuccess("")}
      />
    </Container>
  );
}
