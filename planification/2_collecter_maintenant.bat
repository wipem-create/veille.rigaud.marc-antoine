@echo off
REM Lance une itération de veille immédiatement
cd /d "%~dp0.."
python veille.py collect
pause
