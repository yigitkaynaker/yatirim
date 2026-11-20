@echo off
chcp 65001 >nul
title Yatirim - Uygulama Motoru (bu pencereyi KAPATMA)
cd /d "%~dp0"

rem --- Motor zaten calisiyorsa ikinci kez baslatma, sadece uygulamayi ac ---
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if %errorlevel%==0 (
  if /i "%~1"=="/arkaplan" exit /b
  echo Motor zaten calisiyor. Uygulama aciliyor...
  start http://localhost:3000
  timeout /t 3 >nul
  exit /b
)

rem --- Kod guncellendiyse uygulamayi yeniden hazirla ---
set "HEAD="
for /f %%i in ('git rev-parse HEAD 2^>nul') do set "HEAD=%%i"
set "BUILT="
if exist ".next\YATIRIM_SURUM" set /p BUILT=<".next\YATIRIM_SURUM"
if not exist ".next\BUILD_ID" goto build
if not "%HEAD%"=="%BUILT%" goto build
goto run

:build
echo Uygulamanin yeni surumu hazirlaniyor, 1-2 dakika surebilir...
call npm run build
if errorlevel 1 (
  echo.
  echo HATA: Uygulama hazirlanamadi. Bu pencerenin ekran goruntusunu Claude'a gonder.
  pause
  exit /b 1
)
if defined HEAD (echo %HEAD%)>".next\YATIRIM_SURUM"

:run
echo.
echo Uygulama baslatiliyor.
echo Bu pencere acik kaldigi surece uygulama ve nobetci calisir.
echo.
if /i not "%~1"=="/arkaplan" start "" cmd /c "timeout /t 5 >nul && start http://localhost:3000"
call npm start
pause
