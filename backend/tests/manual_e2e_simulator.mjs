// Prueba manual E2E del Dev Console usando Playwright headless.
// No es parte de la suite de vitest (usa un navegador real) — se ejecuta
// a mano para validar la interfaz. Ver docs/DOOMY_VISION_TEST_PLAN.md.
import { chromium } from 'playwright';
import { createApp } from '../src/app.js';

const app = createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text()); });
page.on('requestfailed', (req) => consoleErrors.push('requestfailed: ' + req.url() + ' (' + req.failure()?.errorText + ')'));

await page.goto(`${base}/doomy-vision/dev/`);
await page.fill('#internalKey', 'changeme-shared-secret');
await page.click('#btnConnect');
await page.waitForSelector('#diagSession:not(:has-text("—"))', { timeout: 5000 });

const sessionId = await page.textContent('#diagSession');
console.log('session_id from UI:', sessionId);
if (!sessionId || sessionId === '—') throw new Error('No se creó la sesión desde la UI');

await page.fill('#textInput', '¿Qué hora es?');
await page.click('#btnSend');
await page.waitForSelector('.msg.assistant:not(:has-text("Pensando"))', { timeout: 8000 });
const assistantText = await page.textContent('.msg.assistant:last-child');
console.log('assistant said:', assistantText.slice(0, 120));

// Segundo turno: pregunta que requiere visión, sin imagen -> vision_requested
await page.fill('#textInput', '¿Qué estoy viendo?');
await page.click('#btnSend');
await page.waitForTimeout(1500);

const logText = await page.textContent('#log');
console.log('--- log tail ---');
console.log(logText.split('\n').slice(-8).join('\n'));

await browser.close();
server.close();

if (consoleErrors.length) {
  console.error('JS ERRORS DETECTED:\n' + consoleErrors.join('\n'));
  process.exit(1);
}
console.log('OK: dev console E2E sin errores de JS.');
