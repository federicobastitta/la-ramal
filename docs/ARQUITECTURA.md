# Arquitectura

```
packages/nucleo   Lógica pura, sin navegador ni servidor, 100% probada
apps/web          PWA React: app del chofer (index.html) y panel de la línea (panel.html)
functions         Firebase Cloud Functions v2 (Node 22), región southamerica-east1
firestore.rules   Seguridad: quién lee y escribe qué (probada con el emulador en reglas-test/)
storage.rules     Seguridad de fotos, videos y audios
e2e/              Prueba de punta a punta con Playwright
```

## Núcleo (`packages/nucleo`)

- `esquemas.ts`: contratos con Zod (reporte, alerta, ubicación, adjuntos). Los usan el celular, el panel y el servidor.
- `panico.ts`: máquina de estados del pánico. Es una función pura `(estado, evento) → (estado, efectos)`.
  - Mantener 2 s o doble toque en menos de 600 ms dispara; un toque suelto no hace nada.
  - Con una alerta en curso, apretar de nuevo no crea otra.
  - El celular nunca cierra la alerta por su cuenta.
- `pin.ts`: PBKDF2-SHA256, 210.000 iteraciones y sal aleatoria.
  - Compara en tiempo constante y calcula los dos PIN siempre, para que el tiempo de respuesta no delate si se usó el de coacción.
  - Rechaza los PIN obvios (1234, 0000…).
- `cola.ts`: cola de envíos para cuando no hay señal.
  - Espera exponencial con azar entre reintentos.
  - Idempotente por UUID: un reintento nunca duplica.
  - Dos vaciados a la vez no mandan dos veces.
  - Los errores permanentes salen de la cola y se informan.
- `geo.ts`: cálculos locales, sin servicios externos.
  - Distancia con haversine; proyección al recorrido.
  - Fuera de recorrido, descontando el error del GPS.
  - Atraso respecto de la planilla; vuelta estimada por mediana.
  - Regla de privacidad: la ubicación se comparte solo durante el turno, salvo que haya pánico.
- `clasificar.ts`: clasificación por reglas, instantánea y gratis.
  - Al unirse con la IA, la IA puede **subir** la urgencia pero nunca bajarla.

## Datos

```
lineas/{lineaId}
  reportes/{uuid}     lo crea el chofer; clasificacion la pone el servidor; estado lo cambia la empresa
  panicos/{uuid}      lo crea el chofer; solo suma ubicaciones; la empresa confirma; el servidor cierra
  personas/{uid}      alta por la función altaDePersona
  privado/{uid}       hashes de los PIN e intentos fallidos (solo el servidor)
  auditoria/{id}      pánicos, coacciones, altas (solo lectura para admin)
  gremio/{...}        canal del gremio: lo leen choferes y delegados, la empresa NO
Storage: lineas/{lineaId}/reportes/{uid}/{reporteId}/{n}.{ext}
```

El rol y la línea van en los *custom claims* del usuario; solo el servidor los escribe.

## Flujo de un reporte

1. El celular arma el reporte con UUID, lo valida con Zod y lo pone en la cola, guardada en IndexedDB.
2. La cola sube los adjuntos a Storage y crea el documento. Si no hay señal, lo reintenta con el evento `online`, al volver a la app, con el Background Sync del service worker y cada 30 s.
3. `alLlegarReporte`:
   - valida y clasifica por reglas;
   - si la urgencia es alta, manda una notificación push al tema `linea-{id}-{area}`;
   - si hay `ANTHROPIC_API_KEY`, Claude lee el texto y mira la primera foto, con salida estructurada, y se une con la regla.
4. El panel lo ve en vivo; al cambiar el estado, el chofer lo ve en «Tus reportes».

## Flujo del pánico

1. La pantalla o el botón BLE mandan eventos `presionar`/`soltar` con su hora. La máquina de estados decide.
2. Al disparar se lee el GPS y se crea la alerta; si falla, se reintenta cada 3 s.
3. La ubicación se suma cada 15 s mientras la alerta esté activa.
4. `alDispararPanico` manda un push de máxima prioridad a tráfico y a seguridad, y deja auditoría.
5. `cancelarPanico` (callable):
   - Verifica el PIN dentro de una transacción.
   - Con 5 fallos en 10 minutos, bloquea.
   - Con el PIN de coacción marca `coaccion: true`. Desde ese momento las reglas le niegan la lectura al chofer, así en su celular la alerta figura cerrada, y la terminal la ve marcada.

## Modo demo

Sin variables `VITE_FIREBASE_*`, `FuenteDemo` hace de servidor dentro del navegador: IndexedDB más BroadcastChannel entre pestañas. Implementa la misma interfaz `Fuente` que `FuenteFirebase`. La prueba e2e corre contra este modo.

## Decisiones

- **PWA en vez de app nativa para el MVP.** Se instala desde el navegador, se actualiza sola y Web Bluetooth funciona en Chrome de Android. La etapa 2 puede envolverla (Capacitor) para el pánico con la pantalla apagada.
- **Haiku para clasificar.** Son miles de reportes por mes y la regla ya resolvió lo urgente. Se cambia con el parámetro `CLAUDE_MODELO`.
- **El SDK de Firebase se carga solo cuando hace falta.** En modo demo no se descarga.
