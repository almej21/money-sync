import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SyncIcon from "@mui/icons-material/Sync";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  Divider,
  MenuItem,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { formatIlsAmount } from "../../lib/currency";
import Dropdown from "../Dropdown";

function isCardSuffix(value) {
  return /^\d{4}$/.test(String(value || "").trim());
}

function formatSourceAccountLabel(account = {}, t) {
  const sourceAccountId = String(account?.sourceAccountId || "").trim();
  const sourceAccountName = String(account?.sourceAccountName || "").trim();
  if (isCardSuffix(sourceAccountId)) {
    return `${t("cardEndingWith")} ${sourceAccountId}`;
  }
  if (!sourceAccountName) return sourceAccountId;
  if (!sourceAccountId || sourceAccountName === sourceAccountId) {
    return sourceAccountName;
  }
  return `${sourceAccountName} (${sourceAccountId})`;
}

function AccountSettingsRow({
  account,
  connectionId,
  connectionVisibilityScope,
  accountVisibilityByConnection,
  billingDayByConnection,
  updatingAccountVisibilityKey,
  billingDayOptions,
  updateCardSettings,
  saving,
  loading,
  canManageBankConnections,
  onOpenManualExpense,
  manualExpensesForConnection,
  manualExpensesLoading,
  deletingManualExpenseId,
  onEditManualExpense,
  onDeleteManualExpense,
  direction,
  t,
  theme,
}) {
  const [isManualExpensesOpen, setIsManualExpensesOpen] = useState(false);
  const [expandedStandingGroups, setExpandedStandingGroups] = useState({});
  const sourceAccountId = String(account?.sourceAccountId || "").trim();
  const requestKey = `${connectionId}:${sourceAccountId}`;
  const accountVisibility =
    accountVisibilityByConnection?.[connectionId]?.[sourceAccountId] ||
    account?.visibilityScope ||
    connectionVisibilityScope ||
    "shared";
  const manualExpensesForAccount = Array.isArray(manualExpensesForConnection)
    ? manualExpensesForConnection.filter(
        (expense) =>
          String(expense?.sourceAccountId || "").trim() === sourceAccountId,
      )
    : [];
  const manualExpenseDisplayItems = manualExpensesForAccount.reduce(
    (acc, expense) => {
      if (expense?.sourceTransactionType === "standing_order") {
        const groupKey = [
          String(expense?.description || "").trim(),
          String(expense?.category || "").trim(),
          String(expense?.sourceAccountId || "").trim(),
          String(expense?.currency || "").trim(),
          String(expense?.amount || "").trim(),
          String(expense?.notes || "").trim(),
        ].join("|");

        const existing = acc.find((item) => item?._groupKey === groupKey);
        if (!existing) {
          acc.push({
            ...expense,
            _isGroupedStanding: true,
            _groupKey: groupKey,
            _groupCount: 1,
            _groupFirstDate: expense?.date || null,
            _groupLastDate: expense?.date || null,
            _groupAmountEach: Number(expense?.amount || 0),
            _standingOccurrences: [expense],
          });
          return acc;
        }

        existing._groupCount += 1;
        existing._standingOccurrences.push(expense);
        const existingFirstDateValue = new Date(existing?._groupFirstDate || 0);
        const existingLastDateValue = new Date(existing?._groupLastDate || 0);
        const currentDateValue = new Date(expense?.date || 0);
        if (
          !Number.isNaN(currentDateValue.getTime()) &&
          (Number.isNaN(existingFirstDateValue.getTime()) ||
            currentDateValue < existingFirstDateValue)
        ) {
          existing._groupFirstDate = expense?.date || existing._groupFirstDate;
        }
        if (
          !Number.isNaN(currentDateValue.getTime()) &&
          (Number.isNaN(existingLastDateValue.getTime()) ||
            currentDateValue > existingLastDateValue)
        ) {
          existing._groupLastDate = expense?.date || existing._groupLastDate;
        }
        return acc;
      }

      if (expense?.sourceTransactionType !== "installments") {
        acc.push({ ...expense, _isGroupedPayments: false });
        return acc;
      }

      const groupKey = [
        String(expense?.description || "").trim(),
        String(expense?.category || "").trim(),
        String(expense?.sourceAccountId || "").trim(),
        String(expense?.installmentTotal || "").trim(),
      ].join("|");

      const existing = acc.find((item) => item?._groupKey === groupKey);
      if (!existing) {
        acc.push({
          ...expense,
          _isGroupedPayments: true,
          _groupKey: groupKey,
          _groupAmountTotal: Number(expense?.amount || 0),
          _groupCount: 1,
          _groupFirstDate: expense?.date || null,
          _groupLastDate: expense?.date || null,
          _groupPerPaymentAmount: Number(expense?.amount || 0),
        });
        return acc;
      }

      existing._groupAmountTotal += Number(expense?.amount || 0);
      existing._groupCount += 1;
      const existingFirstDateValue = new Date(existing?._groupFirstDate || 0);
      const existingLastDateValue = new Date(existing?._groupLastDate || 0);
      const currentDateValue = new Date(expense?.date || 0);
      if (
        !Number.isNaN(currentDateValue.getTime()) &&
        (Number.isNaN(existingFirstDateValue.getTime()) ||
          currentDateValue < existingFirstDateValue)
      ) {
        existing._groupFirstDate = expense?.date || existing._groupFirstDate;
      }
      if (
        !Number.isNaN(currentDateValue.getTime()) &&
        (Number.isNaN(existingLastDateValue.getTime()) ||
          currentDateValue > existingLastDateValue)
      ) {
        existing._groupLastDate = expense?.date || existing._groupLastDate;
      }
      return acc;
    },
    [],
  );

  function formatManualDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function getManualExpenseTypeLabel(expense) {
    if (expense?._isGroupedStanding) return t("manualExpenseStandingOrder");
    if (expense?._isGroupedPayments) return t("manualExpensePayments");
    const sourceType = String(expense?.sourceTransactionType || "").trim();
    if (sourceType === "standing_order") return t("manualExpenseStandingOrder");
    if (sourceType === "manual_single") return t("manualExpenseSingleItem");
    if (sourceType === "installments") return t("manualExpensePayments");
    return "";
  }

  function formatRoundedIlsAmount(value) {
    return formatIlsAmount(Math.round(Number(value || 0)));
  }

  function getDayOfMonth(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return String(date.getDate());
  }

  return (
    <Box
      key={`${connectionId}:${sourceAccountId}`}
      sx={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      <Divider
        sx={{
          borderColor: theme.palette.text.contrastText,
          opacity: 1,
          mb: 1,
        }}
      />
      <Stack
        direction="column"
        spacing={1}
        sx={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
        }}
        alignItems={{
          xs: "stretch",
          sm: "flex-start",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "stretch", sm: "flex-start" }}
          sx={{
            width: "100%",
            columnGap: { sm: 2 },
            rowGap: { xs: 1, sm: 0 },
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.text.contrastText,
              px: ".3rem",
              pb: { xs: 0.5, sm: 0 },
              pt: { xs: 0, sm: 1.5 },
              overflowWrap: "anywhere",
              minWidth: { sm: 170 },
              flex: { sm: "0 0 auto" },
            }}
          >
            {formatSourceAccountLabel(account, t)}
          </Typography>
          <Box
            sx={{
              width: { xs: "100%", sm: 260 },
              minWidth: 0,
              mt: { xs: 0.6, sm: 0 },
            }}
          >
            <Dropdown
              labelId={`account-visibility-${connectionId}-${sourceAccountId}`}
              label={t("cardVisibility")}
              value={accountVisibility}
              onChange={(e) =>
                updateCardSettings(
                  connectionId,
                  sourceAccountId,
                  e.target.value,
                  billingDayByConnection?.[connectionId]?.[sourceAccountId] ||
                    "",
                )
              }
              required
              disabled={
                saving ||
                loading ||
                !canManageBankConnections ||
                Boolean(updatingAccountVisibilityKey) ||
                !sourceAccountId
              }
              sx={{
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                "& .MuiInputBase-root": {
                  color: theme.palette.text.contrastText,
                },
              }}
            >
              <MenuItem value="shared">{t("sharedConnection")}</MenuItem>
              <MenuItem value="private">{t("privateConnection")}</MenuItem>
            </Dropdown>
          </Box>
          <Box sx={{ width: { xs: "100%", sm: 210 }, minWidth: 0 }}>
            <Dropdown
              labelId={`account-billing-day-${connectionId}-${sourceAccountId}`}
              label={t("billingDate")}
              labelShrink
              value={
                billingDayByConnection?.[connectionId]?.[sourceAccountId] || ""
              }
              onChange={(e) =>
                updateCardSettings(
                  connectionId,
                  sourceAccountId,
                  accountVisibility,
                  e.target.value,
                )
              }
              disabled={
                saving ||
                loading ||
                !canManageBankConnections ||
                Boolean(updatingAccountVisibilityKey) ||
                !sourceAccountId
              }
              sx={{
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                "& .MuiInputBase-root": {
                  color: theme.palette.text.contrastText,
                },
              }}
            >
              <MenuItem value="">{t("optional")}</MenuItem>
              {billingDayOptions.map((day) => (
                <MenuItem key={day} value={day}>
                  {day}
                </MenuItem>
              ))}
            </Dropdown>
          </Box>
          {updatingAccountVisibilityKey === requestKey && (
            <CircularProgress
              size={16}
              sx={{
                color: theme.palette.text.contrastText,
                alignSelf: { xs: "flex-start", sm: "center" },
              }}
            />
          )}
        </Stack>
        <Box sx={{ width: "100%", mt: 0.5 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignSelf: { xs: "stretch", sm: "flex-end" }, mb: 0.8 }}
          >
            <Button
              type="button"
              variant="outlined"
              size="small"
              onClick={() => onOpenManualExpense(connectionId, account)}
              disabled={
                saving ||
                loading ||
                !canManageBankConnections ||
                !sourceAccountId
              }
              sx={{
                textTransform: "none",
                color: theme.palette.text.contrastText,
                borderColor: theme.palette.text.contrastText,
                "&:hover": {
                  borderColor: theme.palette.text.contrastText,
                  backgroundColor: "rgba(255,255,255,0.08)",
                },
              }}
            >
              {t("addManualExpense")}
            </Button>
          </Stack>
          <Button
            type="button"
            variant="text"
            onClick={() => setIsManualExpensesOpen((prev) => !prev)}
            sx={{
              p: 0,
              minWidth: 0,
              textTransform: "none",
              color: theme.palette.text.contrastText,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: theme.palette.text.contrastText, fontWeight: 700 }}
            >
              {t("manualExpensesSectionTitle")}
            </Typography>
            {isManualExpensesOpen ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            )}
          </Button>
          <Collapse in={isManualExpensesOpen}>
            {manualExpensesLoading ? (
              <Stack sx={{ py: 1 }} alignItems="flex-start">
                <CircularProgress
                  size={14}
                  sx={{ color: theme.palette.text.contrastText }}
                />
              </Stack>
            ) : manualExpenseDisplayItems.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ color: theme.palette.text.contrastText, opacity: 0.9 }}
              >
                {t("noManualExpensesFound")}
              </Typography>
            ) : (
              <Stack spacing={0.8} sx={{ mt: 0.8 }}>
                {manualExpenseDisplayItems.map((expense) => {
                  const manualExpenseId = String(expense?._id || "");
                  const isDeleting =
                    deletingManualExpenseId === manualExpenseId;
                  const isGroupedStanding = Boolean(
                    expense?._isGroupedStanding,
                  );
                  const isGroupedPayments = Boolean(
                    expense?._isGroupedPayments,
                  );
                  const standingGroupKey = String(expense?._groupKey || "");
                  const isStandingGroupExpanded =
                    expandedStandingGroups?.[standingGroupKey] !== false;
                  const standingOccurrences = isGroupedStanding
                    ? [...(expense?._standingOccurrences || [])].sort(
                        (a, b) => new Date(b?.date || 0) - new Date(a?.date || 0),
                      )
                    : [];
                  const typeLabel = getManualExpenseTypeLabel(expense);
                  const isStandingOrder =
                    isGroupedStanding ||
                    String(expense?.sourceTransactionType || "").trim() ===
                      "standing_order";
                  const displayedAmount = isGroupedPayments
                    ? Number(expense?._groupAmountTotal || 0)
                    : isGroupedStanding
                      ? Number(expense?._groupAmountEach || expense?.amount || 0)
                    : Number(expense?.amount || 0);
                  const paymentsCount = Number(expense?._groupCount || 0);
                  const perPaymentAmount = Number(
                    expense?._groupPerPaymentAmount || 0,
                  );
                  const firstPaymentDateForChargeDay = isGroupedPayments
                    ? expense?._groupFirstDate
                    : expense?.date;
                  const chargeDay = getDayOfMonth(firstPaymentDateForChargeDay);
                  const showStandingChargeDayRow =
                    isStandingOrder && Boolean(chargeDay);
                  const showPaymentsChargeDayRow =
                    isGroupedPayments && Boolean(chargeDay);
                  return (
                    <Box
                      key={manualExpenseId}
                      sx={{
                        position: "relative",
                        borderRadius: 0.7,
                        border: `2px solid ${theme.palette.primary.main}`,
                        px: 2,
                        pt: 0.5,
                        pb: isGroupedStanding ? 1.5 : 6,
                        minHeight: isGroupedStanding ? 0 : 122,
                        backgroundColor: "rgba(255,255,255,0.3)",
                      }}
                    >
                      <Typography
                        variant="h8"
                        sx={{
                          fontWeight: 700,
                          color: theme.palette.text.contrastText,
                          pr: direction === "ltr" ? 7 : 0,
                          pl: direction === "rtl" ? 7 : 0,
                        }}
                      >
                        {String(expense?.description || "-")}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: theme.palette.text.contrastText, mt: 0.5 }}
                      >
                        {String(expense?.category || "-")}
                        {typeLabel ? ` • ${typeLabel}` : ""}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: theme.palette.text.contrastText,
                          mt: 0.25,
                        }}
                      >
                        {isGroupedPayments
                          ? `${paymentsCount} ${t("manualExpensePayments")}`
                          : isGroupedStanding
                            ? `${paymentsCount} • ${t("manualExpenseStandingOrder")}`
                          : isStandingOrder
                            ? ""
                            : formatManualDate(expense?.date)}
                      </Typography>
                      {isGroupedPayments && (
                        <Typography
                          variant="body2"
                          sx={{
                            color: theme.palette.text.contrastText,
                            mt: 0.25,
                          }}
                        >
                          {`${t("manualExpenseEachPayment")}: ${formatRoundedIlsAmount(perPaymentAmount)}`}
                        </Typography>
                      )}
                      {isStandingOrder && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: theme.palette.text.contrastText,
                            opacity: 0.9,
                            display: "block",
                            mt: 0.1,
                          }}
                        >
                          {`${t("manualExpenseFirstPayment")}: ${formatManualDate(
                            isGroupedStanding ? expense?._groupFirstDate : expense?.date,
                          )}`}
                        </Typography>
                      )}
                      {isGroupedPayments && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: theme.palette.text.contrastText,
                            opacity: 0.9,
                            display: "block",
                            mt: 0.1,
                          }}
                        >
                          {`${t("manualExpenseFirstPayment")}: ${formatManualDate(
                            expense?._groupFirstDate,
                          )}`}
                        </Typography>
                      )}
                      {showStandingChargeDayRow && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: theme.palette.text.contrastText,
                            opacity: 0.9,
                            display: "block",
                            mt: 0.05,
                          }}
                        >
                          {t("manualExpenseChargeDayOfMonth").replace(
                            "{day}",
                            chargeDay,
                          )}
                        </Typography>
                      )}
                      {isGroupedStanding && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: theme.palette.text.contrastText,
                            opacity: 0.9,
                            display: "block",
                            mt: 0.05,
                          }}
                        >
                          {`${t("manualExpenseLastPayment")}: ${formatManualDate(
                            expense?._groupLastDate,
                          )}`}
                        </Typography>
                      )}
                      {isGroupedPayments && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: theme.palette.text.contrastText,
                            opacity: 0.9,
                            display: "block",
                            mt: 0.05,
                          }}
                        >
                          {`${t("manualExpenseLastPayment")}: ${formatManualDate(
                            expense?._groupLastDate,
                          )}`}
                        </Typography>
                      )}
                      {showPaymentsChargeDayRow && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: theme.palette.text.contrastText,
                            opacity: 0.9,
                            display: "block",
                            mt: 0.05,
                          }}
                        >
                          {t("manualExpenseChargeDayOfMonth").replace(
                            "{day}",
                            chargeDay,
                          )}
                        </Typography>
                      )}
                      <Typography
                        variant="h6"
                        sx={{
                          position: "absolute",
                          top: 5,
                          right: direction === "ltr" ? 14 : "auto",
                          left: direction === "rtl" ? 14 : "auto",
                          fontWeight: 700,
                          color: theme.palette.text.contrastText,
                        }}
                      >
                        {isGroupedPayments
                          ? `${t("manualExpenseTotal")}: ${formatRoundedIlsAmount(displayedAmount)}`
                          : formatRoundedIlsAmount(displayedAmount)}
                      </Typography>
                      {isGroupedStanding && (
                        <Stack sx={{ mt: 0.8, pt: 0.5 }}>
                          <Button
                            type="button"
                            variant="text"
                            onClick={() =>
                              setExpandedStandingGroups((prev) => ({
                                ...prev,
                                [standingGroupKey]: !(
                                  prev?.[standingGroupKey] !== false
                                ),
                              }))
                            }
                            sx={{
                              p: 0,
                              minWidth: 0,
                              textTransform: "none",
                              color: theme.palette.text.contrastText,
                              fontWeight: 700,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "flex-start",
                              gap: 0.5,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                color: theme.palette.text.contrastText,
                                fontWeight: 700,
                              }}
                            >
                              {t("manualExpensePayments")}
                            </Typography>
                            {isStandingGroupExpanded ? (
                              <ExpandLessIcon fontSize="small" />
                            ) : (
                              <ExpandMoreIcon fontSize="small" />
                            )}
                          </Button>
                          <Collapse in={isStandingGroupExpanded}>
                            <Stack spacing={0.45} sx={{ mt: 0.4 }}>
                              {standingOccurrences.map((occurrence) => {
                                const occurrenceId = String(
                                  occurrence?._id || "",
                                );
                                const isDeletingOccurrence =
                                  deletingManualExpenseId === occurrenceId;
                                return (
                                  <Stack
                                    key={occurrenceId}
                                    direction="row"
                                    alignItems="center"
                                    justifyContent="space-between"
                                    sx={{
                                      borderRadius: 0.7,
                                      px: 0.8,
                                      py: 0.35,
                                      backgroundColor: "rgba(255,255,255,0.35)",
                                    }}
                                  >
                                    <Typography
                                      variant="caption"
                                      sx={{ color: theme.palette.text.contrastText }}
                                    >
                                      {`${formatManualDate(occurrence?.date)} • ${formatRoundedIlsAmount(occurrence?.amount)}`}
                                    </Typography>
                                    <Stack direction="row" spacing={0} sx={{ direction: "ltr", gap: "4px" }}>
                                      {direction === "rtl" ? (
                                        <>
                                          <Button
                                            type="button"
                                            variant="outlined"
                                            color="error"
                                            size="small"
                                            aria-label={t("manualExpenseDelete")}
                                            onClick={() =>
                                              onDeleteManualExpense(occurrence)
                                            }
                                            disabled={
                                              saving ||
                                              loading ||
                                              !canManageBankConnections ||
                                              isDeletingOccurrence
                                            }
                                            sx={{
                                              minWidth: 0,
                                              width: 24,
                                              height: 24,
                                              p: 0,
                                              borderRadius: 0.6,
                                              borderColor: "error.main",
                                              border: "2px solid",
                                              color: "error.main",
                                              "&:hover": {
                                                bgcolor: "error.main",
                                                borderColor: "error.main",
                                                color: "common.white",
                                              },
                                            }}
                                          >
                                            {isDeletingOccurrence ? (
                                              <CircularProgress
                                                size={12}
                                                color="inherit"
                                              />
                                            ) : (
                                              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                            )}
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outlined"
                                            size="small"
                                            aria-label={t("edit")}
                                            onClick={() => onEditManualExpense(occurrence)}
                                            disabled={
                                              saving ||
                                              loading ||
                                              !canManageBankConnections
                                            }
                                            sx={{
                                              minWidth: 0,
                                              width: 24,
                                              height: 24,
                                              p: 0,
                                              borderRadius: 0.6,
                                              borderColor: theme.palette.primary.main,
                                              border: "2px solid",
                                              color: theme.palette.primary.main,
                                              "&:hover": {
                                                bgcolor: theme.palette.primary.main,
                                                borderColor: theme.palette.primary.main,
                                                color: "common.white",
                                              },
                                            }}
                                          >
                                            <EditOutlinedIcon sx={{ fontSize: 14 }} />
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <Button
                                            type="button"
                                            variant="outlined"
                                            size="small"
                                            aria-label={t("edit")}
                                            onClick={() => onEditManualExpense(occurrence)}
                                            disabled={
                                              saving ||
                                              loading ||
                                              !canManageBankConnections
                                            }
                                            sx={{
                                              minWidth: 0,
                                              width: 24,
                                              height: 24,
                                              p: 0,
                                              borderRadius: 0.6,
                                              borderColor: theme.palette.primary.main,
                                              border: "2px solid",
                                              color: theme.palette.primary.main,
                                              "&:hover": {
                                                bgcolor: theme.palette.primary.main,
                                                borderColor: theme.palette.primary.main,
                                                color: "common.white",
                                              },
                                            }}
                                          >
                                            <EditOutlinedIcon sx={{ fontSize: 14 }} />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outlined"
                                            color="error"
                                            size="small"
                                            aria-label={t("manualExpenseDelete")}
                                            onClick={() =>
                                              onDeleteManualExpense(occurrence)
                                            }
                                            disabled={
                                              saving ||
                                              loading ||
                                              !canManageBankConnections ||
                                              isDeletingOccurrence
                                            }
                                            sx={{
                                              minWidth: 0,
                                              width: 24,
                                              height: 24,
                                              p: 0,
                                              borderRadius: 0.6,
                                              borderColor: "error.main",
                                              border: "2px solid",
                                              color: "error.main",
                                              "&:hover": {
                                                bgcolor: "error.main",
                                                borderColor: "error.main",
                                                color: "common.white",
                                              },
                                            }}
                                          >
                                            {isDeletingOccurrence ? (
                                              <CircularProgress
                                                size={12}
                                                color="inherit"
                                              />
                                            ) : (
                                              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                            )}
                                          </Button>
                                        </>
                                      )}
                                    </Stack>
                                  </Stack>
                                );
                              })}
                            </Stack>
                          </Collapse>
                        </Stack>
                      )}
                      {!isGroupedStanding && (
                      <Stack
                        direction="row"
                        spacing={0}
                        sx={{
                          position: "absolute",
                          bottom: 10,
                          right: direction === "ltr" ? 8 : "auto",
                          left: direction === "rtl" ? 8 : "auto",
                          gap: "8px",
                        }}
                      >
                        <Button
                          type="button"
                          variant="outlined"
                          size="small"
                          aria-label={t("edit")}
                          onClick={() => onEditManualExpense(expense)}
                          disabled={
                            saving || loading || !canManageBankConnections
                          }
                          sx={{
                            minWidth: 0,
                            width: 32,
                            height: 32,
                            p: 0,
                            borderRadius: 0.7,
                            borderColor: theme.palette.primary.main,
                            border: "2px solid",
                            color: theme.palette.primary.main,
                            "&:hover": {
                              bgcolor: theme.palette.primary.main,
                              borderColor: theme.palette.primary.main,
                              color: "common.white",
                            },
                          }}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </Button>
                        <Button
                          type="button"
                          variant="outlined"
                          color="error"
                          size="small"
                          aria-label={t("manualExpenseDelete")}
                          onClick={() => onDeleteManualExpense(expense)}
                          disabled={
                            saving ||
                            loading ||
                            !canManageBankConnections ||
                            isDeleting
                          }
                          sx={{
                            minWidth: 0,
                            width: 32,
                            height: 32,
                            p: 0,
                            borderRadius: 0.7,
                            borderColor: "error.main",
                            border: "2px solid",
                            color: "error.main",
                            "&:hover": {
                              bgcolor: "error.main",
                              borderColor: "error.main",
                              color: "common.white",
                            },
                          }}
                        >
                          {isDeleting ? (
                            <CircularProgress size={14} color="inherit" />
                          ) : (
                            <DeleteOutlineIcon fontSize="small" />
                          )}
                        </Button>
                      </Stack>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Collapse>
        </Box>
      </Stack>
    </Box>
  );
}

export default function Connection({
  connection,
  isExpanded,
  showSyncButton,
  isSyncingThisConnection,
  providerLabel,
  formattedLastFetch,
  direction,
  syncingConnectionId,
  saving,
  loading,
  canManageBankConnections,
  accountVisibilityByConnection,
  billingDayByConnection,
  updatingAccountVisibilityKey,
  billingDayOptions,
  toggleConnectionExpanded,
  updateCardSettings,
  openRemoveConfirmation,
  onOpenManualExpense,
  manualExpensesByConnection,
  manualExpensesLoadingByConnection,
  deletingManualExpenseId,
  onEditManualExpense,
  onDeleteManualExpense,
  syncConnection,
  t,
}) {
  const theme = useTheme();
  const connectionId = String(connection?.id || "").trim();
  const sourceAccounts = Array.isArray(connection?.sourceAccounts)
    ? connection.sourceAccounts
    : [];

  return (
    <Card
      variant="outlined"
      sx={{
        border: "none",
        boxShadow: "0 12px 28px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.1)",
      }}
    >
      <CardContent
        sx={{
          backgroundColor: theme.palette.secondary.main,
          display: "flex",
          alignItems: "stretch",
          position: "relative",
          py: 2,
          pr: 2,
          pb: 2,
          "&:last-child": {
            pb: 2,
          },
        }}
      >
        <Stack
          direction={{ xs: "row" }}
          justifyContent="space-between"
          alignItems="flex-start"
          sx={{ width: "100%", minWidth: 0, pb: 0 }}
        >
          <Stack
            spacing={0.5}
            justifyContent="center"
            sx={{ width: "100%", minWidth: 0 }}
          >
            <Typography
              sx={{ fontWeight: 600, color: theme.palette.text.contrastText }}
            >
              {providerLabel || connection.companyId}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: theme.palette.text.contrastText }}
            >
              {connection.visibilityScope === "private"
                ? t("privateConnection")
                : t("sharedConnection")}
            </Typography>
            {connection.lastBankFetchAt && (
              <Typography
                variant="body2"
                sx={{ color: theme.palette.text.contrastText }}
              >
                {t("lastBankFetch")}: {formattedLastFetch}
              </Typography>
            )}
            <Button
              type="button"
              variant="text"
              onClick={() => toggleConnectionExpanded(connectionId)}
              sx={{
                mt: 0.5,
                px: 0,
                justifyContent: "center",
                color: theme.palette.text.contrastText,
                width: "fit-content",
                minWidth: 0,
                alignSelf: "center",
                mx: "auto",
                textTransform: "none",
                boxSizing: "border-box",
              }}
            >
              {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Button>
            <Collapse
              in={isExpanded}
              sx={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
            >
              <Stack
                spacing={1}
                sx={{ mt: 1, width: "100%", maxWidth: "100%", minWidth: 0 }}
              >
                {sourceAccounts.length > 0 ? (
                  sourceAccounts.map((account) => (
                    <AccountSettingsRow
                      key={`${connectionId}:${account?.sourceAccountId || ""}`}
                      account={account}
                      connectionId={connectionId}
                      connectionVisibilityScope={connection?.visibilityScope}
                      accountVisibilityByConnection={
                        accountVisibilityByConnection
                      }
                      billingDayByConnection={billingDayByConnection}
                      updatingAccountVisibilityKey={
                        updatingAccountVisibilityKey
                      }
                      billingDayOptions={billingDayOptions}
                      updateCardSettings={updateCardSettings}
                      saving={saving}
                      loading={loading}
                      canManageBankConnections={canManageBankConnections}
                      onOpenManualExpense={onOpenManualExpense}
                      manualExpensesForConnection={
                        manualExpensesByConnection?.[connectionId] || []
                      }
                      manualExpensesLoading={Boolean(
                        manualExpensesLoadingByConnection?.[connectionId],
                      )}
                      deletingManualExpenseId={deletingManualExpenseId}
                      onEditManualExpense={onEditManualExpense}
                      onDeleteManualExpense={onDeleteManualExpense}
                      direction={direction}
                      t={t}
                      theme={theme}
                    />
                  ))
                ) : (
                  <Typography
                    variant="body2"
                    sx={{ color: theme.palette.text.contrastText }}
                  >
                    {t("noConnectionCardsDetected")}
                  </Typography>
                )}
              </Stack>
            </Collapse>
          </Stack>
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            position: "absolute",
            top: 12,
            ...(direction === "rtl" ? { left: 12 } : { right: 12 }),
            direction: "ltr",
            alignItems: "center",
          }}
        >
          {direction === "rtl" && (
            <Button
              type="button"
              variant="outlined"
              color="error"
              size="small"
              onClick={() => openRemoveConfirmation(connectionId)}
              disabled={saving || loading || !canManageBankConnections}
              sx={{
                minWidth: 0,
                width: 32,
                height: 32,
                p: 0,
                borderRadius: 0.7,
                borderColor: "error.main",
                border: "2px solid",
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
          )}
          {showSyncButton && (
            <Button
              type="button"
              variant="outlined"
              size="small"
              onClick={() => syncConnection(connectionId)}
              disabled={
                saving ||
                loading ||
                !canManageBankConnections ||
                Boolean(syncingConnectionId)
              }
              aria-label={t("syncConnection")}
              sx={{
                minWidth: 0,
                width: 32,
                height: 32,
                p: 0,
                borderRadius: 0.7,
                borderColor: theme.palette.primary.main,
                border: "2px solid",
                color: theme.palette.primary.main,
                "&:hover": {
                  bgcolor: theme.palette.primary.main,
                  borderColor: theme.palette.primary.main,
                  color: "common.white",
                },
              }}
            >
              {isSyncingThisConnection ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <SyncIcon fontSize="small" />
              )}
            </Button>
          )}
          {direction !== "rtl" && (
            <Button
              type="button"
              variant="outlined"
              color="error"
              size="small"
              onClick={() => openRemoveConfirmation(connectionId)}
              disabled={saving || loading || !canManageBankConnections}
              sx={{
                minWidth: 0,
                width: 32,
                height: 32,
                p: 0,
                borderRadius: 0.7,
                borderColor: "error.main",
                border: "2px solid",
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
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
