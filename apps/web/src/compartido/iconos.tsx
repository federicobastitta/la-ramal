import type { ReactElement } from "react";

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Icono: Record<string, () => ReactElement> = {
  inicio: () => <svg {...base}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>,
  camara: () => <svg {...base}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  calle: () => <svg {...base}><path d="M5 20l4-16" /><path d="M19 20l-4-16" /><path d="M12 6v2M12 11v2M12 16v2" /></svg>,
  papel: () => <svg {...base}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h7M9 17h5" /></svg>,
  taza: () => <svg {...base}><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3v3M12 3v3" /></svg>,
  llave: () => <svg {...base}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></svg>,
  micro: () => <svg {...base}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  video: () => <svg {...base}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></svg>,
};
