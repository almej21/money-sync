import {
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import AppSnackbar from "../components/AppSnackbar";
import ConfirmationDialog from "../components/ConfirmationDialog";
import AddConnectionForm from "../components/bankCredentials/AddConnectionForm";
import Connection from "../components/bankCredentials/Connection";
import ManualExpenseEditModal from "../components/bankCredentials/ManualExpenseEditModal";
import ManualExpenseModal from "../components/bankCredentials/ManualExpenseModal";
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
import {
  deleteManualExpense,
  getExpenses,
  listManualExpenses,
} from "../services/expenseService";

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

export default function BankCredentialsPage() {
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
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [manualExpensesByConnection, setManualExpensesByConnection] = useState(
    {},
  );
  const [
    manualExpensesLoadingByConnection,
    setManualExpensesLoadingByConnection,
  ] = useState({});
  const [deletingManualExpenseId, setDeletingManualExpenseId] = useState("");
  const [pendingManualExpenseDelete, setPendingManualExpenseDelete] =
    useState(null);
  const [
    manualExpenseSourceConnectionKey,
    setManualExpenseSourceConnectionKey,
  ] = useState("");
  const [manualExpenseSourceAccountId, setManualExpenseSourceAccountId] =
    useState("");
  const [isManualExpenseModalOpen, setIsManualExpenseModalOpen] =
    useState(false);
  const [editingManualExpense, setEditingManualExpense] = useState(null);
  const [isManualExpenseEditModalOpen, setIsManualExpenseEditModalOpen] =
    useState(false);
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

      const connectionIds = nextConnections
        .map((item) => String(item?.id || "").trim())
        .filter(Boolean);
      for (const connectionId of connectionIds) {
        loadManualExpensesForConnection(connectionId);
      }
    } catch (err) {
      setError(err.message || t("failedLoadBankStatus"));
    } finally {
      setLoading(false);
    }
  }

  async function loadManualExpensesForConnection(connectionId) {
    const normalizedConnectionId = String(connectionId || "").trim();
    if (!normalizedConnectionId) return;
    setManualExpensesLoadingByConnection((prev) => ({
      ...prev,
      [normalizedConnectionId]: true,
    }));
    try {
      const expenses = await listManualExpenses(normalizedConnectionId, "");
      setManualExpensesByConnection((prev) => ({
        ...prev,
        [normalizedConnectionId]: Array.isArray(expenses) ? expenses : [],
      }));
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      const shouldTreatAsEmpty =
        message.includes("manual expense not found") ||
        message.includes("not found") ||
        message.includes("request failed");
      if (shouldTreatAsEmpty) {
        setManualExpensesByConnection((prev) => ({
          ...prev,
          [normalizedConnectionId]: [],
        }));
      } else {
        setError(error?.message || t("failedLoadManualExpenses"));
        setManualExpensesByConnection((prev) => ({
          ...prev,
          [normalizedConnectionId]: [],
        }));
      }
    } finally {
      setManualExpensesLoadingByConnection((prev) => ({
        ...prev,
        [normalizedConnectionId]: false,
      }));
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
  useEffect(() => {
    let isActive = true;
    async function loadExpenseCategories() {
      try {
        const expenses = await getExpenses();
        if (!isActive) return;
        const categories = Array.from(
          new Set(
            (Array.isArray(expenses) ? expenses : [])
              .map((expense) => String(expense?.category || "").trim())
              .filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b));
        setExpenseCategories(categories);
      } catch {
        if (!isActive) return;
        setExpenseCategories([]);
      }
    }
    loadExpenseCategories();
    return () => {
      isActive = false;
    };
  }, []);
  const billingDayOptions = useMemo(() => getBillingDayOptions(), []);

  function openManualExpenseModal(connectionId, sourceAccount) {
    const sourceConnectionKey = String(connectionId || "").trim();
    const sourceAccountId = String(sourceAccount?.sourceAccountId || "").trim();
    if (!sourceConnectionKey || !sourceAccountId) return;
    setManualExpenseSourceConnectionKey(sourceConnectionKey);
    setManualExpenseSourceAccountId(sourceAccountId);
    setIsManualExpenseModalOpen(true);
  }

  function closeManualExpenseModal() {
    setIsManualExpenseModalOpen(false);
    setManualExpenseSourceConnectionKey("");
    setManualExpenseSourceAccountId("");
  }

  function openManualExpenseEditModal(expense) {
    if (!expense?._id) return;
    setEditingManualExpense(expense);
    setIsManualExpenseEditModalOpen(true);
  }

  function closeManualExpenseEditModal() {
    setIsManualExpenseEditModalOpen(false);
    setEditingManualExpense(null);
  }

  function onDeleteManualExpense(expense) {
    if (!expense?._id) return;
    setPendingManualExpenseDelete(expense);
  }

  function closeManualExpenseDeleteConfirmation() {
    if (Boolean(deletingManualExpenseId)) return;
    setPendingManualExpenseDelete(null);
  }

  async function confirmDeleteManualExpense() {
    const expense = pendingManualExpenseDelete;
    const manualExpenseId = String(expense?._id || "").trim();
    const sourceConnectionKey = String(
      expense?.sourceConnectionKey || "",
    ).trim();
    if (!manualExpenseId || !sourceConnectionKey) return;
    setDeletingManualExpenseId(manualExpenseId);
    try {
      await deleteManualExpense(manualExpenseId);
      setSuccess(t("manualExpenseDeleted"));
      setManualExpensesByConnection((prev) => ({
        ...prev,
        [sourceConnectionKey]: (prev[sourceConnectionKey] || []).filter(
          (item) => String(item?._id || "").trim() !== manualExpenseId,
        ),
      }));
    } catch (error) {
      setError(error?.message || t("failedDeleteManualExpense"));
    } finally {
      setDeletingManualExpenseId("");
      setPendingManualExpenseDelete(null);
    }
  }

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
              return (
                <Connection
                  key={connection.id}
                  connection={connection}
                  isExpanded={Boolean(expandedConnectionIds[connectionId])}
                  showSyncButton={canTriggerConnectionSync(
                    connection?.lastBankFetchAt,
                  )}
                  isSyncingThisConnection={syncingConnectionId === connectionId}
                  providerLabel={
                    providerLabelById[connection.companyId] ||
                    connection.companyId
                  }
                  formattedLastFetch={formatFetchTimestamp(
                    connection.lastBankFetchAt,
                  )}
                  direction={direction}
                  syncingConnectionId={syncingConnectionId}
                  saving={saving}
                  loading={loading}
                  canManageBankConnections={canManageBankConnections}
                  accountVisibilityByConnection={accountVisibilityByConnection}
                  billingDayByConnection={billingDayByConnection}
                  updatingAccountVisibilityKey={updatingAccountVisibilityKey}
                  billingDayOptions={billingDayOptions}
                  toggleConnectionExpanded={toggleConnectionExpanded}
                  updateCardSettings={updateCardSettings}
                  openRemoveConfirmation={openRemoveConfirmation}
                  onOpenManualExpense={openManualExpenseModal}
                  manualExpensesByConnection={manualExpensesByConnection}
                  manualExpensesLoadingByConnection={
                    manualExpensesLoadingByConnection
                  }
                  deletingManualExpenseId={deletingManualExpenseId}
                  onEditManualExpense={openManualExpenseEditModal}
                  onDeleteManualExpense={onDeleteManualExpense}
                  syncConnection={syncConnection}
                  t={t}
                />
              );
            })}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <AddConnectionForm
            t={t}
            isExpanded={isAddAccountExpanded}
            onToggle={() => setIsAddAccountExpanded((prev) => !prev)}
            canManageBankConnections={canManageBankConnections}
            form={form}
            providers={providers}
            selectedProvider={selectedProvider}
            saving={saving}
            loading={loading}
            connectedCount={connectedCount}
            onSubmit={saveCredentials}
            onCompanyChange={onCompanyChange}
            onConnectionNameChange={(value) =>
              setForm((prev) => ({
                ...prev,
                connectionName: value,
              }))
            }
            onVisibilityChange={(value) =>
              setForm((prev) => ({
                ...prev,
                visibilityScope: value,
              }))
            }
            onCredentialFieldChange={onFieldChange}
            onRemoveAll={openRemoveAllConfirmation}
          />
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
      <ConfirmationDialog
        open={Boolean(pendingRemovalConnectionId)}
        title={t("logoutConfirmMessage")}
        description={t("removeSelectedBankConnectionConfirm")}
        cancelLabel={t("cancel")}
        confirmLabel={t("removeConnection")}
        onClose={closeRemoveConfirmation}
        onConfirm={confirmRemoveConnection}
        disabled={saving}
      />
      <ConfirmationDialog
        open={pendingRemoveAllConfirmation}
        title={t("logoutConfirmMessage")}
        description={t("removeAllBankConnectionsConfirm")}
        cancelLabel={t("cancel")}
        confirmLabel={t("removeAllConnections")}
        onClose={closeRemoveAllConfirmation}
        onConfirm={confirmRemoveAllConnections}
        disabled={saving}
      />
      <ConfirmationDialog
        open={Boolean(pendingManualExpenseDelete)}
        title={t("logoutConfirmMessage")}
        description={t("manualExpenseDeleteConfirm")}
        cancelLabel={t("cancel")}
        confirmLabel={t("manualExpenseDelete")}
        onClose={closeManualExpenseDeleteConfirmation}
        onConfirm={confirmDeleteManualExpense}
        disabled={Boolean(deletingManualExpenseId)}
      />
      <ManualExpenseModal
        open={isManualExpenseModalOpen}
        onClose={closeManualExpenseModal}
        sourceConnectionKey={manualExpenseSourceConnectionKey}
        sourceAccountId={manualExpenseSourceAccountId}
        categories={expenseCategories}
        t={t}
        onSaved={() => {
          setSuccess(t("manualExpenseSaved"));
          loadManualExpensesForConnection(manualExpenseSourceConnectionKey);
        }}
        onError={setError}
      />
      <ManualExpenseEditModal
        open={isManualExpenseEditModalOpen}
        onClose={closeManualExpenseEditModal}
        expense={editingManualExpense}
        categories={expenseCategories}
        t={t}
        onSaved={(updated) => {
          setSuccess(t("manualExpenseUpdated"));
          const sourceConnectionKey = String(
            updated?.sourceConnectionKey ||
              editingManualExpense?.sourceConnectionKey ||
              "",
          ).trim();
          if (!sourceConnectionKey) return;
          setManualExpensesByConnection((prev) => ({
            ...prev,
            [sourceConnectionKey]: (prev[sourceConnectionKey] || []).map(
              (item) =>
                String(item?._id || "").trim() ===
                String(updated?._id || "").trim()
                  ? updated
                  : item,
            ),
          }));
        }}
        onError={setError}
      />
    </Stack>
  );
}
