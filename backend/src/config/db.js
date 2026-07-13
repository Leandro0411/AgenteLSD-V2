// src/config/db.js — Conexión a MongoDB con Mongoose
const mongoose = require('mongoose');

const conectarDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌ Error conectando a MongoDB: ${err.message}`);
    process.exit(1);
  }
};

module.exports = conectarDB;
