/**
 * La app queda fija al ancho del celular, sin zoom con dos dedos ni doble toque (dueño, 30/09: «que no tenga
 * movimiento con los dos dedos… así tiene calce perfecto de celular»).
 * - Android respeta `user-scalable=no` del viewport (en los .html).
 * - El iPhone lo ignora a propósito: por eso además se frenan acá los gestos de pellizco de Safari y los toques
 *   con dos dedos, y en el CSS `touch-action: pan-x pan-y` (deja deslizar pero no hace zoom ni con pellizco ni con
 *   doble toque; el doble toque no se frena acá para no perder toques rápidos, como el PIN).
 */
export function sinZoom() {
  if (typeof window === "undefined") return;
  const frenar = (e: Event) => e.preventDefault();
  // Gestos propios de Safari (pellizco).
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, frenar, { passive: false });
  // Dos dedos moviéndose = zoom.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
