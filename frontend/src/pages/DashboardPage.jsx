import { useCallback, useEffect, useMemo, useState } from "react";
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
  Typography,
} from "@mui/material";
import { api } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { useExpenseBackgroundRefresh } from "../hooks/useExpenseBackgroundRefresh";

function formatDateTime(value, locale) {
  if (!value) return "-";
  return new Date(value).toLocaleString(locale);
}

function detailLine(label, value) {
  return `${label}: ${value || "-"}`;
}

export default function DashboardPage() {
  const [expenses, setExpenses] = useState([]);
  const [expandedIds, setExpandedIds] = useState({});
  const [selectedCategories, setSelectedCategories] = useState([]);
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

  const categoryOptions = useMemo(() => {
    const values = new Set(
      expenses
        .map((exp) => String(exp.category || "").trim())
        .filter(Boolean),
    );
    return Array.from(values).sort((a, b) => a.localeCompare(b, locale));
  }, [expenses, locale]);

  const displayedExpenses = useMemo(() => {
    const filtered = expenses.filter((exp) => {
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
  }, [expenses, selectedCategories, sortBy]);

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          {t("allExpenses")}
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
          <FormControl fullWidth>
            <InputLabel id="category-filter-label">{t("categoryFilter")}</InputLabel>
            <Select
              labelId="category-filter-label"
              multiple
              value={selectedCategories}
              label={t("categoryFilter")}
              onChange={(event) => setSelectedCategories(event.target.value)}
              renderValue={(selected) => (selected.length ? selected.join(", ") : t("allCategories"))}
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
        <List disablePadding>
          {displayedExpenses.map((exp, index) => (
            <div key={exp._id}>
              <ListItem disableGutters>
                <ListItemText
                  sx={{
                    "& .MuiListItemText-primary, & .MuiListItemText-secondary": {
                      textAlign: direction === "rtl" ? "right" : "left",
                    },
                  }}
                  primaryTypographyProps={{ dir: direction }}
                  secondaryTypographyProps={{ component: "div", dir: direction }}
                  primary={exp.description}
                  secondary={
                    <Box
                      dir={direction}
                      sx={{ textAlign: direction === "rtl" ? "right" : "left" }}
                    >
                      {new Date(exp.date).toLocaleDateString(locale)} · {exp.category || "-"}
                      <br />
                      <Box
                        component="span"
                        sx={{ direction: "ltr", unicodeBidi: "isolate", display: "inline-block" }}
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
                    {detailLine(t("reviewed"), exp.isReviewed ? t("yes") : t("no"))}
                    <br />
                    {detailLine(
                      t("tags"),
                      Array.isArray(exp.tags) && exp.tags.length ? exp.tags.join(", ") : "",
                    )}
                    <br />
                    {detailLine(t("notes"), exp.notes)}
                    <br />
                    {detailLine(t("created"), formatDateTime(exp.createdAt, locale))}
                    <br />
                    {detailLine(t("updated"), formatDateTime(exp.updatedAt, locale))}
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
