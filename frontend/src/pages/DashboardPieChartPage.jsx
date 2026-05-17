import DonutLargeRoundedIcon from "@mui/icons-material/DonutLargeRounded";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  CircularProgress,
  List,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ArcElement, Chart, Legend, PieController, Tooltip } from "chart.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardFilters from "../components/DashboardFilters";
import MinimalExpenseItem from "../components/MinimalExpenseItem";
import { useAuth } from "../context/AuthContext";
import { useDashboardFilters } from "../context/DashboardFiltersContext";
import { useLanguage } from "../context/LanguageContext";
import {
  getBankCredentialStatus,
  getBankProviders,
} from "../services/bankService";
import { getExpenses } from "../services/expenseService";

Chart.register(PieController, ArcElement, Tooltip, Legend);

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

function getPieColor(index) {
  const hue = (index * 67) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

const alwaysVisiblePieLabelsPlugin = {
  id: "alwaysVisiblePieLabels",
  afterDatasetsDraw(chart, _args, pluginOptions) {
    if (!pluginOptions?.enabled) return;
    const dataset = chart.data?.datasets?.[0];
    const labels = chart.data?.labels || [];
    const meta = chart.getDatasetMeta(0);
    if (!dataset || !meta?.data?.length) return;

    const values = Array.isArray(dataset.data) ? dataset.data : [];
    const total = values.reduce(
      (sum, value) => sum + Math.max(0, Number(value || 0)),
      0,
    );
    if (!total) return;

    const ctx = chart.ctx;
    ctx.save();
    ctx.font = "600 11px Inter, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    meta.data.forEach((arc, index) => {
      const rawValue = Number(values[index] || 0);
      if (!Number.isFinite(rawValue) || rawValue <= 0) return;
      const ratio = rawValue / total;
      if (ratio < 0.025) return;

      const angle = (arc.startAngle + arc.endAngle) / 2;
      const angleSpan = Math.max(0, arc.endAngle - arc.startAngle);
      const radius = arc.outerRadius * 0.66;
      const category = String(labels[index] || "").trim() || "-";
      const percentage = `${Math.round(ratio * 100)}%`;
      let categoryText = category;
      const maxCategoryChars = 24;
      if (categoryText.length > maxCategoryChars) {
        categoryText = `${categoryText.slice(0, maxCategoryChars)}…`;
      }

      const percentageWidth = ctx.measureText(percentage).width;
      const categoryWidth = ctx.measureText(categoryText).width;
      const textWidth = Math.max(percentageWidth, categoryWidth);
      const availableArcLength = angleSpan * radius;
      if (availableArcLength < textWidth + 8) return;

      const x = arc.x + Math.cos(angle) * radius;
      const y = arc.y + Math.sin(angle) * radius;

      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 3;
      ctx.strokeText(categoryText, x, y - 7);
      ctx.strokeText(percentage, x, y + 7);
      ctx.fillStyle = "rgba(255,255,255,0.98)";
      ctx.fillText(categoryText, x, y - 7);
      ctx.fillText(percentage, x, y + 7);
    });

    ctx.restore();
  },
};

export default function DashboardPieChartPage() {
  const { t, locale, direction } = useLanguage();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const previousDropdownFiltersSignatureRef = useRef("");
  const didInitializeAccountFilterSelectionRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [bankConnections, setBankConnections] = useState([]);
  const [providerLabels, setProviderLabels] = useState({});
  const [expandedLegendCategories, setExpandedLegendCategories] = useState({});
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
          typeof value === "function"
            ? value(prev.selectedConnectionIds)
            : value,
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
        if (!Number.isFinite(year) || !Number.isFinite(monthIndex))
          return false;
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
  const hasMultipleSelectedAccounts = selectedConnectionIds.length > 1;

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
    if (
      previousDropdownFiltersSignatureRef.current === dropdownFiltersSignature
    ) {
      return;
    }
    previousDropdownFiltersSignatureRef.current = dropdownFiltersSignature;
    setSelectedAmountRange([minExpenseAmount, maxExpenseAmount]);
  }, [
    dropdownFiltersSignature,
    maxExpenseAmount,
    minExpenseAmount,
    setSelectedAmountRange,
  ]);

  useEffect(() => {
    const safeMin = Math.max(0, Number(minExpenseAmount || 0));
    const safeMax = Math.max(0, Number(maxExpenseAmount || 0));
    setSelectedAmountRange((prev) => {
      const prevMin = Number(prev?.[0] || 0);
      const prevMax = Number(prev?.[1] || 0);

      if (prevMin === 0 && prevMax === 0) return [safeMin, safeMax];

      const nextMin = Math.min(Math.max(safeMin, prevMin), safeMax);
      const nextMax = Math.min(Math.max(nextMin, prevMax), safeMax);
      if (nextMin === prevMin && nextMax === prevMax) return prev;
      return [nextMin, nextMax];
    });
  }, [maxExpenseAmount, minExpenseAmount, setSelectedAmountRange]);

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
  }, [
    accountFilterOptions,
    setSelectedConnectionIds,
    user?.defaultSelectedBankConnectionIds,
  ]);

  const displayedExpenses = useMemo(
    () =>
      expensesMatchingBaseFilters.filter((exp) => {
        const amount = Math.abs(Number(exp.amount || 0));
        return (
          amount >= selectedAmountRange[0] && amount <= selectedAmountRange[1]
        );
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
  const pieSeries = useMemo(() => {
    const totalsByCategory = new Map();

    displayedExpenses.forEach((expense) => {
      const amount = Math.abs(Number(expense?.amount || 0));
      if (!Number.isFinite(amount) || amount <= 0) return;
      const category = String(expense?.category || "").trim() || "-";
      totalsByCategory.set(
        category,
        (totalsByCategory.get(category) || 0) + amount,
      );
    });

    return Array.from(totalsByCategory.entries())
      .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [displayedExpenses]);
  const pieDetails = useMemo(() => {
    const total = pieSeries.reduce(
      (sum, item) => sum + Math.max(0, Number(item.value || 0)),
      0,
    );
    if (!total) return [];
    return pieSeries.map((item, index) => ({
      ...item,
      color: getPieColor(index),
      percentage: (item.value / total) * 100,
    }));
  }, [pieSeries]);
  const expensesByCategory = useMemo(() => {
    const grouped = new Map();
    displayedExpenses.forEach((expense) => {
      const category = String(expense?.category || "").trim() || "-";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(expense);
    });

    for (const [category, items] of grouped.entries()) {
      grouped.set(
        category,
        [...items].sort(
          (a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime(),
        ),
      );
    }

    return grouped;
  }, [displayedExpenses]);
  const legendItems = useMemo(
    () =>
      pieDetails.map((item) => ({
        ...item,
        expenses: expensesByCategory.get(item.label) || [],
      })),
    [expensesByCategory, pieDetails],
  );
  const chartCurrency = displayedExpenses[0]?.currency || "₪";

  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    if (!pieSeries.length) return;

    chartInstanceRef.current = new Chart(canvas, {
      type: "pie",
      plugins: [alwaysVisiblePieLabelsPlugin],
      data: {
        labels: pieSeries.map((item) => item.label),
        datasets: [
          {
            data: pieSeries.map((item) => item.value),
            backgroundColor: pieSeries.map((_, index) => getPieColor(index)),
            borderColor: "rgba(255, 255, 255, 0.9)",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false,
            position: "bottom",
          },
          alwaysVisiblePieLabels: {
            enabled: isMobile,
          },
          tooltip: {
            enabled: !isMobile,
            callbacks: {
              label: (context) =>
                `${context.label}: ${chartCurrency}${Number(context.raw || 0).toFixed(2)}`,
            },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [chartCurrency, isMobile, pieSeries]);

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

  function toggleLegendCategory(categoryLabel) {
    const categoryKey = String(categoryLabel || "").trim();
    if (!categoryKey) return;
    setExpandedLegendCategories((prev) => ({
      ...prev,
      [categoryKey]: !prev[categoryKey],
    }));
  }

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
            <DonutLargeRoundedIcon fontSize="small" />
            <Typography variant="subtitle1" dir={direction}>
              {t("summaryDates")}: {displayedDateRange}
            </Typography>
          </Stack>
        </Box>

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={26} thickness={5} />
          </Box>
        ) : pieSeries.length === 0 ? (
          <Typography variant="body2" color="text.secondary" dir={direction}>
            {t("allExpenses")}: 0
          </Typography>
        ) : (
          <>
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <Box sx={{ width: "70%", minWidth: 280, maxWidth: 280 }}>
                <canvas ref={chartCanvasRef} />
              </Box>
            </Box>
            <Box sx={{ mt: 1.5 }}>
                {legendItems.map((item) => {
                  const categoryKey = String(item?.label || "").trim();
                  const categoryExpenses = Array.isArray(item?.expenses)
                    ? item.expenses
                    : [];
                  const isExpanded = Boolean(expandedLegendCategories[categoryKey]);
                  return (
                  <Stack
                    key={item.label}
                    sx={{
                      py: 0.5,
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          flex: "0 0 auto",
                          bgcolor: item.color,
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}
                        dir={direction}
                      >
                        {item.label}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
                        {item.percentage.toFixed(1)}%
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ whiteSpace: "nowrap", fontWeight: 700 }}
                      >
                        {chartCurrency}
                        {Math.round(item.value)}
                      </Typography>
                    </Stack>
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => toggleLegendCategory(categoryKey)}
                        endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      >
                        {isExpanded ? t("hideDetails") : t("showDetails")}
                      </Button>
                    </Box>
                    <Collapse in={isExpanded}>
                      <List disablePadding>
                        {categoryExpenses.map((expense) => {
                          return (
                            <MinimalExpenseItem
                              key={`${categoryKey}:${String(expense?._id || "")}`}
                              exp={expense}
                              showSourceAccountIdAfterCategory={
                                hasMultipleSelectedAccounts
                              }
                              direction={direction}
                              t={t}
                            />
                          );
                        })}
                      </List>
                    </Collapse>
                  </Stack>
                  );
                })}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}
