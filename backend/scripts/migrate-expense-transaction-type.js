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
      "One-time migration: normalize expense amounts and set transactionType.",
      "",
      "Rules:",
      "  amount < 0  => transactionType=return, amount=Math.abs(amount)",
      "  amount >= 0 => transactionType=expense, amount=Math.abs(amount)",
      "",
      "Usage:",
      "  npm --prefix backend run migrate:expense-transaction-type -- [flags]",
      "",
      "Flags:",
      "  --write      Persist changes (without this flag: dry run)",
      "  --help, -h   Show this help",
    ].join("\n"),
  );
}

function normalizeAmountAndType(rawAmount) {
  const numericAmount = Number(rawAmount || 0);
  if (!Number.isFinite(numericAmount)) {
    return { amount: 0, transactionType: "expense" };
  }
  return {
    amount: Math.abs(numericAmount),
    transactionType: numericAmount < 0 ? "return" : "expense",
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
    dryRun: !options.write,
  };

  const cursor = Expense.find({})
    .select({
      _id: 1,
      date: 1,
      amount: 1,
      transactionType: 1,
      dedupKey: 1,
      currency: 1,
      description: 1,
      merchant: 1,
      sourceCompanyId: 1,
      sourceAccountId: 1,
      sourceAccountName: 1,
    })
    .cursor({ batchSize: options.batchSize });

  const ops = [];
  for await (const expense of cursor) {
    stats.scanned += 1;
    const normalized = normalizeAmountAndType(expense.amount);
    const nextTransactionType = normalized.transactionType;
    const nextAmount = normalized.amount;

    const nextDedupKey = createExpenseDedupKey({
      date: expense.date,
      amount: nextAmount,
      transactionType: nextTransactionType,
      currency: expense.currency,
      description: expense.description,
      merchant: expense.merchant,
      sourceCompanyId: expense.sourceCompanyId,
      sourceAccountId: expense.sourceAccountId,
      sourceAccountName: expense.sourceAccountName,
    });

    const currentAmount = Number(expense.amount || 0);
    const currentType = String(expense.transactionType || "").trim();
    const shouldUpdate =
      currentAmount !== nextAmount ||
      currentType !== nextTransactionType ||
      String(expense.dedupKey || "") !== nextDedupKey;

    if (!shouldUpdate) continue;
    stats.changed += 1;

    if (options.write) {
      ops.push({
        updateOne: {
          filter: { _id: expense._id },
          update: {
            $set: {
              amount: nextAmount,
              transactionType: nextTransactionType,
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
