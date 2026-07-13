// src/models/HistorialAnalisis.js — Reemplaza sesiones en memoria de Flask
const mongoose = require('mongoose');

const historialSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, index: true },
    nombreArchivo: { type: String, required: true },
    problemas: { type: mongoose.Schema.Types.Mixed, default: [] },
    veredicto: {
      type: String,
      enum: ['PRESENTABLE', 'SERÁ RECHAZADO', 'REVISAR'],
      default: 'REVISAR',
    },
    veredicto_razon: String,
    resumen: String,
    estadisticas: {
      total_empleados: Number,
      total_conceptos: Number,
      errores_criticos: Number,
      advertencias: Number,
      empleados_afectados_critico: Number,
      empleados_afectados_advertencia: Number,
    },
    errores_arca: {
      presente: { type: Boolean, default: false },
      total: { type: Number, default: 0 },
      resumen: String,
    },
    validacionDeterministica: mongoose.Schema.Types.Mixed,
    modo_analisis: { type: String, default: 'auto' },
    completado: { type: Boolean, default: false },
    _rutaTmp:   { type: String, select: false }, // ruta temporal del TXT, no exponer al cliente
  },
  { timestamps: { createdAt: 'fechaAnalisis', updatedAt: 'actualizadoEn' } }
);

module.exports = mongoose.model('HistorialAnalisis', historialSchema);
