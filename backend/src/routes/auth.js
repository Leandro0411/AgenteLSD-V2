// src/routes/auth.js
const express  = require('express');
const jwt      = require('jsonwebtoken');
const Usuario  = require('../models/Usuario');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Usuario y contraseña requeridos.' });
  }

  try {
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
  // Ahora desestructuramos los campos nuevos
  const { username, email, telefono, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ ok: false, error: 'Usuario, email y contraseña son obligatorios.' });
  }

  try {
    // Verificamos si el usuario O EL EMAIL ya existen
    const existeUsername = await Usuario.findOne({ username: username.trim().toLowerCase() });
    if (existeUsername) {
      return res.status(400).json({ ok: false, error: 'Ese nombre de usuario ya está en uso.' });
    }

    const existeEmail = await Usuario.findOne({ email: email.trim().toLowerCase() });
    if (existeEmail) {
      return res.status(400).json({ ok: false, error: 'Ese correo electrónico ya está registrado.' });
    }

    const nuevoUsuario = await Usuario.create({
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      telefono: telefono ? telefono.trim() : '',
      passwordHash: password,
      rol: 'usuario'
    });

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
router.get('/me', verificarToken, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('-passwordHash');
    if (!usuario) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    return res.json({ ok: true, usuario: { username: usuario.username, rol: usuario.rol } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

router.post('/logout', verificarToken, (req, res) => {
  return res.json({ ok: true, mensaje: 'Sesión cerrada.' });
});

// ── PUT /api/auth/usuarios/:id/rol ──────────────────────────────────────────
// Cambiar el rol de un usuario (Solo Administradores)
router.put('/usuarios/:id/rol', verificarToken, async (req, res) => {
  try {
    // 1. Verificamos que quien hace la petición tenga rol 'admin'
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Acceso denegado. Solo los administradores pueden cambiar roles.' });
    }

    const { rol } = req.body;
    
    // 2. Validamos que el rol enviado sea válido
    if (!['admin', 'usuario'].includes(rol)) {
      return res.status(400).json({ ok: false, error: 'Rol inválido. Debe ser admin o usuario.' });
    }

    // 3. Actualizamos el usuario en la base de datos
    const usuarioActualizado = await Usuario.findByIdAndUpdate(
      req.params.id,
      { rol: rol },
      { new: true } // Para que nos devuelva el documento ya modificado
    ).select('-passwordHash');

    if (!usuarioActualizado) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    return res.json({ 
      ok: true, 
      mensaje: 'Rol actualizado correctamente.',
      usuario: usuarioActualizado 
    });

  } catch (err) {
    console.error('[auth] Error al cambiar rol:', err);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
});

module.exports = router;