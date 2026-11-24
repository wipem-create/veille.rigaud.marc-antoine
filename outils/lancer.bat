@echo off
rem Lance un petit serveur local puis ouvre le site : http://localhost:8000
cd /d "%~dp0.."
start "" http://localhost:8000
python -m http.server 8000
