// src/services/pythonBridge.js — Invoca el microservicio Python via child_process.spawn
const { spawn }   = require('child_process');
const readline    = require('readline');
const path        = require('path');
const fs          = require('fs');

// 👇 Importamos el nuevo modelo de reglas dinámicas
const ReglaValidacion = require('../models/ReglaValidacion');

const PYTHON_EXEC   = process.env.PYTHON_EXECUTABLE || 'python';
const SCRIPT_PATH   = path.resolve(__dirname, '../../..', 'python_service', 'agente_lsd.py');
// 👇 Definimos la ruta del JSON que va a leer Python
const DYN_RULES_PATH = path.resolve(__dirname, '../../..', 'python_service', 'reglas_dinamicas.json');

function analizarArchivo(rutaAbsolutaTxt, modo, rutaConceptosTxt, onEvento, onEnd, onError) {
  if (!fs.existsSync(SCRIPT_PATH)) {
    onError(`Script Python no encontrado en: ${SCRIPT_PATH}`);
    return null;
  }

  const modoValido = ['auto', 'rapido', 'profundo'].includes(modo) ? modo : 'auto';

  // Objeto "Proxy" para no romper el código de analizar.js que espera un .kill() síncrono
  const controlProceso = {
    kill: () => { console.warn('[pythonBridge] Intento de matar proceso antes del spawn'); }
  };

  // Ejecutamos la lógica de forma asíncrona pero sin frenar el flujo principal
  (async () => {
    try {
      // 1. Buscamos todas las reglas visuales activas en MongoDB
      const reglasDinamicas = await ReglaValidacion.find({ activa: true }).lean();

      // 2. Escribimos el JSON para que Python lo absorba al arrancar
      fs.writeFileSync(DYN_RULES_PATH, JSON.stringify(reglasDinamicas, null, 2), 'utf-8');

      // 3. Ahora sí, lanzamos Python
      const args = ['-u', SCRIPT_PATH, rutaAbsolutaTxt, '--modo', modoValido];
      if (rutaConceptosTxt && fs.existsSync(rutaConceptosTxt)) {
        args.push('--conceptos', rutaConceptosTxt);
      }

      const proceso = spawn(PYTHON_EXEC, args, {
        env: { ...process.env }, 
      });

      // Conectamos el kill real al proxy
      controlProceso.kill = () => proceso.kill();

      // Parseo línea a línea con readline
      const rl = readline.createInterface({ input: proceso.stdout, crlfDelay: Infinity });

      rl.on('line', (linea) => {
        const trimmed = linea.trim();
        if (!trimmed) return;
        try {
          const evento = JSON.parse(trimmed);
          onEvento(evento);
        } catch (_) {
          console.warn('[pythonBridge] stdout no-JSON (ignorado):', trimmed);
        }
      });

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
        _limpiarArchivo(rutaAbsolutaTxt);
        if (rutaConceptosTxt) _limpiarArchivo(rutaConceptosTxt);
      });

      proceso.on('error', (err) => {
        onError(`No se pudo lanzar Python: ${err.message}. ¿Está instalado en el PATH?`);
      });

    } catch (err) {
      console.error('[pythonBridge] Error inyectando reglas dinámicas:', err);
      onError(`Error interno al preparar reglas dinámicas: ${err.message}`);
      _limpiarArchivo(rutaAbsolutaTxt);
      if (rutaConceptosTxt) _limpiarArchivo(rutaConceptosTxt);
    }
  })();

  return controlProceso;
}

function _limpiarArchivo(ruta) {
  fs.unlink(ruta, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.warn('[pythonBridge] No se pudo limpiar temporal:', ruta, err.message);
    }
  });
}

module.exports = { analizarArchivo };
