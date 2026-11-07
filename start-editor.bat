@echo off
rem Double-click me (Windows). Starts the site on your laptop and opens the editor.
rem Keep this window open while you work; close it when you are done.
cd /d "%~dp0"
set URL=http://localhost:8000/work.html?edit
start "" cmd /c "timeout /t 2 /nobreak >nul & start chrome %URL% || start %URL%"
python serve.py 8000 2>nul || py serve.py 8000 2>nul || (echo Python is not installed. Get it from python.org, tick "Add to PATH", then double-click me again. & pause)
