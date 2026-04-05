import { Router } from "express";
import TicketType from "../models/TicketType.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const items = await TicketType.find({ active: true }).sort({ createdAt: -1 }).lean();

    // Filtrar entradas cuya fecha de evento ya pasó
    const now = new Date();
    const visible = items.filter((t) => {
      if (!t.eventDate) return true;
      const event = new Date(t.eventDate);
      // Permitir hasta las 8 AM del día siguiente al evento
      const cutoff = new Date(event);
      cutoff.setDate(cutoff.getDate() + 1);
      cutoff.setHours(8, 0, 0, 0);
      return now < cutoff;
    });

    res.json({
      tickets: visible.map((t) => ({
        id: String(t._id),
        name: t.name,
        priceARS: t.priceARS,
        stock: t.stock,
        eventDate: t.eventDate || null,
      })),
    });
  } catch (e) {
    console.error("[publicTickets] list error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;