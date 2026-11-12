export function searchDelay(query) {
  return [...query.trim()].length < 3 ? null : 700;
}

export function validRank(result, comparison) {
  return Boolean(result.complete && !comparison.comparisonIncomplete && Number.isInteger(result.rank) && result.rank > 0);
}

export function itemName(item, fallback) {
  return (item.selectionType === "canonical" && item.description) || item.productId?.name || item.productIds?.find((product) => product?.name)?.name || item.groupId?.name || item.description || fallback;
}

export function selectionExists(items, barcodes) {
  const key = [...barcodes].sort().join(",");
  return items.some((item) => {
    const codes = item.selectionType === "same_name" ? (item.productIds || []).map((p) => p?.barcode).filter(Boolean) : item.selectionType === "exact" && item.productId?.barcode ? [item.productId.barcode] : [];
    return codes.length === barcodes.length && codes.sort().join(",") === key;
  });
}
