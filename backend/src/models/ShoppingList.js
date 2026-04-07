import mongoose from "mongoose";

const shoppingItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    note: { type: String, default: "" },
    completed: { type: Boolean, default: false },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true },
);

const shoppingListSchema = new mongoose.Schema(
  {
    householdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    collaborators: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        canEdit: { type: Boolean, default: true },
      },
    ],
    items: [shoppingItemSchema],
  },
  { timestamps: true },
);

shoppingListSchema.index({ householdId: 1, updatedAt: -1 });

export default mongoose.model("ShoppingList", shoppingListSchema);
