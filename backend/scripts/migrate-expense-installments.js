import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Expense from "../src/models/Expense.js";
import { createExpenseDedupKey } from "../src/services/expenseDedup.js";

dotenv.config();

function parseArgs(argv = []) {
  const args = new Set(argv);
  return {
    help: args.has("--help") || args.has("-h"),
    write: args.has("--write"),
    batchSize: 500,
  };
}

function printHelp() {
  console.log(
    [
      "One-time migration: backfill installment metadata for existing scraped expenses.",
      "",
      "Scope:",
      "  source = israeli-bank-scrapers",
      "",
      "What this migration does:",
      "  1. Ensures new fields exist with safe defaults:",
      "     - sourceTransactionType, processedDate, installmentNumber, installmentTotal, isInstallmentCharged",
      "  2. Infers installment progress only when clearly present in text (e.g. 'תשלום 3 מתוך 12').",
      "  3. Rebuilds dedupKey for changed rows.",
      "",
      "Important:",
      "  Old rows without installment hints cannot be inferred reliably from DB data alone.",
      "  For full accuracy, run a fresh bank sync after deployment.",
      "",
      "Usage:",
      "  npm --prefix backend run migrate:expense-installments -- [flags]",
      "",
      "Flags:",
      "  --write      Persist changes (without this flag: dry run)",
      "  --help, -h   Show this help",
    ].join("\n"),
  );
}

function normalizeSourceTransactionType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized || "normal";
}

function toNullablePositiveInt(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.trunc(numeric);
}

function normalizeBooleanOrNull(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function inferInstallmentsFromText(expense) {
  const text = [
    expense?.description,
    expense?.merchant,
    expense?.notes,
    expense?.externalId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  if (!text) return null;

  const patterns = [
    /תשלום\s*(\d+)\s*מתוך\s*(\d+)/i,
    /installment\s*(\d+)\s*(?:\/|of|out\s*of)\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const number = toNullablePositiveInt(match[1]);
    const total = toNullablePositiveInt(match[2]);
    if (number == null || total == null) continue;
    return { installmentNumber: number, installmentTotal: total };
  }

  return null;
}

function buildNextInstallmentState(expense) {
  const currentSourceType = normalizeSourceTransactionType(
    expense?.sourceTransactionType,
  );
  const currentNumber = toNullablePositiveInt(expense?.installmentNumber);
  const currentTotal = toNullablePositiveInt(expense?.installmentTotal);
  const inferred = inferInstallmentsFromText(expense);
  const status = String(expense?.status || "")
    .trim()
    .toLowerCase();

  let sourceTransactionType = currentSourceType;
  let installmentNumber = currentNumber;
  let installmentTotal = currentTotal;
  let inferredFromText = false;

  if (inferred) {
    sourceTransactionType = "installments";
    installmentNumber = inferred.installmentNumber;
    installmentTotal = inferred.installmentTotal;
    inferredFromText = true;
  }

  if (sourceTransactionType !== "installments") {
    return {
      sourceTransactionType: "normal",
      installmentNumber: null,
      installmentTotal: null,
      isInstallmentCharged: null,
      inferredFromText,
    };
  }

  const hasPlan =
    installmentNumber != null && installmentTotal != null && installmentTotal > 0;
  const explicitBoolean = normalizeBooleanOrNull(expense?.isInstallmentCharged);
  const isInstallmentCharged =
    explicitBoolean != null
      ? explicitBoolean
      : hasPlan
        ? true
        : status === "pending"
          ? false
          : false;

  return {
    sourceTransactionType: "installments",
    installmentNumber: hasPlan ? installmentNumber : null,
    installmentTotal: hasPlan ? installmentTotal : null,
    isInstallmentCharged,
    inferredFromText,
  };
}

function normalizeProcessedDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function areDatesEqual(a, b) {
  const left = a instanceof Date ? a.getTime() : normalizeProcessedDate(a)?.getTime();
  const right =
    b instanceof Date ? b.getTime() : normalizeProcessedDate(b)?.getTime();
  return (left ?? null) === (right ?? null);
}

function buildDedupInput(expense, overrides = {}) {
  return {
    date: expense.date,
    amount: Number(expense.amount || 0),
    transactionType: String(expense.transactionType || "expense"),
    currency: expense.currency,
    description: expense.description,
    merchant: expense.merchant,
    sourceCompanyId: expense.sourceCompanyId,
    sourceAccountId: expense.sourceAccountId,
    sourceAccountName: expense.sourceAccountName,
    sourceTransactionType:
      overrides.sourceTransactionType ?? expense.sourceTransactionType,
    installmentNumber:
      overrides.installmentNumber ?? expense.installmentNumber ?? null,
    installmentTotal: overrides.installmentTotal ?? expense.installmentTotal ?? null,
    isInstallmentCharged:
      overrides.isInstallmentCharged ?? expense.isInstallmentCharged ?? null,
  };
}

async function runMigration() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await connectDB();

  const stats = {
    scanned: 0,
    changed: 0,
    inferredFromText: 0,
    markedInstallmentsNotCharged: 0,
    dryRun: !options.write,
  };

  const cursor = Expense.find({ source: "israeli-bank-scrapers" })
    .select({
      _id: 1,
      date: 1,
      amount: 1,
      transactionType: 1,
      currency: 1,
      description: 1,
      merchant: 1,
      notes: 1,
      externalId: 1,
      sourceCompanyId: 1,
      sourceAccountId: 1,
      sourceAccountName: 1,
      status: 1,
      dedupKey: 1,
      sourceTransactionType: 1,
      processedDate: 1,
      installmentNumber: 1,
      installmentTotal: 1,
      isInstallmentCharged: 1,
    })
    .cursor({ batchSize: options.batchSize });

  const ops = [];
  for await (const expense of cursor) {
    stats.scanned += 1;
    const nextInstallmentState = buildNextInstallmentState(expense);
    const nextProcessedDate = normalizeProcessedDate(expense.processedDate);
    const nextDedupKey = createExpenseDedupKey(
      buildDedupInput(expense, nextInstallmentState),
    );

    const shouldUpdate =
      normalizeSourceTransactionType(expense.sourceTransactionType) !==
        nextInstallmentState.sourceTransactionType ||
      toNullablePositiveInt(expense.installmentNumber) !==
        nextInstallmentState.installmentNumber ||
      toNullablePositiveInt(expense.installmentTotal) !==
        nextInstallmentState.installmentTotal ||
      normalizeBooleanOrNull(expense.isInstallmentCharged) !==
        nextInstallmentState.isInstallmentCharged ||
      !areDatesEqual(expense.processedDate, nextProcessedDate) ||
      String(expense.dedupKey || "") !== nextDedupKey;

    if (!shouldUpdate) continue;
    stats.changed += 1;
    if (nextInstallmentState.inferredFromText) {
      stats.inferredFromText += 1;
    }
    if (
      nextInstallmentState.sourceTransactionType === "installments" &&
      nextInstallmentState.isInstallmentCharged === false
    ) {
      stats.markedInstallmentsNotCharged += 1;
    }

    if (!options.write) continue;
    ops.push({
      updateOne: {
        filter: { _id: expense._id },
        update: {
          $set: {
            sourceTransactionType: nextInstallmentState.sourceTransactionType,
            processedDate: nextProcessedDate,
            installmentNumber: nextInstallmentState.installmentNumber,
            installmentTotal: nextInstallmentState.installmentTotal,
            isInstallmentCharged: nextInstallmentState.isInstallmentCharged,
            dedupKey: nextDedupKey,
          },
        },
      },
    });

    if (ops.length >= options.batchSize) {
      // eslint-disable-next-line no-await-in-loop
      await Expense.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }

  if (options.write && ops.length) {
    await Expense.bulkWrite(ops, { ordered: false });
  }

  console.log(JSON.stringify(stats, null, 2));
}

runMigration()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: error?.message || "Migration failed",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });

