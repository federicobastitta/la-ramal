import { useCallback, useEffect, useRef, useState } from "react";
import { buscarEmisoras, EMISORAS, type Banda, type Emisora } from "./emisoras";
import { useDetenido } from "../dispositivo/detenido";
import { Futbol, avisoDeMiEquipo, usePartidos } from "./PartidosRadio";
import { CarrerasRadio, avisoDeCarrera, useCarreras } from "./CarrerasRadio";
import { registrarRadio } from "./locutor";

const CLAVE_ULTIMA = "la-ramal-radio";
const leer = () => {
  try {
    return localStorage.getItem(CLAVE_ULTIMA);
  } catch {
    return null;
  }
};
const guardar = (id: string) => {
  try {
    localStorage.setItem(CLAVE_ULTIMA, id);
  } catch {
    /* sin almacenamiento */
  }
};

type Estado = "apagada" | "conectando" | "sonando" | "error";

/**
 * Radio AM/FM de la app. Queda abajo, arriba de la barra, en todas las pantallas.
 * - Con el coche en movimiento solo se muestran botones grandes (play/pausa y cambiar a la anterior o siguiente):
 *   nada de buscar ni leer listas manejando.
 * - Se maneja también desde el Bluetooth del coche y la pantalla bloqueada (Media Session).
 */
export function Radio({ demo }: { demo: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [emisoras, setEmisoras] = useState<Emisora[]>(EMISORAS.map((e) => ({ ...e, stream: null, logo: null })));
  const [cargando, setCargando] = useState(false);
  const [sinDirectorio, setSinDirectorio] = useState(false);
  const [actual, setActual] = useState<string>(leer() ?? "la100");
  const [estado, setEstado] = useState<Estado>("apagada");
  const [abierta, setAbierta] = useState(false);
  const [banda, setBanda] = useState<Banda>("FM");
  const { detenido } = useDetenido(demo);
  const { partidos, ejemplo } = usePartidos(demo);
  const juegaMiEquipo = avisoDeMiEquipo(partidos);
  const { carreras, ejemplo: carrerasEjemplo } = useCarreras(demo);
  const corre = avisoDeCarrera(carreras);
  const [deporte, setDeporte] = useState<"futbol" | "carreras">("futbol");

  /** Devuelve la lista con transmisiones (la busca en el directorio la primera vez). */
  const lista = useRef(emisoras);
  const encender = useCallback(async (): Promise<Emisora[]> => {
    if (lista.current.some((e) => e.stream)) return lista.current;
    setCargando(true);
    try {
      lista.current = await buscarEmisoras();
      setEmisoras(lista.current);
      setSinDirectorio(false);
    } catch {
      setSinDirectorio(true);
    } finally {
      setCargando(false);
    }
    return lista.current;
  }, []);

  const emisora = emisoras.find((e) => e.id === actual) ?? emisoras[0]!;

  const tocar = useCallback(
    async (e: Emisora) => {
      setActual(e.id);
      guardar(e.id);
      const a = audio.current;
      if (!a) return;
      if (!e.stream) {
        setEstado("error");
        return;
      }
      setEstado("conectando");
      a.src = e.stream;
      try {
        await a.play();
      } catch {
        setEstado("error");
      }
    },
    [],
  );

  const pausar = () => {
    audio.current?.pause();
    setEstado("apagada");
  };

  const mover = useCallback(
    async (paso: 1 | -1) => {
      const todas = await encender();
      const conSenal = todas.filter((e) => e.stream);
      const l = conSenal.length ? conSenal : todas;
      const i = l.findIndex((e) => e.id === actual);
      void tocar(l[(i + paso + l.length) % l.length]!);
    },
    [encender, actual, tocar],
  );

  const escucharDeporte = (e: Emisora) => {
    void encender().then((l) => tocar(l.find((x) => x.id === e.id) ?? e));
    if (!detenido) setAbierta(false);
  };

  const escuchar = async () => {
    const todas = await encender();
    void tocar(todas.find((e) => e.id === actual) ?? todas[0]!);
  };

  // Los mensajes de la terminal bajan esta radio mientras hablan.
  useEffect(() => {
    registrarRadio(audio.current);
    return () => registrarRadio(null);
  }, []);

  // Controles del Bluetooth del coche y de la pantalla bloqueada.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: `${emisora.nombre} ${emisora.banda} ${emisora.frecuencia}`, artist: "LA RAMAL · Radio", artwork: emisora.logo ? [{ src: emisora.logo }] : [] });
    navigator.mediaSession.setActionHandler("play", () => void escuchar());
    navigator.mediaSession.setActionHandler("pause", pausar);
    navigator.mediaSession.setActionHandler("nexttrack", () => void mover(1));
    navigator.mediaSession.setActionHandler("previoustrack", () => void mover(-1));
  }, [emisora, tocar, mover]);

  const textoEstado =
    estado !== "sonando" && estado !== "conectando" && juegaMiEquipo
      ? `⚽ ${juegaMiEquipo.estado === "en_vivo" ? "Juega ahora" : "Hoy juega"} ${juegaMiEquipo.partido.local} – ${juegaMiEquipo.partido.visitante}`
      : estado !== "sonando" && estado !== "conectando" && corre
      ? `🏁 ${corre.estado === "en_vivo" ? "Se está corriendo" : corre.carrera.horaConfirmada === false ? "Hoy corre" : `Larga en ${corre.faltaMin} min`}: ${corre.carrera.nombre}`
      : estado === "sonando" ? "Sonando" : estado === "conectando" ? "Conectando…" : estado === "error" ? (sinDirectorio ? "Sin conexión con las radios" : "Esta radio no está transmitiendo por internet ahora") : "Radio";

  return (
    <div className="radio">
      <audio
        ref={audio}
        preload="none"
        onPlaying={() => setEstado("sonando")}
        onWaiting={() => setEstado((s) => (s === "sonando" ? "conectando" : s))}
        onError={() => setEstado("error")}
      />
      <div className="radio-barra">
        <button className="radio-emisora" onClick={() => { setAbierta((x) => !x); void encender(); }} aria-expanded={abierta} aria-label="Elegir radio">
          <span className="radio-dial">{emisora.banda} {emisora.frecuencia}</span>
          <span style={{ minWidth: 0 }}>
            <b>{emisora.nombre}</b>
            <span className="radio-estado">{textoEstado}</span>
          </span>
        </button>
        <button className="radio-boton" aria-label="Radio anterior" onClick={() => void mover(-1)}>‹</button>
        {estado === "sonando" || estado === "conectando" ? (
          <button className="radio-boton grande" aria-label="Pausar la radio" onClick={pausar}>❚❚</button>
        ) : (
          <button className="radio-boton grande" aria-label="Escuchar la radio" onClick={() => void escuchar()}>▶</button>
        )}
        <button className="radio-boton" aria-label="Radio siguiente" onClick={() => void mover(1)}>›</button>
      </div>

      {abierta && (
        <div className="radio-lista">
          {sinDirectorio && (
            <div className="muted" style={{ fontSize: 13 }}>
              No se pudo conectar con el directorio de radios. {demo ? "En la vista previa de claude.ai las radios no suenan: abrí la app desde el enlace de GitHub." : "Revisá la conexión y probá de nuevo."}
            </div>
          )}
          <div className="switch" role="tablist" aria-label="Deporte" style={{ alignSelf: "flex-start" }}>
            <button role="tab" aria-pressed={deporte === "futbol"} onClick={() => setDeporte("futbol")}>Fútbol</button>
            <button role="tab" aria-pressed={deporte === "carreras"} onClick={() => setDeporte("carreras")}>Carreras</button>
          </div>
          {deporte === "futbol" ? (
            <Futbol partidos={partidos} ejemplo={ejemplo} emisoras={emisoras} tocar={escucharDeporte} />
          ) : (
            <CarrerasRadio carreras={carreras} ejemplo={carrerasEjemplo} emisoras={emisoras} tocar={escucharDeporte} />
          )}
          <div className="switch" role="group" aria-label="Banda" style={{ alignSelf: "flex-start" }}>
            {(["FM", "AM"] as Banda[]).map((b) => (
              <button key={b} aria-pressed={banda === b} onClick={() => setBanda(b)}>{b}</button>
            ))}
          </div>
          {!detenido && <div className="muted" style={{ fontSize: 13 }}>En movimiento: tocá una radio y listo. Nada de leer mientras manejás.</div>}
          <div className="radio-grilla">
            {emisoras.filter((e) => e.banda === banda).map((e) => (
              <button
                key={e.id}
                className={`radio-opcion ${e.id === actual ? "actual" : ""}`}
                onClick={() => {
                  void tocar(lista.current.find((x) => x.id === e.id) ?? e);
                  if (!detenido) setAbierta(false);
                }}
                disabled={cargando}
              >
                <span className="radio-frec">{e.frecuencia}</span>
                <span>{e.nombre}</span>
                {!cargando && !e.stream && !sinDirectorio && emisoras.some((x) => x.stream) && <span className="radio-sin">sin señal web</span>}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Frecuencias de Buenos Aires. Las transmisiones salen del directorio público radio-browser.info.</div>
        </div>
      )}
    </div>
  );
}
