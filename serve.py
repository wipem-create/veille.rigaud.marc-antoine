#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SERVE.PY — Serveur local du site de veille + collecte automatique.

  python serve.py              site sur http://localhost:8080 + collectes auto (7h puis toutes les 2h jusqu'à 19h)
  python serve.py --port 9000  autre port
  python serve.py --sans-auto  site seul (pas de collecte programmée)

Le bouton « ▶ Collecter » du site appelle POST /api/refresh.
"""
import http.server, json, os, sys, threading, time, webbrowser
import veille

ROOT = os.path.dirname(os.path.abspath(__file__))
ETAT = {"en_cours": False, "derniere": None, "erreur": None}
VERROU = threading.Lock()

def lancer_collecte():
    if not VERROU.acquire(blocking=False):
        return False
    def run():
        ETAT.update(en_cours=True, erreur=None)
        try:
            veille.executer("collect")
        except Exception as e:
            ETAT["erreur"] = str(e)
        finally:
            ETAT.update(en_cours=False, derniere=time.strftime("%Y-%m-%d %H:%M:%S"))
            VERROU.release()
    threading.Thread(target=run, daemon=True).start()
    return True

def planificateur():
    cfg = veille.lire_json(os.path.join(veille.DATA, "config.json"), {}).get("planification", {})
    h0, h1, pas = int(cfg.get("premiere_collecte", "07:00")[:2]), int(cfg.get("derniere_collecte", "19:00")[:2]), int(cfg.get("intervalle_heures", 2))
    creneaux, fait = list(range(h0, h1 + 1, pas)), set()
    print(f"[auto] collectes programmées à {', '.join(f'{h}h' for h in creneaux)} (heure de Paris)")
    while True:
        now = veille.vers_paris(veille.maintenant_utc())
        if now.hour in creneaux and (now.date(), now.hour) not in fait:
            fait.add((now.date(), now.hour))
            lancer_collecte()
        time.sleep(30)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        if self.path.startswith("/data/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path.startswith("/api/status"):
            return self._json(ETAT)
        return super().do_GET()
    def do_POST(self):
        if self.path.startswith("/api/refresh"):
            return self._json({"lance": lancer_collecte(), **ETAT})
        self.send_error(404)
    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            return
        sys.stderr.write("  " + fmt % args + "\n")

if __name__ == "__main__":
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8080
    if "--sans-auto" not in sys.argv:
        threading.Thread(target=planificateur, daemon=True).start()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://localhost:{port}/index.html"
    print(f"Site de veille : {url}  (Ctrl+C pour arrêter)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    srv.serve_forever()
