import BoltIcon from "@mui/icons-material/Bolt";
import CancelIcon from "@mui/icons-material/Cancel";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import HomeIcon from "@mui/icons-material/Home";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import MovieIcon from "@mui/icons-material/Movie";
import PublishedWithChangesIcon from "@mui/icons-material/PublishedWithChanges";
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
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api";

function formatDateTime(value, locale) {
  if (!value) return "-";
  return new Date(value).toLocaleString(locale);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
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

export default function ExpenseItem({
  exp,
  isExpanded,
  onToggleExpanded,
  onExpenseUpdated,
  isLast,
  direction,
  locale,
  t,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState(exp.description || "");
  const [draftCategory, setDraftCategory] = useState(exp.category || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setDraftDescription(exp.description || "");
    setDraftCategory(exp.category || "");
  }, [exp.category, exp.description, exp._id]);

  const CategoryIcon = getCategoryIcon(exp.category);
  const amountValue = Number(exp.amount || 0);
  const isPositiveAmount = amountValue > 0;

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
      const updated = await api(`/expenses/${exp._id}`, {
        method: "PUT",
        body: JSON.stringify({
          description: nextDescription,
          category: nextCategory || "Uncategorized",
        }),
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
      <ListItem disableGutters sx={{ py: 0.75 }}>
        <Box
          sx={{
            width: "100%",
            p: 0.5,
            borderRadius: 1.2,
            bgcolor: "#f4f6f3",
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
              bgcolor: "#cfe1b9",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              p: 0,
            }}
          >
            <CategoryIcon sx={{ color: "#2f3a24", fontSize: 28 }} />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <Stack sx={{ gap: 0.75 }}>
                <TextField
                  size="small"
                  fullWidth
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  label={t("description")}
                />
                <TextField
                  size="small"
                  fullWidth
                  value={draftCategory}
                  onChange={(event) => setDraftCategory(event.target.value)}
                  label={t("category")}
                />
              </Stack>
            ) : (
              <>
                <Typography
                  dir={direction}
                  sx={{
                    fontWeight: 700,
                    textAlign: direction === "rtl" ? "right" : "left",
                    lineHeight: 1.2,
                    fontSize: ".95rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  {exp.description || "-"}
                  {exp.isUserAltered && (
                    <Tooltip title={t("changedByUser")}>
                      <PublishedWithChangesIcon
                        sx={{ fontSize: 16, color: "#2f3a24" }}
                      />
                    </Tooltip>
                  )}
                </Typography>
                <Typography
                  dir={direction}
                  sx={{
                    color: "text.secondary",
                    fontWeight: 600,
                    fontSize: ".8rem",
                    textAlign: direction === "rtl" ? "right" : "left",
                  }}
                >
                  {formatDate(exp.date)} {"\u2022"} {exp.category || "-"}
                </Typography>
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
          <Stack sx={{ alignItems: "flex-end", width: "fit-content", gap: 0.25 }}>
            <Typography
              sx={{
                fontWeight: 800,
                color: isPositiveAmount ? "#19a700c8" : "#2f3a24",
                direction: "ltr",
                unicodeBidi: "isolate",
                fontSize: "1rem",
              }}
            >
              {exp.amount} {exp.currency}
            </Typography>
            <Stack direction="row" sx={{ alignItems: "center" }}>
              {isEditing && (
                <>
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
                </>
              )}
            </Stack>
          </Stack>
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
            {detailLine(t("created"), formatDateTime(exp.createdAt, locale))}
            <br />
            {detailLine(t("updated"), formatDateTime(exp.updatedAt, locale))}
          </Typography>
        </Collapse>
      </Box>
    </div>
  );
}
