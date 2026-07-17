// src/models/Usuario.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const usuarioSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Debe ingresar un email válido']
    },
    telefono: {
      type: String,
      required: false,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true,
    },
    rol: {
      type: String,
      enum: ['admin', 'usuario'],
      default: 'usuario',
    },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: false } }
);

// Hash automático antes de guardar
usuarioSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// Método para verificar contraseña
usuarioSchema.methods.verificarPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('Usuario', usuarioSchema);