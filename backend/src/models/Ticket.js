const mongoose = require('mongoose');

const respuestaSchema = new mongoose.Schema({
  texto: String,
  adminUsername: String,
  archivoCorregido: String,       // Nombre físico en disco (con UUID)
  nombreArchivoCorregido: String, // Nombre original para el usuario
  fecha: { type: Date, default: Date.now }
}, { _id: false });

const ticketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      default: () => Math.random().toString(36).substring(2, 10),
    },
    sessionId: { type: String }, // 👈 CLAVE: Para buscar el TXT original
    username: { type: String, required: true },
    archivo: { type: String, default: 'Desconocido' },
    tipo: { type: String, enum: ['rating', 'ticket'], default: 'rating' },
    estrellas: { type: Number, min: 0, max: 5, default: 0 },
    mensaje: { type: String, default: '' },
    estado: { type: String, enum: ['abierto', 'cerrado', 'ok'], default: 'ok' },
    respuestas: [respuestaSchema] // 👈 NUEVO: Historial de respuestas del admin
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: false } }
);

ticketSchema.pre('save', function (next) {
  if (this.isNew && this.tipo === 'ticket') {
    this.estado = 'abierto';
  }
  next();
});

module.exports = mongoose.model('Ticket', ticketSchema);