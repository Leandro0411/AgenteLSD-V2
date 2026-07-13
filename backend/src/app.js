// src/app.js — Servidor principal Express
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const conectarDB = require('./config/db');

// ── Rutas ─────────────────────────────────────────────────────────────────────
const authRoutes     = require('./routes/auth');
const analizarRoutes = require('./routes/analizar');
const chatRoutes     = require('./routes/chat');
const wikiRoutes     = require('./routes/wiki');
const ticketRoutes   = require('./routes/tickets');
const adminRoutes    = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Conectar MongoDB ──────────────────────────────────────────────────────────
conectarDB();

// ── Middlewares globales ──────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:4200', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rutas API ─────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/analizar', analizarRoutes);
app.use('/api/chat',     chatRoutes);
app.use('/api/wiki',     wikiRoutes);
app.use('/api/tickets',  ticketRoutes);
app.use('/api/admin',    adminRoutes);

// ── Health check general ──────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, version: '2.0.0' }));

// ── Manejo de errores global ──────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[app] Error no manejado:', err.message);
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Error interno.' });
});

// ── Iniciar servidor ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(55));
  console.log(`  AGENTE LSD v2 — Backend Node.js`);
  console.log(`  Puerto: ${PORT}  |  Env: ${process.env.NODE_ENV}`);
  console.log(`  MongoDB: ${process.env.MONGO_URI}`);
  console.log('='.repeat(55) + '\n');
});

module.exports = app;
