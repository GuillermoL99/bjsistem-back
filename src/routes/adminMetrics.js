import express from "express";
import Order from "../models/Orders.js";
import TicketType from "../models/TicketType.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /admin/metrics
 * SUPER_ADMIN only — devuelve métricas de ventas
 */
router.get("/metrics", requireAuth(), requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    // Órdenes por status
    const statusAgg = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const byStatus = {};
    for (const s of statusAgg) {
      byStatus[s._id || "unknown"] = s.count;
    }

    // Totales de ventas aprobadas
    const approvedAgg = await Order.aggregate([
      { $match: { status: "approved" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$transaction_amount" },
          totalOrders: { $sum: 1 },
          totalTickets: { $sum: "$quantity" },
        },
      },
    ]);
    const approved = approvedAgg[0] || { totalRevenue: 0, totalOrders: 0, totalTickets: 0 };

    // Ventas por tipo de entrada
    const byTicketAgg = await Order.aggregate([
      { $match: { status: "approved" } },
      {
        $group: {
          _id: "$ticketId",
          title: { $first: "$title" },
          count: { $sum: 1 },
          tickets: { $sum: "$quantity" },
          revenue: { $sum: "$transaction_amount" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    // Ventas por día (últimos 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyAgg = await Order.aggregate([
      { $match: { status: "approved", createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          orders: { $sum: 1 },
          revenue: { $sum: "$transaction_amount" },
          tickets: { $sum: "$quantity" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // QRs escaneados
    const scannedCount = await Order.countDocuments({ scanned: true });

    // Stock actual
    const ticketTypes = await TicketType.find({}).lean();

    res.json({
      byStatus,
      approved: {
        totalRevenue: approved.totalRevenue || 0,
        totalOrders: approved.totalOrders || 0,
        totalTickets: approved.totalTickets || 0,
      },
      byTicket: byTicketAgg.map((t) => ({
        ticketId: t._id,
        title: t.title,
        orders: t.count,
        tickets: t.tickets,
        revenue: t.revenue,
      })),
      daily: dailyAgg.map((d) => ({
        date: d._id,
        orders: d.orders,
        revenue: d.revenue,
        tickets: d.tickets,
      })),
      scannedCount,
      stock: ticketTypes.map((t) => ({
        id: String(t._id),
        name: t.name,
        stock: t.stock,
        active: t.active,
      })),
    });
  } catch (e) {
    console.error("[metrics] error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
