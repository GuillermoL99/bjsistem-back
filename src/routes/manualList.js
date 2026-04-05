import express from "express";
import Order from "../models/Orders.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Crear persona manualmente (solo nombre, apellido, dni)
router.post("/manual", requireAuth(), requireRole(["SUPER_ADMIN", "STAFF"]), async (req, res) => {
  try {
    const { nombre, apellido, dni } = req.body;
    if (!nombre || !apellido || !dni) {
      return res.status(400).json({ error: "missing_fields" });
    }

    // Crear orden manual (sin pago)
    const order = await Order.create({
      orderId: uuidv4(),
      buyer_firstName: nombre,
      buyer_lastName: apellido,
      buyer_dni: dni,
      status: "manual",
      addedBy: req.user?.username || null,
    });

    res.status(201).json({ ok: true, order });
  } catch (e) {
    console.error("[manual add] error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
