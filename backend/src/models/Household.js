import mongoose from "mongoose";

const accountVisibilityRuleSchema = new mongoose.Schema(
  {
    sourceAccountId: { type: String, default: "" },
    visibilityScope: {
      type: String,
      enum: ["shared", "private"],
      default: "shared",
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedAt: { type: Date, default: null },
    billingDay: {
      type: Number,
      min: 1,
      max: 31,
      default: null,
    },
  },
  { _id: false, id: false },
);

const bankConnectionSchema = new mongoose.Schema(
  {
    companyId: { type: String, default: "" },
    connectionName: { type: String, default: "" },
    visibilityScope: {
      type: String,
      enum: ["shared", "private"],
      default: "shared",
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    usernameEnc: { type: String, default: "" },
    nationalIdEnc: { type: String, default: "" },
    passwordEnc: { type: String, default: "" },
    encryptedFields: {
      type: Map,
      of: String,
      default: {},
    },
    accountVisibilityRules: {
      type: [accountVisibilityRuleSchema],
      default: [],
    },
    updatedAt: { type: Date, default: null },
    lastBankFetchAt: { type: Date, default: null },
  },
  { _id: true, id: false },
);

const householdSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    bankConnections: {
      type: [bankConnectionSchema],
      default: [],
    },
    bankSync: {
      lockUntil: { type: Date, default: null },
      lockOwner: { type: String, default: "" },
      lastStartedAt: { type: Date, default: null },
      lastCompletedAt: { type: Date, default: null },
      lastReason: { type: String, default: "" },
      updatedAt: { type: Date, default: null },
    },
    lastActiveAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("Household", householdSchema);
