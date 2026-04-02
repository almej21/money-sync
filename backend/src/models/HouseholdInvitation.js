import mongoose from "mongoose";

const householdInvitationSchema = new mongoose.Schema(
  {
    householdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      required: true,
    },
    inviterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    inviteeUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    inviteeEmail: { type: String, required: true, lowercase: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "revoked"],
      default: "pending",
    },
  },
  { timestamps: true },
);

householdInvitationSchema.index(
  { householdId: 1, inviteeEmail: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  },
);

householdInvitationSchema.index({ inviteeEmail: 1, status: 1, createdAt: -1 });

export default mongoose.model("HouseholdInvitation", householdInvitationSchema);
