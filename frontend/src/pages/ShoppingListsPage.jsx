import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import AppSnackbar from "../components/AppSnackbar";
import GenericModal from "../components/GenericModal";
import { useLanguage } from "../context/LanguageContext";
import {
  createShoppingList,
  deleteShoppingList,
  getShoppingLists,
  toggleShoppingListItem,
  updateShoppingList,
} from "../services/shoppingListService";

function getDefaultListTitle() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${hours}:${minutes} - ${day}.${month}`;
}

export default function ShoppingListsPage() {
  const { t, direction } = useLanguage();
  const [lists, setLists] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState(getDefaultListTitle);
  const [newListItems, setNewListItems] = useState([
    { description: "", quantity: 1 },
  ]);
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingDeleteList, setPendingDeleteList] = useState(null);
  const [isDeletingList, setIsDeletingList] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingListId, setEditingListId] = useState("");
  const [editingListTitle, setEditingListTitle] = useState("");
  const [editingItems, setEditingItems] = useState([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const listsRef = useRef([]);

  async function load() {
    const data = await getShoppingLists();
    setLists(data);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);

  function openCreateModal() {
    setNewListTitle(getDefaultListTitle());
    setNewListItems([{ description: "", quantity: 1 }]);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
  }

  function onItemChange(index, value) {
    setNewListItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], description: value };
      return next;
    });
  }

  function onItemQuantityChange(index, value) {
    const parsed = Number(value);
    const safe = Number.isFinite(parsed)
      ? Math.max(0, Math.min(100, parsed))
      : 0;
    setNewListItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: safe };
      return next;
    });
  }

  function addItemRow() {
    setNewListItems((prev) => [...prev, { description: "", quantity: 1 }]);
  }

  function openEditModal(list) {
    if (!list?._id) return;
    setEditingListId(String(list._id));
    setEditingListTitle(String(list.title || "").trim());
    setEditingItems(
      Array.isArray(list.items) && list.items.length
        ? list.items.map((item) => ({
            _id: item._id,
            description: String(item.description || item.text || "").trim(),
            quantity: Number(item.quantity || 1),
            completed: Boolean(item.completed),
          }))
        : [{ description: "", quantity: 1, completed: false }],
    );
    setIsEditModalOpen(true);
  }

  function closeEditModal() {
    if (isSavingEdit) return;
    setIsEditModalOpen(false);
    setEditingListId("");
    setEditingListTitle("");
    setEditingItems([]);
  }

  function onEditItemChange(index, value) {
    setEditingItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], description: value };
      return next;
    });
  }

  function onEditItemQuantityChange(index, value) {
    const parsed = Number(value);
    const safe = Number.isFinite(parsed)
      ? Math.max(0, Math.min(100, parsed))
      : 0;
    setEditingItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: safe };
      return next;
    });
  }

  function addEditItemRow() {
    setEditingItems((prev) => [
      ...prev,
      { description: "", quantity: 1, completed: false },
    ]);
  }

  async function createList(e) {
    e.preventDefault();
    const title = String(newListTitle || "").trim() || getDefaultListTitle();
    const normalizedItems = newListItems
      .map((item) => ({
        description: String(item?.description || "").trim(),
        quantity: Math.max(0, Math.min(100, Number(item?.quantity || 0))),
      }))
      .filter((item) => item.description);

    await createShoppingList({
      title,
      items: normalizedItems,
    });

    closeCreateModal();
    load();
  }

  async function toggleItem(listId, itemId) {
    const previousLists = listsRef.current;

    setLists((prev) =>
      prev.map((list) => {
        if (list._id !== listId) return list;
        return {
          ...list,
          items: list.items.map((item) =>
            item._id === itemId
              ? { ...item, completed: !item.completed }
              : item,
          ),
        };
      }),
    );

    try {
      await toggleShoppingListItem(listId, itemId);
    } catch (error) {
      setLists(previousLists);
      setErrorMessage(error?.message || "Failed to update item");
    }
  }

  function openDeleteConfirmation(list) {
    setPendingDeleteList(list || null);
  }

  function closeDeleteConfirmation() {
    if (isDeletingList) return;
    setPendingDeleteList(null);
  }

  async function confirmDeleteList() {
    const listId = String(pendingDeleteList?._id || "").trim();
    if (!listId) return;

    setIsDeletingList(true);
    try {
      await deleteShoppingList(listId);
      setLists((prev) => prev.filter((list) => list._id !== listId));
      setPendingDeleteList(null);
    } catch (error) {
      setErrorMessage(error?.message || "Failed to delete list");
    } finally {
      setIsDeletingList(false);
    }
  }

  async function saveEditedList(e) {
    e.preventDefault();
    const listId = String(editingListId || "").trim();
    if (!listId) return;

    const title = String(editingListTitle || "").trim() || getDefaultListTitle();
    const normalizedItems = editingItems
      .map((item) => ({
        _id: item?._id,
        description: String(item?.description || "").trim(),
        quantity: Number(item?.quantity || 1),
        completed: Boolean(item?.completed),
      }))
      .filter((item) => item.description);

    setIsSavingEdit(true);
    try {
      const updated = await updateShoppingList(listId, {
        title,
        items: normalizedItems,
      });
      setLists((prev) =>
        prev.map((list) => (list._id === updated._id ? updated : list)),
      );
      closeEditModal();
    } catch (error) {
      setErrorMessage(error?.message || "Failed to update list");
    } finally {
      setIsSavingEdit(false);
    }
  }

  return (
    <Stack spacing={2}>
      {lists.map((list) => (
        <Card key={list._id}>
          <CardContent>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <Typography
                variant="h6"
                sx={{
                  textDecoration: "underline",
                  textDecorationThickness: "2px",
                  textUnderlineOffset: "5px",
                }}
              >
                {list.title}
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  direction: "ltr",
                  alignItems: "flex-start",
                  columnGap: 1,
                  flexShrink: 0,
                }}
              >
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={() => openDeleteConfirmation(list)}
                  sx={{
                    minWidth: 0,
                    width: 32,
                    height: 32,
                    p: 0,
                    mr: 0.5,
                    borderRadius: 1,
                    borderColor: "error.main",
                    color: "error.main",
                    "&:hover": {
                      bgcolor: "error.main",
                      borderColor: "error.main",
                      color: "common.white",
                    },
                  }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => openEditModal(list)}
                  sx={{
                    minWidth: 0,
                    width: 32,
                    height: 32,
                    p: 0,
                    borderRadius: 1,
                  }}
                >
                  <EditOutlinedIcon fontSize="small" />
                </Button>
              </Box>
            </Stack>
            <Divider sx={{ mb: 1.5 }} />
            <List disablePadding>
              {list.items.map((item, index) => (
                <Box key={item._id}>
                  <ListItem disableGutters sx={{ py: 1 }}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      spacing={1}
                      sx={{ width: "100%" }}
                    >
                      <Stack
                        direction="row"
                        alignItems="center"
                        sx={{ minWidth: 0 }}
                      >
                        <Checkbox
                          checked={Boolean(item.completed)}
                          onChange={() => toggleItem(list._id, item._id)}
                        />
                        <ListItemText
                          primary={`${item.description || item.text || "-"} x${item.quantity}`}
                          primaryTypographyProps={{
                            dir: direction,
                            sx: {
                              textAlign: direction === "rtl" ? "right" : "left",
                              wordBreak: "break-word",
                              textDecoration: item.completed
                                ? "line-through"
                                : "none",
                              opacity: item.completed ? 0.7 : 1,
                            },
                          }}
                          sx={{ my: 0 }}
                        />
                      </Stack>
                    </Stack>
                  </ListItem>
                  {index < list.items.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          </CardContent>
        </Card>
      ))}

      <Button
        variant="contained"
        onClick={openCreateModal}
        sx={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: (theme) => theme.zIndex.fab || 1200,
          borderRadius: 999,
          px: 2,
          py: 1,
          boxShadow: 4,
          whiteSpace: "nowrap",
        }}
      >
        {t("newListButton")}
      </Button>

      <GenericModal
        open={isCreateModalOpen}
        onClose={closeCreateModal}
        headerText={t("createShoppingList")}
      >
        <Box component="form" onSubmit={createList}>
          <Stack spacing={1.5} sx={{ minHeight: { xs: 360, sm: 420 } }}>
            <TextField
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              label={t("title")}
              fullWidth
            />
            {newListItems.map((itemValue, index) => {
              return (
                <Stack
                  key={`new-item-${index}`}
                  direction="row"
                  useFlexGap
                  sx={{ gap: 2 }}
                >
                  <TextField
                    value={itemValue.description}
                    onChange={(e) => onItemChange(index, e.target.value)}
                    label={t("itemName")}
                    placeholder={t("sampleMilk")}
                    fullWidth
                  />
                  <TextField
                    type="number"
                    value={itemValue.quantity}
                    onChange={(e) => onItemQuantityChange(index, e.target.value)}
                    label={t("itemQuantity")}
                    inputProps={{ min: 0, max: 100 }}
                    sx={{ width: 100 }}
                  />
                </Stack>
              );
            })}
            <Box sx={{ flexGrow: 1 }} />
            <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
              <Button
                type="button"
                onClick={addItemRow}
              >
                {t("newItemButton")}
              </Button>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button type="button" variant="outlined" onClick={closeCreateModal} fullWidth>
                {t("cancel")}
              </Button>
              <Button type="submit" variant="contained" fullWidth>
                {t("create")}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </GenericModal>

      <GenericModal
        open={isEditModalOpen}
        onClose={closeEditModal}
        headerText={t("editListTitle")}
      >
        <Box component="form" onSubmit={saveEditedList}>
          <Stack spacing={1.5} sx={{ minHeight: { xs: 360, sm: 420 } }}>
            <TextField
              value={editingListTitle}
              onChange={(e) => setEditingListTitle(e.target.value)}
              label={t("title")}
              fullWidth
            />
            {editingItems.map((item, index) => {
              return (
                <Stack
                  key={`edit-item-${item._id || index}`}
                  direction="row"
                  useFlexGap
                  sx={{ gap: 2 }}
                >
                  <TextField
                    value={item.description}
                    onChange={(e) => onEditItemChange(index, e.target.value)}
                    label={t("itemName")}
                    placeholder={t("sampleMilk")}
                    fullWidth
                  />
                  <TextField
                    type="number"
                    value={item.quantity}
                    onChange={(e) =>
                      onEditItemQuantityChange(index, e.target.value)
                    }
                    label={t("itemQuantity")}
                    inputProps={{ min: 0, max: 100 }}
                    sx={{ width: 100 }}
                  />
                </Stack>
              );
            })}
            <Box sx={{ flexGrow: 1 }} />
            <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
              <Button
                type="button"
                onClick={addEditItemRow}
              >
                {t("newItemButton")}
              </Button>
            </Box>
            <Button type="submit" variant="contained" disabled={isSavingEdit}>
              {t("save")}
            </Button>
          </Stack>
        </Box>
      </GenericModal>

      <AppSnackbar
        open={Boolean(errorMessage)}
        message={errorMessage}
        severity="error"
        onClose={() => setErrorMessage("")}
      />

      <Dialog
        open={Boolean(pendingDeleteList)}
        onClose={closeDeleteConfirmation}
      >
        <DialogTitle>{t("logoutConfirmMessage")}</DialogTitle>
        <DialogContent>
          <Typography color="text.primary">
            {t("deleteListConfirmMessage").replace(
              "{listName}",
              pendingDeleteList?.title || "",
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteConfirmation} disabled={isDeletingList}>
            {t("cancel")}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDeleteList}
            disabled={isDeletingList}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
