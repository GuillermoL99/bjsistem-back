import { Router } from "express";
import Order from "../models/Orders.js";
import TicketType from "../models/TicketType.js";
import ListSettings from "../models/ListSettings.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth());

// helper — obtener o crear settings
async function getSettings() {
  let s = await ListSettings.findOne({ key: "free_list" });
  if (!s) s = await ListSettings.create({ key: "free_list" });
  return s;
}

// GET /admin/list — devuelve solo Lista Free (manuales sin ticketId)
router.get("/", async (req, res) => {
  try {
    const [orders, settings] = await Promise.all([
      Order.find({ status: "manual", ticketId: null })
        .select("buyer_firstName buyer_lastName buyer_dni orderId scanned scannedAt addedBy")
        .lean(),
      getSettings(),
    ]);

    const freePeople = orders.map((o) => ({
      orderId: o.orderId,
      firstName: o.buyer_firstName || "",
      lastName: o.buyer_lastName || "",
      dni: o.buyer_dni || "",
      scanned: !!o.scanned,
      manual: true,
      addedBy: o.addedBy || null,
    }));

    res.json({
      eventDate: settings.eventDate || null,
      people: freePeople,
    });
  } catch (e) {
    console.error("[adminList] error:", e);
    res.status(500).json({ error: "server_error" });
  }
});


// POST /admin/list — crear lista (setea fecha)
router.post("/", requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const { eventDate } = req.body || {};
    if (!eventDate) return res.status(400).json({ error: "missing_eventDate" });
    const s = await getSettings();
    s.eventDate = eventDate;
    await s.save();
    res.json({ ok: true, eventDate: s.eventDate });
  } catch (e) {
    console.error("[adminList] create list error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /admin/list/all — eliminar lista (borra fecha y personas)
router.delete("/all", requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const [result] = await Promise.all([
      Order.deleteMany({ status: "manual", ticketId: null }),
      ListSettings.updateOne({ key: "free_list" }, { $set: { eventDate: null } })
    ]);
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (e) {
    console.error("[adminList] delete all error:", e);
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

// POST /admin/list — agregar persona manual a un evento o a Lista Free
router.post("/", async (req, res) => {
  try {
    let { ticketId, firstName, lastName, dni } = req.body || {};
    firstName = String(firstName || "").trim();
    lastName = String(lastName || "").trim();
    dni = String(dni || "").trim();

    if (!firstName) return res.status(400).json({ error: "missing_firstName" });
    if (!lastName) return res.status(400).json({ error: "missing_lastName" });
    if (!dni) return res.status(400).json({ error: "missing_dni" });

    // Verificar duplicado por DNI en el mismo evento/lista
    const dupeQuery = { buyer_dni: dni, status: { $in: ["approved", "manual"] } };
    if (ticketId && ticketId !== "free") {
      dupeQuery.ticketId = ticketId;
    } else {
      dupeQuery.ticketId = null;
    }
    const exists = await Order.findOne(dupeQuery).lean();
    if (exists) return res.status(409).json({ error: "duplicate_dni" });

    const orderId = `MANUAL_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const doc = {
      orderId,
      buyer_firstName: firstName,
      buyer_lastName: lastName,
      buyer_dni: dni,
      quantity: 1,
      status: "manual",
    };

    if (ticketId && ticketId !== "free") {
      const ticket = await TicketType.findById(ticketId).lean();
      if (!ticket) return res.status(404).json({ error: "ticket_not_found" });
      doc.ticketId = ticket._id;
      doc.title = ticket.name;
    } else {
      doc.title = "Lista Free";
    }

    doc.addedBy = req.user?.username || null;

    await Order.create(doc);

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
