# LA RAMAL

La app de los choferes de colectivo, y el panel de la línea que recibe lo que mandan.

Esta primera versión (MVP) trae:

- **Botón de pánico.** Se dispara con la pantalla o con un botón Bluetooth externo, manteniéndolo 2 segundos o con doble toque.
  - La ubicación se sigue mandando hasta que se cierra el caso.
  - Para cancelar hace falta un PIN, que verifica el servidor.
  - Tiene un **PIN de coacción**: el celular muestra «cancelada», pero la alerta sigue activa y la terminal la ve marcada.
- **Reporte del colectivo y de la calle.** El chofer manda foto, video o el ruido grabado, con la ubicación exacta.
  - Tipos de reporte: desperfecto, embotellamiento, choque, agresor, corte u otra cosa.
  - Llega directo a la línea, clasificado por área y urgencia: primero por reglas en el acto, después la IA lee el texto y mira la foto.
  - Sin señal, el reporte queda guardado en el celular y sale solo cuando vuelve la señal, sin duplicarse.
- **Cortes en vivo.** Lo que reportaron los compañeros en las últimas 3 horas.
- **Panel de la línea.**
  - Alertas de pánico con el mapa.
  - Reportes con sus fotos, videos y audios, filtrados por área.
  - Botones «Mandar al taller», «Publicar a la flota» y «Tomar el caso»: el chofer ve la respuesta en su celular.
  - Semáforo de la flota.

### Etapa 2 (en curso)

- **Barra del chofer:** Inicio · Incidente (lo vial) · Avería (el vehículo) · Papeles · Números · Compañeros.
- **Papeles:**
  - la planilla de hoy, las próximas y las pasadas, con horas y horas extra;
  - recibos con conformidad atada al hash del PDF;
  - certificados con aviso de vencimiento a 30, 15, 7, 1 y 0 días;
  - pedidos: certificados en PDF, parte de enfermo con foto, vacaciones y cambio de turno entre compañeros aprobado por tráfico, con intercambio automático de planillas;
  - avisos de la empresa con «leído por».
- **Vueltas automáticas por GPS:** sin apretar nada, durante el turno. Detectan la salida y la llegada a las cabeceras, las paradas y las detenciones por el tránsito. Las posiciones crudas no salen del celular.
- **Números del chofer:**
  - productividad (vueltas contra la planilla, puntualidad, horas, km);
  - demoras por vuelta, horarios pico, días más convenientes y sectores más trabados;
  - índice de exigencia con fórmula pública, para compartir.
- **Panel:** Personal, Planillas (se pegan desde Excel), Avisos y **exigencia por recorrido y franja horaria**.
- Falta: Compañeros (truco en vivo, prode, calendario, cumpleaños) y el coche (revisión antes de salir).

## Probarla ya (modo demo, sin servidor)

Publicada en GitHub Pages:
- App del chofer: https://federicobastitta.github.io/la-ramal/
- Panel de la línea: https://federicobastitta.github.io/la-ramal/panel.html

Abrí las dos en el mismo navegador (dos pestañas): lo que mandás desde la app aparece en el panel.
Los datos quedan solo en ese navegador. PIN de la demo: `7391` cancela; `7392` es el de coacción.

En tu computadora:

```bash
npm install
npm run dev
```

1. Abrí `http://localhost:5173` (la app del chofer).
2. En otra pestaña abrí `http://localhost:5173/panel.html` (el panel).
3. Lo que mandás desde la app aparece en el panel al instante.

PIN de la demo: `7391` cancela la alerta; `7392` es el de coacción.

## Pasarla a Firebase (real)

1. Crear un proyecto en Firebase con plan Blaze (lo exigen las funciones).
2. Activar:
   - Authentication con teléfono;
   - Firestore y Storage en `southamerica-east1`;
   - Cloud Messaging.
3. Copiar `apps/web/.env.ejemplo` a `apps/web/.env.local` y completarlo con los datos de la app web.
4. Copiar `.firebaserc.ejemplo` a `.firebaserc` con el id del proyecto.
5. Guardar la clave de Anthropic: `npx firebase functions:secrets:set ANTHROPIC_API_KEY`. Es opcional: sin ella, los reportes se clasifican solo por reglas.
6. Subir todo: `npx firebase deploy`.
7. Dar de alta al primer administrador: ponerle a mano el claim `{ "rol": "admin", "linea": "<id>" }`. Desde ahí, las altas se hacen con la función `altaDePersona`.

## Para desarrolladores

| Comando | Qué hace |
| --- | --- |
| `npm run typecheck` | Tipos estrictos en todo el monorepo |
| `npm test` | Pruebas del núcleo y de las funciones (Vitest) |
| `npm run test:reglas` | Reglas de Firestore contra el emulador (necesita Java) |
| `npm run e2e` | Punta a punta con Playwright sobre `vite preview` |
| `npm run verificar` | Todo lo anterior menos el e2e |

La arquitectura está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) y el protocolo del botón en [docs/boton-ble.md](docs/boton-ble.md).
