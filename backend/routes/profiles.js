const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/profiles — lista perfis com seus sites (pro painel exibir)
router.get('/', async (req, res) => {
  const perfis = await pool.query('SELECT id, name FROM profiles ORDER BY name');
  const resultado = [];
  for (const p of perfis.rows) {
    const sites = await pool.query('SELECT domain FROM profile_sites WHERE profile_id = $1 ORDER BY domain', [p.id]);
    resultado.push({ ...p, sites: sites.rows.map((r) => r.domain) });
  }
  res.json(resultado);
});

// POST /api/profiles  { name }
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  const result = await pool.query('INSERT INTO profiles (name) VALUES ($1) RETURNING id, name', [name]);
  res.status(201).json(result.rows[0]);
});

// POST /api/profiles/:id/sites  { domain }
router.post('/:id/sites', async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain é obrigatório' });
  await pool.query(
    'INSERT INTO profile_sites (profile_id, domain) VALUES ($1, $2) ON CONFLICT (profile_id, domain) DO NOTHING',
    [req.params.id, domain.toLowerCase().trim()]
  );
  res.status(201).json({ ok: true });
});

// DELETE /api/profiles/:id/sites/:domain
router.delete('/:id/sites/:domain', async (req, res) => {
  await pool.query('DELETE FROM profile_sites WHERE profile_id = $1 AND domain = $2', [req.params.id, req.params.domain.toLowerCase()]);
  res.json({ ok: true });
});

// PUT /api/employees/:id/profile  { profile_id }  — vincula funcionário a um perfil
router.put('/employees/:id/profile', async (req, res) => {
  const { profile_id } = req.body;
  await pool.query('UPDATE employees SET profile_id = $1 WHERE id = $2', [profile_id, req.params.id]);
  res.json({ ok: true });
});

// POST /api/employees/:id/exceptions  { domain, type: "add" | "remove" }
router.post('/employees/:id/exceptions', async (req, res) => {
  const { domain, type } = req.body;
  if (!domain || !['add', 'remove'].includes(type)) {
    return res.status(400).json({ error: 'domain e type ("add" ou "remove") são obrigatórios' });
  }
  await pool.query(
    `INSERT INTO employee_exceptions (employee_id, domain, type) VALUES ($1, $2, $3)
     ON CONFLICT (employee_id, domain) DO UPDATE SET type = EXCLUDED.type`,
    [req.params.id, domain.toLowerCase().trim(), type]
  );
  res.status(201).json({ ok: true });
});

// GET /api/employees/:id/exceptions
router.get('/employees/:id/exceptions', async (req, res) => {
  const result = await pool.query('SELECT domain, type FROM employee_exceptions WHERE employee_id = $1', [req.params.id]);
  res.json(result.rows);
});

// DELETE /api/employees/:id/exceptions/:domain
router.delete('/employees/:id/exceptions/:domain', async (req, res) => {
  await pool.query('DELETE FROM employee_exceptions WHERE employee_id = $1 AND domain = $2', [req.params.id, req.params.domain.toLowerCase()]);
  res.json({ ok: true });
});

module.exports = router;
