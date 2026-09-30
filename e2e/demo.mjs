// Prueba de punta a punta del modo demo: el chofer reporta y dispara el pánico; el panel lo ve en vivo.
// Uso: node e2e/demo.mjs [url] (con `npm run preview -w @la-ramal/web` corriendo).
import { chromium } from "playwright";

const URL = process.argv[2] ?? "http://localhost:4173";
const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await navegador.newContext({ geolocation: { latitude: -34.7206, longitude: -58.2546, accuracy: 12 }, permissions: ["geolocation"] });
const chofer = await ctx.newPage();
const panel = await ctx.newPage();
// La voz del celular se reemplaza por una que anota lo que dice (en la prueba no hay parlante).
await chofer.addInitScript(() => {
  window.__dichos = [];
  window.speechSynthesis.speak = (u) => {
    if (u.text) window.__dichos.push(u.text);
    setTimeout(() => u.onend?.(new Event("end")), 50);
  };
});
const errores = [];
for (const p of [chofer, panel]) p.on("pageerror", (e) => errores.push(e.message));

await chofer.goto(URL + "/?sinArranque");
await panel.goto(URL + "/panel.html");
await chofer.getByRole("button", { name: "Avería", exact: true }).click();
await chofer.getByRole("button", { name: "Frenos", exact: true }).click();
await chofer.locator('input[accept="image/*"]').setInputFiles({ name: "freno.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
await chofer.getByLabel("Contalo en pocas palabras").fill("El delantero hace ruido al frenar fuerte");
await chofer.getByText("Ubicación lista").waitFor();
await chofer.getByRole("button", { name: "Enviar a la línea" }).click();
await chofer.getByText("Enviado a la línea").waitFor();

await panel.getByText("Frenos: El delantero hace ruido al frenar fuerte").waitFor({ timeout: 5000 });
const urgencia = await panel.getByText("Urgencia alta").count();
await panel.getByRole("button", { name: "Mandar al taller" }).first().click();
await chofer.getByText("En el taller").first().waitFor({ timeout: 5000 });

// Pánico: mantener apretado 2,2 s.
await chofer.getByRole("button", { name: "Inicio", exact: true }).click();
const b = chofer.getByRole("button", { name: /Botón de pánico/ });
await b.hover();
await chofer.mouse.down();
await chofer.waitForTimeout(2200);
await chofer.mouse.up();
await chofer.getByText("Alerta de pánico enviada").waitFor({ timeout: 8000 });
await panel.getByText(/PÁNICO · Interno 23/).waitFor({ timeout: 5000 });
await panel.getByRole("button", { name: /Confirmar al chofer/ }).click();
await chofer.getByText("la ayuda va en camino").waitFor({ timeout: 5000 });

// Cancelación con el PIN de coacción: el chofer ve "cancelada", el panel la sigue viendo marcada.
await chofer.getByLabel(/tu PIN/).fill("7392");
await chofer.getByRole("button", { name: "Cancelar alerta" }).click();
await chofer.getByText("Alerta cancelada").waitFor();
await panel.getByText(/CANCELADA BAJO COACCIÓN/).waitFor({ timeout: 5000 });

// Mensaje de la terminal por la radio: el panel lo manda, el celular muestra el cartel y la voz lo lee.
await panel.getByRole("button", { name: "📻 Mensaje por la radio" }).click();
await panel.getByLabel("Mensaje").fill("Corte en Mitre y 12 de Octubre, tomen por Rivadavia");
await panel.getByRole("button", { name: "Enviar por la radio" }).click();
await panel.getByText("Mensaje enviado a toda la flota").waitFor({ timeout: 5000 });
await chofer.getByText("Corte en Mitre y 12 de Octubre, tomen por Rivadavia").waitFor({ timeout: 5000 });
await chofer.waitForFunction(() => window.__dichos.some((t) => t.startsWith("Mensaje de la terminal.")), null, { timeout: 8000 });
const dichos = await chofer.evaluate(() => window.__dichos);
// Uno para otro coche no le llega a este.
await panel.getByLabel("Para").fill("Interno 99");
await panel.getByLabel("Mensaje").fill("Solo para el 99");
await panel.getByRole("button", { name: "Enviar por la radio" }).click();
await panel.getByText("Mensaje enviado al Interno 99").waitFor({ timeout: 5000 });
await chofer.waitForTimeout(1500);
if (await chofer.getByText("Solo para el 99").count()) throw new Error("Le llegó un mensaje de otro coche");
await chofer.screenshot({ path: "e2e/chofer-radio.png" });
await chofer.getByRole("button", { name: "Cerrar el mensaje" }).click();

// Los avisos de la empresa también se escuchan.
await panel.getByRole("button", { name: "Avisos", exact: true }).click();
await panel.getByLabel("Título").fill("Doblar en Directorio");
await panel.getByLabel("Texto").fill("Desde mañana el ramal B dobla en Directorio");
await panel.getByRole("button", { name: "Publicar" }).click();
await chofer.getByText("📣 Aviso de la empresa", { exact: false }).waitFor({ timeout: 5000 });
await chofer.waitForFunction(() => window.__dichos.some((t) => t.startsWith("Aviso de la empresa. Doblar en Directorio.")), null, { timeout: 8000 });
await chofer.getByRole("button", { name: "Cerrar el mensaje" }).click();

// Bolsa de francos: Carlos toma el miércoles que ofrece Jorge; la gerencia aprueba y la planilla de Carlos pasa a franco.
await chofer.getByRole("button", { name: /^Papeles/ }).click();
await chofer.getByRole("tab", { name: "Francos" }).click();
// El miércoles que ofrece Jorge puede caer en el mes que viene.
await chofer.getByRole("grid").waitFor();
if (!(await chofer.getByRole("button", { name: /1 ofrecen franco/ }).count())) await chofer.getByRole("button", { name: "Mes siguiente" }).click();
await chofer.getByRole("button", { name: /1 ofrecen franco/ }).first().click();
await chofer.getByText("Jorge Benítez ofrece su franco").waitFor({ timeout: 5000 });
await chofer.getByRole("button", { name: "Tomar este franco" }).click();
await chofer.getByText("Acordado: espera a la gerencia").waitFor({ timeout: 5000 });
await panel.getByRole("button", { name: "Bolsa de francos", exact: true }).click();
const acordado = panel.locator(".it", { hasText: "Lo tomó Carlos Medina" });
await acordado.waitFor({ timeout: 5000 });
await acordado.getByRole("button", { name: "Aprobar" }).click();
await panel.getByText("Aprobado: las planillas quedaron cambiadas").waitFor({ timeout: 5000 });
await chofer.getByText("Aprobado", { exact: true }).waitFor({ timeout: 5000 });
const francosDeCarlos = await chofer.getByRole("button", { name: /, tu franco/ }).count();
await chofer.screenshot({ path: "e2e/chofer-francos.png", fullPage: true });
await panel.screenshot({ path: "e2e/panel-francos.png" });

await chofer.screenshot({ path: "e2e/chofer.png", fullPage: true });
await panel.screenshot({ path: "e2e/panel.png", fullPage: true });
await navegador.close();
if (errores.length) throw new Error("Errores en la página: " + errores.join(" | "));
console.log(`OK: reporte en el panel (urgencia alta: ${urgencia > 0}), taller visto por el chofer, pánico confirmado, coacción marcada, mensaje por la radio leído: «${dichos.at(-1)}», aviso de la empresa leído en voz alta, franco tomado y aprobado (Carlos ve ${francosDeCarlos} días de franco en el calendario).`);
