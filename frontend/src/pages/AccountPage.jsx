import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import AppSnackbar from "../components/AppSnackbar";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export default function AccountPage() {
  const { user, updatePreferences } = useAuth();
  const { t } = useLanguage();
  const [sourceAccountOptions, setSourceAccountOptions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const userDefaultIds = useMemo(
    () =>
      Array.isArray(user?.defaultSelectedBankConnectionIds)
        ? user.defaultSelectedBankConnectionIds
        : [],
    [user?.defaultSelectedBankConnectionIds],
  );

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [expenses, statusData, providersData] = await Promise.all([
          api("/expenses"),
          api("/bank/credentials"),
          api("/bank/providers"),
        ]);
        const connections = Array.isArray(statusData?.connections)
          ? statusData.connections.filter((connection) =>
              String(connection?.id || "").trim(),
            )
          : [];
        const connectionById = new Map(
          connections.map((connection) => [String(connection.id || "").trim(), connection]),
        );

        const providers = Array.isArray(providersData?.providers)
          ? providersData.providers
          : [];
        const providerLabels = Object.fromEntries(
          providers.map((provider) => [
            provider.companyId,
            provider.label || provider.companyId,
          ]),
        );

        const optionsByAccountId = new Map();
        (Array.isArray(expenses) ? expenses : []).forEach((expense) => {
          const accountId = String(expense?.sourceAccountId || "").trim();
          if (!accountId || optionsByAccountId.has(accountId)) return;

          const sourceConnectionKey = String(expense?.sourceConnectionKey || "").trim();
          const sourceCompanyId = String(expense?.sourceCompanyId || "").trim();
          const connection = connectionById.get(sourceConnectionKey);
          const companyId = String(connection?.companyId || sourceCompanyId || "").trim();
          const providerLabel = providerLabels[companyId] || companyId || t("bank");

          optionsByAccountId.set(accountId, {
            id: accountId,
            label: `${providerLabel} (${accountId})`,
          });
        });

        const options = Array.from(optionsByAccountId.values()).sort((a, b) =>
          a.label.localeCompare(b.label, "en"),
        );
        setSourceAccountOptions(options);
      } catch (err) {
        setError(err.message || t("failedLoadAccountDefaults"));
      } finally {
        setLoading(false);
      }
    }

    loadData().catch(console.error);
  }, [t]);

  useEffect(() => {
    const allConnectionIds = sourceAccountOptions.map((option) => option.id);
    const validDefaultIds = userDefaultIds.filter((id) =>
      allConnectionIds.includes(id),
    );
    setSelectedIds(validDefaultIds.length ? validDefaultIds : allConnectionIds);
  }, [sourceAccountOptions, userDefaultIds]);

  function onToggleConnection(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updatePreferences({
        defaultSelectedBankConnectionIds: selectedIds,
      });
      setSuccess(t("accountDefaultsSaved"));
    } catch (err) {
      setError(err.message || t("failedSaveAccountDefaults"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {t("account")}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {t("defaultBankAccountsDescription")}
          </Typography>

          {loading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={20} />
              <Typography>{t("loading")}</Typography>
            </Box>
          ) : !sourceAccountOptions.length ? (
            <Typography color="text.secondary">{t("noBankConnections")}</Typography>
          ) : (
            <Stack spacing={1}>
              {sourceAccountOptions.map((option) => {
                return (
                  <FormControlLabel
                    key={option.id}
                    control={
                      <Checkbox
                        checked={selectedIds.includes(option.id)}
                        onChange={() => onToggleConnection(option.id)}
                      />
                    }
                    label={option.label}
                  />
                );
              })}
            </Stack>
          )}

          <Button
            variant="contained"
            sx={{ mt: 2 }}
            onClick={save}
            disabled={saving || loading || !sourceAccountOptions.length}
          >
            {t("save")}
          </Button>
        </CardContent>
      </Card>

      <AppSnackbar
        open={Boolean(error)}
        message={error}
        severity="error"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={() => setError("")}
      />
      <AppSnackbar
        open={Boolean(success)}
        message={success}
        severity="success"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={() => setSuccess("")}
      />
    </Stack>
  );
}
