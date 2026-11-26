#!/bin/sh
# Ajoute la collecte automatique à la crontab : 7h, 9h, 11h, 13h, 15h, 17h, 19h (heure locale de la machine).
DOSSIER="$(cd "$(dirname "$0")/.." && pwd)"
PY="$(command -v python3 || command -v python)"
LIGNE="0 7-19/2 * * * cd \"$DOSSIER\" && \"$PY\" veille.py collect >> \"$DOSSIER/data/store/cron.log\" 2>&1"
( crontab -l 2>/dev/null | grep -v "veille.py collect" ; echo "$LIGNE" ) | crontab -
echo "Crontab installée :"; crontab -l | grep veille.py
