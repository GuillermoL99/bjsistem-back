import { Router } from "express";
import GuestList from "../models/GuestList.js";
import GuestPerson from "../models/GuestPerson.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth());

// GET /admin/guest-lists — obtener todas las listas con sus personas
router.get("/", async (req, res) => {
  try {
    const lists = await GuestList.find().sort({ eventDate: -1 }).lean();
    const listIds = lists.map(l => l._id);
    const people = await GuestPerson.find({ listId: { $in: listIds } }).lean();
    const listsWithPeople = lists.map(list => ({
      ...list,
      eventDate: list.eventDate instanceof Date ? list.eventDate.toISOString().slice(0, 10) : (typeof list.eventDate === "string" ? list.eventDate.slice(0, 10) : null),
      people: people.filter(p => String(p.listId) === String(list._id)),
    }));
    res.json({ lists: listsWithPeople });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

// POST /admin/guest-lists — crear nueva lista
router.post("/", requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const { eventDate } = req.body || {};
    if (!eventDate) return res.status(400).json({ error: "missing_eventDate" });
    const exists = await GuestList.findOne({ eventDate: new Date(eventDate) });
    if (exists) return res.status(409).json({ error: "date_exists" });
    const list = await GuestList.create({ eventDate: new Date(eventDate), createdBy: req.user.username });
    res.status(201).json({ ok: true, list });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /admin/guest-lists/:listId — eliminar lista y sus personas
router.delete("/:listId", requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const { listId } = req.params;
    await GuestPerson.deleteMany({ listId });
    await GuestList.deleteOne({ _id: listId });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

// POST /admin/guest-lists/:listId/person — agregar persona
router.post("/:listId/person", requireRole(["STAFF", "SUPER_ADMIN"]), async (req, res) => {
  try {
    const { listId } = req.params;
    let { firstName, lastName, dni } = req.body || {};
    firstName = String(firstName || "").trim();
    lastName = String(lastName || "").trim();
    dni = String(dni || "").trim();
    if (!firstName || !lastName || !dni) return res.status(400).json({ error: "missing_fields" });
    // Duplicado en la misma lista
    const exists = await GuestPerson.findOne({ listId, dni });
    if (exists) return res.status(409).json({ error: "duplicate_dni" });
    const person = await GuestPerson.create({
      listId,
      firstName,
      lastName,
      dni,
      addedBy: req.user.username,
    });
    res.status(201).json({ ok: true, person });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /admin/guest-lists/:listId/person/:personId — marcar/desmarcar persona
router.patch("/:listId/person/:personId", async (req, res) => {
  try {
    const { personId } = req.params;
    const person = await GuestPerson.findById(personId);
    if (!person) return res.status(404).json({ error: "not_found" });
    person.scanned = !person.scanned;
    person.scannedAt = person.scanned ? new Date() : null;
    await person.save();
    res.json({ ok: true, scanned: person.scanned });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /admin/guest-lists/:listId/person/:personId — eliminar persona
router.delete("/:listId/person/:personId", async (req, res) => {
  try {
    const { personId } = req.params;
    await GuestPerson.deleteOne({ _id: personId });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
