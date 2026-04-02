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
import { useLanguage } from "../context/LanguageContext";
import {
  createShoppingList,
  getShoppingLists,
  toggleShoppingListItem,
} from "../services/shoppingListService";

export default function ShoppingListsPage() {
  const { t, direction } = useLanguage();
  const [lists, setLists] = useState([]);
  const [title, setTitle] = useState("");

  async function load() {
    const data = await getShoppingLists();
    setLists(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function createList(e) {
    e.preventDefault();
    await createShoppingList({
      title,
      items: [
        { text: t("sampleMilk"), quantity: 1 },
        { text: t("sampleBread"), quantity: 1 },
      ],
    });
    setTitle("");
    load();
  }

  async function toggleItem(listId, itemId) {
    await toggleShoppingListItem(listId, itemId);
    load();
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {t("createShoppingList")}
          </Typography>
          <Box component="form" onSubmit={createList}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                label={t("title")}
                placeholder={t("weeklyGroceries")}
                fullWidth
              />
              <Button
                type="submit"
                variant="contained"
                sx={{ width: { xs: "100%", sm: "auto" } }}
              >
                {t("create")}
              </Button>
            </Stack>
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
                  <ListItem disableGutters sx={{ py: 1 }}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      alignItems={{ xs: "stretch", sm: "center" }}
                      spacing={1}
                      sx={{ width: "100%" }}
                    >
                      <ListItemText
                        primary={`${item.text} x${item.quantity}`}
                        primaryTypographyProps={{
                          dir: direction,
                          sx: {
                            textAlign: direction === "rtl" ? "right" : "left",
                            wordBreak: "break-word",
                          },
                        }}
                        sx={{ my: 0 }}
                      />
                      <Button
                        onClick={() => toggleItem(list._id, item._id)}
                        variant={item.completed ? "outlined" : "contained"}
                        size="small"
                        sx={{
                          width: { xs: "100%", sm: "auto" },
                          alignSelf: { xs: "stretch", sm: "center" },
                          flexShrink: 0,
                        }}
                      >
                        {item.completed ? t("done") : t("markDone")}
                      </Button>
                    </Stack>
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
