import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  Divider,
  List,
  ListItem,
  ListItemText,
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

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          {t("allExpenses")}
        </Typography>
        <List disablePadding>
          {expenses.map((exp, index) => (
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
                      {new Date(exp.date).toLocaleDateString(locale)}
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
              {index < expenses.length - 1 && <Divider />}
            </div>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
