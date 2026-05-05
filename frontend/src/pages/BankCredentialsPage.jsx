import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SyncIcon from "@mui/icons-material/Sync";
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
  triggerBankConnectionSync,
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

function canTriggerConnectionSync(lastBankFetchAt) {
  if (!lastBankFetchAt) return true;
  const lastFetchDate = new Date(lastBankFetchAt);
  if (Number.isNaN(lastFetchDate.getTime())) return true;
  return Date.now() - lastFetchDate.getTime() >= 60 * 60 * 1000;
}

function buildAccountVisibilityState(connections = []) {
  const visibilityByConnection = {};
  const billingDayByConnection = {};
  for (const connection of connections) {
    const connectionId = String(connection?.id || "").trim();
    if (!connectionId) continue;
    const sourceAccounts = Array.isArray(connection?.sourceAccounts)
      ? connection.sourceAccounts
      : [];
    visibilityByConnection[connectionId] = {};
    billingDayByConnection[connectionId] = {};
    for (const account of sourceAccounts) {
      const sourceAccountId = String(account?.sourceAccountId || "").trim();
      if (!sourceAccountId) continue;
      visibilityByConnection[connectionId][sourceAccountId] = String(
        account?.visibilityScope || connection?.visibilityScope || "shared",
      ).trim();
      const billingDay = Number(account?.billingDay);
      billingDayByConnection[connectionId][sourceAccountId] =
        Number.isInteger(billingDay) && billingDay >= 1 && billingDay <= 31
          ? billingDay
          : "";
    }
  }
  return { visibilityByConnection, billingDayByConnection };
}

function getBillingDayOptions() {
  return Array.from({ length: 31 }, (_, index) => index + 1);
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
  const [syncingConnectionId, setSyncingConnectionId] = useState("");
  const [updatingAccountVisibilityKey, setUpdatingAccountVisibilityKey] =
    useState("");
  const [accountVisibilityByConnection, setAccountVisibilityByConnection] =
    useState({});
  const [billingDayByConnection, setBillingDayByConnection] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingRemovalConnectionId, setPendingRemovalConnectionId] =
    useState("");
  const [pendingRemoveAllConfirmation, setPendingRemoveAllConfirmation] =
    useState(false);
  const [isAddAccountExpanded, setIsAddAccountExpanded] = useState(false);
  const [expandedConnectionIds, setExpandedConnectionIds] = useState({});
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
      const accountState = buildAccountVisibilityState(nextConnections);
      setAccountVisibilityByConnection(accountState.visibilityByConnection);
      setBillingDayByConnection(accountState.billingDayByConnection);
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

  function setLocalAccountSettings(
    connectionId,
    sourceAccountId,
    visibilityScope,
    billingDay,
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
    setBillingDayByConnection((prev) => ({
      ...prev,
      [normalizedConnectionId]: {
        ...(prev[normalizedConnectionId] || {}),
        [normalizedSourceAccountId]:
          billingDay === "" || billingDay == null ? "" : Number(billingDay),
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
              ? {
                  ...account,
                  visibilityScope,
                  billingDay:
                    billingDay === "" || billingDay == null
                      ? null
                      : Number(billingDay),
                }
              : account,
          ),
        };
      }),
    );
  }

  async function updateCardSettings(
    connectionId,
    sourceAccountId,
    nextScope,
    nextBillingDay,
  ) {
    const normalizedConnectionId = String(connectionId || "").trim();
    const normalizedSourceAccountId = String(sourceAccountId || "").trim();
    if (!normalizedConnectionId || !normalizedSourceAccountId) return;

    const prevScope =
      accountVisibilityByConnection?.[normalizedConnectionId]?.[
        normalizedSourceAccountId
      ] || "shared";
    const prevBillingDay =
      billingDayByConnection?.[normalizedConnectionId]?.[
        normalizedSourceAccountId
      ] || "";
    const requestKey = `${normalizedConnectionId}:${normalizedSourceAccountId}`;
    setUpdatingAccountVisibilityKey(requestKey);
    setError("");
    setSuccess("");
    setLocalAccountSettings(
      normalizedConnectionId,
      normalizedSourceAccountId,
      nextScope,
      nextBillingDay,
    );

    try {
      const response = await saveConnectionAccountVisibility(
        normalizedConnectionId,
        {
          sourceAccountId: normalizedSourceAccountId,
          visibilityScope: nextScope,
          billingDay:
            nextBillingDay === "" || nextBillingDay == null
              ? null
              : Number(nextBillingDay),
        },
      );
      const resolvedScope = String(
        response?.visibilityScope || nextScope,
      ).trim();
      const resolvedBillingDay = Number(response?.billingDay);
      const normalizedResolvedBillingDay =
        Number.isInteger(resolvedBillingDay) &&
        resolvedBillingDay >= 1 &&
        resolvedBillingDay <= 31
          ? resolvedBillingDay
          : "";
      setLocalAccountSettings(
        normalizedConnectionId,
        normalizedSourceAccountId,
        resolvedScope,
        normalizedResolvedBillingDay,
      );
      setSuccess(t("cardSettingsSaved"));
    } catch (err) {
      setLocalAccountSettings(
        normalizedConnectionId,
        normalizedSourceAccountId,
        prevScope,
        prevBillingDay,
      );
      setError(err.message || t("failedSaveCardSettings"));
    } finally {
      setUpdatingAccountVisibilityKey("");
    }
  }

  useEffect(() => {
    loadBankConfig();
  }, []);
  const billingDayOptions = useMemo(() => getBillingDayOptions(), []);

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

  function toggleConnectionExpanded(connectionId) {
    const normalizedConnectionId = String(connectionId || "").trim();
    if (!normalizedConnectionId) return;
    setExpandedConnectionIds((prev) => ({
      ...prev,
      [normalizedConnectionId]: !prev[normalizedConnectionId],
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

  async function syncConnection(connectionId) {
    const normalizedConnectionId = String(connectionId || "").trim();
    if (!normalizedConnectionId) return;
    setError("");
    setSuccess("");
    setSyncingConnectionId(normalizedConnectionId);

    try {
      await triggerBankConnectionSync(normalizedConnectionId);
      setSuccess(t("connectionSyncCompleted"));
      await loadBankConfig();
    } catch (err) {
      setError(err.message || t("failedTriggerConnectionSync"));
    } finally {
      setSyncingConnectionId("");
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
            {connections.map((connection) => {
              const connectionId = String(connection?.id || "").trim();
              const isExpanded = Boolean(expandedConnectionIds[connectionId]);
              const showSyncButton = canTriggerConnectionSync(
                connection?.lastBankFetchAt,
              );
              const isSyncingThisConnection =
                syncingConnectionId === connectionId;
              return (
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
                      pr: 2,
                      pb: 2,
                    }}
                  >
                    <Stack
                      direction={{ xs: "row" }}
                      justifyContent="space-between"
                      alignItems="flex-start"
                      sx={{ width: "100%", minWidth: 0, pb: 0 }}
                    >
                      <Stack
                        spacing={0.5}
                        justifyContent="center"
                        sx={{ width: "100%", minWidth: 0 }}
                      >
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
                        <Button
                          type="button"
                          variant="text"
                          onClick={() => toggleConnectionExpanded(connectionId)}
                          sx={{
                            mt: 0.5,
                            px: 0,
                            justifyContent: "center",
                            color: theme.palette.text.contrastText,
                            width: "fit-content",
                            minWidth: 0,
                            alignSelf: "center",
                            mx: "auto",
                            textTransform: "none",
                            boxSizing: "border-box",
                          }}
                        >
                          {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </Button>
                        <Collapse
                          in={isExpanded}
                          sx={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
                        >
                          <Stack
                            spacing={1}
                            sx={{
                              mt: 1,
                              width: "100%",
                              maxWidth: "100%",
                              minWidth: 0,
                            }}
                          >
                            {(connection.sourceAccounts || []).length > 0 ? (
                              (connection.sourceAccounts || []).map(
                                (account) => {
                                  const sourceAccountId = String(
                                    account?.sourceAccountId || "",
                                  ).trim();
                                  const requestKey = `${connection.id}:${sourceAccountId}`;
                                  const accountVisibility =
                                    accountVisibilityByConnection?.[
                                      connection.id
                                    ]?.[sourceAccountId] ||
                                    account?.visibilityScope ||
                                    connection?.visibilityScope ||
                                    "shared";
                                  return (
                                    <Box
                                      key={`${connection.id}:${sourceAccountId}`}
                                      sx={{
                                        width: "100%",
                                        maxWidth: "100%",
                                        minWidth: 0,
                                      }}
                                    >
                                      <Divider
                                        sx={{
                                          borderColor:
                                            theme.palette.text.contrastText,
                                          opacity: 1,
                                          mb: 1,
                                        }}
                                      />
                                      <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        spacing={1}
                                        sx={{
                                          width: "100%",
                                          maxWidth: "100%",
                                          minWidth: 0,
                                        }}
                                        alignItems={{
                                          xs: "stretch",
                                          sm: "flex-start",
                                        }}
                                      >
                                        <Typography
                                          variant="body2"
                                          sx={{
                                            color:
                                              theme.palette.text.contrastText,
                                            px: ".3rem",
                                            pb: "1rem",
                                            overflowWrap: "anywhere",
                                          }}
                                        >
                                          {formatSourceAccountLabel(account, t)}
                                        </Typography>
                                        <Stack
                                          spacing={0}
                                          sx={{
                                            width: { xs: "100%", sm: 320 },
                                            maxWidth: "100%",
                                            minWidth: 0,
                                          }}
                                        >
                                          <Box sx={{ mt: { xs: 0, sm: 3 } }}>
                                            <Dropdown
                                              labelId={`account-visibility-${connection.id}-${sourceAccountId}`}
                                              label={t("cardVisibility")}
                                              value={accountVisibility}
                                              onChange={(e) =>
                                                updateCardSettings(
                                                  connectionId,
                                                  sourceAccountId,
                                                  e.target.value,
                                                  billingDayByConnection?.[
                                                    connectionId
                                                  ]?.[sourceAccountId] || "",
                                                )
                                              }
                                              required
                                              disabled={
                                                saving ||
                                                loading ||
                                                !canManageBankConnections ||
                                                Boolean(
                                                  updatingAccountVisibilityKey,
                                                ) ||
                                                !sourceAccountId
                                              }
                                              sx={{
                                                width: "100%",
                                                maxWidth: "100%",
                                                minWidth: 0,
                                                boxSizing: "border-box",
                                                "& .MuiInputBase-root": {
                                                  color:
                                                    theme.palette.text
                                                      .contrastText,
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
                                          </Box>
                                          <Box sx={{ mt: 3 }}>
                                            <Dropdown
                                              labelId={`account-billing-day-${connection.id}-${sourceAccountId}`}
                                              label={t("billingDate")}
                                              labelShrink
                                              value={
                                                billingDayByConnection?.[
                                                  connectionId
                                                ]?.[sourceAccountId] || ""
                                              }
                                              onChange={(e) =>
                                                updateCardSettings(
                                                  connectionId,
                                                  sourceAccountId,
                                                  accountVisibility,
                                                  e.target.value,
                                                )
                                              }
                                              disabled={
                                                saving ||
                                                loading ||
                                                !canManageBankConnections ||
                                                Boolean(
                                                  updatingAccountVisibilityKey,
                                                ) ||
                                                !sourceAccountId
                                              }
                                              sx={{
                                                width: "100%",
                                                maxWidth: "100%",
                                                minWidth: 0,
                                                boxSizing: "border-box",
                                                "& .MuiInputBase-root": {
                                                  color:
                                                    theme.palette.text
                                                      .contrastText,
                                                },
                                              }}
                                            >
                                              <MenuItem value="">
                                                {t("optional")}
                                              </MenuItem>
                                              {billingDayOptions.map((day) => (
                                                <MenuItem key={day} value={day}>
                                                  {day}
                                                </MenuItem>
                                              ))}
                                            </Dropdown>
                                          </Box>
                                        </Stack>
                                        {updatingAccountVisibilityKey ===
                                          requestKey && (
                                          <CircularProgress
                                            size={16}
                                            sx={{
                                              color:
                                                theme.palette.text.contrastText,
                                            }}
                                          />
                                        )}
                                      </Stack>
                                    </Box>
                                  );
                                },
                              )
                            ) : (
                              <Typography
                                variant="body2"
                                sx={{ color: theme.palette.text.contrastText }}
                              >
                                {t("noConnectionCardsDetected")}
                              </Typography>
                            )}
                          </Stack>
                        </Collapse>
                      </Stack>
                    </Stack>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        position: "absolute",
                        top: 12,
                        ...(direction === "rtl" ? { left: 12 } : { right: 12 }),
                        direction: "ltr",
                        alignItems: "center",
                      }}
                    >
                      {direction === "rtl" && (
                        <Button
                          type="button"
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => openRemoveConfirmation(connectionId)}
                          disabled={
                            saving || loading || !canManageBankConnections
                          }
                          sx={{
                            minWidth: 0,
                            width: 32,
                            height: 32,
                            p: 0,
                            borderRadius: 0.7,
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
                      )}
                      {showSyncButton && (
                        <Button
                          type="button"
                          variant="outlined"
                          size="small"
                          onClick={() => syncConnection(connectionId)}
                          disabled={
                            saving ||
                            loading ||
                            !canManageBankConnections ||
                            Boolean(syncingConnectionId)
                          }
                          aria-label={t("syncConnection")}
                          sx={{
                            minWidth: 0,
                            width: 32,
                            height: 32,
                            p: 0,
                            borderRadius: 0.7,
                            borderColor: theme.palette.primary.main,
                            border: "2px solid",
                            color: theme.palette.primary.main,
                            "&:hover": {
                              bgcolor: theme.palette.primary.main,
                              borderColor: theme.palette.primary.main,
                              color: "common.white",
                            },
                          }}
                        >
                          {isSyncingThisConnection ? (
                            <CircularProgress size={14} color="inherit" />
                          ) : (
                            <SyncIcon fontSize="small" />
                          )}
                        </Button>
                      )}
                      {direction !== "rtl" && (
                        <Button
                          type="button"
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => openRemoveConfirmation(connectionId)}
                          disabled={
                            saving || loading || !canManageBankConnections
                          }
                          sx={{
                            minWidth: 0,
                            width: 32,
                            height: 32,
                            p: 0,
                            borderRadius: 0.7,
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
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
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
