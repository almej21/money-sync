import BoltIcon from "@mui/icons-material/Bolt";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HomeIcon from "@mui/icons-material/Home";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import MovieIcon from "@mui/icons-material/Movie";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import SchoolIcon from "@mui/icons-material/School";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import {
  Box,
  Button,
  Collapse,
  ListItem,
  Stack,
  Typography,
} from "@mui/material";

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
  isLast,
  direction,
  locale,
  t,
}) {
  const CategoryIcon = getCategoryIcon(exp.category);
  const amountValue = Number(exp.amount || 0);
  const isPositiveAmount = amountValue > 0;

  return (
    <div>
      <ListItem disableGutters sx={{ py: 0.75 }}>
        <Box
          sx={{
            width: "100%",
            p: 1.5,
            borderRadius: 1.2,
            bgcolor: "#f4f6f3",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 0.7,
              bgcolor: "#cfe1b9",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <CategoryIcon sx={{ color: "#2f3a24", fontSize: 28 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="h7"
              dir={direction}
              sx={{
                fontWeight: 700,
                textAlign: direction === "rtl" ? "right" : "left",
                lineHeight: 1.2,
              }}
            >
              {exp.description || "-"}
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
          </Box>
          <Stack sx={{ alignItems: "flex-end", minWidth: 120 }}>
            <Typography
              variant="h8"
              sx={{
                fontWeight: 800,
                color: isPositiveAmount ? "#19a700c8" : "#2f3a24",
                direction: "ltr",
                unicodeBidi: "isolate",
              }}
            >
              {exp.amount} {exp.currency}
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={() => onToggleExpanded(exp._id)}
              endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{
                mt: 0.25,
                p: 0,
                minWidth: 0,
                color: "#718355",
                fontWeight: 700,
                fontSize: ".7rem",
                fontFamily: "inherit",
                "&:hover": { bgcolor: "transparent", color: "#215b3a" },
              }}
            >
              {isExpanded ? t("hideDetails") : t("showDetails")}
            </Button>
          </Stack>
        </Box>
      </ListItem>
      <Box sx={{ pb: 1, px: 1 }}>
        <Collapse in={Boolean(isExpanded)}>
          <Typography
            variant="body2"
            color="text.secondary"
            dir={direction}
            sx={{
              textAlign: direction === "rtl" ? "right" : "left",
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
