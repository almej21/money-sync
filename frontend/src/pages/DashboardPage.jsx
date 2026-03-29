import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Collapse,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { useExpenseBackgroundRefresh } from "../hooks/useExpenseBackgroundRefresh";

function formatDateTime(value, locale) {
  if (!value) return "-";
  return new Date(value).toLocaleString(locale);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function detailLine(label, value) {
  return `${label}: ${value || "-"}`;
}

export default function DashboardPage() {
  const [expenses, setExpenses] = useState([]);
  const [expandedIds, setExpandedIds] = useState({});
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [timeRange, setTimeRange] = useState("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const { t, locale, direction } = useLanguage();

  const loadExpenses = useCallback(async () => {
    const data = await api("/expenses");
    setExpenses(data);
  }, []);

  useEffect(() => {
    loadExpenses().catch(console.error);
  }, [loadExpenses]);

  useExpenseBackgroundRefresh(loadExpenses);

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

  const displayedExpenses = useMemo(() => {
    const filtered = expenses.filter((exp) => {
      if (!matchesTimeRange(exp.date, timeRange)) return false;
      if (!selectedCategories.length) return true;
      const normalizedCategory = String(exp.category || "").trim();
      return selectedCategories.includes(normalizedCategory);
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
    selectedCategories,
    sortBy,
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

  const displayedDateRange = useMemo(() => {
    if (!displayedExpenses.length) return "- - -";
    const timestamps = displayedExpenses
      .map((expense) => new Date(expense.date).getTime())
      .filter((value) => Number.isFinite(value));
    if (!timestamps.length) return "- - -";

    const minDate = formatDate(new Date(Math.min(...timestamps)));
    const maxDate = formatDate(new Date(Math.max(...timestamps)));
    return `${minDate} - ${maxDate}`;
  }, [displayedExpenses]);

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          {t("allExpenses")}
        </Typography>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          useFlexGap
          sx={{ mb: 2, gap: 2 }}
        >
          <FormControl fullWidth>
            <InputLabel id="category-filter-label">
              {t("categoryFilter")}
            </InputLabel>
            <Select
              labelId="category-filter-label"
              multiple
              value={selectedCategories}
              label={t("categoryFilter")}
              onChange={(event) => setSelectedCategories(event.target.value)}
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

          <FormControl fullWidth>
            <InputLabel id="time-range-label">{t("timeRange")}</InputLabel>
            <Select
              labelId="time-range-label"
              value={timeRange}
              label={t("timeRange")}
              onChange={(event) => setTimeRange(event.target.value)}
            >
              <MenuItem value="this_month">{t("thisMonth")}</MenuItem>
              <MenuItem value="last_month">{t("lastMonth")}</MenuItem>
              <MenuItem value="last_7_days">{t("last7Days")}</MenuItem>
              <MenuItem value="last_30_days">{t("last30Days")}</MenuItem>
              <MenuItem value="custom_range">{t("customRange")}</MenuItem>
              <MenuItem value="all_time">{t("allTime")}</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="sort-by-label">{t("sortBy")}</InputLabel>
            <Select
              labelId="sort-by-label"
              value={sortBy}
              label={t("sortBy")}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <MenuItem value="date_desc">{t("sortDateNewest")}</MenuItem>
              <MenuItem value="date_asc">{t("sortDateOldest")}</MenuItem>
              <MenuItem value="amount_desc">{t("sortPriceHighToLow")}</MenuItem>
              <MenuItem value="amount_asc">{t("sortPriceLowToHigh")}</MenuItem>
            </Select>
          </FormControl>
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
            direction="column"
            alignItems="flex-start"
            spacing={1}
          >
            <Typography
              variant="subtitle1"
              dir={direction}
              sx={{ textAlign: direction === "rtl" ? "right" : "left" }}
            >
              {t("summaryTotal")}:{" "}
              <Box
                component="span"
                sx={{ direction: "ltr", unicodeBidi: "isolate", display: "inline-block" }}
              >
                {displayedAmountTotal.toFixed(2)} {displayedExpenses[0]?.currency || "₪"}
              </Box>
            </Typography>
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
        <List disablePadding>
          {displayedExpenses.map((exp, index) => (
            <div key={exp._id}>
              <ListItem disableGutters>
                <ListItemText
                  sx={{
                    "& .MuiListItemText-primary, & .MuiListItemText-secondary":
                      {
                        textAlign: direction === "rtl" ? "right" : "left",
                      },
                  }}
                  primaryTypographyProps={{ dir: direction }}
                  secondaryTypographyProps={{
                    component: "div",
                    dir: direction,
                  }}
                  primary={exp.description}
                  secondary={
                    <Box
                      dir={direction}
                      sx={{ textAlign: direction === "rtl" ? "right" : "left" }}
                    >
                      {formatDate(exp.date)} ·{" "}
                      {exp.category || "-"}
                      <br />
                      <Box
                        component="span"
                        sx={{
                          direction: "ltr",
                          unicodeBidi: "isolate",
                          display: "inline-block",
                        }}
                      >
                        {exp.amount} {exp.currency}
                      </Box>
                    </Box>
                  }
                />
              </ListItem>
              <Box sx={{ pb: 1 }}>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => toggleExpanded(exp._id)}
                >
                  {expandedIds[exp._id] ? t("hideDetails") : t("showDetails")}
                </Button>
                <Collapse in={Boolean(expandedIds[exp._id])}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    dir={direction}
                    sx={{ textAlign: direction === "rtl" ? "right" : "left" }}
                  >
                    {detailLine(t("merchant"), exp.merchant)}
                    <br />
                    {detailLine(
                      t("reviewed"),
                      exp.isReviewed ? t("yes") : t("no"),
                    )}
                    <br />
                    {detailLine(
                      t("tags"),
                      Array.isArray(exp.tags) && exp.tags.length
                        ? exp.tags.join(", ")
                        : "",
                    )}
                    <br />
                    {detailLine(t("notes"), exp.notes)}
                    <br />
                    {detailLine(
                      t("created"),
                      formatDateTime(exp.createdAt, locale),
                    )}
                    <br />
                    {detailLine(
                      t("updated"),
                      formatDateTime(exp.updatedAt, locale),
                    )}
                  </Typography>
                </Collapse>
              </Box>
              {index < displayedExpenses.length - 1 && <Divider />}
            </div>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
