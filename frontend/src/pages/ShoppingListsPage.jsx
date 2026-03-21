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
import { useLanguage } from "../context/LanguageContext";

export default function ShoppingListsPage() {
  const { t, direction } = useLanguage();
  const [lists, setLists] = useState([]);
  const [title, setTitle] = useState("");

  async function load() {
    const data = await api("/shopping-lists");
    setLists(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function createList(e) {
    e.preventDefault();
    await api("/shopping-lists", {
      method: "POST",
      body: JSON.stringify({
        title,
        items: [
          { text: t("sampleMilk"), quantity: 1 },
          { text: t("sampleBread"), quantity: 1 },
        ],
      }),
    });
    setTitle("");
    load();
  }

  async function toggleItem(listId, itemId) {
    await api(`/shopping-lists/${listId}/items/${itemId}/toggle`, {
      method: "PATCH",
    });
    load();
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {t("createShoppingList")}
          </Typography>
          <Box component="form" onSubmit={createList} sx={{ display: "flex", gap: 1 }}>
            <TextField
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            label={t("title")}
            placeholder={t("weeklyGroceries")}
            fullWidth
          />
            <Button type="submit" variant="contained">
              {t("create")}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {lists.map((list) => (
        <Card key={list._id}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {list.title}
            </Typography>
            <List disablePadding>
              {list.items.map((item, index) => (
                <Box key={item._id}>
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
                        onClick={() => toggleItem(list._id, item._id)}
                        variant={item.completed ? "outlined" : "contained"}
                        size="small"
                      >
                        {item.completed ? t("done") : t("markDone")}
                      </Button>
                    }
                  >
                    <ListItemText primary={`${item.text} x${item.quantity}`} />
                  </ListItem>
                  {index < list.items.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
