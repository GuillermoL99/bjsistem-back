import { Router } from "express";
import TicketType from "../models/TicketType.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth(), requireRole("SUPER_ADMIN"));

router.get("/", async (req, res) => {
  try {
    const items = await TicketType.find().sort({ createdAt: -1 }).lean();
    res.json({
      tickets: items.map((t) => ({
        id: String(t._id),
        name: t.name,
        priceARS: t.priceARS,
        stock: t.stock,
        eventDate: t.eventDate || null,
        active: t.active,
        createdAt: t.createdAt,
      })),
    });
  } catch (e) {
    console.error("[adminTickets] list error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    let { name, priceARS, stock, eventDate } = req.body || {};
    name = String(name || "").trim();

    const price = Number(priceARS);
    const st = Number(stock);

    if (!name) return res.status(400).json({ error: "missing_name" });
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: "invalid_price" });
    if (!Number.isInteger(st) || st < 0) return res.status(400).json({ error: "invalid_stock" });

    const doc = { name, priceARS: price, stock: st, active: true };
    if (eventDate) doc.eventDate = new Date(eventDate);

    const created = await TicketType.create(doc);
    res.status(201).json({ id: String(created._id) });
  } catch (e) {
    console.error("[adminTickets] create error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, priceARS, stock, active, eventDate } = req.body || {};

    const update = {};

    if (name !== undefined) {
      const n = String(name || "").trim();
      if (!n) return res.status(400).json({ error: "invalid_name" });
      update.name = n;
    }

    if (priceARS !== undefined) {
      const p = Number(priceARS);
      if (!Number.isFinite(p) || p <= 0) return res.status(400).json({ error: "invalid_price" });
      update.priceARS = p;
    }

    if (stock !== undefined) {
      const s = Number(stock);
      if (!Number.isInteger(s) || s < 0) return res.status(400).json({ error: "invalid_stock" });
      update.stock = s;
    }

    if (active !== undefined) {
      if (typeof active !== "boolean") return res.status(400).json({ error: "invalid_active" });
      update.active = active;
    }

    if (eventDate !== undefined) {
      update.eventDate = eventDate ? new Date(eventDate) : null;
    }

    const exists = await TicketType.findById(id).lean();
    if (!exists) return res.status(404).json({ error: "ticket_not_found" });

    await TicketType.updateOne({ _id: id }, { $set: update }).exec();
    res.json({ ok: true });
  } catch (e) {
    console.error("[adminTickets] patch error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const exists = await TicketType.findById(id).lean();
    if (!exists) return res.status(404).json({ error: "ticket_not_found" });

    await TicketType.deleteOne({ _id: id }).exec();
    res.json({ ok: true });
  } catch (e) {
    console.error("[adminTickets] delete error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;