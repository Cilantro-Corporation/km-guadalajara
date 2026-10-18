# Instala el Android SDK minimo para compilar el APK (una sola vez):
#   powershell -ExecutionPolicy Bypass -File .\tools\setup-android-sdk.ps1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. "$PSScriptRoot\android-env.ps1"
$sdk = $env:ANDROID_HOME
"JDK: $(Test-Path "$env:JAVA_HOME\bin\java.exe")  ($env:JAVA_HOME)"
if (-not (Test-Path "$sdk\cmdline-tools\latest\bin\sdkmanager.bat")) {
  New-Item -ItemType Directory -Force "$sdk\cmdline-tools" | Out-Null
  $zip = Join-Path $env:TEMP 'android-cmdtools.zip'
  "Descargando Android command-line tools..."
  Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' -OutFile $zip
  Expand-Archive $zip "$sdk\cmdline-tools\tmp" -Force
  Move-Item "$sdk\cmdline-tools\tmp\cmdline-tools" "$sdk\cmdline-tools\latest" -Force
  Remove-Item "$sdk\cmdline-tools\tmp" -Recurse -Force
}
$yes = Join-Path $env:TEMP 'android-yes.txt'
Set-Content -Path $yes -Value (@('y') * 30) -Encoding ascii
"Aceptando licencias del SDK..."
Start-Process -FilePath "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" -ArgumentList '--licenses' -RedirectStandardInput $yes -RedirectStandardOutput (Join-Path $env:TEMP 'android-lic.txt') -NoNewWindow -Wait
"Instalando plataforma y herramientas..."
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'
Set-Content -Path "$PSScriptRoot\..\android\local.properties" -Value ("sdk.dir=" + $sdk.Replace('\', '\\')) -Encoding ascii
"SDK LISTO en $sdk"
Get-ChildItem $sdk | Select-Object Name
