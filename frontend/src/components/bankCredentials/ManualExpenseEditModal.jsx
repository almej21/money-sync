import { Button, MenuItem, Stack, TextField } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { updateManualExpense } from "../../services/expenseService";
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

export default function ManualExpenseEditModal({
  open,
  expense,
  categories,
  t,
  onClose,
  onSaved,
  onError,
}) {
  const { direction } = useLanguage();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !expense) return;
    setDescription(String(expense?.description || ""));
    setCategory(String(expense?.category || ""));
    setAmount(String(expense?.amount ?? ""));
    setDate(toDateInputValue(expense?.date));
  }, [open, expense]);

  const modalTitle = useMemo(() => t("manualExpenseEditTitle"), [t]);

  async function handleSave() {
    const expenseId = String(expense?._id || "").trim();
    if (!expenseId) return;
    setSaving(true);
    try {
      const updated = await updateManualExpense(expenseId, {
        description: String(description || "").trim(),
        category: String(category || "").trim(),
        amount: Number(amount || 0),
        date,
      });
      onSaved?.(updated);
      onClose?.();
    } catch (error) {
      onError?.(error?.message || t("failedUpdateManualExpense"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <GenericModal open={open} onClose={onClose} headerText={modalTitle} width={620}>
      <Stack spacing={1.5} dir={direction}>
        <TextField
          fullWidth
          label={t("manualExpenseDescription")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <Dropdown
          labelId="manual-expense-edit-category"
          label={t("manualExpenseCategory")}
          labelShrink
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((categoryValue) => (
            <MenuItem key={categoryValue} value={categoryValue}>
              {categoryValue}
            </MenuItem>
          ))}
        </Dropdown>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            fullWidth
            type="number"
            label={t("manualStandingOrderAmount")}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputProps={{ min: 0, step: "0.01" }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            type="date"
            label={t("manualExpenseDate")}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button type="button" variant="outlined" onClick={onClose} fullWidth>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            fullWidth
          >
            {saving ? t("loading") : t("save")}
          </Button>
        </Stack>
      </Stack>
    </GenericModal>
  );
}
