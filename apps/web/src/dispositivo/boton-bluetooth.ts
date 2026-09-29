/**
 * Botón de pánico externo por Bluetooth Low Energy (Web Bluetooth, Chrome en Android).
 *
 * Protocolo del botón LA RAMAL (firmware propio, ver docs/boton-ble.md):
 * - Servicio SERVICIO_BOTON, característica CARACTERISTICA_ESTADO con notificaciones.
 * - Cada notificación es 1 byte: 1 = apretado, 0 = suelto. El tiempo lo mide el celular (la máquina de estados del núcleo).
 * - Servicio estándar de batería (0x180F) para avisar antes de que se quede sin pila.
 *
 * Si se corta la conexión (el chofer se alejó del coche, el celular apagó el Bluetooth),
 * se reintenta con espera creciente, sin volver a preguntarle nada al chofer.
 */
export const SERVICIO_BOTON = "5a1d0001-7c3b-4e6e-9f1a-1ea2a4a1a100";
export const CARACTERISTICA_ESTADO = "5a1d0002-7c3b-4e6e-9f1a-1ea2a4a1a100";

export type EventoBoton = { t: "presionar" | "soltar"; en: number };
export type EstadoBoton = "sin_soporte" | "desconectado" | "conectando" | "conectado";

export function hayBluetooth(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export class BotonBluetooth {
  private dispositivo: BluetoothDevice | null = null;
  private intentos = 0;
  private cerrado = false;
  estado: EstadoBoton = hayBluetooth() ? "desconectado" : "sin_soporte";
  bateria: number | null = null;

  constructor(
    private readonly alEvento: (e: EventoBoton) => void,
    private readonly alCambiar: (b: BotonBluetooth) => void,
  ) {}

  private cambiar(e: EstadoBoton) {
    this.estado = e;
    this.alCambiar(this);
  }

  /** Tiene que llamarse desde un toque del chofer (el navegador lo exige para elegir el dispositivo). */
  async vincular(): Promise<void> {
    if (!hayBluetooth()) throw new Error("Este celular no permite Bluetooth desde el navegador. Usá Chrome en Android.");
    this.dispositivo = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICIO_BOTON] }, { namePrefix: "LA RAMAL" }],
      optionalServices: [SERVICIO_BOTON, "battery_service"],
    });
    this.dispositivo.addEventListener("gattserverdisconnected", () => void this.reconectar());
    await this.conectar();
  }

  private async conectar(): Promise<void> {
    if (!this.dispositivo?.gatt) return;
    this.cambiar("conectando");
    const gatt = await this.dispositivo.gatt.connect();
    const servicio = await gatt.getPrimaryService(SERVICIO_BOTON);
    const car = await servicio.getCharacteristic(CARACTERISTICA_ESTADO);
    car.addEventListener("characteristicvaluechanged", (ev) => {
      const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (!v || v.byteLength < 1) return;
      this.alEvento({ t: v.getUint8(0) === 1 ? "presionar" : "soltar", en: Date.now() });
    });
    await car.startNotifications();
    try {
      const bat = await (await gatt.getPrimaryService("battery_service")).getCharacteristic("battery_level");
      this.bateria = (await bat.readValue()).getUint8(0);
    } catch {
      this.bateria = null;
    }
    this.intentos = 0;
    this.cambiar("conectado");
  }

  private async reconectar(): Promise<void> {
    if (this.cerrado) return;
    this.cambiar("desconectado");
    while (!this.cerrado && this.estado !== "conectado") {
      this.intentos++;
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** Math.min(this.intentos, 5))));
      try {
        await this.conectar();
      } catch {
        this.cambiar("desconectado");
      }
    }
  }

  desvincular() {
    this.cerrado = true;
    this.dispositivo?.gatt?.disconnect();
    this.cambiar("desconectado");
  }
}
