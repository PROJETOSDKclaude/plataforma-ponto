const express = require('express');
const { nanoid } = require('nanoid');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Lista todos os funcionários com seus computadores e status atual
router.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.id AS employee_id, e.name AS employee_name,
           c.id AS computer_id, c.name AS computer_name,
           c.liberado, c.updated_at, c.last_seen_at, c.api_key
    FROM employees e
    LEFT JOIN computers c ON c.employee_id = e.id
    ORDER BY e.name
  `);

  res.json(rows);
});

// Cria um funcionário + computador associado, gera a api_key do agente
router.post('/', async (req, res) => {
  const { employee_name, computer_name } = req.body;

  if (!employee_name || !computer_name) {
    return res.status(400).json({ error: 'employee_name e computer_name são obrigatórios.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const employeeResult = await client.query(
      'INSERT INTO employees (name) VALUES ($1) RETURNING id',
      [employee_name]
    );
    const employeeId = employeeResult.rows[0].id;

    const apiKey = nanoid(32);
    const computerResult = await client.query(
      'INSERT INTO computers (employee_id, name, api_key, liberado) VALUES ($1, $2, $3, false) RETURNING id',
      [employeeId, computer_name, apiKey]
    );

    await client.query('COMMIT');

    res.status(201).json({
      employee_id: employeeId,
      computer_id: computerResult.rows[0].id,
      api_key: apiKey, // mostrado só na criação — usar para configurar o agente no PC
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Liberar ou bloquear um computador
router.patch('/computers/:id/status', async (req, res) => {
  const { id } = req.params;
  const { liberado } = req.body;

  if (typeof liberado !== 'boolean') {
    return res.status(400).json({ error: 'Campo "liberado" deve ser true ou false.' });
  }

  const { rows } = await pool.query(`
    SELECT c.*, e.name AS employee_name FROM computers c
    JOIN employees e ON e.id = c.employee_id
    WHERE c.id = $1
  `, [id]);
  const computer = rows[0];

  if (!computer) {
    return res.status(404).json({ error: 'Computador não encontrado.' });
  }

  await pool.query(
    `UPDATE computers SET liberado = $1, updated_at = now() WHERE id = $2`,
    [liberado, id]
  );

  await pool.query(`
    INSERT INTO history (computer_id, employee_name, computer_name, action, admin_username)
    VALUES ($1, $2, $3, $4, $5)
  `, [id, computer.employee_name, computer.name, liberado ? 'liberado' : 'bloqueado', req.admin.username]);

  res.json({ ok: true });
});

// Remove um funcionário (e seu computador, via cascade)
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Sites bloqueados de um computador
router.get('/computers/:id/sites', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, domain FROM blocked_sites WHERE computer_id = $1 ORDER BY domain',
    [req.params.id]
  );
  res.json(rows);
});

router.post('/computers/:id/sites', async (req, res) => {
  let { domain } = req.body;
  if (!domain || !domain.trim()) {
    return res.status(400).json({ error: 'Informe um domínio.' });
  }

  // normaliza: remove protocolo, caminho e espaços
  domain = domain.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');

  const { rows } = await pool.query(`
    INSERT INTO blocked_sites (computer_id, domain)
    VALUES ($1, $2)
    ON CONFLICT (computer_id, domain) DO NOTHING
    RETURNING id
  `, [req.params.id, domain]);

  res.status(201).json({ id: rows[0]?.id, domain });
});

router.delete('/computers/:id/sites/:siteId', async (req, res) => {
  await pool.query('DELETE FROM blocked_sites WHERE id = $1 AND computer_id = $2', [
    req.params.siteId, req.params.id,
  ]);
  res.json({ ok: true });
});

// Histórico de liberações/bloqueios
router.get('/history/all', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT * FROM history ORDER BY created_at DESC LIMIT 200
  `);
  res.json(rows);
});

module.exports = router;
