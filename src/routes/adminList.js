import { Router } from "express";
import Order from "../models/Orders.js";
import TicketType from "../models/TicketType.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth());

// GET /admin/list — devuelve entradas aprobadas + manuales agrupadas por evento
router.get("/", async (req, res) => {
  try {
    const tickets = await TicketType.find().sort({ eventDate: -1, createdAt: -1 }).lean();

    const orders = await Order.find({ status: { $in: ["approved", "manual"] } })
      .select("ticketId buyer_firstName buyer_lastName buyer_dni quantity title orderId scanned scannedAt status")
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
          manual: o.status === "manual",
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

// POST /admin/list — agregar persona manual a un evento
router.post("/", async (req, res) => {
  try {
    let { ticketId, firstName, lastName, dni } = req.body || {};
    firstName = String(firstName || "").trim();
    lastName = String(lastName || "").trim();
    dni = String(dni || "").trim();

    if (!ticketId) return res.status(400).json({ error: "missing_ticketId" });
    if (!firstName) return res.status(400).json({ error: "missing_firstName" });
    if (!lastName) return res.status(400).json({ error: "missing_lastName" });
    if (!dni) return res.status(400).json({ error: "missing_dni" });

    const ticket = await TicketType.findById(ticketId).lean();
    if (!ticket) return res.status(404).json({ error: "ticket_not_found" });

    const orderId = `MANUAL_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    await Order.create({
      orderId,
      ticketId: ticket._id,
      title: ticket.name,
      buyer_firstName: firstName,
      buyer_lastName: lastName,
      buyer_dni: dni,
      quantity: 1,
      status: "manual",
    });

    res.status(201).json({ ok: true, orderId });
  } catch (e) {
    console.error("[adminList] add error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /admin/list/:orderId — eliminar persona manual de la lista
router.delete("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId: String(orderId).trim() });
    if (!order) return res.status(404).json({ error: "not_found" });
    if (order.status !== "manual") return res.status(400).json({ error: "not_manual" });

    await Order.deleteOne({ _id: order._id });
    res.json({ ok: true });
  } catch (e) {
    console.error("[adminList] delete error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
