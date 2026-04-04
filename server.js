import express from "express";
import cors from "cors";
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

import authRoutes from "./src/routes/auth.js";
import adminUsersRoutes from "./src/routes/adminUsers.js";
import adminTicketsRoutes from "./src/routes/adminTickets.js";
import publicTicketsRoutes from "./src/routes/publicTickets.js";
import { sendTicketQR } from "./src/utils/sendTicketQR.js"; // <-- AJUSTADO path

import User from "./src/models/User.js";
import Order from "./src/models/Orders.js";
import TicketType from "./src/models/TicketType.js";
import adminOrders from "./src/routes/adminOrders.js";
import adminScan from "./src/routes/adminScan.js";
import adminMetrics from "./src/routes/adminMetrics.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("OK backend running"));
app.get("/health", (req, res) =>
  res.json({ ok: true, service: "backend", date: new Date().toISOString() })
);

app.use("/auth", authRoutes);
app.use("/admin/users", adminUsersRoutes);
app.use("/admin/tickets", adminTicketsRoutes);
app.use("/tickets", publicTicketsRoutes);
app.use("/admin", adminOrders);
app.use("/admin", adminScan);
app.use("/admin", adminMetrics);

app.get("/orders/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findOne({ orderId }).lean();
  if (!order) return res.status(404).json({ error: "order_not_found", orderId });
  res.json(order);
});

function buildWebhookUrl() {
  const base = (process.env.BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  if (!base.startsWith("https://")) return null;
  return `${base}/mp/webhook`;
}

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

app.post("/checkout", async (req, res) => {
  try {
    let { ticketId, quantity = 1, buyer_email, buyer_dni, buyer_birthdate,  buyer_firstName, buyer_lastName } = req.body || {};
    const qty = Number(quantity);

    // Validaciones básicas
    if (!ticketId) return res.status(400).json({ error: "missing_ticketId" });
    if (!Number.isInteger(qty) || qty < 1 || qty > 3) {
      return res.status(400).json({ error: "invalid_quantity" });
    }

    buyer_email = String(buyer_email || "").trim();
    buyer_dni = String(buyer_dni || "").trim();
    buyer_birthdate = String(buyer_birthdate || "").trim();
    buyer_firstName = String(buyer_firstName || "").trim();
    buyer_lastName = String(buyer_lastName || "").trim();

    if (!buyer_email || !buyer_email.includes("@")) {
      return res.status(400).json({ error: "invalid_email" });
    }
    if (!/^[0-9]{7,9}$/.test(buyer_dni)) {
      return res.status(400).json({ error: "invalid_dni" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(buyer_birthdate)) {
      return res.status(400).json({ error: "invalid_birthdate" });
    }
    if (!buyer_firstName) return res.status(400).json({ error: "invalid_firstName" });
    if (!buyer_lastName) return res.status(400).json({ error: "invalid_lastName" });

    // Ticket existe y está activo
    const ticket = await TicketType.findById(ticketId).lean();
    if (!ticket || ticket.active === false) {
      return res.status(404).json({ error: "ticket_not_found" });
    }

    // Validar stock (no descontamos aún)
    if (Number(ticket.stock) < qty) {
      return res.status(400).json({ error: "no_stock" });
    }

    const orderId = `ORDER_${Date.now()}`;

    await Order.create({
      orderId,
      ticketId: ticket._id,
      title: ticket.name,
      unit_price: Number(ticket.priceARS),
      quantity: qty,
      buyer_email,
      buyer_dni,
      buyer_birthdate,
      buyer_firstName,
      buyer_lastName,
      status: "created",
      currency_id: "ARS",
    });

    res.status(201).json({ orderId });
  } catch (e) {
    console.error("[checkout] error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/mp/create-preference", async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: "missing_orderId" });

    const order = await Order.findOne({ orderId }).lean();
    if (!order) return res.status(404).json({ error: "order_not_found", orderId });

    console.log("[mp] FRONTEND_URL =", process.env.FRONTEND_URL);
    const qty = Number(order.quantity);
    if (!order.ticketId) return res.status(400).json({ error: "order_missing_ticketId" });
    if (!Number.isInteger(qty) || qty < 1 || qty > 3) {
      return res.status(400).json({ error: "invalid_quantity" });
    }

    const ticket = await TicketType.findById(order.ticketId).lean();
    if (!ticket || ticket.active === false) {
      return res.status(404).json({ error: "ticket_not_found" });
    }

    if (Number(ticket.stock) < qty) {
      return res.status(400).json({ error: "no_stock" });
    }

    const FRONTEND_BASE = (process.env.FRONTEND_URL || "http://localhost:5173")
      .trim()
      .replace(/\/+$/, "");

    const backUrls = {
      success: `${FRONTEND_BASE}/success?orderId=${order.orderId}`,
      pending: `${FRONTEND_BASE}/pending?orderId=${order.orderId}`,
      failure: `${FRONTEND_BASE}/failure?orderId=${order.orderId}`,
    };
    console.log("[mp] backUrls =", backUrls);

    const preference = new Preference(mpClient);
    const webhookUrl = buildWebhookUrl();

    const result = await preference.create({
      body: {
        items: [
          {
            title: order.title || ticket.name,
            quantity: qty,
            unit_price: Number(order.unit_price ?? ticket.priceARS),
            currency_id: order.currency_id || "ARS",
          },
        ],
        metadata: {
          orderId: order.orderId,
          buyer_email: order.buyer_email || null,
          buyer_dni: order.buyer_dni || null,
          buyer_birthdate: order.buyer_birthdate || null,
        },
        external_reference: order.orderId,
        notification_url: webhookUrl || undefined,
        back_urls: backUrls,
        back_url: backUrls,
      },
    });

    const pref = result?.id ? result : result?.body || result;

    await Order.updateOne(
      { orderId: order.orderId },
      {
        $set: {
          preferenceId: pref?.id || null,
          init_point: pref?.init_point || null,
          sandbox_init_point: pref?.sandbox_init_point || null,
        },
      }
    ).exec();

    res.json({
      orderId: order.orderId,
      init_point: pref?.init_point,
      sandbox_init_point: pref?.sandbox_init_point,
      preferenceId: pref?.id,
    });
  } catch (e) {
    console.error("[mp] create-preference error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

// MercadoPago valida la URL con GET antes de enviar POST
app.get("/mp/webhook", (req, res) => res.sendStatus(200));

app.post("/mp/webhook", async (req, res) => {
  // Mercado Pago espera 200 rápido
  res.sendStatus(200);

  try {
    console.log("[mp] webhook query:", req.query);
    console.log("[mp] webhook body:", JSON.stringify(req.body));

    const topic =
      req.query?.type || req.query?.topic || req.body?.type || req.body?.topic;
    if (topic && topic !== "payment") return;

    // Priorizar data.id (payment ID real) sobre id (notification ID)
    const paymentId =
      req.body?.data?.id ||
      req.query?.["data.id"] ||
      req.query?.id ||
      req.body?.resource;
    if (!paymentId) return;

    console.log("[mp] paymentId extraído:", paymentId);

    const payment = new Payment(mpClient);
    const paymentInfo = await payment.get({ id: String(paymentId) });

    const orderId = paymentInfo.external_reference;
    if (!orderId) return;

    const existing = await Order.findOne({ orderId }).lean();
    if (!existing) return;

    // Deduplicación: mismo paymentId y mismo status => ignorar
    if (
      existing.paymentId === String(paymentInfo.id) &&
      existing.status === paymentInfo.status
    ) {
      return;
    }

    const newStatus = paymentInfo.status || "unknown";

    // ===== DESCUENTO DE STOCK IDEMPOTENTE (ANTI DOBLE WEBHOOK) =====
    if (newStatus === "approved") {
      const reserved = await Order.findOneAndUpdate(
        { orderId, stockDeducted: { $ne: true } },
        { $set: { stockDeducted: true } },
        { returnDocument: "before" }
      ).exec();

      if (reserved) {
        if (
          reserved.ticketId &&
          Number.isInteger(reserved.quantity) &&
          reserved.quantity > 0
        ) {
          const dec = await TicketType.updateOne(
            { _id: reserved.ticketId, stock: { $gte: reserved.quantity } },
            { $inc: { stock: -reserved.quantity } }
          ).exec();

          if (dec.modifiedCount !== 1) {
            console.error("[mp] stock_not_enough_on_approval", {
              orderId,
              ticketId: String(reserved.ticketId),
              qty: reserved.quantity,
            });
          }
        }
      }
    }
    // ===============================================================

    await Order.updateOne(
      { orderId },
      {
        $set: {
          status: newStatus,
          paymentId: String(paymentInfo.id),
          live_mode: Boolean(paymentInfo.live_mode),
          transaction_amount: paymentInfo.transaction_amount ?? null,
          lastWebhookAt: new Date(),
        },
      }
    );

    console.log("[mp] payment updated:", {
      orderId,
      paymentId: paymentInfo.id,
      status: paymentInfo.status,
      status_detail: paymentInfo.status_detail,
      transaction_amount: paymentInfo.transaction_amount,
      live_mode: paymentInfo.live_mode,
    });

    // === ENVÍO DE QR CUANDO SE APRUEBA EL PAGO ===
    if (newStatus === "approved") {
      // Generar código de 6 dígitos único
      let ticketCode;
      let attempts = 0;
      do {
        ticketCode = String(Math.floor(100000 + Math.random() * 900000));
        const existing = await Order.findOne({ ticketCode });
        if (!existing) break;
        attempts++;
      } while (attempts < 10);

  const qrReserved = await Order.findOneAndUpdate(
    { orderId, qrSent: { $ne: true } },
    { $set: { qrSent: true, ticketCode } },
    { returnDocument: "before" }
  );

  console.log("[mp] qrReserved:", qrReserved ? qrReserved.orderId : null, "email:", qrReserved?.buyer_email);

  if (qrReserved) {
    try {
      await sendTicketQR(
        qrReserved.buyer_email,
        "¡Tu entrada para el evento!",
        qrReserved.orderId,
        {
          title: qrReserved.title,
          nombre: [qrReserved.buyer_firstName, qrReserved.buyer_lastName].filter(Boolean).join(" "),
          dni: qrReserved.buyer_dni,
              ticketCode,
        }
      );
      console.log("[mp] QR enviado a:", qrReserved.buyer_email);
    } catch (err) {
      console.error("[mp] Error enviando QR:", err);
    }
  }
}
    // ================================
  } catch (e) {
    console.error("[mp] Error procesando webhook:", e);
  }
});

async function ensureSuperAdmin() {
  const username = process.env.SUPERADMIN_USERNAME;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!username || !password) {
    console.log("[seed] SUPERADMIN_USERNAME/PASSWORD not set, skipping seed");
    return;
  }

  const existing = await User.findOne({ username }).exec();
  if (existing) {
    console.log(`[seed] SUPER_ADMIN exists (${username})`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({
    username,
    passwordHash,
    role: "SUPER_ADMIN",
    active: true,
  });
  console.log(`[seed] SUPER_ADMIN created (${username})`);
}

async function start() {
  try {
    if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI in .env");
    if (!process.env.JWT_SECRET) throw new Error("Missing JWT_SECRET in .env");
    if (!process.env.MP_ACCESS_TOKEN) {
      throw new Error("Missing MP_ACCESS_TOKEN in .env");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("[db] connected");

    await ensureSuperAdmin();

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () =>
      console.log(`Backend escuchando en http://localhost:${PORT}`)
    );
  } catch (e) {
    console.error("[startup] error:", e);
    process.exit(1);
  }
}

start();