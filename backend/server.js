require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');

const { pool, initSchema } = require('./db');
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const agentRoutes = require('./routes/agent');
const profileRoutes = require('./routes/profiles');

if (!process.env.JWT_SECRET) {
  console.error('Defina JWT_SECRET no arquivo .env antes de iniciar o servidor.');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/profiles', profileRoutes);

// Painel do gestor (arquivos estáticos)
app.use(express.static(path.join(__dirname, 'public')));

// Cria o admin automaticamente a partir de variáveis de ambiente, se ele
// ainda não existir. Útil em planos Free do Render, que não têm Shell —
// evita precisar rodar create-admin.js manualmente.
async function ensureAdminFromEnv() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.log('ADMIN_USERNAME/ADMIN_PASSWORD não definidos — pulando criação automática de admin.');
    return;
  }

  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  await pool.query(`
    INSERT INTO admins (username, password_hash)
    VALUES ($1, $2)
    ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `, [ADMIN_USERNAME, hash]);
  console.log(`Admin "${ADMIN_USERNAME}" sincronizado a partir das variáveis de ambiente.`);
}

const PORT = process.env.PORT || 3000;

initSchema()
  .then(ensureAdminFromEnv)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Erro ao inicializar o banco de dados:', err);
    process.exit(1);
  });
