# Agente LSD v2

Aplicacion web para validar archivos TXT de Libro de Sueldos Digital (LSD), detectar inconsistencias antes de la presentacion y acompañar el resultado con historial, chat contextual, tickets de soporte y herramientas de administracion.

El proyecto esta dividido en tres piezas principales:

- `frontend/`: aplicacion Angular para login, carga de archivos, visualizacion de resultados, historial, top de errores, tickets y panel admin.
- `backend/`: API Node.js + Express que autentica usuarios, guarda informacion en MongoDB, recibe archivos, administra reglas y conecta con Python.
- `python_service/`: motor deterministico que parsea y valida los TXT LSD, emite eventos JSON y genera el informe final.

## Que incluye

- Autenticacion con JWT y roles `usuario` / `admin`.
- Carga de archivos `.txt` LSD desde la interfaz.
- Analisis por streaming SSE para mostrar progreso en tiempo real.
- Validacion deterministica de registros LSD `01`, `02`, `03`, `04` y `05`.
- Modos de analisis `auto`, `rapido` y `profundo` en backend/Python.
- Soporte opcional para archivo de conceptos y archivo de comparacion.
- Informe final con veredicto, resumen, problemas, estadisticas, configuracion detectada y comparacion.
- Historial de analisis por usuario.
- Chat contextual asociado al analisis.
- Sistema de feedback y tickets con respuestas de administrador y adjuntos corregidos.
- Panel admin para usuarios, normativas, reglas, historial, estadisticas, motor de reglas y wiki.
- Reglas dinamicas guardadas en MongoDB e inyectadas al motor Python mediante `python_service/reglas_dinamicas.json`.
- Scripts utilitarios para crear usuario administrador y migrar datos.

## Arquitectura

```text
frontend (Angular)
  -> consume http://localhost:3000/api
  -> sube archivos y abre un EventSource para recibir progreso

backend (Express)
  -> valida JWT y permisos
  -> guarda sesiones, usuarios, reglas, tickets e historial en MongoDB
  -> escribe reglas dinamicas activas para Python
  -> ejecuta python_service/agente_lsd.py con child_process.spawn

python_service
  -> lee el TXT LSD
  -> parsea registros y aplica reglas
  -> imprime eventos JSON por stdout
  -> devuelve un informe final al backend
```

## Flujo de analisis

1. El usuario inicia sesion en el frontend.
2. En `Analizar`, carga un TXT LSD. Opcionalmente puede sumar un TXT de conceptos y otro archivo para comparar.
3. Angular llama a `POST /api/analizar/upload`.
4. El backend guarda una sesion en `HistorialAnalisis`, deja los archivos temporales en `backend/uploads/tmp` y devuelve un `sessionId`.
5. Angular abre `GET /api/analizar/stream/:sessionId` por SSE.
6. El backend toma las reglas dinamicas activas desde MongoDB, genera `python_service/reglas_dinamicas.json` y ejecuta `agente_lsd.py`.
7. Python emite eventos `herramienta`, `validacion_ok`, `aviso`, `informe_final`, `error` o `fin`.
8. El backend reenvia esos eventos al navegador y persiste el informe final.
9. El usuario puede revisar el informe, conversar con el chat contextual, consultar historial o enviar feedback/ticket.

## Estructura del proyecto

```text
.
├── backend/
│   ├── src/
│   │   ├── app.js                 # servidor Express
│   │   ├── config/db.js           # conexion MongoDB
│   │   ├── middleware/auth.js     # JWT y permisos
│   │   ├── models/                # Mongoose models
│   │   ├── routes/                # rutas API
│   │   └── services/pythonBridge.js
│   ├── scripts/
│   │   ├── crear-admin.js
│   │   └── migrar-sqlite.js
│   └── uploads/                   # archivos originales, temporales y respuestas
├── frontend/
│   ├── src/app/
│   │   ├── core/                  # guards y servicios
│   │   ├── features/              # pantallas principales
│   │   └── shared/                # layout/componentes compartidos
│   └── src/environments/          # URLs de API
├── python_service/
│   ├── agente_lsd.py              # motor de validacion
│   ├── reglas_lsd.json            # reglas base
│   ├── reglas_dinamicas.json      # reglas generadas desde MongoDB
│   ├── gemini_files.json
│   └── pdfs/
├── Txts/                          # archivos TXT de prueba
└── graphify-out/                  # salida auxiliar de graphify
```

## Backend

Stack principal:

- Node.js 18+
- Express
- MongoDB + Mongoose
- JWT
- Multer para uploads
- Google Generative AI para funciones de chat/normativa

Rutas principales:

- `POST /api/auth/login`: login.
- `POST /api/auth/register`: registro.
- `GET /api/auth/me`: usuario autenticado.
- `POST /api/analizar/upload`: carga de TXT LSD.
- `GET /api/analizar/stream/:sessionId`: streaming SSE del analisis.
- `GET /api/analizar/resultado/:sessionId`: resultado guardado.
- `POST /api/chat`: chat contextual.
- `GET /api/wiki/reglas`: wiki de reglas.
- `POST /api/tickets`: feedback o ticket.
- `GET /api/tickets/mios`: tickets propios.
- `GET /api/admin/*`: administracion de usuarios, reglas, normativas, historial y estadisticas.
- `GET /health`: health check general.

Modelos destacados:

- `Usuario`: credenciales, email, telefono y rol.
- `HistorialAnalisis`: sesion, archivo, informe, problemas, estadisticas, chat y comparacion.
- `Ticket`: feedback, tickets, respuestas de admin y adjuntos.
- `ReglaValidacion`: reglas dinamicas del motor.
- `ReglaNormativa`, `NormativaQA`, `WikiRegla`: soporte documental y wiki.

## Frontend

Stack principal:

- Angular 15
- RxJS
- Angular Router
- XLSX para lectura/procesamiento de planillas cuando aplica

Pantallas incluidas:

- `login`: acceso de usuario.
- `analizar`: carga de archivo, progreso SSE e informe.
- `historial`: analisis anteriores del usuario.
- `top-errores`: metricas y errores frecuentes.
- `mis-tickets`: seguimiento de tickets propios.
- `admin`: gestion administrativa protegida por rol admin.

En desarrollo el frontend usa:

```ts
apiUrl: 'http://localhost:3000/api'
```

En produccion usa:

```ts
apiUrl: '/api'
```

## Servicio Python

`python_service/agente_lsd.py` es el motor de validacion. Recibe una ruta de TXT y argumentos opcionales:

```bash
python agente_lsd.py archivo.txt --modo auto
python agente_lsd.py archivo.txt --modo profundo --conceptos conceptos.txt
python agente_lsd.py archivo.txt --modo profundo --comparar-con archivo_anterior.txt
```

El script emite JSON linea por linea por `stdout`, lo que permite al backend transmitir progreso al navegador. El archivo `requirements.txt` indica que el motor deterministico actual usa solo librerias estandar de Python.

## Variables de entorno

Crear `backend/.env` con estas variables:

```env
MONGO_URI=
JWT_SECRET=
JWT_EXPIRES_IN=
GEMINI_API_KEY=
PORT=3000
NODE_ENV=development
PYTHON_EXECUTABLE=python
PYTHON_SCRIPT=
UPLOAD_TTL_SEG=
```

Notas:

- `MONGO_URI` debe apuntar a una base MongoDB accesible.
- `JWT_SECRET` tiene que ser un secreto largo para firmar tokens.
- `GEMINI_API_KEY` se usa para funciones de IA/chat si estan habilitadas.
- `PYTHON_EXECUTABLE` permite indicar `python`, `python3` o una ruta absoluta.
- `PYTHON_SCRIPT` existe como variable configurada, aunque el bridge actual resuelve por defecto `python_service/agente_lsd.py`.

## Instalacion y ejecucion local

Desde la raiz del proyecto:

```bash
cd backend
npm install
```

```bash
cd ../frontend
npm install
```

El servicio Python no requiere dependencias externas actualmente:

```bash
cd ../python_service
python --version
```

Levantar backend:

```bash
cd backend
npm run dev
```

Levantar frontend:

```bash
cd frontend
npm start
```

URLs locales:

- Frontend: `http://localhost:4200`
- Backend API: `http://localhost:3000/api`
- Health check: `http://localhost:3000/health`

## Crear el primer admin

Con MongoDB configurado en `backend/.env`:

```bash
cd backend
node scripts/crear-admin.js admin admin123
```

Si no se pasan argumentos, el script usa `admin` / `admin123`. Conviene cambiar la contraseña despues del primer login.

## Comandos utiles

Backend:

```bash
npm run dev
npm start
```

Frontend:

```bash
npm start
npm run build
npm test
```

Python:

```bash
python python_service/agente_lsd.py Txts/LibroDigital-4010.txt --modo profundo
```

## Datos y archivos generados

- `backend/uploads/originales`: copias de TXT originales asociados a tickets/historial.
- `backend/uploads/tmp`: archivos temporales usados durante el analisis.
- `backend/uploads/respuestas`: adjuntos enviados como respuesta de administrador.
- `python_service/reglas_dinamicas.json`: se regenera desde MongoDB antes de lanzar Python.
- `frontend/dist/`: build de Angular.
- `tmp_out.json` y `tmp_err.txt`: salidas temporales locales.

## Consideraciones

- El backend espera MongoDB disponible antes de iniciar correctamente.
- El frontend requiere un token valido para operar sobre las pantallas protegidas.
- El endpoint SSE recibe el token por query string porque `EventSource` del navegador no permite headers custom.
- Los archivos subidos deben ser `.txt`.
- Las reglas dinamicas se administran desde el backend/admin y se sincronizan al motor Python al comenzar cada analisis.
