import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardFilters from "../components/DashboardFilters";
import { useAuth } from "../context/AuthContext";
import { useDashboardFilters } from "../context/DashboardFiltersContext";
import { useLanguage } from "../context/LanguageContext";
import {
  getBankCredentialStatus,
  getBankProviders,
} from "../services/bankService";
import { getExpenses } from "../services/expenseService";

Chart.register(
  BarController,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
);

const CATEGORY_ALL_VALUE = "__all_categories__";
const CATEGORY_RETURNS_VALUE = "__returns_only__";

function getMonthRange(year, monthIndex) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function isReturnExpense(expense) {
  const transactionType = String(expense?.transactionType || "")
    .trim()
    .toLowerCase();
  const amount = Number(expense?.amount || 0);
  return transactionType === "return" || amount < 0;
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

function toLocalDateKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeBucketKey(date, grouping) {
  const safeDate = new Date(date);
  if (Number.isNaN(safeDate.getTime())) return null;

  if (grouping === "weeks") {
    const weekStart = new Date(safeDate);
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);
    const localKey = toLocalDateKey(weekStart);
    return localKey ? `w_${localKey}` : null;
  }

  if (grouping === "months") {
    const year = safeDate.getFullYear();
    const month = String(safeDate.getMonth() + 1).padStart(2, "0");
    return `m_${year}-${month}`;
  }

  const localKey = toLocalDateKey(safeDate);
  return localKey ? `d_${localKey}` : null;
}

function formatBucketLabel(bucketKey, grouping, locale, rangeEndDate) {
  if (!bucketKey) return "";
  const raw = bucketKey.slice(2);

  if (grouping === "weeks") {
    const start = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(start.getTime())) return raw;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const safeRangeEnd = new Date(rangeEndDate || "");
    if (!Number.isNaN(safeRangeEnd.getTime()) && safeRangeEnd < end) {
      end.setTime(safeRangeEnd.getTime());
    }
    const formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  }

  if (grouping === "months") {
    const [year, month] = raw.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "numeric",
    }).format(date);
  }

  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getSelectedRangeBounds({
  timeRange,
  customStartDate,
  customEndDate,
  referenceExpenses,
}) {
  const now = new Date();

  if (timeRange === "custom_range") {
    if (!customStartDate || !customEndDate) return null;
    const start = new Date(`${customStartDate}T00:00:00`);
    const end = new Date(`${customEndDate}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { start, end };
  }

  if (timeRange.startsWith("month_")) {
    const [, yearPart, monthPart] = timeRange.split("_");
    const year = Number(yearPart);
    const monthIndex = Number(monthPart) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
    return getMonthRange(year, monthIndex);
  }

  if (timeRange === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    return { start, end };
  }

  if (timeRange === "all_time") {
    const timestamps = (Array.isArray(referenceExpenses) ? referenceExpenses : [])
      .map((expense) => new Date(expense?.date).getTime())
      .filter((value) => Number.isFinite(value));
    if (!timestamps.length) return null;
    const minDate = new Date(Math.min(...timestamps));
    const maxDate = new Date(Math.max(...timestamps));
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);
    return { start: minDate, end: maxDate };
  }

  return null;
}

function getDayKeysBetween(start, end) {
  if (!start || !end) return [];
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return [];
  }

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  const keys = [];
  while (cursor <= endDay) {
    const localKey = toLocalDateKey(cursor);
    if (localKey) keys.push(`d_${localKey}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function getWeekKeysBetween(start, end) {
  if (!start || !end) return [];
  const safeStart = new Date(start);
  const safeEnd = new Date(end);
  if (
    Number.isNaN(safeStart.getTime()) ||
    Number.isNaN(safeEnd.getTime()) ||
    safeStart > safeEnd
  ) {
    return [];
  }

  const weekStart = new Date(safeStart);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);

  const keys = [];
  while (weekStart <= safeEnd) {
    const localKey = toLocalDateKey(weekStart);
    if (localKey) keys.push(`w_${localKey}`);
    weekStart.setDate(weekStart.getDate() + 7);
  }
  return keys;
}

const alwaysVisibleLabelsPlugin = {
  id: "alwaysVisibleLabels",
  afterDatasetsDraw(chart) {
    const {
      ctx,
      data,
      chartArea: { top },
    } = chart;
    const meta = chart.getDatasetMeta(0);
    const dataset = data.datasets?.[0];
    if (!meta || !dataset) return;

    ctx.save();
    ctx.fillStyle = "#1f2937";
    ctx.font = "600 11px Inter, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    meta.data.forEach((bar, index) => {
      const value = Number(dataset.data[index] || 0);
      if (value === 0) return;
      const y = Math.max(bar.y - 6, top + 12);
      ctx.fillText(`₪${Math.round(value)}`, bar.x, y);
    });

    ctx.restore();
  },
};

export default function DashboardChartsPage() {
  const { t, locale, direction } = useLanguage();
  const { user } = useAuth();
  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const previousDropdownFiltersSignatureRef = useRef("");
  const didInitializeAccountFilterSelectionRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [bankConnections, setBankConnections] = useState([]);
  const [providerLabels, setProviderLabels] = useState({});
  const [chartGrouping, setChartGrouping] = useState("days");
  const { filters, setFilters } = useDashboardFilters();
  const {
    selectedCategories,
    selectedConnectionIds,
    timeRange,
    customStartDate,
    customEndDate,
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
  const setSelectedAmountRange = useCallback(
    (value) =>
      setFilters((prev) => ({
        ...prev,
        selectedAmountRange:
          typeof value === "function" ? value(prev.selectedAmountRange) : value,
      })),
    [setFilters],
  );

  const matchesTimeRange = useCallback(
    (dateValue, selectedRange) => {
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
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );
      return expenseDate >= from && expenseDate <= to;
    },
    [customEndDate, customStartDate],
  );

  useEffect(() => {
    let active = true;

    async function loadData() {
      setIsLoading(true);
      try {
        const [expensesData, statusData, providersData] = await Promise.all([
          getExpenses(),
          getBankCredentialStatus(),
          getBankProviders(),
        ]);

        if (!active) return;
        setExpenses(Array.isArray(expensesData) ? expensesData : []);

        const connections = Array.isArray(statusData?.connections)
          ? statusData.connections.filter((connection) =>
              String(connection?.id || "").trim(),
            )
          : [];
        setBankConnections(connections);

        const providers = Array.isArray(providersData?.providers)
          ? providersData.providers
          : [];
        setProviderLabels(
          Object.fromEntries(
            providers.map((provider) => [
              provider.companyId,
              provider.label || provider.companyId,
            ]),
          ),
        );
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadData().catch(() => setIsLoading(false));
    return () => {
      active = false;
    };
  }, []);

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

  const shouldShowAccountFilter = accountFilterOptions.length > 1;
  const hasSingleAccountOption = accountFilterOptions.length === 1;
  const singleAccountLabel = hasSingleAccountOption
    ? accountFilterOptions[0]?.label || t("allAccounts")
    : t("allAccounts");

  const shouldApplyAccountFilter =
    shouldShowAccountFilter &&
    selectedConnectionIds.length > 0 &&
    selectedConnectionIds.length < accountFilterOptions.length;

  const dropdownFiltersSignature = useMemo(() => {
    const accountSignature = shouldApplyAccountFilter
      ? [...selectedConnectionIds].sort().join("|")
      : "__all__";
    const categorySignature = [...selectedCategories].sort().join("|");
    return [
      `categories:${categorySignature}`,
      `timeRange:${timeRange}`,
      `accounts:${accountSignature}`,
    ].join(";");
  }, [
    selectedCategories,
    selectedConnectionIds,
    shouldApplyAccountFilter,
    timeRange,
  ]);

  const expensesMatchingBaseFilters = useMemo(
    () =>
      expenses.filter((exp) => {
        if (!matchesTimeRange(exp.date, timeRange)) return false;

        if (selectedReturnsOnly && !isReturnExpense(exp)) return false;

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
      expenses,
      matchesTimeRange,
      selectedConnectionIds,
      selectedRegularCategories,
      selectedReturnsOnly,
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

  const displayedExpenses = useMemo(
    () =>
      expensesMatchingBaseFilters.filter((exp) => {
        const amount = Math.abs(Number(exp.amount || 0));
        return amount >= selectedAmountRange[0] && amount <= selectedAmountRange[1];
      }),
    [expensesMatchingBaseFilters, selectedAmountRange],
  );
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

  const chartSeries = useMemo(() => {
    const buckets = new Map();

    displayedExpenses.forEach((expense) => {
      const key = makeBucketKey(expense.date, chartGrouping);
      if (!key) return;
      const absoluteAmount = Math.abs(Number(expense.amount || 0));
      if (!Number.isFinite(absoluteAmount)) return;
      const signedAmount = isReturnExpense(expense) ? -absoluteAmount : absoluteAmount;
      buckets.set(key, (buckets.get(key) || 0) + signedAmount);
    });

    const orderedEntries = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        key,
        label: formatBucketLabel(key, chartGrouping, locale),
        value: Number(value.toFixed(2)),
      }));

    const bounds = getSelectedRangeBounds({
      timeRange,
      customStartDate,
      customEndDate,
      referenceExpenses: expensesMatchingBaseFilters,
    });
    if (!bounds) return orderedEntries;

    const valuesByKey = new Map(orderedEntries.map((item) => [item.key, item.value]));

    if (chartGrouping === "days") {
      const dayKeys = getDayKeysBetween(bounds.start, bounds.end);
      return dayKeys.map((key) => ({
        key,
        label: formatBucketLabel(key, "days", locale),
        value: Number((valuesByKey.get(key) || 0).toFixed(2)),
      }));
    }

    if (chartGrouping === "weeks") {
      const weekKeys = getWeekKeysBetween(bounds.start, bounds.end);
      return weekKeys.map((key) => ({
        key,
        label: formatBucketLabel(key, "weeks", locale, bounds.end),
        value: Number((valuesByKey.get(key) || 0).toFixed(2)),
      }));
    }

    return orderedEntries;
  }, [
    chartGrouping,
    customEndDate,
    customStartDate,
    displayedExpenses,
    expensesMatchingBaseFilters,
    locale,
    timeRange,
  ]);

  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    if (!chartSeries.length) return;

    chartInstanceRef.current = new Chart(canvas, {
      type: "bar",
      plugins: [alwaysVisibleLabelsPlugin],
      data: {
        labels: chartSeries.map((item) => item.label),
        datasets: [
          {
            label: t("amount"),
            data: chartSeries.map((item) => item.value),
            backgroundColor: "rgba(25, 118, 210, 0.65)",
            borderColor: "rgba(25, 118, 210, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [chartSeries, t]);

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

  return (
    <Card sx={{ border: "none !important", borderRadius: "16px" }}>
      <CardContent sx={{ px: { xs: 1, sm: 3 }, py: { xs: 2.5, sm: 3 } }}>
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
          sortBy="date_desc"
          onSortByChange={() => {}}
          showSort={false}
          selectedAmountRange={selectedAmountRange}
          minExpenseAmount={minExpenseAmount}
          maxExpenseAmount={maxExpenseAmount}
          onAmountRangeChange={setSelectedAmountRange}
        />
        <Box sx={{ mb: 2 }}>
          <Stack
            direction="row"
            justifyContent="center"
            flexWrap="nowrap"
            sx={{ gap: "8px" }}
          >
            {["days", "weeks", "months"].map((value) => (
              <Button
                key={value}
                size="small"
                variant={chartGrouping === value ? "contained" : "outlined"}
                onClick={() => setChartGrouping(value)}
              >
                {t(value)}
              </Button>
            ))}
          </Stack>
        </Box>
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
          <Stack direction="row" alignItems="center" spacing={1}>
            <BarChartRoundedIcon fontSize="small" />
            <Typography variant="subtitle1" dir={direction}>
              {t("summaryDates")}: {displayedDateRange}
            </Typography>
          </Stack>
        </Box>

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={26} thickness={5} />
          </Box>
        ) : chartSeries.length === 0 ? (
          <Typography variant="body2" color="text.secondary" dir={direction}>
            {t("allExpenses")}: 0
          </Typography>
        ) : (
          <Box sx={{ height: 380 }}>
            <canvas ref={chartCanvasRef} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
