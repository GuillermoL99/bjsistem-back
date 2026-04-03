import mongoose from "mongoose";

(async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI in .env");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("[db] connected");
  } catch (e) {
    console.error("[db] connection error:", e);
  }
})();