import { useMemo } from "react";
import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import DashboardTotalAmount from "../components/DashboardTotalAmount";
import { useAuth } from "../context/AuthContext";
import { useDashboardFilters } from "../context/DashboardFiltersContext";
import { useLanguage } from "../context/LanguageContext";
import { useExpenseBackgroundRefresh } from "../hooks/useExpenseBackgroundRefresh";
import { getExpenses } from "../services/expenseService";

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

function normalizeCurrencyAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

export default function DashboardPage() {
  const location = useLocation();
  const { user } = useAuth();
  const { direction } = useLanguage();
  const { filters } = useDashboardFilters();
  const {
    selectedCategories,
    selectedConnectionIds,
    timeRange,
    customStartDate,
    customEndDate,
    selectedAmountRange,
  } = filters;

  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [animatedTotalAmount, setAnimatedTotalAmount] = useState(0);
  const [committedTotalAmount, setCommittedTotalAmount] = useState(0);
  const [suppressTotalAnimation, setSuppressTotalAnimation] = useState(false);

  const refreshExpenses = useCallback(async () => {
    const data = await getExpenses();
    setExpenses(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      setIsLoading(true);
      try {
        const data = await getExpenses();
        if (!active) return;
        setExpenses(Array.isArray(data) ? data : []);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadData().catch(() => {
      if (active) setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [user?.householdId, user?.id]);

  useExpenseBackgroundRefresh(refreshExpenses, undefined, {
    syncScopeKey: `${String(user?.householdId || "").trim()}:${String(user?.id || "").trim()}`,
  });

  const selectedReturnsOnly = selectedCategories.includes(CATEGORY_RETURNS_VALUE);
  const selectedRegularCategories = selectedCategories.filter(
    (value) => value !== CATEGORY_RETURNS_VALUE,
  );

  const accountIds = useMemo(
    () =>
      Array.from(
        new Set(
          expenses
            .map((expense) => String(expense?.sourceAccountId || "").trim())
            .filter(Boolean),
        ),
      ),
    [expenses],
  );

  const shouldShowAccountFilter = accountIds.length > 1;
  const shouldApplyAccountFilter =
    shouldShowAccountFilter &&
    selectedConnectionIds.length > 0 &&
    selectedConnectionIds.length < accountIds.length;

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

  const shouldApplyAmountRangeFilter = !(
    Number(selectedAmountRange?.[0] || 0) === 0 &&
    Number(selectedAmountRange?.[1] || 0) === 0
  );

  const displayedExpenses = useMemo(
    () =>
      expensesMatchingBaseFilters.filter((exp) => {
        if (!shouldApplyAmountRangeFilter) return true;
        const amount = Math.abs(Number(exp.amount || 0));
        return amount >= selectedAmountRange[0] && amount <= selectedAmountRange[1];
      }),
    [expensesMatchingBaseFilters, selectedAmountRange, shouldApplyAmountRangeFilter],
  );

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
  const normalizedDisplayedAmountTotal = useMemo(
    () => normalizeCurrencyAmount(displayedAmountTotal),
    [displayedAmountTotal],
  );

  useEffect(() => {
    setSuppressTotalAnimation(true);
    const timer = setTimeout(() => {
      setSuppressTotalAnimation(false);
    }, 240);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      setCommittedTotalAmount(normalizedDisplayedAmountTotal);
    }, 160);
    return () => clearTimeout(timer);
  }, [isLoading, normalizedDisplayedAmountTotal]);

  useEffect(() => {
    if (isLoading) return;
    setAnimatedTotalAmount((previousAmount) =>
      previousAmount === committedTotalAmount
        ? previousAmount
        : normalizeCurrencyAmount(committedTotalAmount),
    );
  }, [committedTotalAmount, isLoading]);

  const shouldShowTotalLoading = isLoading;
  const displayedCurrency = displayedExpenses[0]?.currency || "₪";

  return (
    <>
      <DashboardTotalAmount
        direction={direction}
        shouldShowTotalLoading={shouldShowTotalLoading}
        currency={displayedCurrency}
        animatedTotalAmount={animatedTotalAmount}
        suppressAnimation={suppressTotalAnimation}
      />
      <Outlet />
    </>
  );
}
