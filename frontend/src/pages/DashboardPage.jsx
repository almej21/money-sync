import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { api } from "../api";

export default function DashboardPage() {
  const [summary, setSummary] = useState([]);

  useEffect(() => {
    api("/expenses/summary").then(setSummary).catch(console.error);
  }, []);

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Expense summary
        </Typography>
        <List disablePadding>
          {summary.map((row, index) => (
            <Stack key={row._id}>
              <ListItem disableGutters>
                <ListItemText
                  primary={row._id}
                  secondary={`${row.total.toFixed(2)} ILS · ${row.count} items`}
                />
              </ListItem>
              {index < summary.length - 1 && <Divider />}
            </Stack>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
