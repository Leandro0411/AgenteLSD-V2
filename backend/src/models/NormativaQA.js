// src/models/NormativaQA.js
const mongoose = require('mongoose');

const qaSchema = new mongoose.Schema({
  pregunta: { type: String, required: true },
  respuesta: { type: String, required: true }
}, { _id: false });

const normativaQASchema = new mongoose.Schema({
  archivoOriginal: { type: String, required: true },
  conocimientoExtraido: [qaSchema],
  subidoPor: { type: String }
}, { timestamps: { createdAt: 'subidoEn', updatedAt: false } });

module.exports = mongoose.model('NormativaQA', normativaQASchema);