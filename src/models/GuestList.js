import mongoose from "mongoose";

const guestListSchema = new mongoose.Schema({
  eventDate: { type: Date, required: true },
  createdBy: { type: String, required: true }, // username del creador
}, { timestamps: true });

const GuestList = mongoose.model("GuestList", guestListSchema);
export default GuestList;
