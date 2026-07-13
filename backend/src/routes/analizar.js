// src/routes/analizar.js — Upload de TXT + SSE streaming via Python
// PUNTO CRÍTICO 2: multer con diskStorage (nunca memoryStorage)
const express     = require('express');
const multer      = require('multer');
const path        = require('path');
const jwt         = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { verificarToken } = require('../middleware/auth');
const { analizarArchivo } = require('../services/pythonBridge');
const HistorialAnalisis  = require('../models/HistorialAnalisis');

const ORIGINALES_DIR = path.resolve(__dirname, '../../uploads/originales');

const router = express.Router();

// ── Configuración multer — diskStorage obligatorio ────────────────────────────
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads/tmp');

// Crear carpeta si no existe (evita error de multer al arrancar)
require('fs').mkdirSync(UPLOAD_DIR, { recursive: true });
require('fs').mkdirSync(ORIGINALES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => cb(null, `${uuidv4()}.txt`),
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB máx
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.txt')) {
      return cb(new Error('Solo se aceptan archivos .txt'));
    }
    cb(null, true);
  },
});

// ── POST /api/analizar/upload ─────────────────────────────────────────────────
// Recibe el archivo TXT, crea el registro en MongoDB y devuelve el sessionId
router.post('/upload', verificarToken, upload.single('archivo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo.' });
  }

  const modoRaw = req.body.modo || 'profundo';
  const modo = ['auto', 'rapido', 'profundo'].includes(modoRaw) ? modoRaw : 'profundo';
  const sessionId = uuidv4();

  // Hacer una copia segura del TXT original para que el admin lo pueda descargar
  const fs = require('fs');
  const rutaOriginal = path.join(ORIGINALES_DIR, `${sessionId}.txt`);
  fs.copyFileSync(req.file.path, rutaOriginal);

  try {
    // Crear registro pendiente en MongoDB (guarda la ruta temporal para el stream)
    await HistorialAnalisis.create({
      sessionId,
      username: req.usuario.username,
      nombreArchivo: req.file.originalname,
      completado: false,
      modo_analisis: modo,
      _rutaTmp: req.file.path,  // ← ruta absoluta usada por el stream SSE
    });

    return res.json({
      ok: true,
      sessionId,
      archivo: req.file.originalname,
      rutaTmp: req.file.path, // solo para debug interno
    });
  } catch (err) {
    console.error('[analizar] Error creando sesión:', err);
    return res.status(500).json({ ok: false, error: 'Error interno al iniciar análisis.' });
  }
});

// ── GET /api/analizar/stream/:sessionId ──────────────────────────────────────
// SSE: invoca Python, reenvía eventos al frontend en tiempo real
// CRÍTICO: EventSource no puede enviar headers → verificamos token por query param
router.get('/stream/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  // Verificar JWT desde query param (EventSource no soporta Authorization header)
  const token = req.query.token;
  if (!token) return res.status(401).json({ ok: false, error: 'Token requerido.' });
  let usuarioJWT;
  try {
    usuarioJWT = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado.' });
  }

  const sesion = await HistorialAnalisis.findOne({ sessionId });
  if (!sesion) {
    return res.status(404).json({ ok: false, error: 'Sesión no encontrada.' });
  }
  if (sesion.username !== usuarioJWT.username) {
    return res.status(403).json({ ok: false, error: 'No autorizado.' });
  }

  // Recuperar la ruta del archivo desde MongoDB (campo _rutaTmp, excluido por defecto)
  const sesionConRuta = await HistorialAnalisis.findOne({ sessionId }).select('+_rutaTmp');
  const rutaReal = sesionConRuta?._rutaTmp;

  if (!rutaReal || !require('fs').existsSync(rutaReal)) {
    return res.status(404).json({ ok: false, error: 'Archivo temporal no encontrado. Volvé a subir el archivo.' });
  }

  // Configurar headers SSE
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const enviarEvento = (datos) => {
    res.write(`data: ${JSON.stringify(datos)}\n\n`);
  };

  // Keep-alive cada 15s para que nginx/proxies no corten la conexión
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);

  let informeFinal = null;

  const proceso = analizarArchivo(
    rutaReal,
    sesion.modo_analisis || 'auto',
    // onEvento
    (evento) => {
      enviarEvento(evento);
      if (evento.tipo === 'informe_final' && evento.informe) {
        informeFinal = evento.informe;
      }
    },
    // onEnd — Python terminó exitosamente
    async () => {
      clearInterval(keepAlive);
      // Guardar informe en MongoDB
      if (informeFinal) {
        try {
          await HistorialAnalisis.findOneAndUpdate(
            { sessionId },
            {
              veredicto:               informeFinal.veredicto,
              veredicto_razon:         informeFinal.veredicto_razon,
              resumen:                 informeFinal.resumen,
              estadisticas:            informeFinal.estadisticas,
              errores_arca:            informeFinal.errores_arca,
              problemas:               informeFinal.problemas,
              validacionDeterministica: informeFinal.validacion_deterministica,
              completado:              true,
            }
          );
        } catch (e) {
          console.error('[analizar] Error guardando informe en MongoDB:', e);
        }
      }
      enviarEvento({ tipo: 'fin', sessionId });
      res.end();
    },
    // onError — Python tuvo un error
    (mensaje) => {
      clearInterval(keepAlive);
      enviarEvento({ tipo: 'error', mensaje });
      res.end();
    }
  );

  // Si el cliente Angular desconecta, matar el proceso Python
  req.on('close', () => {
    clearInterval(keepAlive);
    if (proceso) proceso.kill();
  });
});

// ── GET /api/analizar/resultado/:sessionId ────────────────────────────────────
// Devuelve el informe guardado en MongoDB (para recargar resultados)
router.get('/resultado/:sessionId', verificarToken, async (req, res) => {
  try {
    const sesion = await HistorialAnalisis.findOne({ sessionId: req.params.sessionId });
    if (!sesion) return res.status(404).json({ ok: false, error: 'Sesión no encontrada.' });
    if (sesion.username !== req.usuario.username && req.usuario.rol !== 'admin') {
      return res.status(403).json({ ok: false, error: 'No autorizado.' });
    }
    return res.json({ ok: true, informe: sesion });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
