// src/routes/tickets.js — Feedback y tickets de soporte (reemplaza feedback.json)
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Ticket  = require('../models/Ticket');
const { verificarToken, soloAdmin } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/tickets ─────────────────────────────────────────────────────────
// Cualquier usuario autenticado puede enviar un ticket o rating
router.post('/', verificarToken, async (req, res) => {
  const { archivo, tipo, estrellas, mensaje } = req.body;

  try {
    const ticket = await Ticket.create({
      ticketId: uuidv4().substring(0, 8),
      username: req.usuario.username,
      archivo:  archivo  || 'Desconocido',
      tipo:     tipo     || 'rating',
      estrellas: estrellas ?? 0,
      mensaje:  mensaje  || '',
    });
    return res.json({ ok: true, mensaje: 'Enviado con éxito.', ticket });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/tickets ──────────────────────────────────────────────────────────
// Solo admin puede ver todos los tickets
router.get('/', verificarToken, soloAdmin, async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ creadoEn: -1 });
    return res.json({ ok: true, data: tickets });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/tickets/:id/cerrar ──────────────────────────────────────────────
// Solo admin puede cerrar un ticket
router.post('/:ticketId/cerrar', verificarToken, soloAdmin, async (req, res) => {
  try {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId: req.params.ticketId },
      { estado: 'cerrado' },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ ok: false, error: 'Ticket no encontrado.' });
    return res.json({ ok: true, ticket });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
