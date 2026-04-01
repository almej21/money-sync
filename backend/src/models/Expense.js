import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    householdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      required: true,
    },
    source: { type: String, default: "manual" },
    externalId: { type: String },
    sourceCompanyId: { type: String, default: "" },
    sourceConnectionKey: { type: String, default: "" },
    sourceAccountId: { type: String, default: "" },
    sourceAccountName: { type: String, default: "" },
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "₪" },
    description: { type: String, required: true },
    merchant: { type: String },
    category: { type: String, default: "Uncategorized" },
    notes: { type: String, default: "" },
    tags: [{ type: String }],
    isReviewed: { type: Boolean, default: false },
    isUserAltered: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

expenseSchema.index({ householdId: 1, date: -1 });
expenseSchema.index({ householdId: 1, externalId: 1 }, { unique: false });
expenseSchema.index(
  { householdId: 1, source: 1, externalId: 1, sourceConnectionKey: 1 },
  { unique: false },
);

export default mongoose.model("Expense", expenseSchema);
