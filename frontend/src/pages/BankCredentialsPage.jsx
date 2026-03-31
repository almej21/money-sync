import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../api";
import { useLanguage } from "../context/LanguageContext";

function buildEmptyCredentials(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.name, ""]));
}

export default function BankCredentialsPage() {
  const { t, locale } = useLanguage();
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState({ companyId: "", credentials: {} });
  const [connected, setConnected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.companyId === form.companyId) || null,
    [providers, form.companyId],
  );

  async function loadBankConfig() {
    setLoading(true);
    setError("");
    try {
      const [providersData, statusData] = await Promise.all([
        api("/bank/providers"),
        api("/bank/credentials"),
      ]);

      const nextProviders = Array.isArray(providersData.providers)
        ? providersData.providers
        : [];
      const preferredCompanyId = String(statusData.companyId || "").trim();
      const fallbackCompanyId = nextProviders[0]?.companyId || "";
      const companyId = nextProviders.some(
        (provider) => provider.companyId === preferredCompanyId,
      )
        ? preferredCompanyId
        : fallbackCompanyId;
      const provider = nextProviders.find((item) => item.companyId === companyId);

      setProviders(nextProviders);
      setConnected(Boolean(statusData.connected));
      setUpdatedAt(statusData.updatedAt || null);
      setForm({
        companyId,
        credentials: buildEmptyCredentials(provider?.fields || []),
      });
    } catch (err) {
      setError(err.message || t("failedLoadBankStatus"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBankConfig();
  }, []);

  function onCompanyChange(nextCompanyId) {
    const provider = providers.find((item) => item.companyId === nextCompanyId);
    setForm({
      companyId: nextCompanyId,
      credentials: buildEmptyCredentials(provider?.fields || []),
    });
  }

  function onFieldChange(fieldName, value) {
    setForm((prev) => ({
      ...prev,
      credentials: {
        ...prev.credentials,
        [fieldName]: value,
      },
    }));
  }

  async function saveCredentials(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api("/bank/credentials", {
        method: "PUT",
        body: JSON.stringify({
          companyId: form.companyId.trim(),
          credentials: Object.fromEntries(
            Object.entries(form.credentials).map(([key, value]) => [key, value.trim()]),
          ),
        }),
      });

      setSuccess(t("bankCredentialsSaved"));
      setForm((prev) => ({
        ...prev,
        credentials: Object.fromEntries(
          Object.entries(prev.credentials).map(([key]) => [key, ""]),
        ),
      }));
      await loadBankConfig();
    } catch (err) {
      setError(err.message || t("failedSaveBankCredentials"));
    } finally {
      setSaving(false);
    }
  }

  async function disconnectBank() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api("/bank/credentials", { method: "DELETE" });
      setConnected(false);
      setUpdatedAt(null);
      setForm((prev) => ({
        ...prev,
        credentials: buildEmptyCredentials(selectedProvider?.fields || []),
      }));
      setSuccess(t("bankCredentialsRemoved"));
    } catch (err) {
      setError(err.message || t("failedRemoveBankCredentials"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 3 } }}>
          <Typography variant="h5" gutterBottom>
            {t("bankCredentials")}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {t("configureBankCredentials")}
          </Typography>

          <Stack spacing={1} sx={{ mb: 2 }}>
            <Typography>
              {`${t("status")}: ${
                loading ? t("loading") : connected ? t("connected") : t("notConnected")
              }`}
            </Typography>
            {!loading && updatedAt && (
              <Typography color="text.secondary">
                {t("lastUpdated")}: {new Date(updatedAt).toLocaleString(locale)}
              </Typography>
            )}
          </Stack>

          <Box component="form" onSubmit={saveCredentials}>
            <Stack spacing={2}>
              <TextField
                label={t("bankOrCreditCardCompany")}
                select
                value={form.companyId}
                onChange={(e) => onCompanyChange(e.target.value)}
                required
                fullWidth
              >
                {providers.map((provider) => (
                  <MenuItem key={provider.companyId} value={provider.companyId}>
                    {provider.label} ({provider.companyId})
                  </MenuItem>
                ))}
              </TextField>

              {(selectedProvider?.fields || []).map((field) => (
                <TextField
                  key={field.name}
                  label={field.label || field.name}
                  type={field.type || "text"}
                  value={form.credentials[field.name] || ""}
                  onChange={(e) => onFieldChange(field.name, e.target.value)}
                  required={Boolean(field.required)}
                  helperText={field.required ? t("required") : t("optional")}
                  fullWidth
                />
              ))}

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={saving || loading}
                  sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                  {t("saveCredentials")}
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  color="error"
                  onClick={disconnectBank}
                  disabled={saving || loading || !connected}
                  sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                  {t("disconnect")}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
    </Stack>
  );
}
