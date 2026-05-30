const LTR_MARK = "\u200E";

export function formatCurrencyAmount(value, currency = "₪", options = {}) {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
  } = options;
  const numericValue = Number(value ?? 0);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
  const formattedNumber = safeValue.toLocaleString("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  });
  return `${LTR_MARK}${String(currency || "₪")}${formattedNumber}${LTR_MARK}`;
}

export function formatIlsAmount(value, options = {}) {
  return formatCurrencyAmount(value, "₪", options);
}
