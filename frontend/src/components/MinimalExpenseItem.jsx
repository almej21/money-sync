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
  console.log(direction);
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
  const categoryText = String(exp?.category || "").trim() || "-";
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
          px: 0.5,
          py: 0.2,
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
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 0.35,
              justifyContent: "flex-end",
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
        <Stack direction="row" alignItems="center" spacing={0.7}>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              mt: isPending || isInstallmentType ? 0.5 : 0,
            }}
          >
            <Box
              sx={{
                minWidth: 0,
                width: "100%",
              }}
            >
              <Typography
                dir={direction}
                sx={{
                  display: "block",
                  width: "100%",
                  fontWeight: 700,
                  direction,
                  unicodeBidi: "isolate",
                  margin: 0,
                  padding: 0,
                  lineHeight: 1.2,
                  fontSize: ".72rem",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {String(exp?.description || "-").trim()}
              </Typography>
              <Box
                component="div"
                dir={direction}
                sx={{
                  color: "text.primary",
                  fontWeight: 600,
                  fontSize: ".68rem",
                  width: "100%",
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 0.35,
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
                  {formattedDate}
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
            </Box>
          </Box>
          <Box
            component="span"
            dir="ltr"
            sx={{
              color: isReturn ? "#00b909" : theme.palette.text.primary,
              display: "inline-flex",
              alignItems: "baseline",
              flexDirection: "row",
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


