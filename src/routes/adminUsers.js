import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// Solo SUPER_ADMIN
router.use(requireAuth(), requireRole("SUPER_ADMIN"));

router.get("/", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json({
      users: users.map((u) => ({
        id: String(u._id),
        username: u.username,
        role: u.role,
        active: u.active,
        createdAt: u.createdAt,
      })),
    });
  } catch (e) {
    console.error("[adminUsers] list error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    let { username, password, role } = req.body || {};
    username = String(username || "").trim();

    if (!username || !password || !role) return res.status(400).json({ error: "missing_fields" });
    if (!["SUPER_ADMIN", "STAFF"].includes(role)) return res.status(400).json({ error: "invalid_role" });

    const exists = await User.findOne({ username }).lean();
    if (exists) return res.status(409).json({ error: "username_taken" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash, role, active: true });

    res.status(201).json({ id: String(user._id) });
  } catch (e) {
    console.error("[adminUsers] create error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body || {};

    if (typeof active !== "boolean") return res.status(400).json({ error: "invalid_active" });

    // Evitar auto-desactivar
    if (String(req.user.id) === String(id) && active === false) {
      return res.status(400).json({ error: "cannot_deactivate_self" });
    }

    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ error: "user_not_found" });

    // Recomendado: evitar desactivar a un SUPER_ADMIN (para no quedarte sin admin)
    if (user.role === "SUPER_ADMIN" && active === false) {
      return res.status(400).json({ error: "cannot_deactivate_super_admin" });
    }

    await User.updateOne({ _id: id }, { $set: { active } }).exec();
    res.json({ ok: true });
  } catch (e) {
    console.error("[adminUsers] patch error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Evitar auto-eliminarse
    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ error: "cannot_delete_self" });
    }

    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ error: "user_not_found" });

    // Evitar eliminar el último SUPER_ADMIN
    if (user.role === "SUPER_ADMIN") {
      const superAdminsCount = await User.countDocuments({ role: "SUPER_ADMIN" }).exec();
      if (superAdminsCount <= 1) {
        return res.status(400).json({ error: "cannot_delete_last_super_admin" });
      }
    }

    await User.deleteOne({ _id: id }).exec();
    res.json({ ok: true });
  } catch (e) {
    console.error("[adminUsers] delete error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;