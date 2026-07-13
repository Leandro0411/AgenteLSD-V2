// scripts/migrar-sqlite.js
// Migra users.db (SQLite) + feedback.json + reglas_custom.json → MongoDB
// Uso: node scripts/migrar-sqlite.js
require('dotenv').config({ path: '../.env' });

const path     = require('path');
const fs       = require('fs');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const SQLITE_DB       = path.resolve(__dirname, '../../../agente_lsd/users.db');
const FEEDBACK_JSON   = path.resolve(__dirname, '../../../agente_lsd/feedback.json');
const REGLAS_JSON     = path.resolve(__dirname, '../../../agente_lsd/reglas_custom.json');

// Modelos
const Usuario   = require('../src/models/Usuario');
const Ticket    = require('../src/models/Ticket');
const WikiRegla = require('../src/models/WikiRegla');

async function migrar() {
  console.log('\n🔄 Iniciando migración SQLite → MongoDB\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB conectado');

  // ── 1. Usuarios desde SQLite ───────────────────────────────────────────────
  try {
    // better-sqlite3 debe instalarse: npm install better-sqlite3
    const Database = require('better-sqlite3');
    const db       = new Database(SQLITE_DB, { readonly: true });
    const filas    = db.prepare('SELECT * FROM users').all();
    db.close();

    let creados = 0;
    for (const fila of filas) {
      const existe = await Usuario.findOne({ username: fila.username });
      if (existe) { console.log(`  ⏩ Usuario '${fila.username}' ya existe, salteando.`); continue; }

      // El hash ya viene de werkzeug (PBKDF2). Lo reemplazamos con bcrypt.
      // Como no tenemos la contraseña en texto plano, asignamos 'cambiar123' y avisamos.
      const nuevoHash = await bcrypt.hash('cambiar123', 12);
      await Usuario.create({
        username:     fila.username,
        passwordHash: nuevoHash,
        rol:          fila.rol || 'usuario',
        creadoEn:     fila.creado ? new Date(fila.creado) : new Date(),
      });
      creados++;
      console.log(`  ✓ Usuario '${fila.username}' (${fila.rol}) migrado. Contraseña temporal: cambiar123`);
    }
    console.log(`\n  👥 Usuarios migrados: ${creados}/${filas.length}`);
    console.log('  ⚠  Pediles a los usuarios que cambien su contraseña en el primer login.\n');
  } catch (err) {
    console.warn('  ⚠  No se pudo leer users.db:', err.message);
    console.warn('     Instalá better-sqlite3: npm install better-sqlite3\n');
  }

  // ── 2. Feedback / tickets desde JSON ─────────────────────────────────────
  try {
    if (fs.existsSync(FEEDBACK_JSON)) {
      const items = JSON.parse(fs.readFileSync(FEEDBACK_JSON, 'utf-8'));
      let creados = 0;
      for (const item of items) {
        const existe = await Ticket.findOne({ ticketId: item.id });
        if (existe) continue;
        await Ticket.create({
          ticketId: item.id,
          username: item.username || 'desconocido',
          archivo:  item.archivo  || 'Desconocido',
          tipo:     item.tipo     || 'rating',
          estrellas: item.estrellas ?? 0,
          mensaje:  item.mensaje  || '',
          estado:   item.estado   || 'ok',
          creadoEn: item.fecha ? new Date(item.fecha) : new Date(),
        });
        creados++;
      }
      console.log(`  🎫 Tickets migrados: ${creados}/${items.length}`);
    } else {
      console.log('  ℹ  feedback.json no encontrado, salteando.');
    }
  } catch (err) {
    console.warn('  ⚠  Error migrando feedback.json:', err.message);
  }

  // ── 3. Reglas custom desde JSON ───────────────────────────────────────────
  try {
    if (fs.existsSync(REGLAS_JSON)) {
      const reglas = JSON.parse(fs.readFileSync(REGLAS_JSON, 'utf-8'));
      let creados  = 0;
      for (const [ruleId, datos] of Object.entries(reglas)) {
        const existe = await WikiRegla.findOne({ ruleId });
        if (existe) continue;
        await WikiRegla.create({ ruleId, ...datos, editadoPor: 'migración' });
        creados++;
      }
      console.log(`  📚 Reglas wiki migradas: ${creados}/${Object.keys(reglas).length}`);
    } else {
      console.log('  ℹ  reglas_custom.json no encontrado, salteando.');
    }
  } catch (err) {
    console.warn('  ⚠  Error migrando reglas_custom.json:', err.message);
  }

  await mongoose.disconnect();
  console.log('\n✅ Migración completada.\n');
}

migrar().catch((err) => {
  console.error('❌ Error fatal en migración:', err);
  process.exit(1);
});
