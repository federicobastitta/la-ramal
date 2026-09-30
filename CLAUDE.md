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
- 30/09 el dueño: usar la instancia de AWS "Conectar2-Staging-Quirurgico" (i-0bc4fdcc1add08009) para La Ramal, y
  después publicarla en Google Play y App Store. Plan propuesto (falta que confirme): servidor propio en la instancia en
  vez de Firestore; app nativa con Capacitor sobre la misma web; push por FCM (Android) y APNs (iPhone); voz nativa del
  teléfono para que los mensajes por la radio suenen con la pantalla bloqueada. La instancia NO tiene rol IAM (sin SSM)
  y el disco (8 GB) está lleno: el dueño tiene que poner `conectar2-ssm-profile` y agrandar el disco.
- 30/09 BOLSA DE FRANCOS (pedido del dueño): Papeles › Francos (calendario del mes) y panel › Bolsa de francos. Núcleo
  `francos.ts` (ofrezco/pido, "a cambio de", publicado → acordado → aprobado por gerencia), colección `francos` con reglas,
  función `alAprobarFranco` que intercambia las planillas. En la demo: francos Carlos domingo, Jorge miércoles, Marcela lunes.
- 30/09 DEMO (pedido del dueño): la app del chofer en modo demo arranca con una AM (Radio Mitre 790 o la primera AM que
  transmita) y a los 5 s la terminal manda "Cuando termine el recorrido, pase por el taller." (`chofer/ArranqueDemo.tsx`).
  Si el navegador frena el sonido sin toque, sale un botón grande "Empezar". El e2e abre con `?sinArranque`.
