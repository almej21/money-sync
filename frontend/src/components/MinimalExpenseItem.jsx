import {
  Box,
  ListItem,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate());
  const month = String(date.getMonth() + 1);
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export default function MinimalExpenseItem({
  exp,
  showSourceAccountIdAfterCategory = false,
  direction,
  t,
}) {
  const theme = useTheme();
  const amountValue = Number(exp?.amount || 0);
  const normalizedAmount = Math.abs(amountValue);
  const isReturn =
    String(exp?.transactionType || "")
      .trim()
      .toLowerCase() === "return";
  const isPending =
    String(exp?.status || "")
      .trim()
      .toLowerCase() === "pending";
  const sourceTransactionType = String(exp?.sourceTransactionType || "")
    .trim()
    .toLowerCase();
  const isInstallmentType = sourceTransactionType === "installments";
  const installmentNumber = Number(exp?.installmentNumber);
  const installmentTotal = Number(exp?.installmentTotal);
  const hasInstallmentPlan =
    Number.isFinite(installmentNumber) &&
    installmentNumber > 0 &&
    Number.isFinite(installmentTotal) &&
    installmentTotal > 0;
  const isInstallmentCharged =
    exp?.isInstallmentCharged === true ||
    (exp?.isInstallmentCharged !== false && hasInstallmentPlan);
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
  const sourceAccountIdText = String(exp?.sourceAccountId || "").trim();
  const shouldShowSourceAccountId =
    showSourceAccountIdAfterCategory && Boolean(sourceAccountIdText);
  const formattedDate = formatDate(exp?.date);
  const amountCurrency = String(exp?.currency || "").trim() || "₪";
  const statusBadgeSx = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 0.7,
    px: 0.45,
    py: 0.2,
    fontWeight: 700,
    fontSize: ".52rem",
    lineHeight: 1,
    flexShrink: 0,
  };

  return (
    <ListItem disableGutters sx={{ py: 0.2 }}>
      <Box
        sx={{
          width: "100%",
          position: "relative",
          p: 0.35,
          borderRadius: 0.9,
          bgcolor: theme.palette.background.default,
        }}
      >
        {(isPending || isInstallmentType) && (
          <Box
            dir={direction}
            sx={{
              position: "absolute",
              top: 0,
              left: 8,
              right: 8,
              transform: "translateY(-35%)",
              zIndex: 2,
              display: "flex",
              flexDirection: direction === "rtl" ? "row-reverse" : "row",
              flexWrap: "wrap",
              gap: 0.35,
              justifyContent: direction === "rtl" ? "flex-end" : "flex-start",
            }}
          >
            {isPending && (
              <Tooltip title={t("pendingStatusTooltip")} arrow>
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
        <Stack
          direction={direction === "rtl" ? "row-reverse" : "row"}
          alignItems="center"
          spacing={0.7}
          sx={{ direction: "ltr" }}
        >
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              textAlign: "start",
              mt: isPending || isInstallmentType ? 0.5 : 0,
            }}
          >
            <Stack
              direction={direction === "rtl" ? "row-reverse" : "row"}
              alignItems="center"
              spacing={0.35}
              sx={{
                minWidth: 0,
                width: "100%",
                justifyContent: "flex-start",
              }}
            >
              <Typography
                component="span"
                dir={direction === "rtl" ? "auto" : "ltr"}
                sx={{
                  fontWeight: 700,
                  fontSize: ".72rem",
                  fontFamily: "inherit",
                  flexShrink: 1,
                  maxWidth: "100%",
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  unicodeBidi: "plaintext",
                  textAlign: direction === "rtl" ? "right" : "left",
                }}
              >
                {String(exp?.description || "-")}
              </Typography>
              {direction === "rtl" && (
                <Typography
                  component="span"
                  sx={{
                    fontWeight: 600,
                    fontSize: ".72rem",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    direction: "ltr",
                    unicodeBidi: "isolate",
                  }}
                >
                  {"\u2022"}
                </Typography>
              )}
              <Typography
                component="span"
                sx={{
                  fontWeight: 600,
                  fontSize: ".72rem",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  direction,
                }}
              >
                {direction === "rtl" ? "" : "\u2022 "}
                <Box component="span" sx={{ direction: "ltr" }}>
                  {formattedDate}
                </Box>
                {shouldShowSourceAccountId && (
                  <>
                    {" \u2022 "}
                    <Box
                      component="span"
                      sx={{ direction: "ltr", unicodeBidi: "bidi-override" }}
                    >
                      ({sourceAccountIdText})
                    </Box>
                  </>
                )}
              </Typography>
            </Stack>
          </Box>
          <Box
            component="span"
            dir="ltr"
            sx={{
              color: isReturn ? "#00b909" : theme.palette.text.primary,
              display: "inline-flex",
              alignItems: "baseline",
              gap: 0.35,
              fontWeight: 800,
              unicodeBidi: "bidi-override",
              flexShrink: 0,
            }}
          >
            {isReturn && (
              <Typography
                component="span"
                sx={{
                  fontWeight: 400,
                  fontSize: ".72rem",
                }}
              >
                +
              </Typography>
            )}
            <Typography
              component="span"
              sx={{
                fontWeight: 400,
                fontSize: ".72rem",
              }}
            >
              {amountCurrency}
            </Typography>
            <Typography
              component="span"
              sx={{
                fontWeight: 800,
                fontSize: ".82rem",
              }}
            >
              {normalizedAmount}
            </Typography>
          </Box>
        </Stack>
      </Box>
    </ListItem>
  );
}
