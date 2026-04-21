import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
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
  saveConnectionAccountVisibility,
} from "../services/bankService";

const HIDDEN_COMPANY_IDS = new Set(["isracard"]);

function buildEmptyCredentials(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.name, ""]));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatFetchTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = pad2(date.getFullYear() % 100);
  return `${hours}:${minutes}, ${day}/${month}/${year}`;
}

function buildAccountVisibilityState(connections = []) {
  const byConnection = {};
  for (const connection of connections) {
    const connectionId = String(connection?.id || "").trim();
    if (!connectionId) continue;
    const sourceAccounts = Array.isArray(connection?.sourceAccounts)
      ? connection.sourceAccounts
      : [];
    byConnection[connectionId] = {};
    for (const account of sourceAccounts) {
      const sourceAccountId = String(account?.sourceAccountId || "").trim();
      if (!sourceAccountId) continue;
      byConnection[connectionId][sourceAccountId] = String(
        account?.visibilityScope || connection?.visibilityScope || "shared",
      ).trim();
    }
  }
  return byConnection;
}

function isCardSuffix(value) {
  return /^\d{4}$/.test(String(value || "").trim());
}

function formatSourceAccountLabel(account = {}, t) {
  const sourceAccountId = String(account?.sourceAccountId || "").trim();
  const sourceAccountName = String(account?.sourceAccountName || "").trim();
  if (isCardSuffix(sourceAccountId)) {
    return `${t("cardEndingWith")} ${sourceAccountId}`;
  }
  if (!sourceAccountName) return sourceAccountId;
  if (!sourceAccountId || sourceAccountName === sourceAccountId) {
    return sourceAccountName;
  }
  return `${sourceAccountName} (${sourceAccountId})`;
}

export default function BankCredentialsPage() {
  const theme = useTheme();
  const { user } = useAuth();
  const { t, direction } = useLanguage();
  const [providers, setProviders] = useState([]);
  const [connections, setConnections] = useState([]);
  const [connectedCount, setConnectedCount] = useState(0);
  const [form, setForm] = useState({
    companyId: "",
    connectionName: "",
    visibilityScope: "shared",
    credentials: {},
  });
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingAccountVisibilityKey, setUpdatingAccountVisibilityKey] =
    useState("");
  const [accountVisibilityByConnection, setAccountVisibilityByConnection] =
    useState({});
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

  async function loadBankConfig() {
    setLoading(true);
    setError("");
    try {
      const [providersData, statusData] = await Promise.all([
        getBankProviders(),
        getBankCredentialStatus(),
      ]);

      const nextProviders = Array.isArray(providersData.providers)
        ? providersData.providers.filter(
            (provider) =>
              !HIDDEN_COMPANY_IDS.has(String(provider?.companyId || "").trim()),
          )
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
      setAccountVisibilityByConnection(
        buildAccountVisibilityState(nextConnections),
      );
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
        visibilityScope: "shared",
        credentials: buildEmptyCredentials(provider?.fields || []),
      });
    } catch (err) {
      setError(err.message || t("failedLoadBankStatus"));
    } finally {
      setLoading(false);
    }
  }

  function setLocalAccountVisibility(
    connectionId,
    sourceAccountId,
    visibilityScope,
  ) {
    const normalizedConnectionId = String(connectionId || "").trim();
    const normalizedSourceAccountId = String(sourceAccountId || "").trim();
    if (!normalizedConnectionId || !normalizedSourceAccountId) return;

    setAccountVisibilityByConnection((prev) => ({
      ...prev,
      [normalizedConnectionId]: {
        ...(prev[normalizedConnectionId] || {}),
        [normalizedSourceAccountId]: visibilityScope,
      },
    }));
    setConnections((prev) =>
      prev.map((connection) => {
        if (String(connection?.id || "").trim() !== normalizedConnectionId) {
          return connection;
        }
        const sourceAccounts = Array.isArray(connection?.sourceAccounts)
          ? connection.sourceAccounts
          : [];
        return {
          ...connection,
          sourceAccounts: sourceAccounts.map((account) =>
            String(account?.sourceAccountId || "").trim() ===
            normalizedSourceAccountId
              ? { ...account, visibilityScope }
              : account,
          ),
        };
      }),
    );
  }

  async function updateCardVisibility(
    connectionId,
    sourceAccountId,
    nextScope,
  ) {
    const normalizedConnectionId = String(connectionId || "").trim();
    const normalizedSourceAccountId = String(sourceAccountId || "").trim();
    if (!normalizedConnectionId || !normalizedSourceAccountId) return;

    const prevScope =
      accountVisibilityByConnection?.[normalizedConnectionId]?.[
        normalizedSourceAccountId
      ] || "shared";
    const requestKey = `${normalizedConnectionId}:${normalizedSourceAccountId}`;
    setUpdatingAccountVisibilityKey(requestKey);
    setError("");
    setSuccess("");
    setLocalAccountVisibility(
      normalizedConnectionId,
      normalizedSourceAccountId,
      nextScope,
    );

    try {
      const response = await saveConnectionAccountVisibility(
        normalizedConnectionId,
        {
          sourceAccountId: normalizedSourceAccountId,
          visibilityScope: nextScope,
        },
      );
      const resolvedScope = String(
        response?.visibilityScope || nextScope,
      ).trim();
      setLocalAccountVisibility(
        normalizedConnectionId,
        normalizedSourceAccountId,
        resolvedScope,
      );
      setSuccess(t("cardVisibilitySaved"));
    } catch (err) {
      setLocalAccountVisibility(
        normalizedConnectionId,
        normalizedSourceAccountId,
        prevScope,
      );
      setError(err.message || t("failedSaveCardVisibility"));
    } finally {
      setUpdatingAccountVisibilityKey("");
    }
  }

  useEffect(() => {
    loadBankConfig();
  }, []);

  function onCompanyChange(nextCompanyId) {
    const provider = providers.find((item) => item.companyId === nextCompanyId);
    setForm((prev) => ({
      ...prev,
      companyId: nextCompanyId,
      connectionName: "",
      credentials: buildEmptyCredentials(provider?.fields || []),
    }));
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
        visibilityScope: form.visibilityScope,
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
        visibilityScope: "shared",
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
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography>{`${t("status")}:`}</Typography>
              {loading ? (
                <CircularProgress size={16} />
              ) : (
                <Typography>{`${t("connectedAccounts")} ${connectedCount}`}</Typography>
              )}
            </Stack>
            {!loading && updatedAt && (
              <Typography color="text.primary">
                {t("lastUpdated")}: {formatFetchTimestamp(updatedAt)}
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
              <Card
                key={connection.id}
                variant="outlined"
                sx={{ border: `2px solid ${theme.palette.primary.main}` }}
              >
                <CardContent
                  sx={{
                    backgroundColor: theme.palette.secondary.main,
                    display: "flex",
                    alignItems: "stretch",
                    position: "relative",
                    py: 2,
                    pr: 7,
                    pb: 6,
                    "&:last-child": {
                      pb: 6,
                    },
                  }}
                >
                  <Stack
                    direction={{ xs: "row" }}
                    justifyContent="space-between"
                    alignItems="flex-start"
                    width="100%"
                    pb={0}
                  >
                    <Stack spacing={0.5} justifyContent="center">
                      <Typography
                        sx={{
                          fontWeight: 600,
                          color: theme.palette.text.contrastText,
                        }}
                      >
                        {providerLabelById[connection.companyId] ||
                          connection.companyId}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: theme.palette.text.contrastText }}
                      >
                        {connection.visibilityScope === "private"
                          ? t("privateConnection")
                          : t("sharedConnection")}
                      </Typography>
                      {connection.lastBankFetchAt && (
                        <Typography
                          variant="body2"
                          sx={{ color: theme.palette.text.contrastText }}
                        >
                          {t("lastBankFetch")}:{" "}
                          {formatFetchTimestamp(connection.lastBankFetchAt)}
                        </Typography>
                      )}
                      <Stack spacing={1} sx={{ mt: 1 }}>
                        {(connection.sourceAccounts || []).length > 0 ? (
                          (connection.sourceAccounts || []).map((account) => {
                            const sourceAccountId = String(
                              account?.sourceAccountId || "",
                            ).trim();
                            const requestKey = `${connection.id}:${sourceAccountId}`;
                            const accountVisibility =
                              accountVisibilityByConnection?.[connection.id]?.[
                                sourceAccountId
                              ] ||
                              account?.visibilityScope ||
                              connection?.visibilityScope ||
                              "shared";
                            return (
                              <Box key={`${connection.id}:${sourceAccountId}`}>
                                <Divider
                                  sx={{
                                    borderColor: theme.palette.text.contrastText,
                                    opacity: 1,
                                    mb: 1,
                                  }}
                                />
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1}
                                  alignItems={{ xs: "stretch", sm: "center" }}
                                >
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      color: theme.palette.text.contrastText,
                                      px: ".3rem",
                                      pb: "1rem",
                                    }}
                                  >
                                    {formatSourceAccountLabel(account, t)}
                                  </Typography>
                                  <Dropdown
                                    labelId={`account-visibility-${connection.id}-${sourceAccountId}`}
                                    label={t("cardVisibility")}
                                    value={accountVisibility}
                                    onChange={(e) =>
                                      updateCardVisibility(
                                        connection.id,
                                        sourceAccountId,
                                        e.target.value,
                                      )
                                    }
                                    required
                                    disabled={
                                      saving ||
                                      loading ||
                                      !canManageBankConnections ||
                                      Boolean(updatingAccountVisibilityKey) ||
                                      !sourceAccountId
                                    }
                                    sx={{
                                      minWidth: { xs: "100%", sm: 220 },
                                      "& .MuiInputBase-root": {
                                        color: theme.palette.text.contrastText,
                                      },
                                    }}
                                  >
                                    <MenuItem value="shared">
                                      {t("sharedConnection")}
                                    </MenuItem>
                                    <MenuItem value="private">
                                      {t("privateConnection")}
                                    </MenuItem>
                                  </Dropdown>
                                  {updatingAccountVisibilityKey ===
                                    requestKey && (
                                    <CircularProgress
                                      size={16}
                                      sx={{
                                        color: theme.palette.text.contrastText,
                                      }}
                                    />
                                  )}
                                </Stack>
                              </Box>
                            );
                          })
                        ) : (
                          <Typography
                            variant="body2"
                            sx={{ color: theme.palette.text.contrastText }}
                          >
                            {t("noConnectionCardsDetected")}
                          </Typography>
                        )}
                      </Stack>
                    </Stack>
                  </Stack>
                  <Button
                    type="button"
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={() => openRemoveConfirmation(connection.id)}
                    disabled={saving || loading || !canManageBankConnections}
                    sx={{
                      position: "absolute",
                      bottom: 12,
                      ...(direction === "rtl" ? { left: 12 } : { right: 12 }),
                      minWidth: 0,
                      width: 32,
                      height: 32,
                      p: 0,
                      borderRadius: .7,
                      borderColor: "error.main",
                      border: "2px solid",
                      color: "error.main",
                      "&:hover": {
                        bgcolor: "error.main",
                        borderColor: "error.main",
                        color: "common.white",
                      },
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </Button>
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
                  <Dropdown
                    labelId="bank-connection-visibility-label"
                    label={t("connectionVisibility")}
                    value={form.visibilityScope}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        visibilityScope: e.target.value,
                      }))
                    }
                    required
                  >
                    <MenuItem value="shared">{t("sharedConnection")}</MenuItem>
                    <MenuItem value="private">
                      {t("privateConnection")}
                    </MenuItem>
                  </Dropdown>

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
            {t("removeSelectedBankConnectionConfirm")}
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
            {t("removeAllBankConnectionsConfirm")}
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
