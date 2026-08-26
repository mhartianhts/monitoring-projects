@echo off
echo Starting Python Converter Microservice...
cd /d "%~dp0"
if exist "venv\Scripts\python.exe" (
    venv\Scripts\python.exe compile_proto.py
    venv\Scripts\python.exe src/server.py
) else (
    python compile_proto.py
    python src/server.py
)
pause
