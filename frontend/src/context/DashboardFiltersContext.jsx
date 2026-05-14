import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "dashboardFilters:v1";

const DEFAULT_FILTERS = {
  selectedCategories: [],
  selectedConnectionIds: [],
  timeRange: "this_month",
  customStartDate: "",
  customEndDate: "",
  selectedAmountRange: [0, 0],
  sortBy: "date_desc",
};

const DashboardFiltersContext = createContext(null);

function sanitizeFilters(value) {
  const next = { ...DEFAULT_FILTERS };
  if (!value || typeof value !== "object") return next;

  if (Array.isArray(value.selectedCategories)) {
    next.selectedCategories = value.selectedCategories;
  }
  if (Array.isArray(value.selectedConnectionIds)) {
    next.selectedConnectionIds = value.selectedConnectionIds;
  }
  if (typeof value.timeRange === "string") {
    next.timeRange = value.timeRange;
  }
  if (typeof value.customStartDate === "string") {
    next.customStartDate = value.customStartDate;
  }
  if (typeof value.customEndDate === "string") {
    next.customEndDate = value.customEndDate;
  }
  if (
    Array.isArray(value.selectedAmountRange) &&
    value.selectedAmountRange.length === 2
  ) {
    next.selectedAmountRange = value.selectedAmountRange;
  }
  if (typeof value.sortBy === "string") {
    next.sortBy = value.sortBy;
  }

  return next;
}

function readInitialFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return sanitizeFilters(JSON.parse(raw));
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function DashboardFiltersProvider({ children }) {
  const [filters, setFilters] = useState(readInitialFilters);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Ignore persistence failures.
    }
  }, [filters]);

  const value = useMemo(
    () => ({
      filters,
      setFilters,
    }),
    [filters],
  );

  return (
    <DashboardFiltersContext.Provider value={value}>
      {children}
    </DashboardFiltersContext.Provider>
  );
}

export function useDashboardFilters() {
  const context = useContext(DashboardFiltersContext);
  if (!context) {
    throw new Error(
      "useDashboardFilters must be used within DashboardFiltersProvider",
    );
  }
  return context;
}

