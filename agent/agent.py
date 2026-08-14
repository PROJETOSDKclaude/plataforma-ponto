"""
Agente da Central de Acesso — roda em cada PC.

O que faz:
- A cada X segundos, consulta o servidor perguntando se este computador
  está liberado (com base na chave em config.json).
- Se estiver BLOQUEADO, mostra uma janela em tela cheia por cima de tudo,
  com o nome do funcionário e do computador, até o gestor liberar pelo painel.
- Se estiver LIBERADO, a janela some.

IMPORTANTE — sobre limites deste agente:
Esta janela é um aviso visual em tela cheia, não um bloqueio "à prova de
falhas" do Windows (não mexe em registro, não desativa o Gerenciador de
Tarefas nem atalhos do sistema). Ela deve funcionar em conjunto com uma
política interna clara (o funcionário sabe que faz parte do processo de
ponto da empresa), não como um mecanismo técnico inquebrável.

Requisitos: Python 3.9+, biblioteca `requests` (pip install requests).
Tkinter já vem com o Python padrão no Windows.
"""

import json
import subprocess
import sys
import threading
import time
import tkinter as tk
from pathlib import Path

import requests

# Quando empacotado com PyInstaller (--onefile), __file__ aponta pra uma pasta
# temporária de extração, não pra onde o .exe realmente está. Por isso
# precisamos checar sys.frozen e usar a pasta do executável nesse caso —
# é isso que permite colocar um config.json diferente ao lado de cada .exe.
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

CONFIG_PATH = BASE_DIR / "config.json"
POLL_SECONDS = 20
REQUEST_TIMEOUT = 8

# --- Bloqueio de sites via arquivo hosts -----------------------------------
# IMPORTANTE: editar o hosts do Windows exige privilégio de administrador.
# Se o agente não estiver rodando elevado (ver README sobre Tarefa Agendada),
# essa parte falha silenciosamente e só o bloqueio de tela continua funcionando.

HOSTS_PATH = Path(r"C:\Windows\System32\drivers\etc\hosts")
MARK_START = "# === CENTRAL-DE-ACESSO (gerenciado automaticamente, nao editar) ==="
MARK_END = "# === FIM CENTRAL-DE-ACESSO ==="


def apply_blocked_sites(domains):
    """Reescreve o bloco gerenciado do hosts com os domínios atuais.
    Retorna True se conseguiu escrever, False se faltou permissão."""
    try:
        content = HOSTS_PATH.read_text(encoding="utf-8", errors="ignore")
    except (PermissionError, FileNotFoundError, OSError):
        return False

    lines = content.splitlines()
    if MARK_START in lines:
        start = lines.index(MARK_START)
        end = lines.index(MARK_END) if MARK_END in lines else len(lines) - 1
        lines = lines[:start] + lines[end + 1:]

    if domains:
        block = [MARK_START]
        for raw in domains:
            d = raw.strip().lower()
            if not d:
                continue
            block.append(f"127.0.0.1 {d}")
            if not d.startswith("www."):
                block.append(f"127.0.0.1 www.{d}")
        block.append(MARK_END)
        lines.extend(block)

    new_content = "\n".join(lines) + "\n"

    try:
        HOSTS_PATH.write_text(new_content, encoding="utf-8")
    except (PermissionError, OSError):
        return False

    try:
        subprocess.run(["ipconfig", "/flushdns"], capture_output=True, timeout=5)
    except Exception:
        pass

    return True


def load_config():
    if not CONFIG_PATH.exists():
        sys.exit(
            f"Arquivo de configuração não encontrado: {CONFIG_PATH}\n"
            f"Copie config.example.json para config.json e preencha server_url e api_key."
        )
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


class LockScreen:
    def __init__(self, root):
        self.root = root
        self.root.title("Controle de Acesso")
        self.root.attributes("-fullscreen", True)
        self.root.attributes("-topmost", True)
        self.root.configure(bg="#10131A")
        self.root.protocol("WM_DELETE_WINDOW", lambda: None)  # ignora o X da janela

        container = tk.Frame(root, bg="#10131A")
        container.place(relx=0.5, rely=0.5, anchor="center")

        tk.Label(
            container, text="CONTROLE DE ACESSO", fg="#E7EAF0", bg="#10131A",
            font=("Segoe UI", 20, "bold"),
        ).pack(pady=(0, 18))

        tk.Label(
            container, text="🔒 BLOQUEADO", fg="#FF5A5F", bg="#10131A",
            font=("Segoe UI", 30, "bold"),
        ).pack(pady=(0, 24))

        tk.Label(
            container, text="Aguardando liberação...", fg="#8A93A6", bg="#10131A",
            font=("Segoe UI", 13),
        ).pack(pady=(0, 30))

        self.info_label = tk.Label(
            container, text="", fg="#8A93A6", bg="#10131A", font=("Consolas", 11),
        )
        self.info_label.pack()

    def set_info(self, employee_name, computer_name):
        self.info_label.config(text=f"Funcionário: {employee_name}    |    Computador: {computer_name}")

    def show(self):
        self.root.deiconify()
        self.root.attributes("-fullscreen", True)
        self.root.lift()
        self.root.attributes("-topmost", True)

    def hide(self):
        self.root.withdraw()


def poll_loop(lock_screen, config, state):
    headers = {"X-API-Key": config["api_key"]}
    url = config["server_url"].rstrip("/") + "/api/agent/status"
    last_applied_sites = None

    while True:
        try:
            resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()

            state["employee_name"] = data.get("employee_name", "")
            state["computer_name"] = data.get("computer_name", "")
            state["liberado"] = data.get("liberado", False)
            state["blocked_sites"] = data.get("blocked_sites", [])

            current_sites = sorted(state["blocked_sites"])
            if current_sites != last_applied_sites:
                if apply_blocked_sites(state["blocked_sites"]):
                    last_applied_sites = current_sites
        except requests.RequestException:
            # Sem conexão com o servidor: por segurança, mantém o último
            # estado conhecido (não desbloqueia por falha de rede).
            pass

        time.sleep(POLL_SECONDS)


def apply_state(root, lock_screen, state):
    lock_screen.set_info(state.get("employee_name", "—"), state.get("computer_name", "—"))
    if state.get("liberado"):
        lock_screen.hide()
    else:
        lock_screen.show()
    root.after(1000, apply_state, root, lock_screen, state)


def main():
    config = load_config()
    global POLL_SECONDS
    POLL_SECONDS = config.get("poll_seconds", POLL_SECONDS)

    root = tk.Tk()
    lock_screen = LockScreen(root)

    state = {"liberado": False, "employee_name": "...", "computer_name": "..."}

    t = threading.Thread(target=poll_loop, args=(lock_screen, config, state), daemon=True)
    t.start()

    root.after(500, apply_state, root, lock_screen, state)
    root.mainloop()


if __name__ == "__main__":
    main()
