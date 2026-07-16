// src/models/ReglaValidacion.js
const mongoose = require('mongoose');

const reglaValidacionSchema = new mongoose.Schema({
  registroTarget: { type: String, required: true, enum: ['01', '02', '03', '04', '05'] }, // Ej: '03'
  campo:          { type: String, required: true }, // Ej: 'codigo_arca'
  operador:       { type: String, required: true, enum: ['==', '!=', '>', '<', 'contiene'] }, // Ej: '=='
  valor:          { type: String, required: true }, // Ej: '560000'
  severidad:      { type: String, required: true, enum: ['CRITICO', 'ADVERTENCIA'] },
  mensaje:        { type: String, required: true },
  activa:         { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('ReglaValidacion', reglaValidacionSchema);