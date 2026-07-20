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
const NormativaQA      = require('../models/NormativaQA');
const ReglaNormativa   = require('../models/ReglaNormativa');
const ReglaValidacion = require('../models/ReglaValidacion');
const WikiRegla = require('../models/WikiRegla');

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

    // 3. Parsear el resultado y guardar como reglas individuales en ReglaNormativa
    const conocimientoExtraido = JSON.parse(result.response.text());

    const reglas = conocimientoExtraido.map((qa) => ({
      titulo:    qa.pregunta?.substring(0, 80) || 'Sin título',
      pregunta:  qa.pregunta  || '',
      respuesta: qa.respuesta || '',
      fuente:    req.file.originalname,
      subidoPor: req.usuario.username,
      activa:    true,
    }));

    await ReglaNormativa.insertMany(reglas);

    // Mantener compatibilidad: también guardar en NormativaQA (legacy)
    await NormativaQA.create({
      archivoOriginal:      req.file.originalname,
      conocimientoExtraido: conocimientoExtraido,
      subidoPor:            req.usuario.username,
    });

    // 4. Borrar el archivo de Gemini API y del disco local
    await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${apiKey}`, { method: 'DELETE' });
    fs.unlink(req.file.path, () => {});

    return res.json({
      ok: true,
      mensaje: `PDF procesado. Se extrajeron ${reglas.length} reglas de conocimiento.`,
      total: reglas.length,
    });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('[admin] Error procesando PDF:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── REGLAS DE CONOCIMIENTO (Base de Conocimiento curada) ──────────────────────

// GET /api/admin/reglas — Listar todas las reglas (paginado)
router.get('/reglas', verificarToken, soloAdmin, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;
    const soloActivas = req.query.activas === 'true';

    const filtro = soloActivas ? { activa: true } : {};
    const [reglas, total] = await Promise.all([
      ReglaNormativa.find(filtro).sort({ creadaEn: -1 }).skip(skip).limit(limit),
      ReglaNormativa.countDocuments(filtro),
    ]);
    return res.json({ ok: true, reglas, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/reglas — Crear regla manualmente
router.post('/reglas', verificarToken, soloAdmin, async (req, res) => {
  const { titulo, pregunta, respuesta, fuente } = req.body;
  if (!titulo || !pregunta || !respuesta) {
    return res.status(400).json({ ok: false, error: 'titulo, pregunta y respuesta son obligatorios.' });
  }
  try {
    const regla = await ReglaNormativa.create({
      titulo, pregunta, respuesta,
      fuente:    fuente    || 'Manual',
      subidoPor: req.usuario.username,
    });
    return res.status(201).json({ ok: true, regla });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/admin/reglas/:id — Editar regla
router.put('/reglas/:id', verificarToken, soloAdmin, async (req, res) => {
  const { titulo, pregunta, respuesta, activa } = req.body;
  try {
    const regla = await ReglaNormativa.findByIdAndUpdate(
      req.params.id,
      { titulo, pregunta, respuesta, activa },
      { new: true, runValidators: true }
    );
    if (!regla) return res.status(404).json({ ok: false, error: 'Regla no encontrada.' });
    return res.json({ ok: true, regla });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/admin/reglas/:id — Borrar regla
router.delete('/reglas/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    await ReglaNormativa.findByIdAndDelete(req.params.id);
    return res.json({ ok: true, mensaje: 'Regla eliminada.' });
  } catch (err) {
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

// GET /api/admin/estadisticas — Dashboard de métricas globales (solo admin)
router.get('/estadisticas', verificarToken, soloAdmin, async (req, res) => {
  try {
    // 1. Calculamos los totales generales (KPIs)
    const kpis = await HistorialAnalisis.aggregate([
      { $match: { completado: true } },
      { $group: {
          _id: null,
          totalArchivos: { $sum: 1 },
          totalEmpleados: { $sum: "$estadisticas.total_empleados" },
          totalErrores: { $sum: "$estadisticas.errores_criticos" }
        }
      }
    ]);

    // 2. Armamos el Top 5 de los errores más repetidos
    const topErrores = await HistorialAnalisis.aggregate([
      { $match: { completado: true } },
      { $unwind: "$problemas" }, // Desarmamos el array de problemas de cada archivo
      { $group: { 
          _id: "$problemas.titulo", // Agrupamos por el título del error
          cantidad: { $sum: 1 }     // Contamos cuántas veces apareció
        } 
      },
      { $sort: { cantidad: -1 } },  // Ordenamos de mayor a menor
      { $limit: 5 }                 // Nos quedamos con los 5 primeros
    ]);

    return res.json({
      ok: true,
      kpis: kpis[0] || { totalArchivos: 0, totalEmpleados: 0, totalErrores: 0 },
      topErrores
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/historial/usuario — Historial del propio usuario (cualquier rol)
router.get('/historial/mio', verificarToken, async (req, res) => {
  try {
    // 👇 Agregamos lectura del límite (por defecto 10)
    const limite = parseInt(req.query.limite) || 10;

    let query = HistorialAnalisis.find({ username: req.usuario.username })
                                 .sort({ creadoEn: -1, _id: -1 });

    // 👇 Si hay límite, lo aplicamos a MongoDB
    if (limite > 0) {
      query = query.limit(limite);
    }

    const historial = await query.exec();
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

// ── MOTOR DE REGLAS VISUALES ──────────────────────────────────────────────────

// GET /api/admin/motor-reglas
router.get('/motor-reglas', verificarToken, soloAdmin, async (req, res) => {
  try {
    const reglas = await ReglaValidacion.find().sort({ createdAt: -1 });
    return res.json({ ok: true, reglas });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/motor-reglas
router.post('/motor-reglas', verificarToken, soloAdmin, async (req, res) => {
  try {
    const regla = await ReglaValidacion.create(req.body);
    return res.json({ ok: true, regla });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/admin/motor-reglas/:id/toggle
router.put('/motor-reglas/:id/toggle', verificarToken, soloAdmin, async (req, res) => {
  try {
    const regla = await ReglaValidacion.findByIdAndUpdate(req.params.id, { activa: req.body.activa }, { new: true });
    return res.json({ ok: true, regla });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/admin/motor-reglas/:id
router.delete('/motor-reglas/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    await ReglaValidacion.findByIdAndDelete(req.params.id);
    return res.json({ ok: true, mensaje: 'Regla eliminada' });
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

// ── WIKI (Edición de errores de Python) ───────────────────────────────────────
// POST /api/admin/wiki/reglas/:ruleId
router.post('/wiki/reglas/:ruleId', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { causa, solucion, videoUrl } = req.body;
    const regla = await WikiRegla.findOneAndUpdate(
      { ruleId: req.params.ruleId }, // 👇 Usamos ruleId para que coincida con tu modelo
      { 
        causa, 
        solucion, 
        videoUrl, 
        editadoPor: req.usuario.username 
      },
      { new: true, upsert: true }
    );
    return res.json({ ok: true, regla });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
