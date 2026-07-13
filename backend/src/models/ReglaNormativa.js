// src/models/ReglaNormativa.js
// Reemplaza el esquema anidado de NormativaQA.
// Cada regla es un documento independiente con su propio _id → editable individualmente.
const mongoose = require('mongoose');

const reglaNormativaSchema = new mongoose.Schema(
  {
    titulo:    { type: String, required: true, trim: true },
    pregunta:  { type: String, required: true, trim: true },
    respuesta: { type: String, required: true, trim: true },
    fuente:    { type: String, default: 'Manual', trim: true }, // nombre del PDF origen
    activa:    { type: Boolean, default: true },                // el admin puede desactivar sin borrar
    subidoPor: { type: String, default: 'admin' },
  },
  { timestamps: { createdAt: 'creadaEn', updatedAt: 'actualizadaEn' } }
);

// Índice de texto completo para búsqueda semántica liviana en chat.js
reglaNormativaSchema.index({ pregunta: 'text', titulo: 'text', respuesta: 'text' });

module.exports = mongoose.model('ReglaNormativa', reglaNormativaSchema);
