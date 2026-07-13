// src/models/WikiRegla.js — Reemplaza reglas_custom.json
const mongoose = require('mongoose');

const pasoSchema = new mongoose.Schema({
  paso: Number,
  titulo: String,
  instruccion: String,
  referencia: String,
}, { _id: false });

const wikiReglaSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true, unique: true, index: true },
    mensaje: String,
    descripcion: String,
    causa: String,
    solucion: String,
    fix_hint: String,
    tutorial_pasos: [pasoSchema],
    videoUrl: String,
    editadoPor: String,
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'editadoEn' } }
);

module.exports = mongoose.model('WikiRegla', wikiReglaSchema);
