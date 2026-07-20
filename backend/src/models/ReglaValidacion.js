// src/models/ReglaValidacion.js
const mongoose = require('mongoose');

const reglaValidacionSchema = new mongoose.Schema({
  codigo:         { type: String }, 
  
  registroTarget: { type: String, required: true, enum: ['01', '02', '03', '04', '05'] },
  campo:          { type: String, required: true },
  operador:       { type: String, required: true, enum: ['==', '!=', '>', '<', 'contiene'] },
  valor:          { type: String, required: true },
  severidad:      { type: String, required: true, enum: ['CRITICO', 'ADVERTENCIA'] },
  mensaje:        { type: String, required: true },

  solucion:       { type: String },
  loom_video:     { type: String },
  
  activa:         { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('ReglaValidacion', reglaValidacionSchema);