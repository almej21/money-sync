import mongoose from "mongoose";

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
    defaultSelectedBankConnectionIds: {
      type: [String],
      default: [],
    },
    expenseSyncMeta: {
      lastBankFetchAt: { type: Date, default: null },
    },
    passwordResetTokenHash: { type: String, default: "" },
    passwordResetTokenExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);
