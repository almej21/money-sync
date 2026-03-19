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

export default function ShoppingListsPage() {
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
          { text: "Milk", quantity: 1 },
          { text: "Bread", quantity: 1 },
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
            Create shopping list
          </Typography>
          <Box component="form" onSubmit={createList} sx={{ display: "flex", gap: 1 }}>
            <TextField
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            label="Title"
            placeholder="Weekly groceries"
            fullWidth
          />
            <Button type="submit" variant="contained">
              Create
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
                    secondaryAction={
                      <Button
                        onClick={() => toggleItem(list._id, item._id)}
                        variant={item.completed ? "outlined" : "contained"}
                        size="small"
                      >
                        {item.completed ? "Done" : "Mark done"}
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
