# Comprueba el APK: firma, permisos, versión y contenido web
. "$PSScriptRoot\android-env.ps1"
$apk = Join-Path (Split-Path -Parent $PSScriptRoot) 'build\km-guadalajara.apk'
$bt = "$env:ANDROID_HOME\build-tools\35.0.0"
"=== FIRMA ==="
& "$bt\apksigner.bat" verify --verbose $apk 2>$null | Select-String 'Verifies|v1 scheme|v2 scheme|v3 scheme|Number of signers'
"=== PAQUETE ==="
& "$bt\aapt2.exe" dump badging $apk | Select-String "package:|uses-permission|sdkVersion|targetSdkVersion|application-label:|launchable"
"=== CONTENIDO WEB ==="
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead($apk)
$z.Entries | Where-Object { $_.FullName -like 'assets/public/*' } | ForEach-Object { "{0,9}  {1}" -f $_.Length, $_.FullName }
$z.Dispose()
"=== FIN ==="
