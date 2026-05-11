import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import {
  deleteManualExpense,
  listManualExpenses,
  updateManualExpense,
} from "../../services/expenseService";
import Dropdown from "../Dropdown";
import GenericModal from "../GenericModal";

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatAmount(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  return num.toFixed(2);
}

export default function ManualExpensesListModal({
  open,
  onClose,
  sourceConnectionKey,
  sourceAccountId,
  categories,
  t,
  onSuccess,
  onError,
}) {
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [savingId, setSavingId] = useState("");
  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState({
    description: "",
    category: "",
    amount: "",
    date: "",
  });

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setEditingId("");
    setDraft({ description: "", category: "", amount: "", date: "" });
    listManualExpenses(sourceConnectionKey, "")
      .then((rows) => setItems(Array.isArray(rows) ? rows : []))
      .catch((error) => {
        setItems([]);
        onError?.(error?.message || "Failed to load manual expenses");
      })
      .finally(() => setLoading(false));
  }, [open, sourceConnectionKey, sourceAccountId, onError]);

  const title = useMemo(() => t("manualExpensesListTitle"), [t]);

  function beginEdit(item) {
    setEditingId(String(item?._id || ""));
    setDraft({
      description: String(item?.description || ""),
      category: String(item?.category || ""),
      amount: formatAmount(item?.amount),
      date: toDateInputValue(item?.date),
    });
  }

  function cancelEdit() {
    setEditingId("");
    setDraft({ description: "", category: "", amount: "", date: "" });
  }

  async function saveEdit(itemId) {
    const id = String(itemId || "").trim();
    if (!id) return;
    setSavingId(id);
    try {
      const updated = await updateManualExpense(id, {
        description: String(draft.description || "").trim(),
        category: String(draft.category || "").trim(),
        amount: Number(draft.amount || 0),
        date: draft.date,
      });
      setItems((prev) =>
        prev.map((item) => (String(item?._id || "") === id ? updated : item)),
      );
      setEditingId("");
      onSuccess?.(t("manualExpenseUpdated"));
    } catch (error) {
      onError?.(error?.message || t("failedUpdateManualExpense"));
    } finally {
      setSavingId("");
    }
  }

  async function removeItem(itemId) {
    const id = String(itemId || "").trim();
    if (!id) return;
    setDeletingId(id);
    try {
      await deleteManualExpense(id);
      setItems((prev) => prev.filter((item) => String(item?._id || "") !== id));
      onSuccess?.(t("manualExpenseDeleted"));
    } catch (error) {
      onError?.(error?.message || t("failedDeleteManualExpense"));
    } finally {
      setDeletingId("");
    }
  }

  return (
    <GenericModal open={open} onClose={onClose} headerText={title} width={760}>
      <Stack spacing={1.2}>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={20} />
          </Stack>
        ) : items.length === 0 ? (
          <Typography color="text.secondary">
            {t("noManualExpensesFound")}
          </Typography>
        ) : (
          items.map((item) => {
            const itemId = String(item?._id || "");
            const isEditing = editingId === itemId;
            return (
              <Box
                key={itemId}
                sx={{
                  borderRadius: 1.5,
                  p: 1.2,
                }}
              >
                {isEditing ? (
                  <Stack spacing={1}>
                    <TextField
                      fullWidth
                      label={t("manualExpenseDescription")}
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      InputLabelProps={{ shrink: true }}
                    />
                    <Dropdown
                      labelId={`manual-edit-category-${itemId}`}
                      label={t("manualExpenseCategory")}
                      labelShrink
                      value={draft.category}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          category: event.target.value,
                        }))
                      }
                    >
                      {categories.map((categoryValue) => (
                        <MenuItem
                          key={`${itemId}-${categoryValue}`}
                          value={categoryValue}
                        >
                          {categoryValue}
                        </MenuItem>
                      ))}
                    </Dropdown>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <TextField
                        fullWidth
                        type="number"
                        label={t("manualStandingOrderAmount")}
                        value={draft.amount}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            amount: event.target.value,
                          }))
                        }
                        inputProps={{ min: 0, step: "0.01" }}
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField
                        fullWidth
                        type="date"
                        label={t("manualExpenseDate")}
                        value={draft.date}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            date: event.target.value,
                          }))
                        }
                        InputLabelProps={{ shrink: true }}
                      />
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={cancelEdit}
                      >
                        {t("cancel")}
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => saveEdit(itemId)}
                        disabled={savingId === itemId}
                      >
                        {savingId === itemId ? t("loading") : t("save")}
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Stack spacing={0.3}>
                      <Typography sx={{ fontWeight: 700 }}>
                        {String(item?.description || "-")}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {String(item?.category || "-")} |{" "}
                        {formatAmount(item?.amount)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t("source")}: {String(item?.sourceAccountId || "-")}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {toDateInputValue(item?.date)}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5}>
                      <IconButton size="small" onClick={() => beginEdit(item)}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeItem(itemId)}
                        disabled={deletingId === itemId}
                      >
                        {deletingId === itemId ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <DeleteOutlineIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Stack>
                  </Stack>
                )}
              </Box>
            );
          })
        )}
      </Stack>
    </GenericModal>
  );
}
