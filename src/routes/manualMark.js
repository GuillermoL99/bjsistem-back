import express from "express";
import Order from "../models/Orders.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Marcar/desmarcar persona como pasada
router.patch("/marcar/:id", requireAuth(), requireRole(["SUPER_ADMIN", "STAFF"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { passed } = req.body;
    if (typeof passed !== "boolean") {
      return res.status(400).json({ error: "invalid_passed" });
    }
    const order = await Order.findByIdAndUpdate(id, { passed }, { new: true });
    if (!order) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, order });
  } catch (e) {
    console.error("[marcar] error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
