import { useMemo, useState } from "react";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
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
import { Navigate, useNavigate, useParams } from "react-router-dom";
import AppSnackbar from "../components/AppSnackbar";
import AppTextField from "../components/AppTextField";
import { useLanguage } from "../context/LanguageContext";
import { resetPassword } from "../services/authService";

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const hasToken = useMemo(() => String(token || "").trim().length > 0, [token]);
  if (!hasToken) return <Navigate to="/login" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!password || !passwordConfirm) {
      setError(t("resetPasswordMissingFields"));
      return;
    }
    if (password !== passwordConfirm) {
      setError(t("resetPasswordMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await resetPassword({
        token,
        password,
        passwordConfirm,
      });
      setSuccess(result?.message || t("resetPasswordSuccess"));
      setPassword("");
      setPasswordConfirm("");
      setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (err) {
      setError(err?.message || t("resetPasswordFailed"));
    } finally {
      setSubmitting(false);
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
      <Card>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography
            variant="h4"
            gutterBottom
            sx={{ fontSize: { xs: "1.5rem", sm: "2.125rem" } }}
          >
            {t("resetPasswordTitle")}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {t("resetPasswordSubtitle")}
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <AppTextField
                label={t("newPassword")}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
                        aria-label={showPassword ? t("hidePassword") : t("showPassword")}
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
              <AppTextField
                label={t("confirmNewPassword")}
                type={showPasswordConfirm ? "text" : "password"}
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
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
                          showPasswordConfirm ? t("hidePassword") : t("showPassword")
                        }
                        onClick={() => setShowPasswordConfirm((prev) => !prev)}
                        onMouseDown={(event) => event.preventDefault()}
                        sx={{
                          m: 0,
                          height: "100%",
                          px: 1.25,
                          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                        }}
                      >
                        {showPasswordConfirm ? <VisibilityOffIcon /> : <VisibilityIcon />}
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
              <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting}>
                {submitting ? t("loading") : t("setNewPassword")}
              </Button>
              <Button variant="text" onClick={() => navigate("/login", { replace: true })}>
                {t("backToLogin")}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
      <AppSnackbar open={Boolean(error)} message={error} severity="error" onClose={() => setError("")} />
      <AppSnackbar
        open={Boolean(success)}
        message={success}
        severity="success"
        onClose={() => setSuccess("")}
      />
    </Container>
  );
}
