import mongoose from "mongoose";

const TicketTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    priceARS: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("TicketType", TicketTypeSchema);