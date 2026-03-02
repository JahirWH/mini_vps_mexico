// ─────────────────────────────────────────────
//  NexCloud MX — Servidor principal
//  Stack: Express · SQLite · bcrypt · JWT
// ─────────────────────────────────────────────
require('dotenv').config();

const express      = require('express');
const cookieParser = require('cookie-parser');
const bcrypt       = require('bcrypt');
const jwt          = require('jsonwebtoken');
const Database     = require('better-sqlite3');
const path         = require('path');

const app = express();
const db  = new Database('./nexcloud.db'); // archivo local, sin configurar nada extra

// ─── CONSTANTES ───────────────────────────────
const JWT_SECRET      = process.env.JWT_SECRET || 'cambia_esto_en_produccion_usa_dotenv';
const COOKIE_NAME     = 'nexcloud_token';
const SALT_ROUNDS     = 10;
const TOKEN_EXPIRES   = '7d'; // el token dura 7 días
const PORT            = process.env.PORT || 3000;

// ─── MIDDLEWARES GLOBALES ─────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Sirve tus archivos HTML estáticos desde /public
app.use(express.static(path.join(__dirname, 'public')));


// ─────────────────────────────────────────────
//  BASE DE DATOS — inicialización automática
//  Se crean las tablas si no existen.
// ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,          -- siempre hasheado con bcrypt
    role        TEXT    NOT NULL DEFAULT 'client', -- 'admin' | 'client'
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    type        TEXT    NOT NULL,          -- 'vps' | 'cpanel' | 'botia' | 'vpn'
    status      TEXT    NOT NULL DEFAULT 'pending', -- 'active' | 'pending' | 'suspended'
    credentials TEXT    NOT NULL DEFAULT '{}',      -- JSON con las credenciales del servicio
    expires_at  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    service     TEXT,
    subject     TEXT    NOT NULL,
    description TEXT    NOT NULL,
    priority    TEXT    NOT NULL DEFAULT 'low',  -- 'low' | 'mid' | 'high'
    status      TEXT    NOT NULL DEFAULT 'open', -- 'open' | 'resolved' | 'closed'
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);


// ─────────────────────────────────────────────
//  MIDDLEWARE DE AUTENTICACIÓN
//  Úsalo en cualquier ruta que quieras proteger.
//  Ej: app.get('/dashboard', requireAuth, (req, res) => { ... })
// ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    // Si no hay token, redirige al login
    return res.redirect('/login.html?reason=session_expired');
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Adjunta el usuario al request para usarlo en la ruta
    req.user = payload;
    next();
  } catch (err) {
    // Token inválido o expirado
    res.clearCookie(COOKIE_NAME);
    return res.redirect('/login.html?reason=invalid_token');
  }
}

// Variante: solo para admins
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  });
}


// ─────────────────────────────────────────────
//  RUTAS PROTEGIDAS — páginas HTML
//  Express sirve el HTML solo si el token es válido.
//  Si no, redirige a /login.html
// ─────────────────────────────────────────────

// Dashboard
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Ayuda / Soporte
app.get('/help', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'help.html'));
});

// Página principal (pública)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ─────────────────────────────────────────────
//  AUTH — REGISTRO
//  POST /auth/register
//  Body: { name, email, password }
// ─────────────────────────────────────────────
app.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  // Validaciones básicas
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  // Verificar si el email ya existe
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Este email ya está registrado' });
  }

  // Hashear contraseña — NUNCA guardes contraseñas en texto plano
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  // Insertar usuario
  const insert = db.prepare(
    'INSERT INTO users (name, email, password) VALUES (?, ?, ?)'
  );
  const result = insert.run(name, email.toLowerCase().trim(), hashedPassword);

  // Crear token JWT
  const token = jwt.sign(
    { userId: result.lastInsertRowid, email, name, role: 'client' },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES }
  );

  // Guardar token en cookie httpOnly (no accesible desde JavaScript del navegador)
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,   // 🔒 JS del frontend NO puede leerla
    secure: process.env.NODE_ENV === 'production', // solo HTTPS en prod
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días en ms
  });

  res.status(201).json({
    message: 'Registro exitoso',
    user: { id: result.lastInsertRowid, name, email, role: 'client' }
  });
});


// ─────────────────────────────────────────────
//  AUTH — LOGIN
//  POST /auth/login
//  Body: { email, password }
// ─────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  // Buscar usuario por email
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

  // Mismo mensaje de error para email y contraseña (evita enumerar usuarios)
  if (!user) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  // Comparar contraseña con el hash guardado
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  // Crear token JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES }
  );

  // Guardar en cookie httpOnly
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({
    message: 'Login exitoso',
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});


// ─────────────────────────────────────────────
//  AUTH — CERRAR SESIÓN
//  GET /auth/logout
// ─────────────────────────────────────────────
app.get('/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect('/login.html');
});


// ─────────────────────────────────────────────
//  AUTH — VERIFICAR SESIÓN ACTIVA
//  GET /auth/me  →  usado por el frontend para
//  saber si el usuario está logueado.
// ─────────────────────────────────────────────
app.get('/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?')
    .get(req.user.userId);

  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user });
});


// ─────────────────────────────────────────────
//  API — SERVICIOS DEL USUARIO
//  GET /api/services  →  devuelve los servicios
//  del usuario logueado con sus credenciales.
// ─────────────────────────────────────────────
app.get('/api/services', requireAuth, (req, res) => {
  const services = db.prepare(
    'SELECT * FROM services WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.userId);

  // Parsear el JSON de credenciales de cada servicio
  const parsed = services.map(s => ({
    ...s,
    credentials: JSON.parse(s.credentials)
  }));

  res.json({ services: parsed });
});


// ─────────────────────────────────────────────
//  ADMIN — CREAR SERVICIO PARA UN USUARIO
//  POST /admin/services
//  Body: { user_id, type, credentials, expires_at }
//  Solo accesible para admins (tú).
//
//  Ejemplo de credenciales VPS:
//  { ip: "187.x.x.x", user: "nexuser", password: "xxx", port: 22 }
//
//  Ejemplo cPanel:
//  { url: "dominio.com:2083", user: "cpuser", password: "xxx", ftp: "ftp.dominio.com" }
//
//  Ejemplo Bot IA:
//  { token: "123:ABC...", username: "@MiBot", api_key: "sk-..." }
//
//  Ejemplo VPN:
//  { server_ip: "x.x.x.x", port: 51820, private_key: "...", conf_url: "/files/wg0.conf" }
// ─────────────────────────────────────────────
app.post('/admin/services', requireAdmin, (req, res) => {
  const { user_id, type, credentials, expires_at, status } = req.body;

  if (!user_id || !type || !credentials) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const validTypes = ['vps', 'cpanel', 'botia', 'vpn'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Tipo inválido. Usa: ${validTypes.join(', ')}` });
  }

  const insert = db.prepare(
    'INSERT INTO services (user_id, type, credentials, status, expires_at) VALUES (?, ?, ?, ?, ?)'
  );
  const result = insert.run(
    user_id,
    type,
    JSON.stringify(credentials),
    status || 'active',
    expires_at || null
  );

  res.status(201).json({ message: 'Servicio creado', service_id: result.lastInsertRowid });
});


// ─────────────────────────────────────────────
//  ADMIN — ACTUALIZAR ESTADO O CREDENCIALES
//  PATCH /admin/services/:id
// ─────────────────────────────────────────────
app.patch('/admin/services/:id', requireAdmin, (req, res) => {
  const { status, credentials } = req.body;
  const { id } = req.params;

  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });

  const newStatus = status || service.status;
  const newCreds  = credentials ? JSON.stringify(credentials) : service.credentials;

  db.prepare('UPDATE services SET status = ?, credentials = ? WHERE id = ?')
    .run(newStatus, newCreds, id);

  res.json({ message: 'Servicio actualizado' });
});


// ─────────────────────────────────────────────
//  API — TICKETS
//  POST /api/tickets  →  cliente abre ticket
//  GET  /api/tickets  →  cliente ve sus tickets
// ─────────────────────────────────────────────
app.post('/api/tickets', requireAuth, (req, res) => {
  const { service, subject, description, priority } = req.body;

  if (!subject || !description) {
    return res.status(400).json({ error: 'Asunto y descripción requeridos' });
  }

  const insert = db.prepare(
    'INSERT INTO tickets (user_id, service, subject, description, priority) VALUES (?, ?, ?, ?, ?)'
  );
  const result = insert.run(
    req.user.userId, service || null, subject, description, priority || 'low'
  );

  res.status(201).json({ message: 'Ticket creado', ticket_id: result.lastInsertRowid });
});

app.get('/api/tickets', requireAuth, (req, res) => {
  const tickets = db.prepare(
    'SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.userId);

  res.json({ tickets });
});


// ─────────────────────────────────────────────
//  ADMIN — VER TODOS LOS TICKETS
//  GET /admin/tickets
// ─────────────────────────────────────────────
app.get('/admin/tickets', requireAdmin, (req, res) => {
  const tickets = db.prepare(`
    SELECT t.*, u.name as user_name, u.email as user_email
    FROM tickets t
    JOIN users u ON t.user_id = u.id
    ORDER BY t.created_at DESC
  `).all();

  res.json({ tickets });
});

// Cerrar ticket (admin)
app.patch('/admin/tickets/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE tickets SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'Ticket actualizado' });
});


// ─────────────────────────────────────────────
//  INICIO DEL SERVIDOR
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────┐
  │   NexCloud MX — Servidor activo     │
  │   http://localhost:${PORT}              │
  │                                     │
  │   Rutas públicas:                   │
  │     GET  /                          │
  │     GET  /login.html                │
  │                                     │
  │   Rutas protegidas:                 │
  │     GET  /dashboard  (requiere JWT) │
  │     GET  /help       (requiere JWT) │
  │                                     │
  │   Auth API:                         │
  │     POST /auth/register             │
  │     POST /auth/login                │
  │     GET  /auth/logout               │
  │     GET  /auth/me                   │
  └─────────────────────────────────────┘
  `);
});