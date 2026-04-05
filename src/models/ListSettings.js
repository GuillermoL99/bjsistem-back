import mongoose from "mongoose";

const listSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "free_list" },
  eventDate: { type: Date, default: null },
}, { timestamps: true });

const ListSettings = mongoose.model("ListSettings", listSettingsSchema);
export default ListSettings;
