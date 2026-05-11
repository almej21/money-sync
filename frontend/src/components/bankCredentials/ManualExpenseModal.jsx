import { Button, MenuItem, Stack, TextField } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { createManualExpense } from "../../services/expenseService";
import Dropdown from "../Dropdown";
import GenericModal from "../GenericModal";

function getCardEnding(sourceAccountId) {
  const value = String(sourceAccountId || "").trim();
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return value.slice(-4);
}

function formatDateInput(value) {
  return String(value || "").trim();
}

function formatDateDisplay(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw.split("-");
  if (parts.length !== 3) return "";
  const [year, month, day] = parts;
  if (!year || !month || !day) return "";
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

export default function ManualExpenseModal({
  open,
  onClose,
  sourceConnectionKey,
  sourceAccountId,
  categories,
  t,
  onSaved,
  onError,
}) {
  const { direction } = useLanguage();
  const isRtl = direction === "rtl";
  const [entryType, setEntryType] = useState("single");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  const [singleAmount, setSingleAmount] = useState("");
  const [standingAmountMode, setStandingAmountMode] = useState("total");
  const [standingAmount, setStandingAmount] = useState("");
  const [standingStartDate, setStandingStartDate] = useState("");
  const [standingPayments, setStandingPayments] = useState("");
  const [saving, setSaving] = useState(false);
  const labelSx = {
    fontSize: "1rem",
    px: 0,
    mx: 0,
    right: isRtl ? 0 : "auto",
    left: isRtl ? "auto" : 0,
    transformOrigin: isRtl ? "top right" : "top left",
    transform: isRtl
      ? "translate(0px, -17px) scale(0.75)"
      : "translate(0px, -17px) scale(0.75)",
  };

  useEffect(() => {
    if (!open) return;
    setEntryType("single");
    setDescription("");
    setCategory("");
    setDate("");
    setSingleAmount("");
    setStandingAmountMode("total");
    setStandingAmount("");
    setStandingStartDate("");
    setStandingPayments("");
  }, [open]);

  const modalTitle = useMemo(() => {
    const ending = getCardEnding(sourceAccountId);
    return `${t("addManualExpenseToCardEndingWith")} ${ending}`;
  }, [sourceAccountId, t]);

  async function onSubmit() {
    setSaving(true);
    try {
      const payload =
        entryType === "single"
          ? {
              entryType,
              connectionId: sourceConnectionKey,
              sourceAccountId,
              description,
              category,
              amount: singleAmount,
              date: formatDateInput(date),
            }
          : {
              entryType,
              connectionId: sourceConnectionKey,
              sourceAccountId,
              description,
              category,
              amount: standingAmount,
              amountMode: standingAmountMode,
              startDate: formatDateInput(standingStartDate),
              numberOfPayments: entryType === "payments" ? standingPayments : 1,
            };
      await createManualExpense(payload);
      onSaved?.();
      onClose?.();
    } catch (error) {
      onError?.(error?.message || t("failedSaveManualExpense"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <GenericModal
      open={open}
      onClose={onClose}
      headerText={modalTitle}
      width={620}
    >
      <Stack spacing={2.2} dir={direction} sx={{ px: isRtl ? 0.5 : 0 }}>
        <Dropdown
          labelId="manual-expense-type"
          label={t("manualExpenseType")}
          labelShrink
          inputLabelSx={labelSx}
          value={entryType}
          onChange={(event) => setEntryType(event.target.value)}
          required
        >
          <MenuItem value="single">{t("manualExpenseSingleItem")}</MenuItem>
          <MenuItem value="standing">{t("manualExpenseStandingOrder")}</MenuItem>
          <MenuItem value="payments">{t("manualExpensePayments")}</MenuItem>
        </Dropdown>

        {entryType === "single" ? (
          <>
            <TextField
              fullWidth
              label={t("manualExpenseDescription")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              InputLabelProps={{ shrink: true, sx: labelSx }}
            />
            <TextField
              fullWidth
              type="number"
              label={t("manualStandingOrderAmount")}
              value={singleAmount}
              onChange={(event) => setSingleAmount(event.target.value)}
              inputProps={{ min: 0, step: "0.01" }}
              InputLabelProps={{ shrink: true, sx: labelSx }}
            />
            <Dropdown
              labelId="manual-expense-category"
              label={t("manualExpenseCategory")}
              labelShrink
              inputLabelSx={labelSx}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((categoryValue) => (
                <MenuItem key={categoryValue} value={categoryValue}>
                  {categoryValue}
                </MenuItem>
              ))}
            </Dropdown>
            <TextField
              fullWidth
              type="date"
              label={t("manualExpenseDate")}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              InputLabelProps={{ shrink: true, sx: labelSx }}
            />
            {date && (
              <TextField
                fullWidth
                value={formatDateDisplay(date)}
                label={`${t("manualExpenseDate")} (dd/MM/yyyy)`}
                InputProps={{ readOnly: true }}
                InputLabelProps={{ shrink: true, sx: labelSx }}
              />
            )}
          </>
        ) : (
          <>
            <TextField
              fullWidth
              label={t("manualExpenseDescription")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              InputLabelProps={{ shrink: true, sx: labelSx }}
            />
            <Dropdown
              labelId="manual-standing-category"
              label={t("manualExpenseCategory")}
              labelShrink
              inputLabelSx={labelSx}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((categoryValue) => (
                <MenuItem key={categoryValue} value={categoryValue}>
                  {categoryValue}
                </MenuItem>
              ))}
            </Dropdown>
            <Dropdown
              labelId="manual-standing-amount-mode"
              label={t("manualStandingOrderAmountMode")}
              labelShrink
              inputLabelSx={labelSx}
              value={standingAmountMode}
              onChange={(event) => setStandingAmountMode(event.target.value)}
              required
            >
              <MenuItem value="total">
                {t("manualStandingOrderAmountModeTotal")}
              </MenuItem>
              <MenuItem value="each">
                {t("manualStandingOrderAmountModeEach")}
              </MenuItem>
            </Dropdown>
            <TextField
              fullWidth
              type="number"
              label={t("manualStandingOrderAmount")}
              value={standingAmount}
              onChange={(event) => setStandingAmount(event.target.value)}
              inputProps={{ min: 0, step: "0.01" }}
              InputLabelProps={{ shrink: true, sx: labelSx }}
            />
            <Stack
              direction="row"
              sx={{
                width: "100%",
                display: "grid",
                gridTemplateColumns:
                  entryType === "standing" ? "1fr" : "1fr 1fr",
                columnGap: 1.5,
                alignItems: "start",
              }}
            >
              <TextField
                fullWidth
                type="date"
                label={t("manualStandingOrderStartDate")}
                value={standingStartDate}
                onChange={(event) => setStandingStartDate(event.target.value)}
                InputLabelProps={{ shrink: true, sx: labelSx }}
                sx={{
                  minWidth: 0,
                  "& .MuiInputLabel-root": {
                    right: isRtl ? 0 : "auto",
                    left: isRtl ? "auto" : 0,
                    transformOrigin: isRtl ? "top right" : "top left",
                  },
                }}
              />
              {standingStartDate && (
                <TextField
                  fullWidth
                  value={formatDateDisplay(standingStartDate)}
                  label={`${t("manualStandingOrderStartDate")} (dd/MM/yyyy)`}
                  InputProps={{ readOnly: true }}
                  InputLabelProps={{ shrink: true, sx: labelSx }}
                  sx={{ minWidth: 0 }}
                />
              )}
              {entryType === "payments" && (
                <TextField
                  fullWidth
                  type="number"
                  label={t("manualStandingOrderPaymentsCount")}
                  value={standingPayments}
                  onChange={(event) => setStandingPayments(event.target.value)}
                  inputProps={{ min: 1 }}
                  InputLabelProps={{ shrink: true, sx: labelSx }}
                  sx={{
                    minWidth: 0,
                    "& .MuiInputLabel-root": {
                      right: isRtl ? 0 : "auto",
                      left: isRtl ? "auto" : 0,
                      transformOrigin: isRtl ? "top right" : "top left",
                    },
                  }}
                />
              )}
            </Stack>
          </>
        )}

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
          <Button type="button" variant="outlined" onClick={onClose} fullWidth>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="contained"
            onClick={onSubmit}
            fullWidth
            disabled={saving}
          >
            {t("save")}
          </Button>
        </Stack>
      </Stack>
    </GenericModal>
  );
}
