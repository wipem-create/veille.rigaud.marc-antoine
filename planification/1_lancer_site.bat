@echo off
REM Lance le site en local (http://localhost:8080) + les collectes automatiques 7h-19h
cd /d "%~dp0.."
python serve.py
pause
