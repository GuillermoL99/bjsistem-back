import express from "express";
import Order from "../models/Orders.js";
import TicketType from "../models/TicketType.js";
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

    const safeOrderId = String(orderId || "").trim().slice(0, 100);
    const safeTicketCode = String(ticketCode || "").trim().slice(0, 20);

    // Buscar por orderId o por ticketCode
    const query = safeTicketCode
      ? { ticketCode: safeTicketCode }
      : { orderId: safeOrderId };

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

    // Validar fecha del evento
    if (order.ticketId) {
      const ticket = await TicketType.findById(order.ticketId).lean();
      if (ticket?.eventDate) {
        const now = new Date();
        const event = new Date(ticket.eventDate);
        // Fecha del evento: año-mes-día
        const eventY = event.getFullYear(), eventM = event.getMonth(), eventD = event.getDate();
        const nowY = now.getFullYear(), nowM = now.getMonth(), nowD = now.getDate();
        const sameDay = nowY === eventY && nowM === eventM && nowD === eventD;

        // Madrugada: si son las 00:00–07:59, también vale el evento de ayer
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yestY = yesterday.getFullYear(), yestM = yesterday.getMonth(), yestD = yesterday.getDate();
        const earlyMorning = now.getHours() < 8 && yestY === eventY && yestM === eventM && yestD === eventD;

        if (!sameDay && !earlyMorning) {
          return res.status(400).json({
            ok: false,
            code: "wrong_date",
            eventDate: ticket.eventDate,
            ticketName: ticket.name,
          });
        }
      }
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
    return res.status(500).json({ ok: false, code: "server_error" });
  }
});

export default router;
