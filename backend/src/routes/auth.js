// src/routes/auth.js — Login y gestión de sesión con JWT
const express  = require('express');
const jwt      = require('jsonwebtoken');
const Usuario  = require('../models/Usuario');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Equivalente a POST /login de Flask
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Usuario y contraseña requeridos.' });
  }

  try {
    // passwordHash tiene select:false en el modelo → hay que pedirlo explícitamente
    const usuario = await Usuario.findOne({ username: username.trim().toLowerCase() }).select('+passwordHash');

    if (!usuario || !(await usuario.verificarPassword(password))) {
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas.' });
    }

    const token = jwt.sign(
      { id: usuario._id, username: usuario.username, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    return res.json({
      ok: true,
      token,
      usuario: { username: usuario.username, rol: usuario.rol },
    });
  } catch (err) {
    console.error('[auth] Error en login:', err);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Usuario y contraseña requeridos.' });
  }

  try {
    // 1. Verificamos si el usuario ya existe
    const existe = await Usuario.findOne({ username: username.trim().toLowerCase() });
    if (existe) {
      return res.status(400).json({ ok: false, error: 'Ese nombre de usuario ya está en uso.' });
    }

    // 2. Creamos el usuario (asumimos que tu modelo Usuario encripta la password antes de guardar)
    const nuevoUsuario = await Usuario.create({
      username: username.trim().toLowerCase(),
      passwordHash: password,
      rol: 'usuario' // Por defecto le damos el rol base
    });

    // 3. Generamos el token para loguearlo automáticamente
    const token = jwt.sign(
      { id: nuevoUsuario._id, username: nuevoUsuario.username, rol: nuevoUsuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    return res.json({
      ok: true,
      token,
      usuario: { username: nuevoUsuario.username, rol: nuevoUsuario.rol },
    });
  } catch (err) {
    console.error('[auth] Error en registro:', err);
    return res.status(500).json({ ok: false, error: 'Error interno al crear la cuenta.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Devuelve datos del usuario autenticado (útil para Angular al recargar la app)
router.get('/me', verificarToken, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('-passwordHash');
    if (!usuario) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    return res.json({ ok: true, usuario: { username: usuario.username, rol: usuario.rol } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
// Con JWT stateless, el logout real lo maneja el frontend borrando el token.
// Este endpoint existe para consistencia de API y futura implementación de blacklist.
router.post('/logout', verificarToken, (req, res) => {
  return res.json({ ok: true, mensaje: 'Sesión cerrada.' });
});

module.exports = router;
