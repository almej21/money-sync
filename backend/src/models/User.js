import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
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
    expenseSyncMeta: {
      lastBankFetchAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);
