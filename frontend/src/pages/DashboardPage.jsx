import {
  alpha,
  Box,
  Card,
  CardContent,
  Checkbox,
  Divider,
  List,
  ListItemText,
  MenuItem,
  Skeleton,
  Slider,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
  createTheme,
  useTheme,
} from "@mui/material";
import NumberFlow from "@number-flow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppSnackbar from "../components/AppSnackbar";
import Dropdown from "../components/Dropdown";
import ExpenseItem from "../components/ExpenseItem";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useExpenseBackgroundRefresh } from "../hooks/useExpenseBackgroundRefresh";
import {
  getBankCredentialStatus,
  getBankProviders,
} from "../services/bankService";
import {
  getExpenseChanges,
  getExpenses,
} from "../services/expenseService";
import {
  getCachedExpenses,
  getExpenseCacheMeta,
  replaceCachedExpenses,
  setExpenseCacheMeta,
  upsertCachedExpenses,
} from "../services/expenseCache";

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
    const candidate = toValidDate(item?.updatedAt || item?.createdAt || item?.date);
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
    nextMap.set(nextItem._id, prevItem ? { ...prevItem, ...nextItem } : nextItem);
  }

  return Array.from(nextMap.values());
}

function hasFreshSync(lastSyncAtIso, nowMs) {
  const lastSyncDate = toValidDate(lastSyncAtIso);
  if (!lastSyncDate) return false;
  return nowMs - lastSyncDate.getTime() < BACKGROUND_SYNC_INTERVAL_MS;
}

function isReturnExpense(expense) {
  const transactionType = String(expense?.transactionType || "")
    .trim()
    .toLowerCase();
  const amount = Number(expense?.amount || 0);
  return transactionType === "return" || amount < 0;
}

export default function DashboardPage() {
  const theme = useTheme();
  const ltrSliderTheme = useMemo(
    () =>
      createTheme({
        ...theme,
        direction: "ltr",
      }),
    [theme],
  );
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingExpenses, setIsSyncingExpenses] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [bankConnections, setBankConnections] = useState([]);
  const [providerLabels, setProviderLabels] = useState({});
  const [selectedConnectionIds, setSelectedConnectionIds] = useState([]);
  const didInitializeAccountFilterSelectionRef = useRef(false);
  const [timeRange, setTimeRange] = useState("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [selectedAmountRange, setSelectedAmountRange] = useState([0, 0]);
  const [animatedTotalAmount, setAnimatedTotalAmount] = useState(0);
  const [isTotalCalculating, setIsTotalCalculating] = useState(true);
  const isExpenseBootstrappedRef = useRef(false);
  const hasTriggeredPendingBankConnectionRefreshRef = useRef(false);
  const listContainerRef = useRef(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const { t, locale, direction } = useLanguage();

  const refreshExpenses = useCallback(
    async ({ forceFullFetch = false, ignoreFreshWindow = false } = {}) => {
    const nowMs = Date.now();
    const cacheMeta = await getExpenseCacheMeta().catch(() => ({
      lastSyncAt: null,
      syncCursor: null,
    }));

    if (
      !forceFullFetch &&
      !ignoreFreshWindow &&
      cacheMeta?.syncCursor &&
      hasFreshSync(cacheMeta?.lastSyncAt, nowMs)
    ) {
      return;
    }

    if (!forceFullFetch && cacheMeta?.syncCursor) {
      try {
        const response = await getExpenseChanges(cacheMeta.syncCursor);
        const changedItems = Array.isArray(response?.items) ? response.items : [];
        if (changedItems.length > 0) {
          setExpenses((prev) => mergeExpensesById(prev, changedItems));
          await upsertCachedExpenses(changedItems).catch(() => {});
        }
        const nextCursor = response?.cursor || cacheMeta.syncCursor;
        await setExpenseCacheMeta({
          lastSyncAt: response?.serverTime || new Date().toISOString(),
          syncCursor: nextCursor,
        }).catch(() => {});
        return;
      } catch {
        // Fall back to full fetch when incremental path fails.
      }
    }

    const data = await getExpenses();
    setExpenses(Array.isArray(data) ? data : []);
    const fullCursor = getLatestExpenseCursor(data);
    await replaceCachedExpenses(data).catch(() => {});
    await setExpenseCacheMeta({
      lastSyncAt: new Date().toISOString(),
      syncCursor: fullCursor,
    }).catch(() => {});
    },
    [],
  );

  const bootstrapExpenses = useCallback(async () => {
    if (isExpenseBootstrappedRef.current) return;
    isExpenseBootstrappedRef.current = true;

    setIsLoading(true);
    try {
      const cached = await getCachedExpenses().catch(() => []);
      if (Array.isArray(cached) && cached.length > 0) {
        setExpenses(cached);
        setIsLoading(false);
      }

      await refreshExpenses({
        forceFullFetch: !Array.isArray(cached) || cached.length === 0,
      });
    } finally {
      setIsLoading(false);
    }
  }, [refreshExpenses]);

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
  const returnsLabel = String(locale || "").toLowerCase().startsWith("he")
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

      optionsByAccountId.set(accountId, {
        id: accountId,
        label,
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
  const maxExpenseAmount = useMemo(
    () =>
      Math.max(
        0,
        ...expenses.map((exp) => {
          const amount = Math.abs(Number(exp.amount || 0));
          return Number.isFinite(amount) ? amount : 0;
        }),
      ),
    [expenses],
  );

  useEffect(() => {
    const safeMax = Math.max(0, Number(maxExpenseAmount || 0));
    setSelectedAmountRange((prev) => {
      const prevMin = Number(prev?.[0] || 0);
      const prevMax = Number(prev?.[1] || 0);

      if (prevMin === 0 && prevMax === 0) {
        return [0, safeMax];
      }

      const nextMin = Math.min(Math.max(0, prevMin), safeMax);
      const nextMax = Math.min(Math.max(nextMin, prevMax), safeMax);
      if (nextMin === prevMin && nextMax === prevMax) return prev;
      return [nextMin, nextMax];
    });
  }, [maxExpenseAmount]);

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

    const filteredValues = values.filter((value) =>
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

  const displayedExpenses = useMemo(() => {
    const filtered = expenses.filter((exp) => {
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
      if (amount < selectedAmountRange[0] || amount > selectedAmountRange[1]) {
        return false;
      }

      if (!shouldApplyAccountFilter) return true;

      const sourceAccountId = String(exp.sourceAccountId || "").trim();
      if (!sourceAccountId) return false;
      return selectedConnectionIds.includes(sourceAccountId);
    });

    return filtered.sort((a, b) => {
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
  }, [
    customEndDate,
    customStartDate,
    expenses,
    accountFilterOptions,
    selectedRegularCategories,
    selectedReturnsOnly,
    selectedConnectionIds,
    selectedAmountRange,
    sortBy,
    shouldApplyAccountFilter,
    timeRange,
  ]);

  const displayedAmountTotal = useMemo(
    () =>
      displayedExpenses.reduce((sum, expense) => {
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
    const safeStart = Math.max(0, visibleRange.start);
    const safeEnd = Math.max(safeStart, visibleRange.end);
    return displayedExpenses.slice(safeStart, safeEnd + 1);
  }, [displayedExpenses, isLoading, visibleRange.end, visibleRange.start]);
  const topSpacerHeight = Math.max(0, visibleRange.start * VIRTUAL_ROW_HEIGHT_PX);
  const bottomSpacerHeight = Math.max(
    0,
    (displayedExpenses.length - (visibleRange.end + 1)) * VIRTUAL_ROW_HEIGHT_PX,
  );

  useEffect(() => {
    if (isLoading) return;
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
      const visibleHeight = Math.max(0, viewportHeight - topOffset - bottomOffset);

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
  }, [displayedExpenses, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    setVisibleRange((prev) => {
      const maxEnd = Math.max(0, displayedExpenses.length - 1);
      const nextStart = Math.min(prev.start, maxEnd);
      const nextEnd = Math.min(Math.max(nextStart, prev.end), maxEnd);
      if (prev.start === nextStart && prev.end === nextEnd) return prev;
      return { start: nextStart, end: nextEnd };
    });
  }, [displayedExpenses.length, isLoading]);

  return (
    <>
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
      <Card sx={{ border: "none !important", borderRadius: "16px" }}>
        <CardContent
          sx={{
            px: { xs: 1, sm: 3 },
            py: { xs: 2.5, sm: 3 },
          }}
        >
          <Box
            sx={{
              display: { xs: "grid", md: "none" },
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 2,
              mb: 2,
            }}
          >
            <Dropdown
              labelId="category-filter-label-mobile"
              label={t("categoryFilter")}
              labelShrink
              multiple
              value={selectedCategories}
              displayEmpty
              onChange={(event) => onCategoryFilterChange(event.target.value)}
              renderValue={renderSelectedCategoriesValue}
              sx={{ minWidth: 0 }}
            >
              <MenuItem value={CATEGORY_ALL_VALUE}>
                <Checkbox
                  checked={allCategoriesSelected}
                  indeterminate={
                    !allCategoriesSelected && selectedCategories.length > 0
                  }
                />
                <ListItemText primary={t("all")} />
              </MenuItem>
              <MenuItem value={CATEGORY_RETURNS_VALUE}>
                <Checkbox checked={allCategoriesSelected || selectedReturnsOnly} />
                <ListItemText primary={returnsLabel} />
              </MenuItem>
              {categoryOptions.map((category) => (
                <MenuItem key={category} value={category}>
                  <Checkbox
                    checked={
                      allCategoriesSelected ||
                      selectedCategories.includes(category)
                    }
                  />
                  <ListItemText primary={category} />
                </MenuItem>
              ))}
            </Dropdown>

            <Dropdown
              labelId="account-filter-label-mobile"
              label={t("accountFilter")}
              labelShrink
              multiple
              displayEmpty
              disabled={!shouldShowAccountFilter}
              value={
                shouldShowAccountFilter
                  ? selectedConnectionIds
                  : hasSingleAccountOption
                    ? [accountFilterOptions[0].id]
                    : []
              }
              onChange={(event) => onAccountFilterChange(event.target.value)}
              renderValue={(selected) => {
                if (!shouldShowAccountFilter) {
                  return singleAccountLabel;
                }

                const values = Array.isArray(selected) ? selected : [];
                if (
                  !values.length ||
                  values.length === accountFilterOptions.length
                ) {
                  return t("allAccounts");
                }

                return values
                  .map(
                    (id) =>
                      accountFilterOptions.find((option) => option.id === id)
                        ?.label || id,
                  )
                  .join(", ");
              }}
              sx={{ minWidth: 0 }}
            >
              {!shouldShowAccountFilter ? (
                <MenuItem disabled value="">
                  <ListItemText primary={singleAccountLabel} />
                </MenuItem>
              ) : (
                accountFilterOptions.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    <Checkbox
                      checked={selectedConnectionIds.includes(option.id)}
                    />
                    <ListItemText primary={option.label} />
                  </MenuItem>
                ))
              )}
            </Dropdown>

            <Dropdown
              labelId="time-range-label-mobile"
              value={timeRange}
              label={t("timeRange")}
              onChange={(event) => setTimeRange(event.target.value)}
              sx={{ minWidth: 0 }}
            >
              <MenuItem value="this_month">{t("thisMonth")}</MenuItem>
              <MenuItem value="custom_range">{t("customRange")}</MenuItem>
              <MenuItem value="all_time">{t("allTime")}</MenuItem>
              {lastSixMonthOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Dropdown>

            <Dropdown
              labelId="sort-by-label-mobile"
              value={sortBy}
              label={t("sortBy")}
              onChange={(event) => setSortBy(event.target.value)}
              sx={{ minWidth: 0 }}
            >
              <MenuItem value="date_desc">{t("sortDateNewest")}</MenuItem>
              <MenuItem value="date_asc">{t("sortDateOldest")}</MenuItem>
              <MenuItem value="amount_desc">{t("sortPriceHighToLow")}</MenuItem>
              <MenuItem value="amount_asc">{t("sortPriceLowToHigh")}</MenuItem>
            </Dropdown>
          </Box>

          <Stack
            direction="row"
            useFlexGap
            sx={{ display: { xs: "none", md: "flex" }, mb: 2, gap: 3 }}
          >
            <Dropdown
              labelId="category-filter-label"
              label={t("categoryFilter")}
              labelShrink
              multiple
              value={selectedCategories}
              displayEmpty
              onChange={(event) => onCategoryFilterChange(event.target.value)}
              renderValue={renderSelectedCategoriesValue}
              sx={{ flex: 1, minWidth: 0 }}
            >
              <MenuItem value={CATEGORY_ALL_VALUE}>
                <Checkbox
                  checked={allCategoriesSelected}
                  indeterminate={
                    !allCategoriesSelected && selectedCategories.length > 0
                  }
                />
                <ListItemText primary={t("all")} />
              </MenuItem>
              <MenuItem value={CATEGORY_RETURNS_VALUE}>
                <Checkbox checked={allCategoriesSelected || selectedReturnsOnly} />
                <ListItemText primary={returnsLabel} />
              </MenuItem>
              {categoryOptions.map((category) => (
                <MenuItem key={category} value={category}>
                  <Checkbox
                    checked={
                      allCategoriesSelected ||
                      selectedCategories.includes(category)
                    }
                  />
                  <ListItemText primary={category} />
                </MenuItem>
              ))}
            </Dropdown>

            <Dropdown
              labelId="time-range-label"
              value={timeRange}
              label={t("timeRange")}
              onChange={(event) => setTimeRange(event.target.value)}
              sx={{ flex: 1, minWidth: 170 }}
            >
              <MenuItem value="this_month">{t("thisMonth")}</MenuItem>
              <MenuItem value="custom_range">{t("customRange")}</MenuItem>
              <MenuItem value="all_time">{t("allTime")}</MenuItem>
              {lastSixMonthOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Dropdown>

            <Dropdown
              labelId="sort-by-label"
              value={sortBy}
              label={t("sortBy")}
              onChange={(event) => setSortBy(event.target.value)}
              sx={{ flex: 1, minWidth: 170 }}
            >
              <MenuItem value="date_desc">{t("sortDateNewest")}</MenuItem>
              <MenuItem value="date_asc">{t("sortDateOldest")}</MenuItem>
              <MenuItem value="amount_desc">{t("sortPriceHighToLow")}</MenuItem>
              <MenuItem value="amount_asc">{t("sortPriceLowToHigh")}</MenuItem>
            </Dropdown>

            <Dropdown
              labelId="account-filter-label"
              label={t("accountFilter")}
              labelShrink
              multiple
              displayEmpty
              disabled={!shouldShowAccountFilter}
              value={
                shouldShowAccountFilter
                  ? selectedConnectionIds
                  : hasSingleAccountOption
                    ? [accountFilterOptions[0].id]
                    : []
              }
              onChange={(event) => onAccountFilterChange(event.target.value)}
              renderValue={(selected) => {
                if (!shouldShowAccountFilter) {
                  return singleAccountLabel;
                }

                const values = Array.isArray(selected) ? selected : [];
                if (
                  !values.length ||
                  values.length === accountFilterOptions.length
                ) {
                  return t("allAccounts");
                }

                return values
                  .map(
                    (id) =>
                      accountFilterOptions.find((option) => option.id === id)
                        ?.label || id,
                  )
                  .join(", ");
              }}
              sx={{ flex: 1, minWidth: 0 }}
            >
              {!shouldShowAccountFilter ? (
                <MenuItem disabled value="">
                  <ListItemText primary={singleAccountLabel} />
                </MenuItem>
              ) : (
                accountFilterOptions.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    <Checkbox
                      checked={selectedConnectionIds.includes(option.id)}
                    />
                    <ListItemText primary={option.label} />
                  </MenuItem>
                ))
              )}
            </Dropdown>
          </Stack>
          <Box
            sx={{
              mb: 2,
              px: { xs: 0.5, sm: 1 },
              width: "80%",
              mx: "auto",
            }}
          >
            <Typography
              variant="body2"
              color="text.primary"
              sx={{ mb: 1, textAlign: "center" }}
            >
              {t("amountRange")}:{" "}
              <Box
                component="span"
                sx={{ direction: "ltr", unicodeBidi: "isolate" }}
              >
                {Math.round(selectedAmountRange[0])}₪ -{" "}
                {Math.round(selectedAmountRange[1])}₪
              </Box>
            </Typography>
            <ThemeProvider theme={ltrSliderTheme}>
              <Slider
                value={selectedAmountRange}
                min={0}
                max={maxExpenseAmount}
                step={1}
                disableSwap
                onChange={(_, newValue) => {
                  const nextRange = Array.isArray(newValue)
                    ? newValue
                    : [0, maxExpenseAmount];
                  setSelectedAmountRange(nextRange);
                }}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${Math.round(Number(value))}₪`}
                sx={{ direction: "ltr" }}
              />
            </ThemeProvider>
          </Box>
          {timeRange === "custom_range" && (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              useFlexGap
              sx={{ mb: 2, gap: 2 }}
            >
              <TextField
                id="custom-start-date"
                type="date"
                label={t("startDate")}
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                id="custom-end-date"
                type="date"
                label={t("endDate")}
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
          )}
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
          <List disablePadding ref={listContainerRef}>
            {isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
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
              : (
                <>
                  {topSpacerHeight > 0 && <Box sx={{ height: topSpacerHeight }} />}
                  {visibleExpenses.map((exp) => (
                  <ExpenseItem
                    key={exp._id}
                    exp={exp}
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
