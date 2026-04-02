import mongoose from "mongoose";

const bankConnectionSchema = new mongoose.Schema(
  {
    companyId: { type: String, default: "" },
    connectionName: { type: String, default: "" },
    usernameEnc: { type: String, default: "" },
    nationalIdEnc: { type: String, default: "" },
    passwordEnc: { type: String, default: "" },
    encryptedFields: {
      type: Map,
      of: String,
      default: {},
    },
    updatedAt: { type: Date, default: null },
    lastBankFetchAt: { type: Date, default: null },
  },
  { _id: true, id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    role: {
      type: String,
      enum: ["manager", "member"],
      default: "manager",
    },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household" },
    bankCredentials: {
      companyId: { type: String, default: "" },
      usernameEnc: { type: String, default: "" },
      nationalIdEnc: { type: String, default: "" },
      passwordEnc: { type: String, default: "" },
      encryptedFields: {
        type: Map,
        of: String,
        default: {},
      },
      updatedAt: { type: Date },
    },
    bankConnections: {
      type: [bankConnectionSchema],
      default: [],
    },
    defaultSelectedBankConnectionIds: {
      type: [String],
      default: [],
    },
    expenseSyncMeta: {
      lastBankFetchAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);
