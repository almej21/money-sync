import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  selectionType: { type: String, enum: ["exact", "generic", "same_name", "canonical", "offer"] },
  offer: { type: mongoose.Schema.Types.Mixed },
  canonicalId: { type: String },
  description: { type: String },
  note: { type: String, default: "" },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductGroup" },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  quantity: { type: Number, required: true, default: 1, min: 1, validate: Number.isSafeInteger },
});
itemSchema.pre("validate", function (next) {
  if ((this.selectionType === "exact" && (!this.productId || this.groupId)) ||
      (this.selectionType === "generic" && (!this.groupId || this.productId)) ||
      ((this.selectionType === "same_name" || this.selectionType === "canonical") && (this.productId || this.groupId || !this.productIds.length)) ||
      (this.selectionType === "canonical" && !this.canonicalId) ||
      (this.selectionType === "offer" && (!this.offer || this.productId || this.groupId || this.productIds.length))) {
    this.invalidate("selectionType", "Selection must reference exactly one matching product or group");
  }
  if (!this.selectionType && !this.description) this.invalidate("description", "Description is required");
  next();
});
const schema = new mongoose.Schema({
  selectedCities: [{ type: String }],
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household" },
  title: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  collaborators: [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, canEdit: { type: Boolean, default: true } }],
  name: { type: String, trim: true, maxlength: 100 },
  items: { type: [itemSchema], default: [] },
}, { timestamps: true, optimisticConcurrency: true });
schema.pre("validate", function (next) {
  if (!this.ownerId && !this.householdId) this.invalidate("ownerId", "An owner or household is required");
  if (!this.name && !this.title) this.invalidate("name", "A name or title is required");
  next();
});
schema.index({ householdId: 1, updatedAt: -1 });
schema.index({ ownerId: 1, updatedAt: -1 });
export default mongoose.model("ShoppingList", schema);
