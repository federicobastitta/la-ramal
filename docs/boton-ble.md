# Botón de pánico Bluetooth: protocolo

Placa sugerida para el piloto: nRF52840 o ESP32-C3, con pila CR2032 y carcasa de llavero o para el tablero.

- Nombre anunciado: empieza con `LA RAMAL` (por ejemplo `LA RAMAL 0042`).
- Servicio: `5a1d0001-7c3b-4e6e-9f1a-1ea2a4a1a100`
  - Característica `5a1d0002-7c3b-4e6e-9f1a-1ea2a4a1a100`: `notify`, 1 byte. `1` = apretado, `0` = suelto.
- Servicio estándar de batería `0x180F` / `battery_level`.

El botón **no** decide si hay pánico: solo avisa cuándo lo apretaron y cuándo lo soltaron. El tiempo lo mide el celular con la máquina de estados del núcleo, que se puede probar. Así el firmware es mínimo y se puede cambiar la regla, por ejemplo mantener 3 s en vez de 2, sin tocar el botón.

Seguridad:
- La vinculación BLE usa el emparejamiento del sistema (Just Works en el piloto; con clave en producción).
- Si el botón se desconecta, la app reintenta sola con espera creciente, hasta 30 s entre intentos.
