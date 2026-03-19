import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
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

export default function DashboardPage() {
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    api("/expenses").then(setExpenses).catch(console.error);
  }, []);

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          All expenses
        </Typography>
        <List disablePadding>
          {expenses.map((exp, index) => (
            <div key={exp._id}>
              <ListItem disableGutters>
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
                      {detailLine(
                        "Tags",
                        Array.isArray(exp.tags) && exp.tags.length
                          ? exp.tags.join(", ")
                          : "",
                      )}
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
            </div>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
