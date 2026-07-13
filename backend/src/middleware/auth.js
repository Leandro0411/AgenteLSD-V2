// src/middleware/auth.js — Verificación JWT para rutas protegidas
const jwt = require('jsonwebtoken');

/**
 * Middleware que verifica el JWT del header Authorization.
 * Si es válido, adjunta req.usuario = { id, username, rol }.
 */
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Token no proporcionado.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded; // { id, username, rol }
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado.' });
  }
};

/**
 * Middleware que verifica que el usuario tenga rol 'admin'.
 * Debe usarse DESPUÉS de verificarToken.
 */
const soloAdmin = (req, res, next) => {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ ok: false, error: 'No tenés permisos para esta acción.' });
  }
  next();
};

module.exports = { verificarToken, soloAdmin };
