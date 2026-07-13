// src/routes/wiki.js — CRUD de reglas custom (equivalente a POST /api/reglas/<id> de Flask)
const express   = require('express');
const WikiRegla = require('../models/WikiRegla');
const { verificarToken, soloAdmin } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/wiki/reglas ──────────────────────────────────────────────────────
// Listar todas las reglas editadas (cualquier usuario autenticado puede leerlas)
router.get('/reglas', verificarToken, async (req, res) => {
  try {
    const reglas = await WikiRegla.find().sort({ editadoEn: -1 });
    return res.json({ ok: true, reglas });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/wiki/reglas/:ruleId ──────────────────────────────────────────────
// Obtener una regla específica por ID
router.get('/reglas/:ruleId', verificarToken, async (req, res) => {
  try {
    const regla = await WikiRegla.findOne({ ruleId: req.params.ruleId });
    if (!regla) return res.status(404).json({ ok: false, error: 'Regla no encontrada.' });
    return res.json({ ok: true, regla });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/wiki/reglas/:ruleId ─────────────────────────────────────────────
// Crear o actualizar una regla (solo admin) — equivalente a POST /api/reglas/<id> de Flask
router.post('/reglas/:ruleId', verificarToken, soloAdmin, async (req, res) => {
  const { ruleId } = req.params;

  // Solo campos permitidos (misma lógica que el Flask original)
  const camposPermitidos = ['mensaje', 'descripcion', 'causa', 'solucion', 'fix_hint', 'tutorial_pasos'];
  const actualizacion = { editadoPor: req.usuario.username };

  camposPermitidos.forEach((campo) => {
    if (req.body[campo] !== undefined) {
      actualizacion[campo] = req.body[campo];
    }
  });

  try {
    const regla = await WikiRegla.findOneAndUpdate(
      { ruleId },
      { $set: actualizacion },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.json({ ok: true, mensaje: 'Regla actualizada correctamente.', regla });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /api/wiki/reglas/:ruleId ──────────────────────────────────────────
router.delete('/reglas/:ruleId', verificarToken, soloAdmin, async (req, res) => {
  try {
    await WikiRegla.findOneAndDelete({ ruleId: req.params.ruleId });
    return res.json({ ok: true, mensaje: 'Regla eliminada.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
