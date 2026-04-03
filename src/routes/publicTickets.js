import { Router } from "express";
import TicketType from "../models/TicketType.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const items = await TicketType.find({ active: true }).sort({ createdAt: -1 }).lean();
    res.json({
      tickets: items.map((t) => ({
        id: String(t._id),
        name: t.name,
        priceARS: t.priceARS,
        stock: t.stock,
      })),
    });
  } catch (e) {
    console.error("[publicTickets] list error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;