import jwt from "jsonwebtoken";
import User from "../models/User.js";


/**
 * requireAuth()
 * - Lee Authorization: Bearer <token>
 * - Verifica JWT
 * - Busca usuario en DB y valida active
 * - Setea req.user = { id, username, role }
 */
export function requireAuth() {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || req.headers.Authorization || "";
      const [scheme, token] = String(header).split(" ");

      if (!token) return res.status(401).json({ error: "missing_token" });
      if (!scheme || scheme.toLowerCase() !== "bearer") {
        return res.status(401).json({ error: "invalid_auth_scheme" });
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const userId = payload?.sub;

      if (!userId) return res.status(401).json({ error: "invalid_token" });

      const user = await User.findById(userId).lean();
      if (!user || !user.active) return res.status(401).json({ error: "invalid_user" });

      req.user = { id: String(user._id), username: user.username, role: user.role };
      return next();
    } catch (e) {
      return res.status(401).json({ error: "invalid_token" });
    }
  };
}

/**
 * requireRole(roles)
 * - Se usa DESPUÉS de requireAuth()
 */
export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "unauthorized" });
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: "forbidden" });
    return next();
  };
}