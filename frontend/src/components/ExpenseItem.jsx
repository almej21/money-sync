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
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { memo, useEffect, useState } from "react";
import { formatExpenseDescription } from "../lib/expenseDisplay";
import { updateExpense as updateExpenseRequest } from "../services/expenseService";
import AppTextField from "./AppTextField";
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
  categoryOptions = [],
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

  const editCategoryOptions = Array.from(
    new Set(
      (Array.isArray(categoryOptions) ? categoryOptions : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
  const hasDraftCategoryOption = editCategoryOptions.includes(
    String(draftCategory || "").trim(),
  );

  const CategoryIcon = getCategoryIcon(exp.category);
  const displayDescription = formatExpenseDescription(exp.description, t);
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
  const amountCurrency = String(exp.currency || "").trim() || "₪";
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
      <ListItem disableGutters sx={{ py: 0.2, overflow: "visible" }}>
        <Box sx={{ width: "100%", position: "relative" }}>
          {(isPending || isInstallmentType) && (
            <Box
              dir={direction}
              sx={{
                position: "absolute",
                top: 0,
                left: 12,
                right: 12,
                transform: "translateY(-30%)",
                zIndex: 2,
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 0.5,
                justifyContent: "flex-end",
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
                  dir={direction}
                  sx={{
                    ...statusBadgeSx,
                    bgcolor: theme.palette.info.main,
                    color: theme.palette.info.contrastText,
                    textAlign: direction === "rtl" ? "right" : "left",
                    direction,
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
              mt: 0,
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
                <Stack sx={{ gap: 2.5, py: 1 }}>
                  <AppTextField
                    variant="outlined"
                    size="small"
                    fullWidth
                    dir={direction}
                    value={draftDescription}
                    onChange={(event) =>
                      setDraftDescription(event.target.value)
                    }
                    label={t("description")}
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ notched: true }}
                    sx={{
                      mt: 1,
                      "& .MuiOutlinedInput-input": {
                        paddingTop: 1,
                        paddingBottom: 1,
                      },
                    }}
                  />
                  <AppTextField
                    select
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
                  >
                    {hasDraftCategoryOption ? null : (
                      <MenuItem value={draftCategory}>
                        {draftCategory || "Uncategorized"}
                      </MenuItem>
                    )}
                    {editCategoryOptions.map((optionValue) => (
                      <MenuItem key={optionValue} value={optionValue}>
                        {optionValue}
                      </MenuItem>
                    ))}
                  </AppTextField>
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
                      {displayDescription}
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
                  <Box
                    component="div"
                    dir={direction}
                    sx={{
                      color: "text.primary",
                      fontWeight: 600,
                      fontSize: ".75rem",
                      width: "100%",
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent:
                        direction === "rtl" ? "flex-start" : "flex-start",
                      gap: 0.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    <Box
                      component="span"
                      dir="ltr"
                      sx={{ unicodeBidi: "isolate", flexShrink: 0 }}
                    >
                      {formatDate(exp.date)}
                    </Box>
                    <Box component="span" sx={{ flexShrink: 0 }}>
                      {"\u2022"}
                    </Box>
                    {shouldShowSourceAccountId && (
                      <>
                        <Box
                          component="span"
                          dir="ltr"
                          sx={{ unicodeBidi: "isolate", flexShrink: 0 }}
                        >
                          ({sourceAccountIdText})
                        </Box>
                        <Box component="span" sx={{ flexShrink: 0 }}>
                          {"\u2022"}
                        </Box>
                      </>
                    )}
                    <Box
                      component="span"
                      sx={{
                        unicodeBidi: "isolate",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {categoryText}
                    </Box>
                  </Box>
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
                dir="ltr"
                sx={{
                  color: isReturn ? "#00b909" : theme.palette.text.primary,
                  display: "inline-flex",
                  alignItems: "baseline",
                  flexDirection: "row",
                  unicodeBidi: "bidi-override",
                }}
              >
                {isReturn && (
                  <Typography
                    component="span"
                    sx={{
                      fontWeight: 400,
                      fontSize: ".9rem",
                    }}
                  >
                    +
                  </Typography>
                )}
                <Typography
                  component="span"
                  sx={{
                    fontWeight: 400,
                    fontSize: ".9rem",
                  }}
                >
                  {amountCurrency}
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    fontWeight: 800,
                    fontSize: "1rem",
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
        <Collapse in={Boolean(isExpanded)}>
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


