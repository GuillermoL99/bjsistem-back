import mongoose from "mongoose";

const guestPersonSchema = new mongoose.Schema({
  listId: { type: mongoose.Schema.Types.ObjectId, ref: "GuestList", required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  dni: { type: String, required: true },
  scanned: { type: Boolean, default: false },
  scannedAt: { type: Date, default: null },
  addedBy: { type: String, required: true }, // username del staff
}, { timestamps: true });

const GuestPerson = mongoose.model("GuestPerson", guestPersonSchema);
export default GuestPerson;
