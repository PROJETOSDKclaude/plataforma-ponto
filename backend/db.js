// db.js — conexão e schema do banco (Postgres, ex: Supabase)

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Defina DATABASE_URL no .env (string de conexão do Supabase/Postgres).');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // necessário para conectar no Supabase
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS computers (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      liberado BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ DEFAULT now(),
      last_seen_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS history (
      id SERIAL PRIMARY KEY,
      computer_id INTEGER NOT NULL,
      employee_name TEXT NOT NULL,
      computer_name TEXT NOT NULL,
      action TEXT NOT NULL,
      admin_username TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS blocked_sites (
      id SERIAL PRIMARY KEY,
      computer_id INTEGER NOT NULL REFERENCES computers(id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(computer_id, domain)
    );
  `);
}

module.exports = { pool, initSchema };
