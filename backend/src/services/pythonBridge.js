// src/services/pythonBridge.js — Invoca el microservicio Python via child_process.spawn
// PUNTO CRÍTICO 1: stdout es estrictamente JSON, línea a línea
// PUNTO CRÍTICO 2: ruta absoluta siempre, diskStorage de multer
const { spawn }   = require('child_process');
const readline    = require('readline');
const path        = require('path');
const fs          = require('fs');

const PYTHON_EXEC   = process.env.PYTHON_EXECUTABLE || 'python';
const SCRIPT_PATH   = path.resolve(
  __dirname,
  '../../..',
  'python_service',
  'agente_lsd.py'
);

/**
 * Analiza un archivo TXT de LSD invocando el microservicio Python.
 *
 * @param {string} rutaAbsolutaTxt - Ruta absoluta al archivo .txt subido por multer
 * @param {string} modo           - Modo de análisis (auto, rapido, profundo)
 * @param {function} onEvento     - Callback por cada evento JSON que emite Python
 * @param {function} onEnd        - Callback al finalizar exitosamente
 * @param {function} onError      - Callback ante error (string con mensaje)
 * @returns {ChildProcess}         - El proceso, para poder matarlo si el cliente desconecta
 */
function analizarArchivo(rutaAbsolutaTxt, modo, onEvento, onEnd, onError) {
  if (!fs.existsSync(SCRIPT_PATH)) {
    onError(`Script Python no encontrado en: ${SCRIPT_PATH}`);
    return null;
  }

  const modoValido = ['auto', 'rapido', 'profundo'].includes(modo) ? modo : 'auto';
  const scriptPath = path.resolve(__dirname, '../../../python_service/agente_lsd.py');
  const proceso = spawn(PYTHON_EXEC, ['-u', scriptPath, rutaAbsolutaTxt, '--modo', modoValido], {
    env: { ...process.env }, // pasa GEMINI_API_KEY al proceso hijo
  });

  // ✅ stdout: parseo línea a línea con readline
  // Cada línea válida es un JSON de evento { tipo, ... }
  const rl = readline.createInterface({ input: proceso.stdout, crlfDelay: Infinity });

  rl.on('line', (linea) => {
    console.log("📢 LÍNEA DESDE PYTHON:", linea);
    const trimmed = linea.trim();
    if (!trimmed) return; // ignorar líneas vacías
    try {
      const evento = JSON.parse(trimmed);
      onEvento(evento);
    } catch (_) {
      // PUNTO CRÍTICO 1: línea no-JSON logueada internamente, NUNCA al frontend
      console.warn('[pythonBridge] stdout no-JSON (ignorado):', trimmed);
    }
  });

  // ✅ stderr: solo logging interno, nunca llega al SSE del frontend
  proceso.stderr.on('data', (chunk) => {
    console.error('[pythonBridge] stderr Python:', chunk.toString().trim());
  });

  proceso.on('close', (code) => {
    rl.close();
    if (code !== 0) {
      onError(`Python salió con código ${code}. Revisá los logs del servidor.`);
    } else {
      onEnd();
    }
    // PUNTO CRÍTICO 2: limpiar el archivo temporal después de procesar
    _limpiarArchivo(rutaAbsolutaTxt);
  });

  proceso.on('error', (err) => {
    onError(`No se pudo lanzar Python: ${err.message}. ¿Está instalado en el PATH?`);
  });

  return proceso;
}

/**
 * Elimina el archivo temporal del disco después de que Python lo procesó.
 */
function _limpiarArchivo(ruta) {
  fs.unlink(ruta, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.warn('[pythonBridge] No se pudo limpiar temporal:', ruta, err.message);
    }
  });
}

module.exports = { analizarArchivo };
