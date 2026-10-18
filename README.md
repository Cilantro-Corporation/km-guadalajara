# km. Guadalajara

Buscador rápido de **puntos kilométricos (PK)** de las carreteras de la provincia de Guadalajara.

- **Web / iPhone:** https://alessandrocil8-wq.github.io/km-guadalajara/
  (en Safari: *Compartir → Añadir a pantalla de inicio* para tenerla como app).
- **Android:** APK en [Releases](https://github.com/alessandrocil8-wq/km-guadalajara/releases/latest).

## Qué hace

- Busca cualquier PK escribiendo la carretera y el km (`A-2` + `44,3`, o directamente `a2 44,3`).
  Acepta `44`, `44,3`, `44.3` y `44+300`.
- Muestra la horquilla de km de cada carretera dentro de la provincia (p. ej. *A-2 · km 37–143*).
- En autovías y tramos desdoblados permite elegir **sentido** (km creciente / decreciente)
  para situar el punto en la calzada correcta.
- Botones para ir hasta el punto con **Google Maps**, **Mapas de Apple** (iPhone) o **Waze**,
  copiar coordenadas y compartir por **WhatsApp**.
- **PK más cercano** a tu ubicación (botón ◎) o a cualquier punto del mapa (mantener pulsado).
- Favoritos y búsquedas recientes (se guardan solo en el propio móvil).
- Mapa del IGN o satélite (PNOA). Los PK funcionan **sin conexión** (el mapa de fondo necesita internet).

## Datos

- Hitos kilométricos oficiales: Instituto Geográfico Nacional, *Información Geográfica de Referencia –
  Redes de Transporte* (servicio WFS INSPIRE), licencia CC BY 4.0.
- Trazado de las carreteras para calcular puntos intermedios: © colaboradores de OpenStreetMap (ODbL).
- Mapas base: IGN (IGN Base) y PNOA.

Las posiciones entre dos hitos son una estimación siguiendo el trazado de la vía.

## Desarrollo

```bash
npm install
npm run data          # descarga IGN + OSM y regenera www/data/pk.js
node tools/test-core.mjs
npm run serve         # http://localhost:8080
```

APK (Windows, con JDK 21 y Android SDK):

```powershell
. .\tools\android-env.ps1
node tools/prepare-android.mjs; npx cap sync android
cd android; .\gradlew.bat assembleRelease
```
