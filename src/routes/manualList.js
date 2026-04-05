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

    // Validar que no exista ya una persona con ese DNI y status manual
    const exists = await Order.findOne({ buyer_dni: dni, status: "manual" });
    if (exists) {
      return res.status(409).json({ error: "dni_exists" });
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


// Borrar una persona de la lista manual por ID
router.delete("/:id", requireAuth(), requireRole(["SUPER_ADMIN", "STAFF"]), async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Order.findOneAndDelete({ _id: id, status: "manual" });
    if (!deleted) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[manual delete one] error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

// Borrar todas las personas de la lista manual
router.delete("/", requireAuth(), requireRole(["SUPER_ADMIN", "STAFF"]), async (req, res) => {
  try {
    const result = await Order.deleteMany({ status: "manual" });
    res.json({ ok: true, deletedCount: result.deletedCount });
  } catch (e) {
    console.error("[manual delete all] error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
