import express from "express";
import Order from "../models/Orders.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

/**
 * POST /admin/scan
 * Body: { orderId: string }
 * Valida un QR y lo marca como usado. Solo usuarios autenticados (STAFF y SUPER_ADMIN).
 */
router.post("/scan", requireAuth(), async (req, res) => {
  try {
    const { orderId, ticketCode } = req.body;

    if (!orderId && !ticketCode) {
      return res.status(400).json({ ok: false, code: "invalid_input" });
    }

    // Buscar por orderId o por ticketCode
    const query = ticketCode
      ? { ticketCode: String(ticketCode).trim() }
      : { orderId: String(orderId).trim() };

    const order = await Order.findOne(query);

    if (!order) {
      return res.status(404).json({ ok: false, code: "not_found" });
    }

    if (order.status !== "approved") {
      return res.status(400).json({
        ok: false,
        code: "not_approved",
        status: order.status,
      });
    }

    if (order.scanned) {
      return res.status(409).json({
        ok: false,
        code: "already_used",
        scannedAt: order.scannedAt,
      });
    }

    order.scanned = true;
    order.scannedAt = new Date();
    await order.save();

    return res.json({
      ok: true,
      code: "valid",
      order: {
        orderId: order.orderId,
        title: order.title,
        buyer_firstName: order.buyer_firstName,
        buyer_lastName: order.buyer_lastName,
        buyer_dni: order.buyer_dni,
        quantity: order.quantity,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, code: "server_error", error: String(e?.message || e) });
  }
});

export default router;
