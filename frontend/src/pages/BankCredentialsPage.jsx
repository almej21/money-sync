import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
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
  const [connections, setConnections] = useState([]);
  const [connectedCount, setConnectedCount] = useState(0);
  const [form, setForm] = useState({
    companyId: "",
    connectionName: "",
    credentials: {},
  });
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.companyId === form.companyId) || null,
    [providers, form.companyId],
  );
  const providerLabelById = useMemo(
    () =>
      Object.fromEntries(
        providers.map((provider) => [provider.companyId, provider.label || provider.companyId]),
      ),
    [providers],
  );
  const statusText = loading
    ? t("loading")
    : `${t("connectedAccounts")} ${connectedCount}`;

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
      const nextConnections = Array.isArray(statusData.connections)
        ? statusData.connections
        : [];
      const preferredCompanyId = String(form.companyId || "").trim();
      const fallbackCompanyId = nextProviders[0]?.companyId || "";
      const companyId = nextProviders.some(
        (provider) => provider.companyId === preferredCompanyId,
      )
        ? preferredCompanyId
        : fallbackCompanyId;
      const provider = nextProviders.find((item) => item.companyId === companyId);

      setProviders(nextProviders);
      setConnections(nextConnections);
      setConnectedCount(
        Number(statusData.connectedCount ?? nextConnections.filter((item) => item.connected).length),
      );
      setUpdatedAt(statusData.updatedAt || null);
      setForm({
        companyId,
        connectionName: "",
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
      connectionName: "",
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
          connectionName: form.connectionName.trim(),
          credentials: Object.fromEntries(
            Object.entries(form.credentials).map(([key, value]) => [key, value.trim()]),
          ),
        }),
      });

      setSuccess(t("bankConnectionSaved"));
      setForm((prev) => ({
        ...prev,
        connectionName: "",
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

  async function removeConnection(connectionId) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api(`/bank/credentials/${connectionId}`, { method: "DELETE" });
      setSuccess(t("bankConnectionRemoved"));
      await loadBankConfig();
    } catch (err) {
      setError(err.message || t("failedRemoveBankConnection"));
    } finally {
      setSaving(false);
    }
  }

  async function removeAllConnections() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api("/bank/credentials", { method: "DELETE" });
      setSuccess(t("allBankConnectionsRemoved"));
      await loadBankConfig();
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
            <Typography>{`${t("status")}: ${statusText}`}</Typography>
            {!loading && updatedAt && (
              <Typography color="text.secondary">
                {t("lastUpdated")}: {new Date(updatedAt).toLocaleString(locale)}
              </Typography>
            )}
          </Stack>

          <Stack spacing={1.5} sx={{ mb: 3 }}>
            <Typography variant="subtitle1">{t("configuredAccounts")}</Typography>
            {!connections.length && (
              <Typography color="text.secondary">{t("noBankConnections")}</Typography>
            )}
            {connections.map((connection) => (
              <Card key={connection.id} variant="outlined">
                <CardContent sx={{ py: 1.5 }}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Stack spacing={0.5} justifyContent="center">
                      <Typography sx={{ fontWeight: 600 }}>
                        {providerLabelById[connection.companyId] || connection.companyId}
                      </Typography>
                    </Stack>
                    <Button
                      type="button"
                      variant="outlined"
                      color="error"
                      onClick={() => removeConnection(connection.id)}
                      disabled={saving || loading}
                    >
                      {t("removeConnection")}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Box component="form" onSubmit={saveCredentials}>
            <Stack spacing={2}>
              <Typography variant="subtitle1">{t("addConnection")}</Typography>
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

              <TextField
                label={t("connectionName")}
                value={form.connectionName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, connectionName: e.target.value }))
                }
                helperText={t("optional")}
                fullWidth
              />

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
                  {t("addConnection")}
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  color="error"
                  onClick={removeAllConnections}
                  disabled={saving || loading || connectedCount === 0}
                  sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                  {t("removeAllConnections")}
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
