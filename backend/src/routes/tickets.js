const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Ticket  = require('../models/Ticket');
const { verificarToken, soloAdmin } = require('../middleware/auth');

const router = express.Router();

// ── Configuración para archivos de respuesta ──────────────────────────────────
const RESPUESTAS_DIR = path.resolve(__dirname, '../../uploads/respuestas');
const ORIGINALES_DIR = path.resolve(__dirname, '../../uploads/originales');
fs.mkdirSync(RESPUESTAS_DIR, { recursive: true });

const storageRespuestas = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RESPUESTAS_DIR),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}_${file.originalname}`)
});
const uploadRespuesta = multer({ storage: storageRespuestas });

// ── POST /api/tickets ─────────────────────────────────────────────────────────
router.post('/', verificarToken, async (req, res) => {
  const { archivo, tipo, estrellas, mensaje, sessionId } = req.body;

  try {
    const ticket = await Ticket.create({
      ticketId: uuidv4().substring(0, 8),
      sessionId: sessionId || null, // 👈 Se guarda el sessionId
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

// ── GET /api/tickets/mios (SOLO USUARIO) ──────────────────────────────────────
router.get('/mios', verificarToken, async (req, res) => {
  try {
    const tickets = await Ticket.find({ username: req.usuario.username }).sort({ creadoEn: -1 });
    return res.json({ ok: true, data: tickets });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/tickets (SOLO ADMIN) ─────────────────────────────────────────────
router.get('/', verificarToken, soloAdmin, async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ creadoEn: -1 });
    return res.json({ ok: true, data: tickets });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/tickets/:ticketId/responder (SOLO ADMIN) ────────────────────────
router.post('/:ticketId/responder', verificarToken, soloAdmin, uploadRespuesta.single('archivo'), async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ ok: false, error: 'El texto de respuesta es obligatorio.' });

    const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
    if (!ticket) return res.status(404).json({ ok: false, error: 'Ticket no encontrado.' });

    const nuevaRespuesta = {
      texto,
      adminUsername: req.usuario.username,
      archivoCorregido: req.file ? req.file.filename : null,
      nombreArchivoCorregido: req.file ? req.file.originalname : null,
    };

    ticket.respuestas.push(nuevaRespuesta);
    ticket.estado = 'cerrado'; // Cambiamos estado al responder
    await ticket.save();

    return res.json({ ok: true, mensaje: 'Respuesta enviada.', ticket });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/tickets/:ticketId/archivo-original/preview (SOLO ADMIN) ──────────
router.get('/:ticketId/archivo-original/preview', verificarToken, soloAdmin, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
    if (!ticket || !ticket.sessionId) {
      return res.status(404).json({ ok: false, error: 'El ticket no tiene un archivo original asociado.' });
    }

    const ruta = path.join(ORIGINALES_DIR, `${ticket.sessionId}.txt`);
    if (!fs.existsSync(ruta)) {
      return res.status(404).json({ ok: false, error: 'El archivo TXT ya no se encuentra en el servidor.' });
    }

    const contenido = fs.readFileSync(ruta, 'latin1'); // LSD usa latin-1
    const lineas    = contenido.split('\n');
    const MAX_LINEAS = 500;
    const truncado  = lineas.length > MAX_LINEAS;

    return res.json({
      ok: true,
      nombreArchivo: ticket.archivo || 'original.txt',
      totalLineas:   lineas.length,
      truncado,
      contenido:     truncado ? lineas.slice(0, MAX_LINEAS).join('\n') : contenido,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/tickets/:ticketId/archivo-original (SOLO ADMIN) ──────────────────
router.get('/:ticketId/archivo-original', verificarToken, soloAdmin, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
    if (!ticket || !ticket.sessionId) {
      return res.status(404).json({ ok: false, error: 'El ticket no tiene un archivo original asociado.' });
    }

    const ruta = path.join(ORIGINALES_DIR, `${ticket.sessionId}.txt`);
    if (!fs.existsSync(ruta)) {
      return res.status(404).json({ ok: false, error: 'El archivo TXT original ya no se encuentra en el servidor.' });
    }

    return res.download(ruta, ticket.archivo || 'original.txt');
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});


// ── GET /api/tickets/:ticketId/archivo-respuesta/:index ───────────────────────
router.get('/:ticketId/archivo-respuesta/:index', verificarToken, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
    if (!ticket) return res.status(404).json({ ok: false, error: 'Ticket no encontrado.' });

    // Validar que el usuario que descarga es el dueño o es un admin
    if (ticket.username !== req.usuario.username && req.usuario.rol !== 'admin') {
      return res.status(403).json({ ok: false, error: 'No autorizado.' });
    }

    const index = parseInt(req.params.index, 10);
    const respuesta = ticket.respuestas[index];
    if (!respuesta || !respuesta.archivoCorregido) {
      return res.status(404).json({ ok: false, error: 'Archivo no encontrado en esta respuesta.' });
    }

    const ruta = path.join(RESPUESTAS_DIR, respuesta.archivoCorregido);
    if (!fs.existsSync(ruta)) {
      return res.status(404).json({ ok: false, error: 'El archivo físico ya no se encuentra en el servidor.' });
    }

    return res.download(ruta, respuesta.nombreArchivoCorregido);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/tickets/:id/cerrar (Queda por si se cierra sin responder) ───────
router.post('/:ticketId/cerrar', verificarToken, soloAdmin, async (req, res) => {
  try {
    const ticket = await Ticket.findOneAndUpdate({ ticketId: req.params.ticketId }, { estado: 'cerrado' }, { new: true });
    return res.json({ ok: true, ticket });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
