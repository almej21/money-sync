import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { createManualExpense } from "../../services/expenseService";
import AppTextField from "../AppTextField";
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

function normalizeDateToIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      return raw;
    }
    return null;
  }

  const displayMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!displayMatch) return null;

  const day = Number(displayMatch[1]);
  const month = Number(displayMatch[2]);
  const year = Number(displayMatch[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatIsoToDisplay(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function DateInputWithPicker({
  label,
  value,
  onChange,
  inputLabelSx,
}) {
  const pickerRef = useRef(null);
  const pickerIsoValue = normalizeDateToIso(value) || "";

  function openPicker() {
    const input = pickerRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  return (
    <Box sx={{ position: "relative" }}>
      <AppTextField
        fullWidth
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="dd/MM/yyyy"
        inputProps={{ inputMode: "numeric", pattern: "\\d{2}/\\d{2}/\\d{4}" }}
        InputLabelProps={{ shrink: true, sx: inputLabelSx }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={openPicker}
                aria-label="Open date picker"
              >
                <CalendarTodayOutlinedIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      <input
        ref={pickerRef}
        type="date"
        value={pickerIsoValue}
        onChange={(event) => {
          const displayValue = formatIsoToDisplay(event.target.value);
          onChange(displayValue);
        }}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </Box>
  );
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
      const singleDateIso =
        entryType === "single" ? normalizeDateToIso(date) : null;
      const standingStartDateIso =
        entryType !== "single" ? normalizeDateToIso(standingStartDate) : null;

      if (entryType === "single" && !singleDateIso) {
        throw new Error("Date must be in dd/MM/yyyy format");
      }
      if (entryType !== "single" && !standingStartDateIso) {
        throw new Error("Starting date must be in dd/MM/yyyy format");
      }

      const payload =
        entryType === "single"
          ? {
              entryType,
              connectionId: sourceConnectionKey,
              sourceAccountId,
              description,
              category,
              amount: singleAmount,
              date: formatDateInput(singleDateIso),
            }
          : {
              entryType,
              connectionId: sourceConnectionKey,
              sourceAccountId,
              description,
              category,
              amount: standingAmount,
              amountMode: standingAmountMode,
              startDate: formatDateInput(standingStartDateIso),
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
            <AppTextField
              fullWidth
              label={t("manualExpenseDescription")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              InputLabelProps={{ shrink: true, sx: labelSx }}
            />
            <AppTextField
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
            <DateInputWithPicker
              label={`${t("manualExpenseDate")} (dd/MM/yyyy)`}
              value={date}
              onChange={setDate}
              inputLabelSx={labelSx}
            />
          </>
        ) : (
          <>
            <AppTextField
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
            <AppTextField
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
              <Box
                sx={{
                  minWidth: 0,
                  "& .MuiInputLabel-root": {
                    right: isRtl ? 0 : "auto",
                    left: isRtl ? "auto" : 0,
                    transformOrigin: isRtl ? "top right" : "top left",
                  },
                }}
              >
                <DateInputWithPicker
                  label={`${t("manualStandingOrderStartDate")} (dd/MM/yyyy)`}
                  value={standingStartDate}
                  onChange={setStandingStartDate}
                  inputLabelSx={labelSx}
                />
              </Box>
              {entryType === "payments" && (
                <AppTextField
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
