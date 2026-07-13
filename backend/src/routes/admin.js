// src/routes/admin.js — Gestión de usuarios, normativas e historial (solo admin)
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Usuario          = require('../models/Usuario');
const HistorialAnalisis = require('../models/HistorialAnalisis');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const NormativaQA = require('../models/NormativaQA');

const router = express.Router();

// ── Multer para PDFs de normativa ─────────────────────────────────────────────
const PDF_TMP = path.resolve(__dirname, '../../uploads/tmp');
require('fs').mkdirSync(PDF_TMP, { recursive: true }); // asegurar que existe
const storagePdf = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PDF_TMP),
  filename:    (_req, _file, cb) => cb(null, `pdf_${uuidv4()}.pdf`),
});
const uploadPdf = multer({
  storage: storagePdf,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.pdf')) {
      return cb(new Error('Solo se aceptan archivos PDF.'));
    }
    cb(null, true);
  },
});

// Archivo JSON local con referencias a PDFs en Gemini Files API
const PDF_REFS_FILE = path.resolve(__dirname, '../../../python_service/gemini_files.json');

// ── USUARIOS ──────────────────────────────────────────────────────────────────

// GET /api/admin/usuarios — Listar usuarios
router.get('/usuarios', verificarToken, soloAdmin, async (req, res) => {
  try {
    const usuarios = await Usuario.find().select('-passwordHash').sort({ creadoEn: -1 });
    return res.json({ ok: true, usuarios });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/usuarios — Crear usuario
router.post('/usuarios', verificarToken, soloAdmin, async (req, res) => {
  const { username, password, rol } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'username y password son requeridos.' });
  }
  try {
    const existente = await Usuario.findOne({ username: username.trim().toLowerCase() });
    if (existente) {
      return res.status(409).json({ ok: false, error: 'El nombre de usuario ya existe.' });
    }
    const nuevo = await Usuario.create({
      username:     username.trim().toLowerCase(),
      passwordHash: password, // el pre-save hook lo hashea
      rol:          rol || 'usuario',
    });
    return res.status(201).json({
      ok: true,
      mensaje: `Usuario '${nuevo.username}' creado como '${nuevo.rol}'.`,
      usuario: { username: nuevo.username, rol: nuevo.rol },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/admin/usuarios/:username/password — Cambiar contraseña
router.put('/usuarios/:username/password', verificarToken, soloAdmin, async (req, res) => {
  const { nuevaPassword } = req.body;
  if (!nuevaPassword) return res.status(400).json({ ok: false, error: 'nuevaPassword requerida.' });
  try {
    const usuario = await Usuario.findOne({ username: req.params.username });
    if (!usuario) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    usuario.passwordHash = nuevaPassword; // el pre-save hook lo hashea
    usuario.isModified('passwordHash'); // forzar el flag
    await usuario.save();
    return res.json({ ok: true, mensaje: 'Contraseña actualizada.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/admin/usuarios/:username — Eliminar usuario
router.delete('/usuarios/:username', verificarToken, soloAdmin, async (req, res) => {
  if (req.params.username === req.usuario.username) {
    return res.status(400).json({ ok: false, error: 'No podés eliminar tu propio usuario.' });
  }
  try {
    await Usuario.findOneAndDelete({ username: req.params.username });
    return res.json({ ok: true, mensaje: 'Usuario eliminado.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── NORMATIVAS ────────────────────────────────────

// GET /api/admin/normativas — Listar conocimiento destilado
router.get('/normativas', verificarToken, soloAdmin, async (req, res) => {
  try {
    const NormativaQA = require('../models/NormativaQA');
    const pdfs = await NormativaQA.find().sort({ subidoEn: -1 });
    return res.json({ ok: true, pdfs });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});


// POST /api/admin/normativas — Subir PDF, Destilar con Gemini y Guardar
router.post('/normativas', verificarToken, soloAdmin, uploadPdf.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ningún PDF.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    fs.unlink(req.file.path, () => {});
    return res.status(503).json({ ok: false, error: 'GEMINI_API_KEY no configurada.' });
  }

  try {
    // 1. Subir a Gemini
    const fileContent = fs.readFileSync(req.file.path);
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'start, upload, finalize',
        'X-Goog-Upload-Header-Content-Length': fileContent.length,
        'X-Goog-Upload-Header-Content-Type': 'application/pdf',
        'Content-Type': 'application/pdf',
      },
      body: fileContent,
    });

    const uploadData = await uploadRes.json();
    const fileUri = uploadData?.file?.uri;
    const fileName = uploadData?.file?.name;

    if (!fileUri) throw new Error('Gemini no devolvió URI del archivo.');

    // 2. Pedirle a Gemini que "Destile" el PDF
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: "application/json" } // Forzamos a que devuelva un JSON perfecto
    });

    const prompt = `Analizá este documento de normativas de ARCA/LSD. Extraé todo el conocimiento técnico, reglas y excepciones y devolvelo como un arreglo JSON con el siguiente formato: 
    [{"pregunta": "duda frecuente o caso de uso", "respuesta": "regla exacta o solución"}]`;

    const result = await model.generateContent([
      { fileData: { fileUri: fileUri, mimeType: 'application/pdf' } },
      { text: prompt }
    ]);

    // 3. Parsear el resultado y guardar en MongoDB
    const conocimientoExtraido = JSON.parse(result.response.text());
    
    await NormativaQA.create({
      archivoOriginal: req.file.originalname,
      conocimientoExtraido: conocimientoExtraido,
      subidoPor: req.usuario.username
    });

    // 4. (Opcional) Borrar el archivo de Gemini API porque ya sacamos el conocimiento
    await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${apiKey}`, { method: 'DELETE' });
    fs.unlink(req.file.path, () => {}); // Limpiar temporal local

    return res.json({
      ok: true,
      mensaje: `PDF procesado. Se extrajeron ${conocimientoExtraido.length} reglas de conocimiento.`,
    });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('[admin] Error procesando PDF:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── HISTORIAL ─────────────────────────────────────────────────────────────────

// GET /api/admin/historial — Ver todos los análisis (solo admin)
router.get('/historial', verificarToken, soloAdmin, async (req, res) => {
  try {
    const historial = await HistorialAnalisis.find({ completado: true })
      .sort({ fechaAnalisis: -1 })
      .limit(100);
    return res.json({ ok: true, historial });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/historial/usuario — Historial del propio usuario (cualquier rol)
router.get('/historial/mio', verificarToken, async (req, res) => {
  try {
    const historial = await HistorialAnalisis.find({
      username: req.usuario.username,
      completado: true,
    })
      .select('sessionId nombreArchivo veredicto estadisticas fechaAnalisis modo_analisis')
      .sort({ fechaAnalisis: -1 })
      .limit(50);
    return res.json({ ok: true, historial });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/historial/mio-completo — Historial completo con problemas para analítica
router.get('/historial/mio-completo', verificarToken, async (req, res) => {
  try {
    const historial = await HistorialAnalisis.find({
      username: req.usuario.username,
      completado: true,
    }).sort({ fechaAnalisis: -1 }); // Trae todo, incluyendo el array de problemas
    
    return res.json({ ok: true, historial });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── HEALTH ────────────────────────────────────────────────────────────────────
router.get('/health', async (_req, res) => {
  let pdfs = 0;
  try {
    if (fs.existsSync(PDF_REFS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PDF_REFS_FILE, 'utf-8'));
      pdfs = (data.archivos || []).length;
    }
  } catch (_) {}
  return res.json({
    ok:             true,
    api_configurada: Boolean(process.env.GEMINI_API_KEY),
    pdfs_normativa: pdfs,
    node_version:   process.version,
    env:            process.env.NODE_ENV,
  });
});

module.exports = router;
