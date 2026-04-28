import BoltIcon from "@mui/icons-material/Bolt";
import CancelIcon from "@mui/icons-material/Cancel";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import HomeIcon from "@mui/icons-material/Home";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import MovieIcon from "@mui/icons-material/Movie";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import SaveIcon from "@mui/icons-material/Save";
import SchoolIcon from "@mui/icons-material/School";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import {
  Box,
  CircularProgress,
  Collapse,
  IconButton,
  ListItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { memo, useEffect, useState } from "react";
import { updateExpense as updateExpenseRequest } from "../services/expenseService";
import PingPongTypography from "./PingPongTypography";

function formatDateTime(value, locale) {
  if (!value) return "-";
  return new Date(value).toLocaleString(locale);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate());
  const month = String(date.getMonth() + 1);
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function detailLine(label, value) {
  return `${label}: ${value || "-"}`;
}

function getCategoryIcon(category) {
  const value = String(category || "").toLowerCase();
  if (value.includes("מזון ומשקאות")) {
    return ShoppingCartIcon;
  }
  if (
    value.includes("home") ||
    value.includes("ריהוט") ||
    value.includes("house") ||
    value.includes("דיור")
  ) {
    return HomeIcon;
  }
  if (
    value.includes("מסעדות") ||
    value.includes("food") ||
    value.includes("restaurant") ||
    value.includes("מזון")
  ) {
    return RestaurantIcon;
  }
  if (
    value.includes("shop") ||
    value.includes("grocery") ||
    value.includes("קניות")
  ) {
    return ShoppingBagIcon;
  }
  if (
    value.includes("car") ||
    value.includes("transport") ||
    value.includes("דלק")
  ) {
    return DirectionsCarIcon;
  }
  if (
    value.includes("health") ||
    value.includes("medical") ||
    value.includes("בריאות")
  ) {
    return LocalHospitalIcon;
  }
  if (value.includes("אנרגיה")) {
    return LocalGasStationIcon;
  }

  if (
    value.includes("education") ||
    value.includes("school") ||
    value.includes("חינוך")
  ) {
    return SchoolIcon;
  }
  if (
    value.includes("movie") ||
    value.includes("entertainment") ||
    value.includes("בידור")
  ) {
    return MovieIcon;
  }
  if (
    value.includes("electric") ||
    value.includes("utility") ||
    value.includes("חשמל")
  ) {
    return BoltIcon;
  }
  return ReceiptLongIcon;
}

function ExpenseItem({
  exp,
  showSourceAccountIdAfterCategory = false,
  isExpanded,
  onToggleExpanded,
  onExpenseUpdated,
  direction,
  locale,
  t,
}) {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState(
    exp.description || "",
  );
  const [draftCategory, setDraftCategory] = useState(exp.category || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setDraftDescription(exp.description || "");
    setDraftCategory(exp.category || "");
  }, [exp.category, exp.description, exp._id]);

  const CategoryIcon = getCategoryIcon(exp.category);
  const amountValue = Number(exp.amount || 0);
  const normalizedAmount = Math.abs(amountValue);
  const isReturn =
    String(exp.transactionType || "")
      .trim()
      .toLowerCase() === "return";
  const isPending =
    String(exp.status || "")
      .trim()
      .toLowerCase() === "pending";
  const sourceTransactionType = String(exp.sourceTransactionType || "")
    .trim()
    .toLowerCase();
  const isInstallmentType = sourceTransactionType === "installments";
  const installmentNumber = Number(exp.installmentNumber);
  const installmentTotal = Number(exp.installmentTotal);
  const hasInstallmentPlan =
    Number.isFinite(installmentNumber) &&
    installmentNumber > 0 &&
    Number.isFinite(installmentTotal) &&
    installmentTotal > 0;
  const isInstallmentCharged =
    exp.isInstallmentCharged === true ||
    (exp.isInstallmentCharged !== false && hasInstallmentPlan);
  const installmentsStateText = !isInstallmentType
    ? ""
    : !isInstallmentCharged
      ? `${t("installmentsStatePrefix")} • ${t("installmentsStateNotCharged")}`
      : hasInstallmentPlan
        ? `${t("installmentProgressLabel")} ${installmentNumber}/${installmentTotal} • ${
            isPending ? t("pendingStatus") : t("postedStatus")
          }`
        : `${t("installmentsStatePrefix")} • ${t("installmentsStateCharged")} • ${
            isPending ? t("pendingStatus") : t("postedStatus")
          }`;
  const categoryText = String(exp.category || "").trim() || "-";
  const sourceAccountIdText = String(exp.sourceAccountId || "").trim();
  const shouldShowSourceAccountId =
    showSourceAccountIdAfterCategory && Boolean(sourceAccountIdText);
  const isHebrewLocale = String(locale || "")
    .toLowerCase()
    .startsWith("he");
  const metaDisplayDirection = isHebrewLocale ? "rtl" : "ltr";
  const editedLabel = String(locale || "")
    .toLowerCase()
    .startsWith("he")
    ? "נערך"
    : "edited";
  const statusBadgeSx = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 0.9,
    px: 0.6,
    py: 0.4,
    fontFamily: theme.typography.fontFamily,
    fontWeight: 700,
    fontSize: ".6rem",
    lineHeight: 1,
    textTransform: "none",
    flexShrink: 0,
  };

  async function handleSave() {
    const nextDescription = String(draftDescription || "").trim();
    const nextCategory = String(draftCategory || "").trim();
    if (!nextDescription) {
      setSaveError(t("descriptionRequired"));
      return;
    }

    setIsSaving(true);
    setSaveError("");
    try {
      const updated = await updateExpenseRequest(exp._id, {
        description: nextDescription,
        category: nextCategory || "Uncategorized",
      });
      onExpenseUpdated?.(updated);
      setIsEditing(false);
    } catch {
      setSaveError(t("failedUpdateExpense"));
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setDraftDescription(exp.description || "");
    setDraftCategory(exp.category || "");
    setSaveError("");
    setIsEditing(false);
  }

  return (
    <div>
      <ListItem disableGutters sx={{ py: 0.75, overflow: "visible" }}>
        <Box sx={{ width: "100%", position: "relative" }}>
          {(isPending || isInstallmentType) && (
            <Box
              dir={direction}
              sx={{
                position: "absolute",
                top: 0,
                left: direction === "rtl" ? "auto" : 12,
                right: direction === "rtl" ? 12 : "auto",
                transform: "translateY(-30%)",
                zIndex: 2,
                display: "flex",
                flexWrap: "wrap",
                gap: 0.5,
                justifyContent: direction === "rtl" ? "flex-end" : "flex-start",
              }}
            >
              {isPending && (
                <Tooltip
                  title={t("pendingStatusTooltip")}
                  arrow
                  slotProps={{
                    tooltip: {
                      sx: {
                        fontFamily: theme.typography.fontFamily,
                      },
                    },
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      ...statusBadgeSx,
                      bgcolor: theme.palette.warning.main,
                      color: theme.palette.warning.contrastText,
                      cursor: "help",
                    }}
                  >
                    {t("pendingStatus")}
                  </Box>
                </Tooltip>
              )}
              {isInstallmentType && (
                <Box
                  component="span"
                  sx={{
                    ...statusBadgeSx,
                    bgcolor: theme.palette.info.main,
                    color: theme.palette.info.contrastText,
                  }}
                >
                  {installmentsStateText}
                </Box>
              )}
            </Box>
          )}
          <Box
            sx={{
              width: "100%",
              mt: (isPending || isInstallmentType) ? 0.5 : 0,
              p: 0.5,
              borderRadius: 1.2,
              bgcolor: theme.palette.background.default,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
          <IconButton
            size="small"
            aria-label={t("edit")}
            onClick={() => {
              setSaveError("");
              setIsEditing(true);
            }}
            sx={{
              width: 38,
              height: 38,
              borderRadius: 0.9,
              bgcolor: theme.palette.secondary.main,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              alignSelf: isEditing ? "flex-start" : "center",
              p: 0,
            }}
          >
            <CategoryIcon sx={{ fontSize: 28 }} />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <Stack sx={{ gap: 1.3, py: 1 }}>
                <TextField
                  variant="outlined"
                  size="small"
                  fullWidth
                  dir={direction}
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  label={t("description")}
                  InputLabelProps={{ shrink: true }}
                  InputProps={{ notched: true }}
                  sx={{
                    "& .MuiOutlinedInput-input": {
                      paddingTop: 1,
                      paddingBottom: 1,
                    },
                  }}
                />
                <TextField
                  variant="outlined"
                  size="small"
                  fullWidth
                  dir={direction}
                  value={draftCategory}
                  onChange={(event) => setDraftCategory(event.target.value)}
                  label={t("category")}
                  InputLabelProps={{ shrink: true }}
                  InputProps={{ notched: true }}
                  sx={{
                    "& .MuiOutlinedInput-input": {
                      paddingTop: 1,
                      paddingBottom: 1,
                    },
                  }}
                />
              </Stack>
            ) : (
              <>
                <Box
                  dir={direction}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    minWidth: 0,
                    width: "fit-content",
                    maxWidth: "100%",
                  }}
                >
                  <PingPongTypography
                    sx={{
                      fontWeight: 700,
                      textAlign: direction === "rtl" ? "right" : "left",
                      lineHeight: 1.2,
                      fontSize: ".95rem",
                      flexShrink: 1,
                      minWidth: 0,
                    }}
                  >
                    {exp.description || "-"}
                  </PingPongTypography>
                  {exp.isUserAltered && (
                    <Typography
                      component="span"
                      sx={{
                        color: theme.palette.text.primary,
                        fontSize: ".7rem",
                        fontWeight: 700,
                        fontStyle: "italic",
                        textTransform: "none",
                      }}
                    >
                      {editedLabel}
                    </Typography>
                  )}
                </Box>
                <PingPongTypography
                  dir={direction}
                  sx={{
                    color: "text.primary",
                    fontWeight: 600,
                    fontSize: ".75rem",
                    textAlign: direction === "rtl" ? "right" : "left",
                  }}
                >
                  {formatDate(exp.date)} {"\u2022"}{" "}
                  <Box
                    component="span"
                    sx={{
                      direction: metaDisplayDirection,
                      unicodeBidi: "isolate",
                    }}
                  >
                    <Box component="span" sx={{ unicodeBidi: "isolate" }}>
                      {categoryText}
                    </Box>
                    {shouldShowSourceAccountId && (
                      <>
                        {" "}
                        <Box component="span" sx={{ unicodeBidi: "isolate" }}>
                          {"\u2022"}
                        </Box>{" "}
                        <Box
                          component="span"
                          sx={{ direction: "ltr", unicodeBidi: "isolate" }}
                        >
                          ({sourceAccountIdText})
                        </Box>
                      </>
                    )}
                  </Box>
                </PingPongTypography>
              </>
            )}
            {saveError && (
              <Typography
                variant="caption"
                color="error"
                dir={direction}
                sx={{ textAlign: direction === "rtl" ? "right" : "left" }}
              >
                {saveError}
              </Typography>
            )}
          </Box>
          <Stack
            sx={{
              alignItems: isEditing ? "flex-end" : "center",
              width: "fit-content",
              gap: 1.2,
              flexDirection: "column",
              alignSelf: isEditing ? "stretch" : "center",
              justifyContent: isEditing ? "space-between" : "center",
            }}
          >
            <Box
              component="span"
              sx={{
                color: isReturn ? "#00c452" : theme.palette.text.primary,
                display: "inline-flex",
                alignItems: "baseline",
                direction: "ltr",
                unicodeBidi: "isolate",
              }}
            >
              <Typography
                component="span"
                sx={{
                  fontWeight: 400,
                  fontSize: ".9rem",
                  opacity: isInstallmentType ? 0.5 : 1,
                }}
              >
                {isReturn ? "+" : ""}
                {exp.currency}
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontWeight: 800,
                  fontSize: "1rem",
                  opacity: isInstallmentType ? 0.5 : 1,
                }}
              >
                {normalizedAmount}
              </Typography>
            </Box>
            {isEditing && (
              <Stack direction="row" sx={{ alignItems: "center" }}>
                <IconButton
                  size="small"
                  aria-label={t("saveChanges")}
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <CircularProgress size={16} />
                  ) : (
                    <SaveIcon fontSize="small" />
                  )}
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={t("cancel")}
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <CancelIcon fontSize="small" />
                </IconButton>
              </Stack>
            )}
          </Stack>
          </Box>
        </Box>
      </ListItem>
      <Box sx={{ pb: 1, px: 1 }}>
        <Collapse in={Boolean(isExpanded)} >
          <Typography
            color="text.secondary"
            dir={direction}
            sx={{
              textAlign: direction === "rtl" ? "right" : "left",
              fontSize: ".8rem",
              overflowWrap: "anywhere",
            }}
          >
            {detailLine(t("merchant"), exp.merchant)}
            <br />
            {detailLine(t("reviewed"), exp.isReviewed ? t("yes") : t("no"))}
            <br />
            {detailLine(
              t("tags"),
              Array.isArray(exp.tags) && exp.tags.length
                ? exp.tags.join(", ")
                : "",
            )}
            <br />
            {detailLine(t("notes"), exp.notes)}
            <br />
            {isInstallmentType && (
              <>
                {detailLine(t("installmentsStateLabel"), installmentsStateText)}
                <br />
              </>
            )}
            {detailLine(t("created"), formatDateTime(exp.createdAt, locale))}
            <br />
            {detailLine(t("updated"), formatDateTime(exp.updatedAt, locale))}
          </Typography>
        </Collapse>
      </Box>
    </div>
  );
}

export default memo(ExpenseItem);
