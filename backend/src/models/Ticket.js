// src/models/Ticket.js — Reemplaza feedback.json
const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      default: () => Math.random().toString(36).substring(2, 10),
    },
    username: { type: String, required: true },
    archivo: { type: String, default: 'Desconocido' },
    tipo: { type: String, enum: ['rating', 'ticket'], default: 'rating' },
    estrellas: { type: Number, min: 0, max: 5, default: 0 },
    mensaje: { type: String, default: '' },
    estado: { type: String, enum: ['abierto', 'cerrado', 'ok'], default: 'ok' },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: false } }
);

// Los tickets recién creados con tipo='ticket' arrancan como 'abierto'
ticketSchema.pre('save', function (next) {
  if (this.isNew && this.tipo === 'ticket') {
    this.estado = 'abierto';
  }
  next();
});

module.exports = mongoose.model('Ticket', ticketSchema);
