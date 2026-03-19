import { useEffect, useState } from "react";
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

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function detailLine(label, value) {
  return `${label}: ${value || "-"}`;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState({
    date: "",
    amount: "",
    description: "",
    category: "General",
  });

  async function load() {
    const data = await api("/expenses");
    setExpenses(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function createExpense(e) {
    e.preventDefault();
    await api("/expenses", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
      }),
    });
    setForm({ date: "", amount: "", description: "", category: "General" });
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
            Add expense
          </Typography>
          <Box component="form" onSubmit={createExpense}>
            <Stack spacing={2}>
              <TextField
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
              <TextField
            label="Amount"
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            fullWidth
          />
              <TextField
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            fullWidth
          />
              <TextField
            label="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            fullWidth
          />
              <Button type="submit" variant="contained">
                Save
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Expenses
          </Typography>
          <List disablePadding>
            {expenses.map((exp, index) => (
              <Box key={exp._id}>
                <ListItem
                  disableGutters
                  secondaryAction={
                    <Button
                      onClick={() => markReviewed(exp._id, exp.isReviewed)}
                      variant={exp.isReviewed ? "outlined" : "contained"}
                      size="small"
                    >
                      {exp.isReviewed ? "Reviewed" : "Mark reviewed"}
                    </Button>
                  }
                >
                  <ListItemText
                    primary={exp.description}
                    secondary={
                      <>
                        {new Date(exp.date).toLocaleDateString()} · {exp.category}
                        <br />
                        {exp.amount} {exp.currency}
                        <br />
                        {detailLine("Source", exp.source)}
                        <br />
                        {detailLine("Merchant", exp.merchant)}
                        <br />
                        {detailLine("External ID", exp.externalId)}
                        <br />
                        {detailLine("Reviewed", exp.isReviewed ? "Yes" : "No")}
                        <br />
                        {detailLine("Tags", Array.isArray(exp.tags) && exp.tags.length ? exp.tags.join(", ") : "")}
                        <br />
                        {detailLine("Notes", exp.notes)}
                        <br />
                        {detailLine("Created", formatDateTime(exp.createdAt))}
                        <br />
                        {detailLine("Updated", formatDateTime(exp.updatedAt))}
                      </>
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
