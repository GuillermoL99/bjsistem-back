// back/src/routes/adminOrders.js
import express from "express";
import mongoose from "mongoose";
import Order from "../models/Orders.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Escapar caracteres especiales de regex para prevenir NoSQL injection
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ALLOWED_STATUSES = ["created", "pending", "approved", "rejected", "refunded", "cancelled", "manual"];

/**
 * GET /admin/orders?q=&status=
 * SUPER_ADMIN only
 */
router.get("/orders", requireAuth(), requireRole(["SUPER_ADMIN", "STAFF"]), async (req, res) => {
  try {
    const { q = "", status = "" } = req.query;

    const query = {};

    if (status) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: "invalid_status" });
      }
      query.status = status;
    }

    const qq = escapeRegex(String(q || "").trim()).slice(0, 200);
    if (qq) {
      query.$or = [
        { orderId: { $regex: qq, $options: "i" } },
        { buyer_email: { $regex: qq, $options: "i" } },
        { buyer_dni: { $regex: qq, $options: "i" } },
        { buyer_firstName: { $regex: qq, $options: "i" } },
        { buyer_lastName: { $regex: qq, $options: "i" } },
      ];
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(500).lean();

    return res.json({ orders });
  } catch (e) {
    console.error("[adminOrders] list error:", e);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /admin/orders/:orderId
router.get("/orders/:orderId", requireAuth(), requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId }).lean();
    if (!order) return res.status(404).json({ error: "not_found" });

    return res.json({ order });
  } catch (e) {
    console.error("[adminOrders] detail error:", e);
    return res.status(500).json({ error: "server_error" });
  }
});

function escapeCsv(v) {
  const s = String(v ?? "");
  // comillas + escapar comillas internas
  return `"${s.replace(/"/g, '""')}"`;
}

// GET /admin/orders.csv?q=&status=
router.get("/orders.csv", requireAuth(), requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const { q = "", status = "" } = req.query;

    const query = {};
    if (status) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: "invalid_status" });
      }
      query.status = status;
    }

    const qq = escapeRegex(String(q || "").trim()).slice(0, 200);
    if (qq) {
      query.$or = [
        { orderId: { $regex: qq, $options: "i" } },
        { buyer_email: { $regex: qq, $options: "i" } },
        { buyer_dni: { $regex: qq, $options: "i" } },
        { buyer_firstName: { $regex: qq, $options: "i" } },
        { buyer_lastName: { $regex: qq, $options: "i" } },
      ];
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(5000).lean();

    const header = [
      "createdAt",
      "orderId",
      "title",
      "quantity",
      "unit_price",
      "transaction_amount",
      "currency_id",
      "status",
      "paymentId",
      "buyer_firstName",
      "buyer_lastName",
      "buyer_email",
      "buyer_dni",
      "buyer_birthdate",
    ].join(",");

    const lines = orders.map((o) =>
      [
        escapeCsv(o.createdAt ? new Date(o.createdAt).toISOString() : ""),
        escapeCsv(o.orderId),
        escapeCsv(o.title),
        escapeCsv(o.quantity),
        escapeCsv(o.unit_price),
        escapeCsv(o.transaction_amount),
        escapeCsv(o.currency_id),
        escapeCsv(o.status),
        escapeCsv(o.paymentId),
        escapeCsv(o.buyer_firstName),
        escapeCsv(o.buyer_lastName),
        escapeCsv(o.buyer_email),
        escapeCsv(o.buyer_dni),
        escapeCsv(o.buyer_birthdate),
      ].join(",")
    );

    const csv = [header, ...lines].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="orders.csv"`);
    return res.status(200).send(csv);
  } catch (e) {
    console.error("[adminOrders] csv error:", e);
    return res.status(500).json({ error: "server_error" });
  }
});

/**
 * DELETE /admin/orders
 * Body: { ids: ["_id1", "_id2", ...] }
 * SUPER_ADMIN only
 */
router.delete("/orders", requireAuth(), requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids_required" });
    }

    if (ids.length > 500 || !ids.every(id => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ error: "invalid_ids" });
    }

    const result = await Order.deleteMany({ _id: { $in: ids } });
    return res.json({ deleted: result.deletedCount });
  } catch (e) {
    console.error("[adminOrders] delete error:", e);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;