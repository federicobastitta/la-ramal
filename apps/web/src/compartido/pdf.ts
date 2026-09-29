/**
 * PDF mínimo de una página con texto (Helvetica, WinAnsi para las tildes y la ñ).
 * Lo usan la demo (recibos de ejemplo) y el panel para generar certificados de trabajo sin depender de nadie.
 */
export function pdfSimple(titulo: string, lineas: string[]): Blob {
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const texto = [
    "BT /F1 18 Tf 56 780 Td (" + esc(titulo) + ") Tj ET",
    ...lineas.map((l, i) => `BT /F1 11 Tf 56 ${740 - i * 18} Td (${esc(l)}) Tj ET`),
  ].join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${latin1(texto).length} >>\nstream\n${texto}\nendstream`,
  ];
  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(latin1(cuerpo).length);
    cuerpo += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = latin1(cuerpo).length;
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([latin1(cuerpo) as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
}

function latin1(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    b[i] = c < 256 ? c : 63; // "?" para lo que no entra en WinAnsi
  }
  return b;
}

export const hoyISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const sumarDias = (iso: string, n: number) => {
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n);
  return hoyISO(d);
};
export const fechaLinda = (iso: string) =>
  new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
export const plata = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
