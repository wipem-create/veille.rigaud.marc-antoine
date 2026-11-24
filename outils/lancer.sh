#!/usr/bin/env bash
# Lance un petit serveur local puis ouvre le site : http://localhost:8000
cd "$(dirname "$0")/.." || exit 1
echo "Site de veille sur http://localhost:8000  (Ctrl+C pour arrêter)"
(sleep 1; xdg-open http://localhost:8000 2>/dev/null || open http://localhost:8000 2>/dev/null) &
python3 -m http.server 8000
