import mongoose from "mongoose";

const productGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  },
  { timestamps: true },
);

export default mongoose.model("ProductGroup", productGroupSchema);
