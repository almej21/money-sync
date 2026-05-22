import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import {
  alpha,
  Box,
  Card,
  CardContent,
  Divider,
  IconButton,
  List,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import NumberFlow from "@number-flow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppSnackbar from "../components/AppSnackbar";
import DashboardFilters from "../components/DashboardFilters";
import ExpenseItem from "../components/ExpenseItem";
import { useAuth } from "../context/AuthContext";
import { useDashboardFilters } from "../context/DashboardFiltersContext";
import { useLanguage } from "../context/LanguageContext";
import { useExpenseBackgroundRefresh } from "../hooks/useExpenseBackgroundRefresh";
import {
  getBankCredentialStatus,
  getBankProviders,
} from "../services/bankService";
import {
  clearExpenseCache,
  getCachedExpenses,
  getExpenseCacheMeta,
  replaceCachedExpenses,
  setExpenseCacheMeta,
  upsertCachedExpenses,
} from "../services/expenseCache";
import { getExpenseChanges, getExpenses } from "../services/expenseService";

const CATEGORY_ALL_VALUE = "__all_categories__";
const CATEGORY_RETURNS_VALUE = "__returns_only__";
const BACKGROUND_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const VIRTUAL_ROW_HEIGHT_PX = 94;
const VIRTUAL_OVERSCAN_ROWS = 10;

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate());
  const month = String(date.getMonth() + 1);
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatFetchTimestamp(value, locale) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(locale, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveLastFetchClientAtMs(cacheMeta = {}) {
  const fromClientMs = Number(cacheMeta?.lastFetchClientAtMs || 0);
  if (Number.isFinite(fromClientMs) && fromClientMs > 0) return fromClientMs;
  const parsedFromSyncAt = new Date(cacheMeta?.lastSyncAt || "").getTime();
  if (Number.isFinite(parsedFromSyncAt) && parsedFromSyncAt > 0) {
    return parsedFromSyncAt;
  }
  return 0;
}

function formatDateTwoDigit(date) {
  const day = String(date.getDate());
  const month = String(date.getMonth() + 1);
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatDisplayedRange(start, end) {
  if (!start || !end) return "- - -";
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "- - -";
  }

  const startDay = String(startDate.getDate());
  const endDay = String(endDate.getDate());

  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();
  const sameDate = sameMonth && startDate.getDate() === endDate.getDate();

  if (sameDate) {
    return formatDateTwoDigit(startDate);
  }

  if (sameMonth) {
    const month = String(startDate.getMonth() + 1).padStart(2, "0");
    const year = String(startDate.getFullYear()).slice(-2);
    return `${startDay}-${endDay}/${month}/${year}`;
  }

  return `${formatDate(startDate)}-${formatDate(endDate)}`;
}

function getMonthRange(year, monthIndex) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function toValidDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getLatestExpenseCursor(items) {
  const expenses = Array.isArray(items) ? items : [];
  let latest = null;

  for (const item of expenses) {
    const candidate = toValidDate(
      item?.updatedAt || item?.createdAt || item?.date,
    );
    if (!candidate) continue;
    if (!latest || candidate.getTime() > latest.getTime()) {
      latest = candidate;
    }
  }

  return latest ? latest.toISOString() : null;
}

function mergeExpensesById(current, incoming) {
  const currentItems = Array.isArray(current) ? current : [];
  const incomingItems = Array.isArray(incoming) ? incoming : [];
  if (!incomingItems.length) return currentItems;

  const nextMap = new Map(currentItems.map((item) => [item._id, item]));
  for (const nextItem of incomingItems) {
    if (!nextItem?._id) continue;
    const prevItem = nextMap.get(nextItem._id);
    nextMap.set(
      nextItem._id,
      prevItem ? { ...prevItem, ...nextItem } : nextItem,
    );
  }

  return Array.from(nextMap.values());
}

function hasPendingExpenses(items) {
  return (Array.isArray(items) ? items : []).some(
    (item) =>
      String(item?.status || "")
        .trim()
        .toLowerCase() === "pending",
  );
}

function hasFreshSync(lastSyncAtIso, nowMs) {
  const lastSyncDate = toValidDate(lastSyncAtIso);
  if (!lastSyncDate) return false;
  return nowMs - lastSyncDate.getTime() < BACKGROUND_SYNC_INTERVAL_MS;
}

function getCacheScopeFromUser(user) {
  return {
    cacheUserId: String(user?.id || "").trim(),
    cacheHouseholdId: String(user?.householdId || "").trim(),
  };
}

function matchesCacheScope(cacheMeta, cacheScope) {
  const expectedUserId = String(cacheScope?.cacheUserId || "").trim();
  const expectedHouseholdId = String(cacheScope?.cacheHouseholdId || "").trim();
  if (!expectedUserId || !expectedHouseholdId) return false;

  return (
    String(cacheMeta?.cacheUserId || "").trim() === expectedUserId &&
    String(cacheMeta?.cacheHouseholdId || "").trim() === expectedHouseholdId
  );
}

function isReturnExpense(expense) {
  const transactionType = String(expense?.transactionType || "")
    .trim()
    .toLowerCase();
  const amount = Number(expense?.amount || 0);
  return transactionType === "return" || amount < 0;
}

function isInstallmentNotYetCharged(expense) {
  const sourceTransactionType = String(expense?.sourceTransactionType || "")
    .trim()
    .toLowerCase();
  if (sourceTransactionType !== "installments") return false;

  const installmentNumber = Number(expense?.installmentNumber);
  const installmentTotal = Number(expense?.installmentTotal);
  const hasInstallmentsPlan =
    Number.isFinite(installmentNumber) &&
    installmentNumber > 0 &&
    Number.isFinite(installmentTotal) &&
    installmentTotal > 0;
  const explicitChargedState = expense?.isInstallmentCharged;
  if (explicitChargedState === true) return false;
  if (explicitChargedState === false) return true;
  return !hasInstallmentsPlan;
}

function getAmountRangeBounds(expenses = []) {
  const values = (Array.isArray(expenses) ? expenses : [])
    .map((expense) => Math.abs(Number(expense?.amount || 0)))
    .filter((amount) => Number.isFinite(amount));

  if (!values.length) {
    return { min: 0, max: 0 };
  }

  return {
    min: Math.max(0, Math.min(...values)),
    max: Math.max(0, Math.max(...values)),
  };
}

export default function DashboardListPage({ hideTotal = false }) {
  const theme = useTheme();
  const isMobileListView = useMediaQuery(theme.breakpoints.down("sm"));
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingExpenses, setIsSyncingExpenses] = useState(false);
  const [lastExpensesFetchAtMs, setLastExpensesFetchAtMs] = useState(0);
  const [expandedIds, setExpandedIds] = useState({});
  const [bankConnections, setBankConnections] = useState([]);
  const [providerLabels, setProviderLabels] = useState({});
  const didInitializeAccountFilterSelectionRef = useRef(false);
  const previousDropdownFiltersSignatureRef = useRef("");
  const [animatedTotalAmount, setAnimatedTotalAmount] = useState(0);
  const [isTotalCalculating, setIsTotalCalculating] = useState(true);
  const [listSearchQuery, setListSearchQuery] = useState("");
  const isExpenseBootstrappedRef = useRef(false);
  const hasTriggeredPendingBankConnectionRefreshRef = useRef(false);
  const listContainerRef = useRef(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const { t, locale, direction } = useLanguage();
  const { filters, setFilters } = useDashboardFilters();
  const {
    selectedCategories,
    selectedConnectionIds,
    timeRange,
    customStartDate,
    customEndDate,
    sortBy,
    selectedAmountRange,
  } = filters;

  const setSelectedCategories = useCallback(
    (value) =>
      setFilters((prev) => ({
        ...prev,
        selectedCategories:
          typeof value === "function" ? value(prev.selectedCategories) : value,
      })),
    [setFilters],
  );
  const setSelectedConnectionIds = useCallback(
    (value) =>
      setFilters((prev) => ({
        ...prev,
        selectedConnectionIds:
          typeof value === "function" ? value(prev.selectedConnectionIds) : value,
      })),
    [setFilters],
  );
  const setTimeRange = useCallback(
    (value) => setFilters((prev) => ({ ...prev, timeRange: value })),
    [setFilters],
  );
  const setCustomStartDate = useCallback(
    (value) => setFilters((prev) => ({ ...prev, customStartDate: value })),
    [setFilters],
  );
  const setCustomEndDate = useCallback(
    (value) => setFilters((prev) => ({ ...prev, customEndDate: value })),
    [setFilters],
  );
  const setSortBy = useCallback(
    (value) =>
      setFilters((prev) => ({
        ...prev,
        sortBy: typeof value === "function" ? value(prev.sortBy) : value,
      })),
    [setFilters],
  );
  const setSelectedAmountRange = useCallback(
    (value) =>
      setFilters((prev) => ({
        ...prev,
        selectedAmountRange:
          typeof value === "function" ? value(prev.selectedAmountRange) : value,
      })),
    [setFilters],
  );
  const cacheScope = useMemo(
    () => getCacheScopeFromUser(user),
    [user?.householdId, user?.id],
  );

  const refreshExpenses = useCallback(
    async ({ forceFullFetch = false, ignoreFreshWindow = false } = {}) => {
      const nowMs = Date.now();
      let cacheMeta = await getExpenseCacheMeta().catch(() => ({
        lastSyncAt: null,
        lastFetchClientAtMs: 0,
        syncCursor: null,
        cacheUserId: "",
        cacheHouseholdId: "",
      }));

      if (!matchesCacheScope(cacheMeta, cacheScope)) {
        await clearExpenseCache().catch(() => {});
        cacheMeta = {
          lastSyncAt: null,
          lastFetchClientAtMs: 0,
          syncCursor: null,
          cacheUserId: cacheScope.cacheUserId,
          cacheHouseholdId: cacheScope.cacheHouseholdId,
        };
        await setExpenseCacheMeta({
          lastSyncAt: null,
          lastFetchClientAtMs: 0,
          syncCursor: null,
          cacheUserId: cacheScope.cacheUserId,
          cacheHouseholdId: cacheScope.cacheHouseholdId,
        }).catch(() => {});
        setLastExpensesFetchAtMs(0);
      }

      const lastFetchClientAtMs = resolveLastFetchClientAtMs(cacheMeta);
      if (
        !forceFullFetch &&
        !ignoreFreshWindow &&
        nowMs - lastFetchClientAtMs < BACKGROUND_SYNC_INTERVAL_MS
      ) {
        setLastExpensesFetchAtMs(lastFetchClientAtMs);
        return;
      }

      if (!forceFullFetch && cacheMeta?.syncCursor) {
        try {
          const response = await getExpenseChanges(cacheMeta.syncCursor);
          const changedItems = Array.isArray(response?.items)
            ? response.items
            : [];
          if (changedItems.length > 0) {
            setExpenses((prev) => mergeExpensesById(prev, changedItems));
            await upsertCachedExpenses(changedItems).catch(() => {});
          }

          const cachedItems = await getCachedExpenses().catch(() => []);
          if (hasPendingExpenses(cachedItems)) {
            const fullData = await getExpenses();
            const normalizedFullData = Array.isArray(fullData) ? fullData : [];
            setExpenses(normalizedFullData);
            await replaceCachedExpenses(normalizedFullData).catch(() => {});
            const fullCursor = getLatestExpenseCursor(normalizedFullData);
            await setExpenseCacheMeta({
              lastSyncAt: response?.serverTime || new Date().toISOString(),
              lastFetchClientAtMs: Date.now(),
              syncCursor: fullCursor,
              cacheUserId: cacheScope.cacheUserId,
              cacheHouseholdId: cacheScope.cacheHouseholdId,
            }).catch(() => {});
            setLastExpensesFetchAtMs(Date.now());
            return;
          }

          const nextCursor = response?.cursor || cacheMeta.syncCursor;
          await setExpenseCacheMeta({
            lastSyncAt: response?.serverTime || new Date().toISOString(),
            lastFetchClientAtMs: Date.now(),
            syncCursor: nextCursor,
            cacheUserId: cacheScope.cacheUserId,
            cacheHouseholdId: cacheScope.cacheHouseholdId,
          }).catch(() => {});
          setLastExpensesFetchAtMs(Date.now());
          return;
        } catch {
          // Fall back to full fetch when incremental path fails.
        }
      }

      const data = await getExpenses();
      setExpenses(Array.isArray(data) ? data : []);
      const fullCursor = getLatestExpenseCursor(data);
      await replaceCachedExpenses(data).catch(() => {});
      const completedAtMs = Date.now();
      await setExpenseCacheMeta({
        lastSyncAt: new Date(completedAtMs).toISOString(),
        lastFetchClientAtMs: completedAtMs,
        syncCursor: fullCursor,
        cacheUserId: cacheScope.cacheUserId,
        cacheHouseholdId: cacheScope.cacheHouseholdId,
      }).catch(() => {});
      setLastExpensesFetchAtMs(completedAtMs);
    },
    [cacheScope],
  );

  const bootstrapExpenses = useCallback(async () => {
    if (isExpenseBootstrappedRef.current) return;
    isExpenseBootstrappedRef.current = true;

    setIsLoading(true);
    try {
      const cacheMeta = await getExpenseCacheMeta().catch(() => ({
        lastSyncAt: null,
        lastFetchClientAtMs: 0,
        syncCursor: null,
        cacheUserId: "",
        cacheHouseholdId: "",
      }));
      const hasMatchingScope = matchesCacheScope(cacheMeta, cacheScope);
      setLastExpensesFetchAtMs(
        hasMatchingScope ? resolveLastFetchClientAtMs(cacheMeta) : 0,
      );
      if (!hasMatchingScope) {
        await clearExpenseCache().catch(() => {});
        await setExpenseCacheMeta({
          lastSyncAt: null,
          lastFetchClientAtMs: 0,
          syncCursor: null,
          cacheUserId: cacheScope.cacheUserId,
          cacheHouseholdId: cacheScope.cacheHouseholdId,
        }).catch(() => {});
        setLastExpensesFetchAtMs(0);
      }

      const cached = hasMatchingScope
        ? await getCachedExpenses().catch(() => [])
        : [];
      if (Array.isArray(cached) && cached.length > 0) {
        setExpenses(cached);
        setIsLoading(false);
      }

      await refreshExpenses({
        forceFullFetch:
          !hasMatchingScope || !Array.isArray(cached) || cached.length === 0,
        ignoreFreshWindow: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, [cacheScope, refreshExpenses]);

  const loadBankFilterOptions = useCallback(async () => {
    try {
      const [statusData, providersData] = await Promise.all([
        getBankCredentialStatus(),
        getBankProviders(),
      ]);

      const connections = Array.isArray(statusData?.connections)
        ? statusData.connections.filter((connection) =>
            String(connection?.id || "").trim(),
          )
        : [];

      const providers = Array.isArray(providersData?.providers)
        ? providersData.providers
        : [];
      const nextProviderLabels = Object.fromEntries(
        providers.map((provider) => [
          provider.companyId,
          provider.label || provider.companyId,
        ]),
      );

      setProviderLabels(nextProviderLabels);
      setBankConnections(connections);
    } catch {
      setBankConnections([]);
      setProviderLabels({});
      setSelectedConnectionIds([]);
    }
  }, []);

  useEffect(() => {
    isExpenseBootstrappedRef.current = false;
    setExpenses([]);
  }, [cacheScope.cacheHouseholdId, cacheScope.cacheUserId]);

  useEffect(() => {
    bootstrapExpenses().catch(console.error);
  }, [bootstrapExpenses]);

  useEffect(() => {
    loadBankFilterOptions().catch(console.error);
  }, [loadBankFilterOptions]);

  useEffect(() => {
    const hasPendingConnectionInitialFetch = bankConnections.some(
      (connection) =>
        Boolean(connection?.connected) && !connection?.lastBankFetchAt,
    );
    if (!hasPendingConnectionInitialFetch) {
      hasTriggeredPendingBankConnectionRefreshRef.current = false;
      return;
    }
    if (hasTriggeredPendingBankConnectionRefreshRef.current) return;

    hasTriggeredPendingBankConnectionRefreshRef.current = true;
    refreshExpenses({ ignoreFreshWindow: true }).catch(console.error);
  }, [bankConnections, refreshExpenses]);

  const onSyncRunningChange = useCallback((running) => {
    setIsSyncingExpenses(Boolean(running));
  }, []);
  const refreshExpensesFromBackgroundSync = useCallback(
    () => refreshExpenses({ ignoreFreshWindow: true }),
    [refreshExpenses],
  );
  useExpenseBackgroundRefresh(
    refreshExpensesFromBackgroundSync,
    onSyncRunningChange,
    {
      syncScopeKey: `${cacheScope.cacheHouseholdId}:${cacheScope.cacheUserId}`,
    },
  );

  const onExpenseUpdated = useCallback((updatedExpense) => {
    if (!updatedExpense?._id) return;
    setExpenses((prev) => mergeExpensesById(prev, [updatedExpense]));
    upsertCachedExpenses([updatedExpense]).catch(() => {});
    const updatedCursor = getLatestExpenseCursor([updatedExpense]);
    if (updatedCursor) {
      setExpenseCacheMeta({
        lastSyncAt: new Date().toISOString(),
        syncCursor: updatedCursor,
      }).catch(() => {});
    }
  }, []);

  const toggleExpanded = useCallback((expenseId) => {
    setExpandedIds((prev) => ({
      ...prev,
      [expenseId]: !prev[expenseId],
    }));
  }, []);

  function matchesTimeRange(dateValue, selectedRange) {
    if (!dateValue) return false;
    if (selectedRange === "all_time") return true;

    const expenseDate = new Date(dateValue);
    const now = new Date();

    if (selectedRange === "custom_range") {
      if (!customStartDate || !customEndDate) return false;
      const from = new Date(`${customStartDate}T00:00:00`);
      const to = new Date(`${customEndDate}T23:59:59.999`);
      return expenseDate >= from && expenseDate <= to;
    }

    if (selectedRange.startsWith("month_")) {
      const [, yearPart, monthPart] = selectedRange.split("_");
      const year = Number(yearPart);
      const monthIndex = Number(monthPart) - 1;
      if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return false;
      const { start, end } = getMonthRange(year, monthIndex);
      return expenseDate >= start && expenseDate <= end;
    }

    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    return expenseDate >= from && expenseDate <= to;
  }

  const categoryOptions = useMemo(() => {
    const values = new Set(
      expenses.map((exp) => String(exp.category || "").trim()).filter(Boolean),
    );
    return Array.from(values).sort((a, b) => a.localeCompare(b, locale));
  }, [expenses, locale]);
  const allCategoriesSelected =
    selectedCategories.length === 0 ||
    selectedCategories.length === categoryOptions.length;
  const selectedReturnsOnly = selectedCategories.includes(
    CATEGORY_RETURNS_VALUE,
  );
  const returnsLabel = String(locale || "")
    .toLowerCase()
    .startsWith("he")
    ? "החזרים"
    : "returns";
  const selectedRegularCategories = selectedCategories.filter(
    (value) => value !== CATEGORY_RETURNS_VALUE,
  );
  const lastSixMonthOptions = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
    });
    const now = new Date();
    return Array.from({ length: 6 }).map((_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (index + 1), 1);
      const year = date.getFullYear();
      const monthIndex = date.getMonth();
      return {
        value: `month_${year}_${String(monthIndex + 1).padStart(2, "0")}`,
        label: formatter.format(date),
      };
    });
  }, [locale]);

  const accountFilterOptions = useMemo(() => {
    const connectionById = new Map(
      bankConnections.map((connection) => [
        String(connection.id || "").trim(),
        connection,
      ]),
    );

    const optionsByAccountId = new Map();
    expenses.forEach((expense) => {
      const accountId = String(expense.sourceAccountId || "").trim();
      if (!accountId || optionsByAccountId.has(accountId)) return;

      const sourceConnectionKey = String(
        expense.sourceConnectionKey || "",
      ).trim();
      const sourceCompanyId = String(expense.sourceCompanyId || "").trim();
      const connection = connectionById.get(sourceConnectionKey);
      const companyId = String(
        connection?.companyId || sourceCompanyId || "",
      ).trim();
      const accountName = String(connection?.connectionName || "").trim();
      const providerLabel = providerLabels[companyId] || companyId || t("bank");
      const label = accountName
        ? `${accountName} (${providerLabel})`
        : `${providerLabel} (${accountId})`;
      const matchedAccount = Array.isArray(connection?.sourceAccounts)
        ? connection.sourceAccounts.find(
            (account) =>
              String(account?.sourceAccountId || "").trim() === accountId,
          )
        : null;
      const visibilityScope = String(
        matchedAccount?.visibilityScope ||
          connection?.visibilityScope ||
          expense?.visibilityScope ||
          "shared",
      )
        .trim()
        .toLowerCase();

      optionsByAccountId.set(accountId, {
        id: accountId,
        label,
        visibilityScope: visibilityScope === "private" ? "private" : "shared",
      });
    });

    return Array.from(optionsByAccountId.values()).sort((a, b) =>
      a.label.localeCompare(b.label, locale),
    );
  }, [bankConnections, expenses, locale, providerLabels, t]);
  const loadingBankNames = useMemo(() => {
    const connectedNames = bankConnections
      .filter((connection) => Boolean(connection?.connected))
      .map((connection) => {
        const companyId = String(connection?.companyId || "").trim();
        return providerLabels[companyId] || companyId;
      })
      .filter(Boolean);

    const names = connectedNames.length
      ? connectedNames
      : accountFilterOptions.map((option) => option.label);
    if (!names.length) return "";
    return Array.from(new Set(names)).join(", ");
  }, [accountFilterOptions, bankConnections, providerLabels]);

  const shouldShowAccountFilter = accountFilterOptions.length > 1;
  const hasSingleAccountOption = accountFilterOptions.length === 1;
  const singleAccountLabel = hasSingleAccountOption
    ? accountFilterOptions[0]?.label || t("allAccounts")
    : t("allAccounts");
  const hasHouseholdConnections = accountFilterOptions.length > 0;
  const shouldApplyAccountFilter =
    shouldShowAccountFilter &&
    selectedConnectionIds.length > 0 &&
    selectedConnectionIds.length < accountFilterOptions.length;
  const hasMultipleSelectedAccounts = selectedConnectionIds.length > 1;
  const dropdownFiltersSignature = useMemo(() => {
    const accountSignature = shouldApplyAccountFilter
      ? [...selectedConnectionIds].sort().join("|")
      : "__all__";
    const categorySignature = [...selectedCategories].sort().join("|");
    return [
      `categories:${categorySignature}`,
      `timeRange:${timeRange}`,
      `sortBy:${sortBy}`,
      `accounts:${accountSignature}`,
    ].join(";");
  }, [
    selectedCategories,
    selectedConnectionIds,
    shouldApplyAccountFilter,
    sortBy,
    timeRange,
  ]);

  const expensesMatchingBaseFilters = useMemo(
    () =>
      expenses.filter((exp) => {
        if (!matchesTimeRange(exp.date, timeRange)) return false;

        if (selectedReturnsOnly && !isReturnExpense(exp)) {
          return false;
        }

        const normalizedCategory = String(exp.category || "").trim();
        if (
          selectedRegularCategories.length &&
          !selectedRegularCategories.includes(normalizedCategory)
        ) {
          return false;
        }

        const amount = Math.abs(Number(exp.amount || 0));
        if (!Number.isFinite(amount)) return false;

        if (!shouldApplyAccountFilter) return true;

        const sourceAccountId = String(exp.sourceAccountId || "").trim();
        if (!sourceAccountId) return false;
        return selectedConnectionIds.includes(sourceAccountId);
      }),
    [
      customEndDate,
      customStartDate,
      expenses,
      selectedRegularCategories,
      selectedReturnsOnly,
      selectedConnectionIds,
      shouldApplyAccountFilter,
      timeRange,
    ],
  );

  const amountRangeBounds = useMemo(
    () => getAmountRangeBounds(expensesMatchingBaseFilters),
    [expensesMatchingBaseFilters],
  );
  const minExpenseAmount = amountRangeBounds.min;
  const maxExpenseAmount = amountRangeBounds.max;

  useEffect(() => {
    if (isLoading) return;
    if (
      previousDropdownFiltersSignatureRef.current === dropdownFiltersSignature
    ) {
      return;
    }
    previousDropdownFiltersSignatureRef.current = dropdownFiltersSignature;
    setSelectedAmountRange((prev) => {
      const prevMin = Number(prev?.[0] || 0);
      const prevMax = Number(prev?.[1] || 0);
      if (prevMin === minExpenseAmount && prevMax === maxExpenseAmount) {
        return prev;
      }
      return [minExpenseAmount, maxExpenseAmount];
    });
  }, [
    dropdownFiltersSignature,
    isLoading,
    maxExpenseAmount,
    minExpenseAmount,
    setSelectedAmountRange,
  ]);

  useEffect(() => {
    if (isLoading) return;
    const safeMin = Math.max(0, Number(minExpenseAmount || 0));
    const safeMax = Math.max(0, Number(maxExpenseAmount || 0));
    setSelectedAmountRange((prev) => {
      const prevMin = Number(prev?.[0] || 0);
      const prevMax = Number(prev?.[1] || 0);

      if (prevMin === 0 && prevMax === 0) {
        if (safeMin === prevMin && safeMax === prevMax) return prev;
        return [safeMin, safeMax];
      }

      const nextMin = Math.min(Math.max(safeMin, prevMin), safeMax);
      const nextMax = Math.min(Math.max(nextMin, prevMax), safeMax);
      if (nextMin === prevMin && nextMax === prevMax) return prev;
      return [nextMin, nextMax];
    });
  }, [isLoading, maxExpenseAmount, minExpenseAmount, setSelectedAmountRange]);

  useEffect(() => {
    const allAccountIds = accountFilterOptions.map((option) => option.id);
    const preferredAccountIds = Array.isArray(
      user?.defaultSelectedBankConnectionIds,
    )
      ? user.defaultSelectedBankConnectionIds.filter((id) =>
          allAccountIds.includes(id),
        )
      : [];

    setSelectedConnectionIds((prevSelected) => {
      if (allAccountIds.length === 0) return prevSelected;
      if (allAccountIds.length <= 1) return allAccountIds;
      if (!didInitializeAccountFilterSelectionRef.current) {
        didInitializeAccountFilterSelectionRef.current = true;
        if (preferredAccountIds.length) return preferredAccountIds;
        if (!prevSelected.length) return allAccountIds;
      }

      const retained = prevSelected.filter((id) => allAccountIds.includes(id));
      return retained.length ? retained : allAccountIds;
    });
  }, [accountFilterOptions, user?.defaultSelectedBankConnectionIds]);

  function onAccountFilterChange(nextValues) {
    const values = Array.isArray(nextValues) ? nextValues : [];
    if (!values.length) {
      setSelectedConnectionIds(accountFilterOptions.map((option) => option.id));
      return;
    }
    setSelectedConnectionIds(values);
  }

  function onCategoryFilterChange(nextValues) {
    const values = Array.isArray(nextValues) ? nextValues : [];

    if (values.includes(CATEGORY_ALL_VALUE)) {
      // Internal empty selection means "all selected".
      setSelectedCategories([]);
      return;
    }

    const filteredValues = values.filter(
      (value) =>
        value === CATEGORY_RETURNS_VALUE || categoryOptions.includes(value),
    );
    const hasReturnsOnly = filteredValues.includes(CATEGORY_RETURNS_VALUE);
    const regularValues = filteredValues.filter(
      (value) => value !== CATEGORY_RETURNS_VALUE,
    );

    if (
      !hasReturnsOnly &&
      (!regularValues.length || regularValues.length === categoryOptions.length)
    ) {
      setSelectedCategories([]);
      return;
    }

    setSelectedCategories(filteredValues);
  }

  const normalizedListSearchQuery = useMemo(
    () => String(listSearchQuery || "").trim().toLowerCase(),
    [listSearchQuery],
  );

  const displayedExpenses = useMemo(() => {
    const filtered = expensesMatchingBaseFilters.filter((exp) => {
      const amount = Math.abs(Number(exp.amount || 0));
      if (amount < selectedAmountRange[0] || amount > selectedAmountRange[1]) {
        return false;
      }
      return true;
    });

    const sorted = filtered.sort((a, b) => {
      if (sortBy === "date_asc") {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      if (sortBy === "amount_desc") {
        return (
          Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0))
        );
      }
      if (sortBy === "amount_asc") {
        return (
          Math.abs(Number(a.amount || 0)) - Math.abs(Number(b.amount || 0))
        );
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    if (!normalizedListSearchQuery) return sorted;

    return sorted.filter((expense) => {
      const date = new Date(expense?.date);
      const localizedDate = Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString(locale);
      const searchableText = [
        expense?.description,
        expense?.category,
        expense?.merchant,
        expense?.notes,
        expense?.sourceAccountId,
        expense?.sourceConnectionKey,
        expense?.sourceCompanyId,
        formatDate(expense?.date),
        localizedDate,
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");

      return searchableText.includes(normalizedListSearchQuery);
    });
  }, [
    expensesMatchingBaseFilters,
    locale,
    normalizedListSearchQuery,
    selectedAmountRange,
    sortBy,
  ]);

  const displayedAmountTotal = useMemo(
    () =>
      displayedExpenses.reduce((sum, expense) => {
        if (isInstallmentNotYetCharged(expense)) return sum;
        const amount = Math.abs(Number(expense.amount || 0));
        const isReturn =
          String(expense.transactionType || "")
            .trim()
            .toLowerCase() === "return";
        return sum + (isReturn ? -amount : amount);
      }, 0),
    [displayedExpenses],
  );

  useEffect(() => {
    setIsTotalCalculating(true);
    setAnimatedTotalAmount(0);
    const nextFrame = requestAnimationFrame(() => {
      setAnimatedTotalAmount(displayedAmountTotal);
      setIsTotalCalculating(false);
    });

    return () => cancelAnimationFrame(nextFrame);
  }, [displayedAmountTotal]);

  const displayedDateRange = useMemo(() => {
    const now = new Date();

    if (timeRange === "this_month") {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startDay = String(firstDayOfMonth.getDate());
      const endDay = String(now.getDate());
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = String(now.getFullYear()).slice(-2);
      return `${startDay} - ${endDay}/${month}/${year}`;
    }

    if (timeRange === "custom_range") {
      if (!customStartDate || !customEndDate) return "- - -";
      const start = new Date(`${customStartDate}T00:00:00`);
      const end = new Date(`${customEndDate}T23:59:59.999`);
      return formatDisplayedRange(start, end);
    }

    if (timeRange.startsWith("month_")) {
      const [, yearPart, monthPart] = timeRange.split("_");
      const year = Number(yearPart);
      const monthIndex = Number(monthPart) - 1;
      if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
        return "- - -";
      }
      const { start, end } = getMonthRange(year, monthIndex);
      return formatDisplayedRange(start, end);
    }

    if (!displayedExpenses.length) return "- - -";
    const timestamps = displayedExpenses
      .map((expense) => new Date(expense.date).getTime())
      .filter((value) => Number.isFinite(value));
    if (!timestamps.length) return "- - -";

    const minDate = new Date(Math.min(...timestamps));
    const maxDate = new Date(Math.max(...timestamps));
    return formatDisplayedRange(minDate, maxDate);
  }, [customEndDate, customStartDate, displayedExpenses, timeRange]);

  const isAmountSortActive =
    sortBy === "amount_desc" || sortBy === "amount_asc";

  const handleAmountSortToggle = useCallback(() => {
    setSortBy((prev) => {
      if (prev === "amount_desc") return "amount_asc";
      if (prev === "amount_asc") return "amount_desc";
      return "amount_desc";
    });
  }, []);
  const shouldShowTotalLoading = isLoading || isTotalCalculating;
  const renderSelectedCategoriesValue = useCallback(
    (selected) => {
      if (allCategoriesSelected) return t("all");
      const values = Array.isArray(selected) ? selected : [];
      return values
        .map((value) =>
          value === CATEGORY_RETURNS_VALUE ? returnsLabel : value,
        )
        .join(", ");
    },
    [allCategoriesSelected, returnsLabel, t],
  );
  const visibleExpenses = useMemo(() => {
    if (isLoading) return [];
    if (isMobileListView) return displayedExpenses;
    const safeStart = Math.max(0, visibleRange.start);
    const safeEnd = Math.max(safeStart, visibleRange.end);
    return displayedExpenses.slice(safeStart, safeEnd + 1);
  }, [
    displayedExpenses,
    isLoading,
    isMobileListView,
    visibleRange.end,
    visibleRange.start,
  ]);
  const topSpacerHeight = isMobileListView
    ? 0
    : Math.max(0, visibleRange.start * VIRTUAL_ROW_HEIGHT_PX);
  const bottomSpacerHeight = Math.max(
    0,
    isMobileListView
      ? 0
      : (displayedExpenses.length - (visibleRange.end + 1)) *
          VIRTUAL_ROW_HEIGHT_PX,
  );

  useEffect(() => {
    if (isLoading || isMobileListView) return;
    const rowCount = displayedExpenses.length;
    if (!rowCount) {
      setVisibleRange({ start: 0, end: 0 });
      return;
    }

    let frameId = null;
    const calculateRange = () => {
      const container = listContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 0;
      const topOffset = Math.max(0, -rect.top);
      const bottomOffset = Math.max(0, rect.bottom - viewportHeight);
      const visibleHeight = Math.max(
        0,
        viewportHeight - topOffset - bottomOffset,
      );

      const start = Math.max(
        0,
        Math.floor(topOffset / VIRTUAL_ROW_HEIGHT_PX) - VIRTUAL_OVERSCAN_ROWS,
      );
      const end = Math.min(
        rowCount - 1,
        Math.ceil((topOffset + visibleHeight) / VIRTUAL_ROW_HEIGHT_PX) +
          VIRTUAL_OVERSCAN_ROWS,
      );
      setVisibleRange((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end },
      );
    };

    const onScrollOrResize = () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(calculateRange);
    };

    onScrollOrResize();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [displayedExpenses, isLoading, isMobileListView]);

  useEffect(() => {
    if (isLoading || isMobileListView) return;
    setVisibleRange((prev) => {
      const maxEnd = Math.max(0, displayedExpenses.length - 1);
      const nextStart = Math.min(prev.start, maxEnd);
      const nextEnd = Math.min(Math.max(nextStart, prev.end), maxEnd);
      if (prev.start === nextStart && prev.end === nextEnd) return prev;
      return { start: nextStart, end: nextEnd };
    });
  }, [displayedExpenses.length, isLoading, isMobileListView]);

  return (
    <>
      {!hideTotal && (
        <Typography
          dir={direction}
          sx={{
            mb: 1.5,
            px: { xs: 0.5, sm: 0.75 },
            textAlign: direction === "rtl" ? "right" : "left",
            fontSize: "3rem",
          }}
        >
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "baseline",
              direction: "ltr",
              unicodeBidi: "isolate",
              gap: 0.5,
            }}
          >
            {shouldShowTotalLoading ? (
              <>
                <Skeleton
                  variant="rounded"
                  width={28}
                  height={28}
                  sx={{ bgcolor: alpha(theme.palette.text.secondary, 0.2) }}
                />
                <Skeleton
                  variant="rounded"
                  width={140}
                  height={42}
                  sx={{ bgcolor: alpha(theme.palette.text.secondary, 0.2) }}
                />
              </>
            ) : (
              <>
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    fontWeight: 400,
                    color: "text.secondary",
                  }}
                >
                  {displayedExpenses[0]?.currency || "₪"}
                </Box>

                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    fontWeight: 800,
                  }}
                >
                  <NumberFlow
                    value={animatedTotalAmount}
                    format={{
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }}
                    transformTiming={{
                      duration: 600,
                      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                    }}
                    spinTiming={{
                      duration: 600,
                      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                    }}
                    opacityTiming={{
                      duration: 500,
                      easing: "ease-out",
                    }}
                  />
                </Box>
              </>
            )}
          </Box>
        </Typography>
      )}
      <Card
        sx={{
          border: "none !important",
          borderRadius: "16px",
        }}
      >
        <CardContent
          sx={{
            px: { xs: 1, sm: 3 },
            py: { xs: 2.5, sm: 3 },
          }}
        >
          <DashboardFilters
            t={t}
            categoryAllValue={CATEGORY_ALL_VALUE}
            categoryReturnsValue={CATEGORY_RETURNS_VALUE}
            selectedCategories={selectedCategories}
            allCategoriesSelected={allCategoriesSelected}
            selectedReturnsOnly={selectedReturnsOnly}
            returnsLabel={returnsLabel}
            categoryOptions={categoryOptions}
            onCategoryFilterChange={onCategoryFilterChange}
            renderSelectedCategoriesValue={renderSelectedCategoriesValue}
            shouldShowAccountFilter={shouldShowAccountFilter}
            selectedConnectionIds={selectedConnectionIds}
            hasSingleAccountOption={hasSingleAccountOption}
            accountFilterOptions={accountFilterOptions}
            singleAccountLabel={singleAccountLabel}
            onAccountFilterChange={onAccountFilterChange}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomStartDateChange={setCustomStartDate}
            onCustomEndDateChange={setCustomEndDate}
            lastSixMonthOptions={lastSixMonthOptions}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            selectedAmountRange={selectedAmountRange}
            minExpenseAmount={minExpenseAmount}
            maxExpenseAmount={maxExpenseAmount}
            onAmountRangeChange={setSelectedAmountRange}
            showSearch
            searchLabel="Search"
            searchPlaceholder="Search expense, category, or date"
            searchQuery={listSearchQuery}
            onSearchQueryChange={setListSearchQuery}
          />
          {timeRange === "custom_range" &&
            customStartDate &&
            customEndDate &&
            customStartDate > customEndDate && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="error" dir={direction}>
                  {t("invalidDateRange")}
                </Typography>
              </Box>
            )}
          <Box sx={{ mb: 2 }}>
            <Stack
              direction="row"
              alignItems="flex-start"
              spacing={1}
              justifyContent="space-between"
            >
              <Typography
                variant="subtitle1"
                dir={direction}
                sx={{ textAlign: direction === "rtl" ? "right" : "left" }}
              >
                {t("summaryDates")}: {displayedDateRange}
              </Typography>
              <Typography
                variant="subtitle1"
                dir={direction}
                sx={{ textAlign: direction === "rtl" ? "right" : "left" }}
              >
                {t("summaryItems")}: {displayedExpenses.length}
              </Typography>
            </Stack>
          </Box>
          {!isLoading &&
            bankConnections.length === 0 &&
            !hasHouseholdConnections && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="body2"
                  dir={direction}
                  color="warning.main"
                  sx={{ textAlign: direction === "rtl" ? "right" : "left" }}
                >
                  {t("dashboardNoBankConnectionMessage")}
                </Typography>
              </Box>
            )}
          <Box
            sx={{
              display: "flex",
              direction: "ltr",
              justifyContent: direction === "rtl" ? "flex-start" : "flex-end",
              mt: -2,
            }}
          >
            <IconButton
              className="amount-sort-button"
              onClick={handleAmountSortToggle}
              disableRipple
              disableFocusRipple
              aria-label={
                sortBy === "amount_asc"
                  ? t("sortPriceLowToHigh")
                  : t("sortPriceHighToLow")
              }
              sx={{
                border: `2px solid ${isAmountSortActive ? theme.palette.primary.main : "transparent"}`,
                bgcolor: "background.paper",
                color: theme.palette.text.primary,
                opacity: 1,
                borderRadius: 1.25,
                scale: 0.8,
                transition: "none !important",
                "&.amount-sort-button, &.amount-sort-button:hover, &.amount-sort-button:active":
                  {
                    color: `${theme.palette.text.primary} !important`,
                    opacity: "1 !important",
                  },
                "&:hover": {
                  bgcolor: "background.paper",
                  color: theme.palette.text.primary,
                  opacity: 1,
                },
                "&:active": {
                  bgcolor: "background.paper",
                  color: theme.palette.text.primary,
                  opacity: 1,
                },
                "&.Mui-focusVisible": {
                  bgcolor: "background.paper !important",
                  color: "inherit !important",
                  opacity: "1 !important",
                  boxShadow: "none !important",
                  border: `2px solid ${theme.palette.primary.main}`,
                  outline: "none !important",
                },
                "&:focus": {
                  bgcolor: "background.paper !important",
                  color: "inherit !important",
                  opacity: "1 !important",
                  boxShadow: "none !important",
                  border: `2px solid ${theme.palette.primary.main}`,
                  outline: "none !important",
                },
                "& .MuiTouchRipple-root": {
                  display: "none",
                },
                "&:focus .MuiSvgIcon-root, &:focus-visible .MuiSvgIcon-root, &.Mui-focusVisible .MuiSvgIcon-root":
                  {
                    color: `${theme.palette.text.primary} !important`,
                    opacity: "1 !important",
                    fill: "currentColor",
                  },
              }}
            >
              {sortBy === "amount_asc" ? (
                <ArrowUpwardRoundedIcon
                  fontSize="small"
                  sx={{
                    color: theme.palette.text.primary,
                    opacity: "1 !important",
                    transition: "none !important",
                    fill: "currentColor",
                  }}
                />
              ) : (
                <ArrowDownwardRoundedIcon
                  fontSize="small"
                  sx={{
                    color: theme.palette.text.primary,
                    opacity: "1 !important",
                    transition: "none !important",
                    fill: "currentColor",
                  }}
                />
              )}
            </IconButton>
          </Box>
          <List disablePadding ref={listContainerRef}>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <Box key={`expense-skeleton-${index}`} sx={{ py: 1 }}>
                  <Skeleton variant="text" width="55%" height={30} />
                  <Skeleton variant="text" width="72%" height={24} />
                  <Skeleton
                    variant="rounded"
                    width={120}
                    height={30}
                    sx={{ mt: 0.5 }}
                  />
                  {index < 5 && <Divider sx={{ mt: 1 }} />}
                </Box>
              ))
            ) : (
              <>
                {topSpacerHeight > 0 && (
                  <Box sx={{ height: topSpacerHeight }} />
                )}
                {visibleExpenses.map((exp) => (
                  <ExpenseItem
                    key={exp._id}
                    exp={exp}
                    categoryOptions={categoryOptions}
                    showSourceAccountIdAfterCategory={
                      hasMultipleSelectedAccounts
                    }
                    isExpanded={Boolean(expandedIds[exp._id])}
                    onToggleExpanded={toggleExpanded}
                    onExpenseUpdated={onExpenseUpdated}
                    direction={direction}
                    locale={locale}
                    t={t}
                  />
                ))}
                {bottomSpacerHeight > 0 && (
                  <Box sx={{ height: bottomSpacerHeight }} />
                )}
              </>
            )}
          </List>
        </CardContent>
      </Card>
      <AppSnackbar
        open={isSyncingExpenses}
        message={
          loadingBankNames
            ? `${t("loadingBankExpensesPrefix")} ${loadingBankNames} ${t("loadingBankExpensesSuffix")}`
            : t("loadingBankExpensesDefault")
        }
        severity="info"
        variant="filled"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}
