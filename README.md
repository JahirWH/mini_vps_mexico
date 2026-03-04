# NexCloud MX 🇲🇽

Panel de cliente para servicios VPS, Hosting cPanel, Bots IA y VPN.

## 🚀 Características

- Autenticación JWT segura
- Panel de cliente con dashboard
- Gestión de servicios
- Sistema de tickets de soporte
- Base de datos SQLite

## 📋 Requisitos

- Node.js 14+
- npm

## ⚙️ Instalación

\`\`\`bash
git clone https://github.com/JahirWH/mini_vps_mexico.git
cd mini_vps_mexico
npm install
cp .env.example .env

# Edita .env con tus valores

npm start
\`\`\`

## 📝 Variables de Entorno

Ver `.env.example`

## 🔐 Seguridad

- Las contraseñas se hashean con bcrypt
- Tokens JWT en cookies httpOnly
- CORS configurado
- Rate limiting en login

## 📄 Licencia

MIT
