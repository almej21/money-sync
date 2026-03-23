export function normalizeScrapedTransactions(scraped = []) {
  return scraped.map((t) => ({
    source: "israeli-bank-scrapers",
    externalId:
      t.identifier || t.id || `${t.date}-${t.description}-${t.chargedAmount}`,
    date: t.date,
    amount: Number(t.chargedAmount || t.amount || 0),
    currency: "ILS",
    description: t.description || t.memo || "Bank transaction",
    merchant: t.description || "",
    category:
      typeof t.category === "string" && t.category.trim()
        ? t.category.trim()
        : "Imported",
    tags: [],
  }));
}
