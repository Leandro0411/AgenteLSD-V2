// scripts/crear-admin.js — Crea el primer usuario administrador
// Uso: node scripts/crear-admin.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Usuario  = require('../src/models/Usuario');

const USERNAME = process.argv[2] || 'admin';
const PASSWORD = process.argv[3] || 'admin123';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB conectado');

  const existe = await Usuario.findOne({ username: USERNAME });
  if (existe) {
    console.log(`⚠️  El usuario '${USERNAME}' ya existe.`);
    await mongoose.disconnect();
    return;
  }

  await Usuario.create({ username: USERNAME, passwordHash: PASSWORD, rol: 'admin' });
  console.log(`✅ Usuario admin creado:`);
  console.log(`   Usuario:    ${USERNAME}`);
  console.log(`   Contraseña: ${PASSWORD}`);
  console.log(`   ⚠️  Cambiá la contraseña después del primer login.`);
  await mongoose.disconnect();
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
