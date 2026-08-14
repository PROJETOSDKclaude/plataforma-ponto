# Central de Acesso — Plataforma de bloqueio por comprovante de ponto

MVP funcional com três partes:

- `backend/` — servidor (API + painel web do gestor)
- `agent/` — programa que roda no PC de cada funcionário e mostra a tela de bloqueio
- Fluxo: funcionário bate ponto no Pontomais → envia comprovante por WhatsApp →
  gestor confere → libera ou bloqueia o PC pelo painel.

⚠️ **Antes de colocar em uso**: alinhe com o RH/jurídico da empresa como isso vai
ser comunicado aos funcionários (ideal: previsto por escrito em política interna,
com ciência formal de cada um). Bloquear o acesso ao computador é uma medida que
pode ser questionada trabalhistamente se for aplicada sem transparência.

---

## 1. Rodando o backend localmente

```bash
cd backend
npm install
cp .env.example .env
# edite o .env e defina um JWT_SECRET forte
node create-admin.js seu_usuario sua_senha
npm start
```

O painel fica em `http://localhost:3000`.

## 2. Deploy na nuvem (Render, DigitalOcean, etc.)

1. Suba a pasta `backend/` num repositório Git.
2. Crie um Web Service apontando pra esse repositório.
   - Build command: `npm install`
   - Start command: `npm start`
3. Configure a variável de ambiente `JWT_SECRET` no painel do provedor.
4. Depois do primeiro deploy, rode uma vez `node create-admin.js usuario senha`
   (via shell/console do provedor) pra criar o login do gestor.

Observação: este MVP usa SQLite (um arquivo local `data.sqlite`). Funciona bem
para 11–50 computadores, mas se o provedor reiniciar o disco a cada deploy
(alguns planos gratuitos fazem isso), o banco pode ser perdido — verifique se
o plano escolhido tem **disco persistente**. Se quiser something mais robusto
desde já, dá pra trocar `better-sqlite3` por Postgres (a lógica de queries está
isolada em `db.js` e nas rotas, então a migração é localizada).

## 3. Painel do gestor

- Acesse a URL do servidor no navegador, faça login.
- "+ Novo funcionário" cria o funcionário e o computador dele, e gera uma
  **chave de API** — essa chave só aparece uma vez, é ela que vai no `config.json`
  do agente daquele PC.
- O botão Liberar/Bloquear muda o status na hora; o agente do PC reflete a
  mudança no próximo ciclo (a cada 20s por padrão).

## 4. Instalando o agente em cada PC (Windows)

```bash
cd agent
pip install -r requirements.txt
copy config.example.json config.json
# edite config.json: server_url = URL do backend, api_key = chave gerada no painel
python agent.py   # testar antes de empacotar
```

Depois de testar, gere um `.exe` único pra distribuir sem precisar instalar Python:

```bash
pyinstaller --onefile --noconsole --add-data "config.json;." agent.py
```

O executável fica em `dist/agent.exe`. Para rodar automaticamente ao ligar o PC,
coloque um atalho dele na pasta de Inicialização do Windows:
`Win + R` → `shell:startup` → cole o atalho do `agent.exe`.

Cada PC precisa do seu próprio `config.json` com a `api_key` daquele computador
(gerada ao cadastrar o funcionário no painel).

## 6. Bloqueio de sites específicos (opcional)

Além de bloquear o PC inteiro, dá pra bloquear sites específicos por computador,
direto pelo painel (botão "🌐 Sites" em cada linha). O agente aplica isso editando
o arquivo `hosts` do Windows — **e isso só funciona se o agente estiver rodando
com privilégio de administrador**, independente de quem esteja logado no PC.

Por isso, em vez de só um atalho na pasta de Inicialização, use uma **Tarefa
Agendada rodando como SYSTEM**:

1. Pesquise por "Agendador de Tarefas" no menu Iniciar e abra
2. Ação → Criar Tarefa (não "Tarefa Básica")
3. Aba Geral: dê um nome (ex: Central de Acesso). Marque "Executar com os privilégios mais altos". Em "Configurar para", pode deixar Windows 10/11.
4. Aba Disparadores → Novo → "Ao iniciar o computador"
5. Aba Ações → Novo → Programa/script: coloque o caminho completo do `agent.exe` (ex: `C:\CentralAcesso\agent.exe`)
6. Aba Condições: desmarque "Iniciar a tarefa somente se o computador estiver com energia CA" (pra funcionar em notebook na bateria)
7. Salve — vai pedir a senha do usuário admin que está configurando, só nesse momento
8. Teste: reinicie o PC e confirme que a tela de bloqueio aparece sozinha, sem precisar logar em nada manualmente

Se só usar bloqueio de PC inteiro (sem bloquear sites), o atalho simples na
pasta de Inicialização (`shell:startup`) continua funcionando normalmente,
não precisa da Tarefa Agendada.

## 7. Limites conhecidos deste MVP

- A tela de bloqueio é um aviso em primeiro plano, não uma trava de sistema
  operacional — de propósito (ver aviso no topo do arquivo `agent/agent.py`).
- Um funcionário com conhecimento técnico avançado poderia encerrar o processo
  via Gerenciador de Tarefas. Isso é uma limitação aceita aqui: reforçar via
  política interna é mais seguro (jurídica e tecnicamente) do que endurecer o
  agente para ser inquebrável.
- Sem HTTPS configurado por padrão — ao fazer deploy, use um provedor que dê
  HTTPS automático (Render/DigitalOcean App Platform já entregam isso).
- O bloqueio de sites funciona por domínio inteiro (ex: bloquear instagram.com
  bloqueia o site todo, não só páginas específicas), e só funciona se o agente
  estiver rodando elevado (ver seção 6). Um funcionário com acesso admin no
  próprio PC também poderia reverter isso editando o hosts manualmente — mesma
  lógica do aviso acima: é uma camada de conveniência, não uma trava inquebrável.
