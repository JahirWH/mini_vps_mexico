// ─────────────────────────────────────────────
//  seed.js — Datos iniciales para desarrollo
//  Ejecutar UNA sola vez: node seed.js
//  Crea un admin y un cliente de prueba
// ─────────────────────────────────────────────
require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt   = require('bcrypt');

const db = new Database('./nexcloud.db');

// Asegura que las tablas existen
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    credentials TEXT NOT NULL DEFAULT '{}',
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    service TEXT,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'low',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

async function seed() {
  console.log('🌱 Creando datos de prueba...\n');

  // ── ADMIN ─────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin1234!', 10);
  try {
    const admin = db.prepare(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
    ).run('Admin NexCloud', 'admin@nexcloudmx.com', adminPassword, 'admin');
    console.log('✅ Admin creado:');
    console.log('   Email:    admin@nexcloudmx.com');
    console.log('   Password: Admin1234!');
    console.log('   ID:      ', admin.lastInsertRowid, '\n');
  } catch {
    console.log('⚠️  Admin ya existe, omitiendo...\n');
  }

  // ── CLIENTE DE PRUEBA ─────────────────────
  const clientPassword = await bcrypt.hash('Cliente123!', 10);
  let clientId;
  try {
    const client = db.prepare(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
    ).run('Juan López', 'juan@ejemplo.com', clientPassword, 'client');
    clientId = client.lastInsertRowid;
    console.log('✅ Cliente de prueba creado:');
    console.log('   Email:    juan@ejemplo.com');
    console.log('   Password: Cliente123!');
    console.log('   ID:      ', clientId, '\n');
  } catch {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('juan@ejemplo.com');
    clientId = existing?.id;
    console.log('⚠️  Cliente ya existe, omitiendo...\n');
  }

  // ── SERVICIOS DEL CLIENTE ─────────────────
  if (clientId) {
    const insertService = db.prepare(
      'INSERT INTO services (user_id, type, status, credentials, expires_at) VALUES (?, ?, ?, ?, ?)'
    );

    // VPS activo
    insertService.run(clientId, 'vps', 'active', JSON.stringify({
      ip:       '187.216.100.50',
      user:     'nexuser',
      password: 'Nx8!kP2@mZ',
      port:     22,
      os:       'Ubuntu 22.04',
      plan:     'Plan Pro — 2vCPU / 2GB RAM / 20GB SSD'
    }), '2025-04-01');

    // cPanel activo
    insertService.run(clientId, 'cpanel', 'active', JSON.stringify({
      url:      'tudominio.com:2083',
      user:     'nexjuanl',
      password: 'Cp@5xN2!rT',
      ftp:      'ftp.tudominio.com',
      smtp:     'mail.tudominio.com',
      ns1:      'ns1.nexcloudmx.com',
      ns2:      'ns2.nexcloudmx.com'
    }), '2025-04-01');

    // Bot IA pendiente
    insertService.run(clientId, 'botia', 'pending', JSON.stringify({
      token:    null,
      username: null,
      api_key:  null,
      tokens_used:  0,
      tokens_limit: 500000
    }), '2025-04-01');

    // VPN activa
    insertService.run(clientId, 'vpn', 'active', JSON.stringify({
      server_ip:   '187.216.44.12',
      port:        51820,
      private_key: 'mK2Px9LqAbCdEfGhIjKlMnOpQrStUvWxYz1234567890==',
      conf_url:    '/files/wg0-juan.conf'
    }), '2025-04-01');

    console.log('✅ Servicios de prueba creados para Juan López\n');

    // ── TICKET DE PRUEBA ─────────────────────
    db.prepare(
      'INSERT INTO tickets (user_id, service, subject, description, priority) VALUES (?, ?, ?, ?, ?)'
    ).run(
      clientId, 'botia',
      '¿Cuándo estarán listas las credenciales del Bot IA?',
      'Contraté el plan hace 3 horas y aún no veo las credenciales en el dashboard.',
      'mid'
    );
    console.log('✅ Ticket de prueba creado\n');
  }

  console.log('─────────────────────────────────────');
  console.log('🚀 Seed completado. Inicia el servidor:');
  console.log('   npm run dev');
  console.log('   http://localhost:3000');
  console.log('─────────────────────────────────────');
  db.close();
}

seed().catch(console.error);