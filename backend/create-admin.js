// create-admin.js — cria (ou atualiza a senha de) um usuário admin
// Uso: node create-admin.js <usuario> <senha>

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, initSchema } = require('./db');

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Uso: node create-admin.js <usuario> <senha>');
  process.exit(1);
}

async function main() {
  await initSchema();
  const hash = bcrypt.hashSync(password, 10);

  const { rows } = await pool.query('SELECT id FROM admins WHERE username = $1', [username]);

  if (rows.length > 0) {
    await pool.query('UPDATE admins SET password_hash = $1 WHERE username = $2', [hash, username]);
    console.log(`Senha atualizada para o admin "${username}".`);
  } else {
    await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [username, hash]);
    console.log(`Admin "${username}" criado com sucesso.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
