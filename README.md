# Finanzas

App de gastos personales. Un solo código (`app/assets`) para las dos plataformas:

- **Android**: `./build.sh` genera `Finanzas.apk`. Para actualizar sin perder datos, sube `versionCode` en
  `app/AndroidManifest.xml`, compila con el mismo `finanzas.keystore` e instala encima.
- **iPhone**: cada push a `main` publica `app/assets` en GitHub Pages. Se instala desde Safari con
  Compartir → Añadir a pantalla de inicio, y las actualizaciones llegan solas al abrirla con conexión.

Los datos nunca salen del móvil: en Android van en `files/data.json` y en iPhone en el almacenamiento de la web app.
Para pasarlos de un sitio a otro: Ajustes → Exportar / Importar copia.
