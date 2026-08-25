-- Migração: whitelist de sites por funcionário (perfis + exceções individuais)
-- Aditiva — não remove nem altera nenhuma tabela existente.
--
-- Nota: este schema já é aplicado automaticamente pelo initSchema() em
-- backend/db.js (que roda no start do servidor). Este arquivo fica aqui só
-- como referência/documentação da migração — não precisa rodar manualmente.

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profile_sites (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  UNIQUE(profile_id, domain)
);

-- Cada funcionário pode pertencer a um perfil (opcional).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_id INTEGER REFERENCES profiles(id);

-- Exceções pessoais: liberar um site extra, ou remover um site que o
-- perfil libera, só pra esse funcionário específico.
CREATE TABLE IF NOT EXISTS employee_exceptions (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('add', 'remove')),
  UNIQUE(employee_id, domain)
);

-- Observação: a tabela `blocked_sites` existente (por computador) continua
-- funcionando como está — pense nela como "sites extras daquele computador
-- específico", complementares ao que o funcionário libera pelo perfil dele.
-- Se preferir migrar o que já está cadastrado ali para virar exceção do
-- funcionário dono do computador, rode:
--
-- INSERT INTO employee_exceptions (employee_id, domain, type)
-- SELECT DISTINCT c.employee_id, bs.domain, 'add'
-- FROM blocked_sites bs
-- JOIN computers c ON c.id = bs.computer_id
-- ON CONFLICT (employee_id, domain) DO NOTHING;
