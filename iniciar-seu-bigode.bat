@echo off
title Barbearia Seu Bigode - Servidor Local
echo ========================================================
echo   Barbearia Seu Bigode (Desde 2019) - Servidor Local
echo ========================================================
echo.
echo   Reiniciando porta 3001 (se houver instancia antiga)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

if not exist "%~dp0frontend\dist\index.html" (
  echo   Compilando interface web pela primeira vez...
  call npm.cmd --prefix "%~dp0frontend" run build
)

echo.
echo   Abrindo o sistema em http://localhost:3001 ...
echo   (Painel do barbeiro: http://localhost:3001/admin)
echo.
echo   IMPORTANTE: Mantenha esta janela aberta enquanto
echo   estiver usando o sistema!
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3001"
cd /d "%~dp0backend"
node --watch src/server.js
pause
