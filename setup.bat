@echo off
setlocal enabledelayedexpansion

echo Finding active local LAN IPv4 address...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set "IP=%%a"
    set "IP=!IP: =!"
    if not "!IP!"=="" goto :found_ip
)

:found_ip
if "%IP%"=="" set "IP=127.0.0.1"

echo Detected Local LAN IP: %IP%
echo Generating SSL certificate for localhost, 127.0.0.1, %IP%...

cd /d "%~dp0app"
call mkcert -install
call mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 %IP%
echo Certificate generation complete: app\cert.pem and app\key.pem created.
