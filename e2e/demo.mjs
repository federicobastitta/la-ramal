// Prueba de punta a punta del modo demo: el chofer reporta y dispara el pánico; el panel lo ve en vivo.
// Uso: node e2e/demo.mjs [url] (con `npm run preview -w @la-ramal/web` corriendo).
import { chromium } from "playwright";

const URL = process.argv[2] ?? "http://localhost:4173";
const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await navegador.newContext({ geolocation: { latitude: -34.7206, longitude: -58.2546, accuracy: 12 }, permissions: ["geolocation"] });
const chofer = await ctx.newPage();
const panel = await ctx.newPage();
const errores = [];
for (const p of [chofer, panel]) p.on("pageerror", (e) => errores.push(e.message));

await chofer.goto(URL + "/");
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

await chofer.screenshot({ path: "e2e/chofer.png", fullPage: true });
await panel.screenshot({ path: "e2e/panel.png", fullPage: true });
await navegador.close();
if (errores.length) throw new Error("Errores en la página: " + errores.join(" | "));
console.log(`OK: reporte en el panel (urgencia alta: ${urgencia > 0}), taller visto por el chofer, pánico confirmado, coacción marcada.`);
