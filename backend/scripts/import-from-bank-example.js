import { normalizeScrapedTransactions } from "../src/services/bankImporter.js";

// Example only.
// Real israeli-bank-scrapers integration should run in a worker or local script.
// Then POST normalized items to /api/expenses/import with a bearer token.

async function main() {
  const fakeScraped = [
    {
      id: "abc123",
      date: "2026-03-01",
      chargedAmount: 42.5,
      description: "Supermarket",
    },
  ];

  const items = normalizeScrapedTransactions(fakeScraped);
  console.log(JSON.stringify(items, null, 2));
}

main();
