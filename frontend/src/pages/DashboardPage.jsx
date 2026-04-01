import {
  Box,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItemText,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import NumberFlow from "@number-flow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import ExpenseItem from "../components/ExpenseItem";
import { useLanguage } from "../context/LanguageContext";
import { useExpenseBackgroundRefresh } from "../hooks/useExpenseBackgroundRefresh";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTwoDigit(date) {
  const day = String(date.getDate());
  const month = String(date.getMonth() + 1).padStart(2, "0");
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

export default function DashboardPage() {
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingExpenses, setIsSyncingExpenses] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [bankConnections, setBankConnections] = useState([]);
  const [providerLabels, setProviderLabels] = useState({});
  const [selectedConnectionIds, setSelectedConnectionIds] = useState([]);
  const [timeRange, setTimeRange] = useState("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [animatedTotalAmount, setAnimatedTotalAmount] = useState(0);
  const { t, locale, direction } = useLanguage();
  const dropdownMenuColorProps = {
    panelBackground: "#2f3a24", // Background of the dropdown options list window.
    panelText: "#ffffff", // Text color for every option label.
    selectedOptionBackground: "rgba(255, 255, 255, 0.14)", // Background of the currently selected option row.
    selectedOptionText: "#ffffff", // Text color of the currently selected option.
    optionHoverBackground: "rgba(255, 255, 255, 0.1)", // Background when hovering an option row.
  };

  const selectMenuProps = {
    disableScrollLock: true,
    PaperProps: {
      sx: {
        bgcolor: dropdownMenuColorProps.panelBackground,
        color: dropdownMenuColorProps.panelText,
        "& .MuiMenuItem-root": {
          color: dropdownMenuColorProps.panelText,
          "&:hover": {
            bgcolor: dropdownMenuColorProps.optionHoverBackground,
          },
          "&.Mui-selected": {
            bgcolor: dropdownMenuColorProps.selectedOptionBackground,
            color: dropdownMenuColorProps.selectedOptionText,
          },
          "&.Mui-selected:hover": {
            bgcolor: dropdownMenuColorProps.selectedOptionBackground,
          },
        },
      },
    },
  };

  const loadExpenses = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api("/expenses");
      setExpenses(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadBankFilterOptions = useCallback(async () => {
    try {
      const [statusData, providersData] = await Promise.all([
        api("/bank/credentials"),
        api("/bank/providers"),
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
    loadExpenses().catch(console.error);
  }, [loadExpenses]);

  useEffect(() => {
    loadBankFilterOptions().catch(console.error);
  }, [loadBankFilterOptions]);

  const onSyncRunningChange = useCallback((running) => {
    setIsSyncingExpenses(Boolean(running));
  }, []);
  useExpenseBackgroundRefresh(loadExpenses, onSyncRunningChange);

  const onExpenseUpdated = useCallback((updatedExpense) => {
    if (!updatedExpense?._id) return;
    setExpenses((prev) =>
      prev.map((item) =>
        item._id === updatedExpense._id ? { ...item, ...updatedExpense } : item,
      ),
    );
  }, []);

  function toggleExpanded(expenseId) {
    setExpandedIds((prev) => ({
      ...prev,
      [expenseId]: !prev[expenseId],
    }));
  }

  function matchesTimeRange(dateValue, selectedRange) {
    if (!dateValue) return false;
    if (selectedRange === "all_time") return true;

    const expenseDate = new Date(dateValue);
    const now = new Date();

    if (selectedRange === "last_7_days") {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return expenseDate >= from && expenseDate <= now;
    }

    if (selectedRange === "last_30_days") {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return expenseDate >= from && expenseDate <= now;
    }

    if (selectedRange === "last_month") {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );
      return expenseDate >= from && expenseDate <= to;
    }

    if (selectedRange === "custom_range") {
      if (!customStartDate || !customEndDate) return false;
      const from = new Date(`${customStartDate}T00:00:00`);
      const to = new Date(`${customEndDate}T23:59:59.999`);
      return expenseDate >= from && expenseDate <= to;
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

      const sourceConnectionKey = String(expense.sourceConnectionKey || "").trim();
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
  const shouldApplyAccountFilter =
    shouldShowAccountFilter &&
    selectedConnectionIds.length > 0 &&
    selectedConnectionIds.length < accountFilterOptions.length;

  useEffect(() => {
    const allAccountIds = accountFilterOptions.map((option) => option.id);
    setSelectedConnectionIds((prevSelected) => {
      if (allAccountIds.length <= 1) return allAccountIds;
      if (!prevSelected.length) return allAccountIds;

      const retained = prevSelected.filter((id) => allAccountIds.includes(id));
      return retained.length ? retained : allAccountIds;
    });
  }, [accountFilterOptions]);

  function onAccountFilterChange(nextValues) {
    const values = Array.isArray(nextValues) ? nextValues : [];
    if (!values.length) {
      setSelectedConnectionIds(accountFilterOptions.map((option) => option.id));
      return;
    }
    setSelectedConnectionIds(values);
  }

  const displayedExpenses = useMemo(() => {
    const filtered = expenses.filter((exp) => {
      if (!matchesTimeRange(exp.date, timeRange)) return false;
      const normalizedCategory = String(exp.category || "").trim();
      if (
        selectedCategories.length &&
        !selectedCategories.includes(normalizedCategory)
      ) {
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
        return Number(a.amount || 0) - Number(b.amount || 0);
      }
      if (sortBy === "amount_asc") {
        return Number(b.amount || 0) - Number(a.amount || 0);
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [
    customEndDate,
    customStartDate,
    expenses,
    accountFilterOptions,
    selectedCategories,
    selectedConnectionIds,
    sortBy,
    shouldApplyAccountFilter,
    timeRange,
  ]);

  const displayedAmountTotal = useMemo(
    () =>
      displayedExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0,
      ),
    [displayedExpenses],
  );

  useEffect(() => {
    setAnimatedTotalAmount(0);
    const nextFrame = requestAnimationFrame(() => {
      setAnimatedTotalAmount(displayedAmountTotal);
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

    if (timeRange === "last_month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return formatDisplayedRange(start, end);
    }

    if (timeRange === "last_7_days") {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return formatDisplayedRange(start, now);
    }

    if (timeRange === "last_30_days") {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return formatDisplayedRange(start, now);
    }

    if (timeRange === "custom_range") {
      if (!customStartDate || !customEndDate) return "- - -";
      const start = new Date(`${customStartDate}T00:00:00`);
      const end = new Date(`${customEndDate}T23:59:59.999`);
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
          <Box
            component="span"
            sx={{
              display: "inline-block",
              fontWeight: 400,
              color: "#5b6c43",
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
                duration: 450,
                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
              spinTiming={{
                duration: 450,
                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
              opacityTiming={{
                duration: 300,
                easing: "ease-out",
              }}
            />
          </Box>
        </Box>
      </Typography>
      <Card sx={{ border: "none !important" }}>
        <CardContent
          sx={{
            px: { xs: 1, sm: 3 },
            py: { xs: 1, sm: 3 },
          }}
        >
          <Typography variant="h5" gutterBottom>
            {t("allExpenses")}
          </Typography>
          {isSyncingExpenses && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ mb: 2, color: "text.secondary" }}
            >
              <CircularProgress size={18} thickness={5} />
              <Typography variant="body2">
                {loadingBankNames
                  ? `${t("loadingBankExpensesPrefix")} ${loadingBankNames} ${t("loadingBankExpensesSuffix")}`
                  : t("loadingBankExpensesDefault")}
              </Typography>
            </Stack>
          )}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            useFlexGap
            sx={{ mb: 2, gap: 2 }}
          >
            <FormControl fullWidth sx={{ flex: { sm: 1 }, minWidth: 0 }}>
              <InputLabel id="category-filter-label">
                {t("categoryFilter")}
              </InputLabel>
              <Select
                labelId="category-filter-label"
                multiple
                value={selectedCategories}
                label={t("categoryFilter")}
                onChange={(event) => setSelectedCategories(event.target.value)}
                MenuProps={selectMenuProps}
                renderValue={(selected) =>
                  selected.length ? selected.join(", ") : t("allCategories")
                }
              >
                {categoryOptions.map((category) => (
                  <MenuItem key={category} value={category}>
                    <Checkbox checked={selectedCategories.includes(category)} />
                    <ListItemText primary={category} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack
              direction="row"
              useFlexGap
              sx={{
                flex: { sm: 1.2 },
                flexWrap: { xs: "wrap", sm: "nowrap" },
                gap: 2,
                minWidth: 0,
              }}
            >
              <FormControl sx={{ flex: 1, minWidth: { sm: 170, md: 0 } }}>
                <InputLabel id="time-range-label">{t("timeRange")}</InputLabel>
                <Select
                  labelId="time-range-label"
                  value={timeRange}
                  label={t("timeRange")}
                  onChange={(event) => setTimeRange(event.target.value)}
                  MenuProps={selectMenuProps}
                >
                  <MenuItem value="this_month">{t("thisMonth")}</MenuItem>
                  <MenuItem value="last_month">{t("lastMonth")}</MenuItem>
                  <MenuItem value="last_7_days">{t("last7Days")}</MenuItem>
                  <MenuItem value="last_30_days">{t("last30Days")}</MenuItem>
                  <MenuItem value="custom_range">{t("customRange")}</MenuItem>
                  <MenuItem value="all_time">{t("allTime")}</MenuItem>
                </Select>
              </FormControl>

              <FormControl sx={{ flex: 1, minWidth: { sm: 170, md: 0 } }}>
                <InputLabel id="sort-by-label">{t("sortBy")}</InputLabel>
                <Select
                  labelId="sort-by-label"
                  value={sortBy}
                  label={t("sortBy")}
                  onChange={(event) => setSortBy(event.target.value)}
                  MenuProps={selectMenuProps}
                >
                  <MenuItem value="date_desc">{t("sortDateNewest")}</MenuItem>
                  <MenuItem value="date_asc">{t("sortDateOldest")}</MenuItem>
                  <MenuItem value="amount_desc">
                    {t("sortPriceHighToLow")}
                  </MenuItem>
                  <MenuItem value="amount_asc">
                    {t("sortPriceLowToHigh")}
                  </MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {shouldShowAccountFilter && (
              <FormControl fullWidth sx={{ flex: { sm: 1 }, minWidth: 0 }}>
                <InputLabel id="account-filter-label">
                  {t("accountFilter")}
                </InputLabel>
                <Select
                  labelId="account-filter-label"
                  multiple
                  value={selectedConnectionIds}
                  label={t("accountFilter")}
                  onChange={(event) =>
                    onAccountFilterChange(event.target.value)
                  }
                  MenuProps={selectMenuProps}
                  renderValue={(selected) => {
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
                          accountFilterOptions.find(
                            (option) => option.id === id,
                          )?.label || id,
                      )
                      .join(", ");
                  }}
                >
                  {accountFilterOptions.map((option) => (
                    <MenuItem key={option.id} value={option.id}>
                      <Checkbox
                        checked={selectedConnectionIds.includes(option.id)}
                      />
                      <ListItemText primary={option.label} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>
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
          {!isLoading && bankConnections.length === 0 && (
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
          <List disablePadding>
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
              : displayedExpenses.map((exp, index) => (
                  <ExpenseItem
                    key={exp._id}
                    exp={exp}
                    isExpanded={Boolean(expandedIds[exp._id])}
                    onToggleExpanded={toggleExpanded}
                    onExpenseUpdated={onExpenseUpdated}
                    isLast={index === displayedExpenses.length - 1}
                    direction={direction}
                    locale={locale}
                    t={t}
                  />
                ))}
          </List>
        </CardContent>
      </Card>
    </>
  );
}
