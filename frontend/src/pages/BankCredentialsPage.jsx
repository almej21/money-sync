import {
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import AppSnackbar from "../components/AppSnackbar";
import Dropdown from "../components/Dropdown";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import {
  getBankCredentialStatus,
  getBankProviders,
  removeAllBankConnections,
  removeBankConnection,
  saveBankCredentials,
} from "../services/bankService";

function buildEmptyCredentials(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.name, ""]));
}

export default function BankCredentialsPage() {
  const theme = useTheme();
  const { user } = useAuth();
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
  const [pendingRemovalConnectionId, setPendingRemovalConnectionId] =
    useState("");
  const [pendingRemoveAllConfirmation, setPendingRemoveAllConfirmation] =
    useState(false);
  const [isAddAccountExpanded, setIsAddAccountExpanded] = useState(false);
  const canManageBankConnections = (user?.role || "manager") === "manager";

  const selectedProvider = useMemo(
    () =>
      providers.find((provider) => provider.companyId === form.companyId) ||
      null,
    [providers, form.companyId],
  );
  const providerLabelById = useMemo(
    () =>
      Object.fromEntries(
        providers.map((provider) => [
          provider.companyId,
          provider.label || provider.companyId,
        ]),
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
        getBankProviders(),
        getBankCredentialStatus(),
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
      const provider = nextProviders.find(
        (item) => item.companyId === companyId,
      );

      setProviders(nextProviders);
      setConnections(nextConnections);
      setConnectedCount(
        Number(
          statusData.connectedCount ??
            nextConnections.filter((item) => item.connected).length,
        ),
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
      await saveBankCredentials({
        companyId: form.companyId.trim(),
        connectionName: form.connectionName.trim(),
        credentials: Object.fromEntries(
          Object.entries(form.credentials).map(([key, value]) => [
            key,
            value.trim(),
          ]),
        ),
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
      await removeBankConnection(connectionId);
      setSuccess(t("bankConnectionRemoved"));
      await loadBankConfig();
    } catch (err) {
      setError(err.message || t("failedRemoveBankConnection"));
    } finally {
      setSaving(false);
    }
  }

  function openRemoveConfirmation(connectionId) {
    setPendingRemovalConnectionId(String(connectionId || "").trim());
  }

  function closeRemoveConfirmation() {
    if (saving) return;
    setPendingRemovalConnectionId("");
  }

  async function confirmRemoveConnection() {
    if (!pendingRemovalConnectionId) return;
    await removeConnection(pendingRemovalConnectionId);
    setPendingRemovalConnectionId("");
  }

  async function removeAllConnections() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await removeAllBankConnections();
      setSuccess(t("allBankConnectionsRemoved"));
      await loadBankConfig();
    } catch (err) {
      setError(err.message || t("failedRemoveBankCredentials"));
    } finally {
      setSaving(false);
    }
  }

  function openRemoveAllConfirmation() {
    setPendingRemoveAllConfirmation(true);
  }

  function closeRemoveAllConfirmation() {
    if (saving) return;
    setPendingRemoveAllConfirmation(false);
  }

  async function confirmRemoveAllConnections() {
    await removeAllConnections();
    setPendingRemoveAllConfirmation(false);
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 3 } }}>
          <Typography variant="h5" gutterBottom>
            {t("bankCredentials")}
          </Typography>
          <Typography color="text.primary" sx={{ mb: 2 }}>
            {t("configureBankCredentials")}
          </Typography>

          <Stack spacing={1} sx={{ mb: 2 }}>
            <Typography>{`${t("status")}: ${statusText}`}</Typography>
            {!loading && updatedAt && (
              <Typography color="text.primary">
                {t("lastUpdated")}: {new Date(updatedAt).toLocaleString(locale)}
              </Typography>
            )}
          </Stack>

          <Stack spacing={1.5} sx={{ mb: 3 }}>
            <Typography variant="subtitle1">
              {t("configuredAccounts")}
            </Typography>
            {!connections.length && (
              <Typography color="text.primary">
                {t("noBankConnections")}
              </Typography>
            )}
            {connections.map((connection) => (
              <Card key={connection.id} variant="outlined">
                <CardContent
                  sx={{
                    backgroundColor: theme.palette.primary.main,
                    display: "flex",
                    alignItems: "center",
                    py: 2,
                    "&:last-child": {
                      pb: 2,
                    },
                  }}
                >
                  <Stack
                    direction={{ xs: "row" }}
                    justifyContent="space-between"
                    alignItems="center"
                    width="100%"
                    pb={0}
                  >
                    <Stack spacing={0.5} justifyContent="center">
                      <Typography
                        sx={{
                          fontWeight: 600,
                          color: theme.palette.primary.contrastText,
                        }}
                      >
                        {providerLabelById[connection.companyId] ||
                          connection.companyId}
                      </Typography>
                    </Stack>
                    <Button
                      sx={{
                        color: theme.palette.primary.contrastText,
                        border: `1px solid ${theme.palette.primary.contrastText}`,
                      }}
                      type="button"
                      variant="inherit"
                      onClick={() => openRemoveConfirmation(connection.id)}
                      disabled={saving || loading || !canManageBankConnections}
                    >
                      {t("removeConnection")}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Stack spacing={2}>
            {!canManageBankConnections && (
              <Typography color="warning.main">
                {t("bankManagerOnlyMessage")}
              </Typography>
            )}
            <Button
              type="button"
              variant="outlined"
              onClick={() => setIsAddAccountExpanded((prev) => !prev)}
              disabled={!canManageBankConnections}
              sx={{
                width: { xs: "100%", sm: "auto" },
                alignSelf: "flex-start",
              }}
            >
              {isAddAccountExpanded
                ? `${t("addConnection")} -`
                : `${t("addConnection")} +`}
            </Button>
            <Collapse in={isAddAccountExpanded}>
              <Box component="form" onSubmit={saveCredentials}>
                <Stack spacing={2}>
                  <Typography variant="subtitle1">
                    {t("addConnection")}
                  </Typography>
                  <Dropdown
                    labelId="bank-provider-label"
                    label={t("bankOrCreditCardCompany")}
                    value={form.companyId}
                    onChange={(e) => onCompanyChange(e.target.value)}
                    required
                  >
                    {providers.map((provider) => (
                      <MenuItem
                        key={provider.companyId}
                        value={provider.companyId}
                      >
                        {provider.label} ({provider.companyId})
                      </MenuItem>
                    ))}
                  </Dropdown>

                  <TextField
                    label={t("connectionName")}
                    value={form.connectionName}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        connectionName: e.target.value,
                      }))
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
                      onChange={(e) =>
                        onFieldChange(field.name, e.target.value)
                      }
                      required={Boolean(field.required)}
                      helperText={
                        field.required ? t("required") : t("optional")
                      }
                      fullWidth
                    />
                  ))}

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={saving || loading || !canManageBankConnections}
                      sx={{ width: { xs: "100%", sm: "auto" } }}
                    >
                      {t("addConnection")}
                    </Button>
                    <Button
                      type="button"
                      variant="outlined"
                      color="error"
                      onClick={openRemoveAllConfirmation}
                      disabled={
                        saving ||
                        loading ||
                        connectedCount === 0 ||
                        !canManageBankConnections
                      }
                      sx={{ width: { xs: "100%", sm: "auto" } }}
                    >
                      {t("removeAllConnections")}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Collapse>
          </Stack>
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
      <Dialog
        open={Boolean(pendingRemovalConnectionId)}
        onClose={closeRemoveConfirmation}
      >
        <DialogTitle>Are you sure?</DialogTitle>
        <DialogContent>
          <Typography color="text.primary">
            This will remove the selected bank connection.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRemoveConfirmation} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmRemoveConnection}
            disabled={saving}
          >
            {t("removeConnection")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={pendingRemoveAllConfirmation}
        onClose={closeRemoveAllConfirmation}
      >
        <DialogTitle>Are you sure?</DialogTitle>
        <DialogContent>
          <Typography color="text.primary">
            This will remove all configured bank connections.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRemoveAllConfirmation} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmRemoveAllConnections}
            disabled={saving}
          >
            {t("removeAllConnections")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
