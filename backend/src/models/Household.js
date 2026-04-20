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
  },
  { timestamps: true },
);

export default mongoose.model("Household", householdSchema);
