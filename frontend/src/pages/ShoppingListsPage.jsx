import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import EditSquareIcon from "@mui/icons-material/EditSquare";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import AppTextField from "../components/AppTextField";
import AppSnackbar from "../components/AppSnackbar";
import GenericModal from "../components/GenericModal";
import LiquidGlassContainer from "../components/LiquidGlassContainer";
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
  const { t, direction, locale } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [lists, setLists] = useState([]);
  const [isLoadingLists, setIsLoadingLists] = useState(true);
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
  const [expandedNoteEditorKey, setExpandedNoteEditorKey] = useState("");
  const [noteDrafts, setNoteDrafts] = useState({});
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [expandedLists, setExpandedLists] = useState({});
  const listsRef = useRef([]);

  async function load() {
    setIsLoadingLists(true);
    try {
      const data = await getShoppingLists();
      setLists(data);
    } catch (error) {
      setErrorMessage(error?.message || "Failed to load shopping lists");
    } finally {
      setIsLoadingLists(false);
    }
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
      ? Math.max(1, Math.min(100, parsed))
      : 1;
    setNewListItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: safe };
      return next;
    });
  }

  function incrementItemQuantity(index) {
    const current = Number(newListItems[index]?.quantity || 1);
    onItemQuantityChange(index, Math.min(100, current + 1));
  }

  function decrementItemQuantity(index) {
    const current = Number(newListItems[index]?.quantity || 1);
    onItemQuantityChange(index, Math.max(1, current - 1));
  }

  function addItemRow() {
    setNewListItems((prev) => [...prev, { description: "", quantity: 1 }]);
  }

  function removeItemRow(index) {
    setNewListItems((prev) => {
      if (prev.length <= 1) return [{ description: "", quantity: 1 }];
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
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
            note: String(item.note || "").trim(),
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
      ? Math.max(1, Math.min(100, parsed))
      : 1;
    setEditingItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: safe };
      return next;
    });
  }

  function incrementEditItemQuantity(index) {
    const current = Number(editingItems[index]?.quantity || 1);
    onEditItemQuantityChange(index, Math.min(100, current + 1));
  }

  function decrementEditItemQuantity(index) {
    const current = Number(editingItems[index]?.quantity || 1);
    onEditItemQuantityChange(index, Math.max(1, current - 1));
  }

  function addEditItemRow() {
    setEditingItems((prev) => [
      ...prev,
      { description: "", quantity: 1, completed: false },
    ]);
  }

  function removeEditItemRow(index) {
    setEditingItems((prev) => {
      if (prev.length <= 1)
        return [{ description: "", quantity: 1, completed: false }];
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function createList(e) {
    e.preventDefault();
    const title = String(newListTitle || "").trim() || getDefaultListTitle();
    const normalizedItems = newListItems
      .map((item) => ({
        description: String(item?.description || "").trim(),
        quantity: Math.max(1, Math.min(100, Number(item?.quantity || 1))),
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
      const updated = await toggleShoppingListItem(listId, itemId);
      setLists((prev) =>
        prev.map((list) => (list._id === updated._id ? updated : list)),
      );
    } catch (error) {
      setLists(previousLists);
      setErrorMessage(error?.message || "Failed to update item");
    }
  }

  function openDeleteConfirmation(list) {
    setPendingDeleteList(list || null);
  }

  function isListExpanded(listId) {
    const key = String(listId || "").trim();
    if (!key) return false;
    if (!Object.hasOwn(expandedLists, key)) return false;
    return Boolean(expandedLists[key]);
  }

  function toggleListExpanded(listId) {
    const key = String(listId || "").trim();
    if (!key) return;
    setExpandedLists((prev) => ({
      ...prev,
      [key]: !isListExpanded(key),
    }));
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

    const title =
      String(editingListTitle || "").trim() || getDefaultListTitle();
    const normalizedItems = editingItems
      .map((item) => ({
        _id: item?._id,
        description: String(item?.description || "").trim(),
        quantity: Math.max(1, Math.min(100, Number(item?.quantity || 1))),
        note: String(item?.note || "").trim(),
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

  function formatCreatedAt(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getItemNoteEditorKey(listId, itemId) {
    return `${String(listId || "").trim()}::${String(itemId || "").trim()}`;
  }

  function getDraftNoteValue(listId, item) {
    const key = getItemNoteEditorKey(listId, item?._id);
    if (Object.hasOwn(noteDrafts, key)) {
      return noteDrafts[key];
    }
    return String(item?.note || "");
  }

  function onNoteDraftChange(listId, itemId, value) {
    const key = getItemNoteEditorKey(listId, itemId);
    setNoteDrafts((prev) => ({ ...prev, [key]: value }));
  }

  async function saveItemNote(list, item) {
    const listId = String(list?._id || "").trim();
    const itemId = String(item?._id || "").trim();
    if (!listId || !itemId) return;

    const key = getItemNoteEditorKey(listId, itemId);
    const nextNote = String(getDraftNoteValue(listId, item)).trim();
    const currentNote = String(item?.note || "").trim();
    if (nextNote === currentNote) return;

    const nextItems = (Array.isArray(list?.items) ? list.items : []).map(
      (listItem) => {
        if (String(listItem?._id || "") !== itemId) return listItem;
        return { ...listItem, note: nextNote };
      },
    );

    setIsSavingNote(true);
    try {
      const updated = await updateShoppingList(listId, { items: nextItems });
      setLists((prev) =>
        prev.map((existing) =>
          String(existing?._id || "") === listId ? updated : existing,
        ),
      );
      setNoteDrafts((prev) => ({ ...prev, [key]: nextNote }));
    } catch (error) {
      setErrorMessage(error?.message || t("failedSaveItemNote"));
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <Stack spacing={2}>
      {isLoadingLists
        ? Array.from({ length: 3 }).map((_, index) => (
            <Card key={`shopping-list-skeleton-${index}`}>
              <CardContent
                sx={{
                  px: 1,
                  py: 1.25,
                  "&:last-child": { pb: 1.25 },
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 116px",
                    alignItems: "center",
                    columnGap: 1,
                  }}
                >
                  <Stack direction="row" alignItems="baseline" spacing={0.75}>
                    <Skeleton variant="text" width={120} height={34} />
                    <Skeleton variant="text" width={72} height={18} />
                  </Stack>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "row",
                      direction: "ltr",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      columnGap: 0.8,
                      width: 116,
                    }}
                  >
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        order: direction === "rtl" ? 3 : 1,
                      }}
                    >
                      <Skeleton variant="rounded" width={32} height={32} />
                    </Box>
                    <Box sx={{ width: 32, height: 32, order: 2 }}>
                      <Skeleton variant="rounded" width={32} height={32} />
                    </Box>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        order: direction === "rtl" ? 1 : 3,
                      }}
                    >
                      <Skeleton variant="rounded" width={32} height={32} />
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))
        : lists.map((list) => (
            <Card key={list._id}>
              {(() => {
                const expanded = isListExpanded(list._id);
                const listItems = Array.isArray(list.items) ? list.items : [];
                const allItemsCompleted =
                  listItems.length > 0 &&
                  listItems.every((item) => Boolean(item?.completed));
                return (
                  <CardContent
                    sx={{
                      px: 1,
                      py: expanded ? 1.5 : 1.25,
                      "&:last-child": { pb: expanded ? 1.5 : 1.25 },
                    }}
                  >
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "1fr 116px",
                        alignItems: "center",
                        columnGap: 1,
                        mb: expanded ? 1 : 0,
                      }}
                    >
                      <Stack
                        direction="row"
                        alignItems="baseline"
                        spacing={0.75}
                        onClick={() => toggleListExpanded(list._id)}
                        sx={{ cursor: "pointer" }}
                      >
                        <Typography
                          variant="h8"
                          sx={{
                            textDecoration: allItemsCompleted
                              ? "line-through"
                              : "underline",
                            textDecorationThickness: allItemsCompleted
                              ? "1.5px"
                              : "2px",
                            textUnderlineOffset: allItemsCompleted
                              ? "0px"
                              : "5px",
                            opacity: allItemsCompleted ? 0.75 : 1,
                          }}
                        >
                          {list.title}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ px: 1 }}
                        >
                          ({Array.isArray(list.items) ? list.items.length : 0}{" "}
                          {t("itemsCountLabel")})
                        </Typography>
                      </Stack>
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "row",
                          direction: "ltr",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          columnGap: 0.8,
                          width: 116,
                        }}
                      >
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => toggleListExpanded(list._id)}
                          aria-label={
                            isListExpanded(list._id)
                              ? t("hideDetails")
                              : t("showDetails")
                          }
                          sx={{
                            minWidth: 0,
                            width: 32,
                            height: 32,
                            p: 0,
                            borderRadius: 0.8,
                            border: "2px solid",
                            order: direction === "rtl" ? 3 : 1,
                          }}
                        >
                          {isListExpanded(list._id) ? (
                            <ExpandLessIcon fontSize="small" />
                          ) : (
                            <ExpandMoreIcon fontSize="small" />
                          )}
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
                            borderRadius: 0.8,
                            border: "2px solid",
                            order: 2,
                          }}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </Button>
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
                            borderRadius: 0.8,
                            borderColor: "error.main",
                            border: "2px solid",
                            color: "error.main",
                            order: direction === "rtl" ? 1 : 3,
                            "&:hover": {
                              bgcolor: "error.main",
                              borderColor: "error.main",
                              color: "common.white",
                            },
                          }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </Button>
                      </Box>
                    </Box>
                    <Collapse in={isListExpanded(list._id)}>
                      <Divider sx={{ mb: 1.5 }} />
                      <List disablePadding>
                        {list.items.map((item, index) => (
                          <Box key={item._id}>
                            <ListItem disableGutters sx={{ py: 0 }}>
                              <Stack
                                direction="row"
                                justifyContent="flex-start"
                                alignItems="center"
                                spacing={1}
                                sx={{ width: "100%", minHeight: 24 }}
                              >
                                <Stack
                                  direction="row"
                                  alignItems="center"
                                  sx={{
                                    minWidth: 0,
                                    width: "100%",
                                    minHeight: 24,
                                  }}
                                >
                                  <Checkbox
                                    checked={Boolean(item.completed)}
                                    onChange={() =>
                                      toggleItem(list._id, item._id)
                                    }
                                    size="small"
                                    sx={{ p: 0.7, mr: 0.5 }}
                                  />
                                  <ListItemText
                                    primary={`${item.description || item.text || "-"} x${item.quantity}`}
                                    primaryTypographyProps={{
                                      dir: direction,
                                      sx: {
                                        textAlign:
                                          direction === "rtl"
                                            ? "right"
                                            : "left",
                                        fontSize: "0.9rem",
                                        wordBreak: "break-word",
                                        textDecoration: item.completed
                                          ? "line-through"
                                          : "none",
                                        opacity: item.completed ? 0.7 : 1,
                                      },
                                    }}
                                    sx={{
                                      my: 0,
                                      "& .MuiTypography-root": {
                                        lineHeight: 1.1,
                                      },
                                    }}
                                  />
                                  {Boolean(String(item?.note || "").trim()) && (
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        maxWidth: 180,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        fontSize: "0.8rem",
                                        fontWeight: "600",
                                        fontFamily:
                                          '"Guttman Yad", "Segoe Print", "Miriam Libre", "Noto Sans Hebrew", cursive',
                                        color: "text.secondary",
                                      }}
                                    >
                                      {String(item.note || "").trim()}
                                    </Typography>
                                  )}
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      setExpandedNoteEditorKey((prev) =>
                                        prev ===
                                        getItemNoteEditorKey(list._id, item._id)
                                          ? ""
                                          : getItemNoteEditorKey(
                                              list._id,
                                              item._id,
                                            ),
                                      )
                                    }
                                    aria-label={t("addNote")}
                                    sx={{ alignSelf: "center", p: 0.25 }}
                                  >
                                    <EditSquareIcon fontSize="small" />
                                  </IconButton>
                                </Stack>
                              </Stack>
                            </ListItem>
                            <Collapse
                              in={
                                expandedNoteEditorKey ===
                                getItemNoteEditorKey(list._id, item._id)
                              }
                            >
                              <Box sx={{ py: 1 }}>
                                <Stack
                                  direction="row"
                                  alignItems="center"
                                  spacing={1}
                                >
                                  <AppTextField
                                    fullWidth
                                    size="small"
                                    label={t("note")}
                                    value={getDraftNoteValue(list._id, item)}
                                    onChange={(event) =>
                                      onNoteDraftChange(
                                        list._id,
                                        item._id,
                                        event.target.value,
                                      )
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key !== "Enter") return;
                                      event.preventDefault();
                                      saveItemNote(list, item);
                                      setExpandedNoteEditorKey("");
                                    }}
                                    disabled={isSavingNote}
                                  />
                                  <IconButton
                                    color="primary"
                                    onClick={() => {
                                      saveItemNote(list, item);
                                      setExpandedNoteEditorKey("");
                                    }}
                                    aria-label={t("save")}
                                    disabled={isSavingNote}
                                  >
                                    <SaveOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </Stack>
                              </Box>
                            </Collapse>
                            {index < list.items.length - 1 && <Divider />}
                          </Box>
                        ))}
                      </List>
                      <Box
                        sx={{
                          mt: 1.25,
                          display: "flex",
                          direction: "ltr",
                          justifyContent:
                            direction === "rtl" ? "flex-start" : "flex-end",
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {t("createdAtLabel")}{" "}
                          {formatCreatedAt(list.createdAt)}
                        </Typography>
                      </Box>
                    </Collapse>
                  </CardContent>
                );
              })()}
            </Card>
          ))}

      <LiquidGlassContainer
        cardSx={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: (muiTheme) => muiTheme.zIndex.fab || 1200,
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <Button
          variant="text"
          onClick={openCreateModal}
          sx={{
            borderRadius: 999,
            px: 2.5,
            minWidth: 0,
            whiteSpace: "nowrap",
            color: "text.primary",
            fontWeight: 600,
          }}
        >
          {t("newListButton")}
        </Button>
      </LiquidGlassContainer>

      <GenericModal
        open={isCreateModalOpen}
        onClose={closeCreateModal}
        headerText={t("createShoppingList")}
      >
        <Box component="form" onSubmit={createList}>
          <Stack spacing={1.5}>
            <AppTextField
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              label={t("title")}
              fullWidth
            />
            <Stack useFlexGap sx={{ rowGap: 2 }}>
              {newListItems.map((itemValue, index) => {
                return (
                  <Stack
                    key={`new-item-${index}`}
                    direction="row"
                    useFlexGap
                    sx={{ gap: 2, mt: 0.5 }}
                  >
                    <AppTextField
                      value={itemValue.description}
                      onChange={(e) => onItemChange(index, e.target.value)}
                      label={t("itemName")}
                      InputLabelProps={{ shrink: true }}
                      placeholder={t("sampleMilk")}
                      fullWidth
                    />
                    {isMobile ? (
                      <Box
                        sx={{
                          width: 124,
                          height: "var(--app-outlined-input-min-height)",
                          minHeight: "var(--app-outlined-input-min-height)",
                          boxSizing: "border-box",
                          bgcolor: "background.default",
                          border: "1px solid",
                          borderColor: "primary.light",
                          borderRadius: (muiTheme) =>
                            `${muiTheme.shape.borderRadius}px`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          px: 1,
                        }}
                      >
                        <Typography
                          dir="ltr"
                          sx={{
                            minWidth: 20,
                            textAlign: "center",
                            fontWeight: 600,
                            color: "text.primary",
                          }}
                        >
                          {Math.max(
                            1,
                            Math.min(100, Number(itemValue.quantity || 1)),
                          )}
                        </Typography>
                        <Stack
                          spacing={0}
                          sx={{
                            height: "100%",
                            justifyContent: "space-between",
                          }}
                        >
                          <IconButton
                            size="small"
                            onClick={() => incrementItemQuantity(index)}
                            aria-label="Increase quantity"
                            tabIndex={-1}
                            sx={{
                              minWidth: 0,
                              width: 16,
                              height: 12,
                              p: 0,
                              borderRadius: 0.5,
                            }}
                          >
                            <KeyboardArrowUpIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => decrementItemQuantity(index)}
                            aria-label="Decrease quantity"
                            tabIndex={-1}
                            sx={{
                              minWidth: 0,
                              width: 16,
                              height: 12,
                              p: 0,
                              borderRadius: 0.5,
                            }}
                          >
                            <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      </Box>
                    ) : (
                      <AppTextField
                        type="number"
                        dir="ltr"
                        value={itemValue.quantity}
                        onChange={(e) =>
                          onItemQuantityChange(index, e.target.value)
                        }
                        label={t("itemQuantity")}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{
                          min: 1,
                          max: 100,
                          inputMode: "numeric",
                        }}
                        sx={{ width: 100 }}
                      />
                    )}
                    <IconButton
                      aria-label="Delete item"
                      color="error"
                      onClick={() => removeItemRow(index)}
                      sx={{ alignSelf: "center", mt: 0.25 }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
            <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
              <Button type="button" onClick={addItemRow}>
                {t("newItemButton")}
              </Button>
            </Box>
            <Stack
              direction="row"
              useFlexGap
              spacing={1}
              sx={{
                gap: 1,
                mt: 1,
                pt: 1,
                borderTop: "1px solid",
                borderColor: "divider",
              }}
            >
              <Button
                type="button"
                variant="outlined"
                onClick={closeCreateModal}
                fullWidth
              >
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
          <Stack spacing={1.5}>
            <AppTextField
              value={editingListTitle}
              onChange={(e) => setEditingListTitle(e.target.value)}
              label={t("title")}
              fullWidth
            />
            <Stack useFlexGap sx={{ rowGap: 2 }}>
              {editingItems.map((item, index) => {
                return (
                  <Stack
                    key={`edit-item-${item._id || index}`}
                    direction="row"
                    useFlexGap
                    sx={{ gap: 0.5 }}
                  >
                    <AppTextField
                      value={item.description}
                      onChange={(e) => onEditItemChange(index, e.target.value)}
                      label={t("itemName")}
                      InputLabelProps={{ shrink: true }}
                      placeholder={t("sampleMilk")}
                      fullWidth
                    />
                    {isMobile ? (
                      <Box
                        sx={{
                          width: 104,
                          height: "var(--app-outlined-input-min-height)",
                          minHeight: "var(--app-outlined-input-min-height)",
                          boxSizing: "border-box",
                          bgcolor: "background.default",
                          border: "1px solid",
                          borderColor: "primary.light",
                          borderRadius: (muiTheme) =>
                            `${muiTheme.shape.borderRadius}px`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          px: 1,
                        }}
                      >
                        <Typography
                          dir="ltr"
                          sx={{
                            minWidth: 20,
                            textAlign: "center",
                            fontWeight: 600,
                            color: "text.primary",
                          }}
                        >
                          {Math.max(
                            1,
                            Math.min(100, Number(item.quantity || 1)),
                          )}
                        </Typography>
                        <Stack
                          spacing={0}
                          sx={{
                            height: "100%",
                            justifyContent: "space-between",
                          }}
                        >
                          <IconButton
                            size="small"
                            onClick={() => incrementEditItemQuantity(index)}
                            aria-label="Increase quantity"
                            tabIndex={-1}
                            sx={{
                              minWidth: 0,
                              width: 16,
                              height: 12,
                              p: 0,
                              borderRadius: 0.5,
                            }}
                          >
                            <KeyboardArrowUpIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => decrementEditItemQuantity(index)}
                            aria-label="Decrease quantity"
                            tabIndex={-1}
                            sx={{
                              minWidth: 0,
                              width: 16,
                              height: 12,
                              p: 0,
                              borderRadius: 0.5,
                            }}
                          >
                            <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      </Box>
                    ) : (
                      <AppTextField
                        type="number"
                        dir="ltr"
                        value={item.quantity}
                        onChange={(e) =>
                          onEditItemQuantityChange(index, e.target.value)
                        }
                        label={t("itemQuantity")}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{
                          min: 1,
                          max: 100,
                          inputMode: "numeric",
                        }}
                        sx={{ width: 100 }}
                      />
                    )}
                    <IconButton
                      aria-label="Delete item"
                      color="error"
                      onClick={() => removeEditItemRow(index)}
                      disabled={isSavingEdit}
                      sx={{ alignSelf: "center", mt: 0.25 }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
            <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
              <Button type="button" onClick={addEditItemRow}>
                {t("newItemButton")}
              </Button>
            </Box>
            <Button type="submit" variant="contained" disabled={isSavingEdit}>
              {isSavingEdit ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={16} color="inherit" />
                  <span>{t("loading")}</span>
                </Stack>
              ) : (
                t("save")
              )}
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
