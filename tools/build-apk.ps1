# Compila el APK firmado:  .\tools\build-apk.ps1
# Resultado: build\km-guadalajara.apk
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. "$PSScriptRoot\android-env.ps1"
node tools/prepare-android.mjs
npx cap sync android
Set-Location "$root\android"
.\gradlew.bat assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw "Fallo al compilar (codigo $LASTEXITCODE)" }
Set-Location $root
Copy-Item "android\app\build\outputs\apk\release\app-release.apk" "build\km-guadalajara.apk" -Force
& "$env:ANDROID_HOME\build-tools\35.0.0\apksigner.bat" verify --print-certs "build\km-guadalajara.apk"
Write-Host "APK LISTO: $root\build\km-guadalajara.apk"
