import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "missing_fields" });

  const user = await User.findOne({ username }).exec();
  if (!user || !user.active) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const token = jwt.sign(
    { role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { subject: String(user._id), expiresIn: "7d" }
  );

  res.json({ token, user: { id: String(user._id), username: user.username, role: user.role } });
});

router.get("/me", requireAuth(), async (req, res) => {
  res.json({ user: req.user });
});

export default router;