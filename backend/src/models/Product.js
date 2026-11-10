import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    barcode: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    brand: { type: String, trim: true },
    packageSize: { type: String, trim: true },
  },
  { timestamps: true },
);

export default mongoose.model("Product", productSchema);
