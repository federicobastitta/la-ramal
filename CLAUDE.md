# Notas para Claude (LA RAMAL)

Hablar en español, simple. Dueño: el mismo de Alldoo/Conectar/FC.

- Monorepo npm: `packages/nucleo` (lógica pura, probada), `apps/web` (PWA chofer + panel), `functions` (Firebase), reglas en la raíz.
- Antes de subir: `npm run verificar` (tipos, pruebas, build, reglas con emulador; hay Java en la sesión) y `npm run e2e`
  con `npm run preview -w @la-ramal/web -- --port 4173` corriendo. En la sesión, Chromium está en
  `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` (pasarlo en CHROMIUM_PATH).
- Colores de marca: azul #14213d y amarillo #f2b705 (el dueño dijo "dejá esos colores"). Nada médico en esta app.
- No poner "bloqueo en movimiento" (el dueño lo sacó). El truco se juega solo con el coche parado (pedido del dueño).
- Folleto: https://claude.ai/artifact/Mcwo5VCrUEzpgbwMmVtKr9
- FUNCIÓN PRINCIPAL (dueño, 30/09): mensajes de la terminal por la radio con «ding» y voz gratis (speechSynthesis del
  teléfono; Polly quedó como opción paga, no se usa). Núcleo `mensaje-radio.ts`, colección `mensajesRadio` (la crea
  gestión, la lee la línea, no se edita ni borra), `radio/locutor.ts` (ding con WebAudio, baja la radio; en iPhone la
  pausa porque no deja cambiar el volumen) y `radio/useMensajesRadio.ts`. Los navegadores exigen un toque previo para sonar.
- 30/09 "el aviso se tiene que escuchar": los avisos de la empresa (panel › Avisos) también suenan con ding + voz
  (`textoDeAvisoParaLeer`, corta a ~350 letras y manda a Papeles). Mismo hook `useMensajesRadio`, ventana de 15 min.
