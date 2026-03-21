import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
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

export default function ExpensesPage() {
  const { t, locale, direction } = useLanguage();
  const [expenses, setExpenses] = useState([]);
  const defaultCategory = t("general");
  const [form, setForm] = useState({
    date: "",
    amount: "",
    description: "",
    category: defaultCategory,
  });

  const load = useCallback(async () => {
    const data = await api("/expenses");
    setExpenses(data);
  }, []);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useExpenseBackgroundRefresh(load);

  async function createExpense(e) {
    e.preventDefault();
    await api("/expenses", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
      }),
    });
    setForm({ date: "", amount: "", description: "", category: defaultCategory });
    load();
  }

  async function markReviewed(id, current) {
    await api(`/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify({ isReviewed: !current }),
    });
    load();
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {t("addExpense")}
          </Typography>
          <Box component="form" onSubmit={createExpense}>
            <Stack spacing={2}>
              <TextField
            type="date"
            label={t("date")}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
              <TextField
            label={t("amount")}
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            fullWidth
          />
              <TextField
            label={t("description")}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            fullWidth
          />
              <TextField
            label={t("category")}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            fullWidth
          />
                <Button type="submit" variant="contained">
                {t("save")}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {t("expenses")}
          </Typography>
          <List disablePadding>
            {expenses.map((exp, index) => (
              <Box key={exp._id}>
                <ListItem
                  disableGutters
                  sx={{
                    "& .MuiListItemSecondaryAction-root": {
                      right: direction === "rtl" ? "auto" : 16,
                      left: direction === "rtl" ? 16 : "auto",
                    },
                  }}
                  secondaryAction={
                    <Button
                      onClick={() => markReviewed(exp._id, exp.isReviewed)}
                      variant={exp.isReviewed ? "outlined" : "contained"}
                      size="small"
                    >
                      {exp.isReviewed ? t("reviewed") : t("markReviewed")}
                    </Button>
                  }
                >
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
                        <Box dir={direction} sx={{ textAlign: direction === "rtl" ? "right" : "left" }}>
                          {new Date(exp.date).toLocaleDateString(locale)} · {exp.category}
                          <br />
                          <Box
                            component="span"
                            sx={{ direction: "ltr", unicodeBidi: "isolate", display: "inline-block" }}
                          >
                            {exp.amount} {exp.currency}
                          </Box>
                          <br />
                          {detailLine(t("merchant"), exp.merchant)}
                        <br />
                        {detailLine(t("reviewed"), exp.isReviewed ? t("yes") : t("no"))}
                        <br />
                        {detailLine(t("tags"), Array.isArray(exp.tags) && exp.tags.length ? exp.tags.join(", ") : "")}
                        <br />
                        {detailLine(t("notes"), exp.notes)}
                        <br />
                        {detailLine(t("created"), formatDateTime(exp.createdAt, locale))}
                        <br />
                        {detailLine(t("updated"), formatDateTime(exp.updatedAt, locale))}
                      </Box>
                    }
                  />
                </ListItem>
                {index < expenses.length - 1 && <Divider />}
              </Box>
            ))}
          </List>
        </CardContent>
      </Card>
    </Stack>
  );
}
