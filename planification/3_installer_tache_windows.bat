@echo off
REM Crée une tâche planifiée Windows : collecte chaque jour à 7h00, puis toutes les 2 h pendant 12 h (jusqu'à 19h).
REM Fonctionne même si le site n'est pas ouvert. À lancer une seule fois.
cd /d "%~dp0.."
set DOSSIER=%CD%
for /f "delims=" %%P in ('where python') do (set PY=%%P & goto :trouve)
:trouve
schtasks /Create /F /TN "Veille_H1_H2_H3" /SC DAILY /ST 07:00 /RI 120 /DU 12:00 /TR "\"%PY%\" \"%DOSSIER%\veille.py\" collect"
echo.
echo Tache "Veille_H1_H2_H3" creee : 7h00 puis toutes les 2 h jusqu'a 19h.
echo Pour la supprimer : schtasks /Delete /TN "Veille_H1_H2_H3" /F
pause
