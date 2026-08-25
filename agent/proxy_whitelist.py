"""
proxy_whitelist.py — Proxy local que implementa whitelist de verdade.

Diferente do bloqueio por `hosts` (que só CONSEGUE bloquear sites listados,
deixando o resto livre), este proxy faz o inverso: só deixa passar os sites
da whitelist, bloqueando todo o resto por padrão.

Como funciona:
- Sobe um proxy HTTP/HTTPS em 127.0.0.1 (porta configurável).
- Configura o Windows pra usar esse proxy (registro do Windows — cobre
  Edge, Chrome e a maioria dos programas).
- Aplica regras de firewall que bloqueiam saída direta nas portas 80/443,
  forçando tudo a passar pelo proxy.
- Pra HTTPS, o navegador manda "CONNECT dominio:443" — o proxy olha esse
  domínio e decide liberar (fazendo um túnel sem descriptografar nada) ou
  recusar. Pra HTTP, olha o header Host.

Requer rodar como administrador (mesma exigência do bloqueio por hosts).
"""

import subprocess
import socket
import select
import threading
import winreg
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

_whitelist_lock = threading.Lock()
_whitelist = set()


def atualizar_whitelist(dominios):
    """Substitui a whitelist inteira. Chamado a cada sincronização com o servidor."""
    global _whitelist
    with _whitelist_lock:
        _whitelist = {d.strip().lower() for d in dominios if d.strip()}


def _permitido(host):
    host = host.lower().split(":")[0]
    with _whitelist_lock:
        whitelist_atual = _whitelist
    if host in whitelist_atual:
        return True
    # libera subdomínios automaticamente: "google.com" na whitelist libera "mail.google.com"
    partes = host.split(".")
    for i in range(1, len(partes) - 1):
        if ".".join(partes[i:]) in whitelist_atual:
            return True
    return False


class _ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # silencia o log padrão barulhento do http.server

    def do_CONNECT(self):
        host = self.path  # formato "dominio:porta"
        if not _permitido(host):
            self.send_response(403)
            self.end_headers()
            return

        try:
            destino_host, destino_porta = host.split(":")
            destino = socket.create_connection((destino_host, int(destino_porta)), timeout=10)
        except OSError:
            self.send_response(502)
            self.end_headers()
            return

        self.send_response(200, "Connection Established")
        self.end_headers()

        self._tunelar(self.connection, destino)

    def _tunelar(self, cliente, destino):
        sockets = [cliente, destino]
        try:
            while True:
                prontos, _, erro = select.select(sockets, [], sockets, 60)
                if erro or not prontos:
                    break
                for s in prontos:
                    outro = destino if s is cliente else cliente
                    dados = s.recv(8192)
                    if not dados:
                        return
                    outro.sendall(dados)
        except OSError:
            pass
        finally:
            destino.close()

    def _tratar_http(self):
        host = self.headers.get("Host", "")
        if not _permitido(host):
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"Acesso bloqueado pela politica da empresa")
            return
        # Requisições HTTP simples (não HTTPS) são raras hoje em dia;
        # aqui só bloqueamos ou deixamos passar via encaminhamento simples.
        self.send_response(502)
        self.end_headers()

    def do_GET(self):
        self._tratar_http()

    def do_POST(self):
        self._tratar_http()


def iniciar_proxy(porta=8080):
    servidor = ThreadingHTTPServer(("127.0.0.1", porta), _ProxyHandler)
    thread = threading.Thread(target=servidor.serve_forever, daemon=True)
    thread.start()
    return servidor


# --- Configuração do sistema (proxy + firewall) -----------------------------

def configurar_proxy_do_sistema(porta=8080):
    """Aponta o proxy do Windows (WinINet — Edge, Chrome, maioria dos apps) pro proxy local."""
    chave = winreg.OpenKey(
        winreg.HKEY_CURRENT_USER,
        r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
        0, winreg.KEY_SET_VALUE,
    )
    winreg.SetValueEx(chave, "ProxyEnable", 0, winreg.REG_DWORD, 1)
    winreg.SetValueEx(chave, "ProxyServer", 0, winreg.REG_SZ, f"127.0.0.1:{porta}")
    winreg.CloseKey(chave)


def aplicar_firewall_lockdown(caminho_exe):
    """Bloqueia saída direta 80/443 pra todo mundo, libera só pro processo do agente.

    RESSALVA: o Windows Firewall pode priorizar bloqueio sobre liberação mesmo
    com regra específica de programa — teste numa máquina antes de aplicar em
    todas. Se não funcionar de forma confiável no seu ambiente, a alternativa
    mais robusta é usar WFP diretamente (mais complexo).
    """
    subprocess.run([
        "netsh", "advfirewall", "firewall", "add", "rule",
        "name=ControleAcesso-BloqueiaSaidaWeb", "dir=out", "action=block",
        "protocol=TCP", "remoteport=80,443", "enable=yes",
    ], capture_output=True)

    subprocess.run([
        "netsh", "advfirewall", "firewall", "add", "rule",
        "name=ControleAcesso-LiberaAgente", "dir=out", "action=allow",
        "protocol=TCP", "remoteport=80,443", f"program={caminho_exe}", "enable=yes",
    ], capture_output=True)


def remover_firewall_lockdown():
    for nome in ("ControleAcesso-BloqueiaSaidaWeb", "ControleAcesso-LiberaAgente"):
        subprocess.run(
            ["netsh", "advfirewall", "firewall", "delete", "rule", f"name={nome}"],
            capture_output=True,
        )
