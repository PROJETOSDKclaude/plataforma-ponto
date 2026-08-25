const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// O agente do Windows chama essa rota periodicamente.
// Autenticação simples via header X-API-Key (uma chave por computador, não por pessoa).
router.get('/status', async (req, res) => {
  const apiKey = req.header('X-API-Key');

  if (!apiKey) {
    return res.status(401).json({ error: 'X-API-Key ausente.' });
  }

  const { rows } = await pool.query(`
    SELECT c.*, e.id AS employee_id, e.name AS employee_name, e.profile_id
    FROM computers c
    JOIN employees e ON e.id = c.employee_id
    WHERE c.api_key = $1
  `, [apiKey]);
  const computer = rows[0];

  if (!computer) {
    return res.status(404).json({ error: 'Computador não cadastrado.' });
  }

  await pool.query(`UPDATE computers SET last_seen_at = now() WHERE id = $1`, [computer.id]);

  // Sites do perfil do funcionário (whitelist base).
  const perfilResult = await pool.query(
    'SELECT domain FROM profile_sites WHERE profile_id = $1',
    [computer.profile_id]
  );
  const sites = new Set(perfilResult.rows.map((r) => r.domain));

  // Exceções pessoais: adicionar ou remover um site específico pra esse funcionário.
  const excecoesResult = await pool.query(
    'SELECT domain, type FROM employee_exceptions WHERE employee_id = $1',
    [computer.employee_id]
  );
  for (const e of excecoesResult.rows) {
    if (e.type === 'add') sites.add(e.domain);
    if (e.type === 'remove') sites.delete(e.domain);
  }

  res.json({
    liberado: !!computer.liberado,
    employee_name: computer.employee_name,
    computer_name: computer.name,
    allowed_sites: Array.from(sites),
  });
});

module.exports = router;
