import { Router } from "express";
import Order from "../models/Orders.js";
import TicketType from "../models/TicketType.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth());

// GET /admin/list — devuelve entradas aprobadas agrupadas por evento
router.get("/", async (req, res) => {
  try {
    const tickets = await TicketType.find().sort({ eventDate: -1, createdAt: -1 }).lean();

    const orders = await Order.find({ status: "approved" })
      .select("ticketId buyer_firstName buyer_lastName buyer_dni quantity title orderId scanned scannedAt")
      .lean();

    const grouped = tickets.map((t) => {
      const people = orders
        .filter((o) => o.ticketId && String(o.ticketId) === String(t._id))
        .map((o) => ({
          orderId: o.orderId,
          firstName: o.buyer_firstName || "",
          lastName: o.buyer_lastName || "",
          dni: o.buyer_dni || "",
          quantity: o.quantity ?? 1,
          scanned: !!o.scanned,
        }));

      return {
        ticketId: String(t._id),
        ticketName: t.name,
        eventDate: t.eventDate || null,
        active: t.active,
        people,
      };
    });

    res.json({ events: grouped });
  } catch (e) {
    console.error("[adminList] error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /admin/list/:orderId — marcar/desmarcar persona en lista
router.patch("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId: String(orderId).trim() });
    if (!order) return res.status(404).json({ error: "not_found" });

    order.scanned = !order.scanned;
    order.scannedAt = order.scanned ? new Date() : null;
    await order.save();

    res.json({ ok: true, scanned: order.scanned });
  } catch (e) {
    console.error("[adminList] toggle error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
