// Prueba manual E2E del Dev Console usando Playwright headless.
// No es parte de la suite de vitest (usa un navegador real, y Playwright no
// es una dependencia del proyecto a propósito — ver README/docs) — se
// ejecuta a mano (`npm run e2e`) para validar la interfaz de punta a punta.
// Ver docs/DOOMY_VISION_TEST_PLAN.md.
//
// Cobertura (Fase 31-35, Mission 002 — expandida desde Mission 001):
// crear sesión -> subir imagen -> preguntar -> recibir respuesta -> "reproducir"
// el audio TTS mock (confirmar que el <audio> tiene una src válida y carga) ->
// turno de seguimiento -> confirmar que la sesión (y su contexto) se preservó.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const app = createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const tmpDir = await mkdtemp(path.join(tmpdir(), 'doomy-vision-e2e-'));
const fixtureImagePath = path.join(tmpDir, 'fixture.jpg');
await sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 40, g: 120, b: 200 } } }).jpeg().toFile(fixtureImagePath);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  // Mismo hallazgo conocido que el filtro de requestfailed de abajo: el
  // egress restringido de este sandbox bloquea Google Fonts con
  // ERR_CONNECTION_RESET, y Chromium a veces solo lo reporta aquí (mensaje
  // genérico, sin URL) en vez de (o además de) en requestfailed. No es un
  // bug de la aplicación — el stack de fuentes ya tiene fallback a fuentes
  // de sistema, documentado en DOOMY_VISION_TEST_PLAN.md.
  if (msg.text().includes('net::ERR_CONNECTION_RESET')) return;
  consoleErrors.push('console.error: ' + msg.text());
});
page.on('requestfailed', (req) => {
  // Google Fonts bloqueado por egress del sandbox es un hallazgo conocido y
  // documentado (BLOCKER informativo, no un bug de la app) — no cuenta como
  // fallo de esta prueba. Cualquier otro requestfailed sí cuenta.
  if (req.url().includes('fonts.googleapis.com') || req.url().includes('fonts.gstatic.com')) return;
  consoleErrors.push('requestfailed: ' + req.url() + ' (' + req.failure()?.errorText + ')');
});

let step = '';
try {
  step = 'goto';
  await page.goto(`${base}/doomy-vision/dev/`);

  step = 'connect';
  await page.fill('#internalKey', 'changeme-shared-secret');
  await page.click('#btnConnect');
  await page.waitForSelector('#diagSession:not(:has-text("—"))', { timeout: 5000 });
  const sessionId = await page.textContent('#diagSession');
  console.log('session_id from UI:', sessionId);
  if (!sessionId || sessionId === '—') throw new Error('No se creó la sesión desde la UI');

  step = 'upload image + ask';
  await page.setInputFiles('#fileImage', fixtureImagePath);
  await page.waitForSelector('#previewStrip .preview-chip'); // confirma que el preview se renderizó
  await page.fill('#textInput', '¿Qué estoy viendo?');
  await page.click('#btnSend');
  await page.waitForSelector('.msg.assistant:not(:has-text("Pensando"))', { timeout: 8000 });
  const firstAnswer = await page.textContent('.msg.assistant:last-child');
  console.log('assistant said (con imagen):', firstAnswer.slice(0, 120));
  const visionUsedTag = await page.locator('.msg.assistant:last-child .meta .tag', { hasText: 'vision_used' }).count();
  if (visionUsedTag === 0) throw new Error('La respuesta no marcó vision_used a pesar de haber adjuntado una imagen');

  step = 'play mock TTS audio';
  const audioEl = page.locator('.msg.assistant:last-child audio');
  await audioEl.waitFor({ timeout: 3000 });
  const audioSrc = await audioEl.getAttribute('src');
  if (!audioSrc) throw new Error('El mensaje de respuesta no incluyó un elemento <audio> con src');
  // "Reproducir" de verdad: dispara play() en la página y confirma que el
  // navegador pudo cargar el recurso (readyState > 0) sin lanzar error.
  const playedOk = await page.evaluate(async () => {
    const el = document.querySelector('.msg.assistant:last-child audio');
    if (!el) return false;
    try {
      await el.play();
      return el.readyState > 0;
    } catch {
      return false;
    }
  });
  if (!playedOk) throw new Error('El audio de respuesta no pudo reproducirse en el navegador');
  console.log('audio TTS mock reproducido OK, src:', audioSrc);

  step = 'follow-up turn (session context preserved)';
  await page.fill('#textInput', '¿Tiene PoE?');
  await page.click('#btnSend');
  await page.waitForFunction(
    () => document.querySelectorAll('.msg.assistant').length >= 2 && !document.querySelector('.msg.assistant:last-child')?.textContent?.includes('Pensando'),
    { timeout: 8000 }
  );
  const followUpAnswer = await page.textContent('.msg.assistant:last-child');
  console.log('assistant said (follow-up):', followUpAnswer.slice(0, 120));

  step = 'verify session preserved';
  const sessionIdAfter = await page.textContent('#diagSession');
  if (sessionIdAfter !== sessionId) throw new Error(`session_id cambió entre turnos: ${sessionId} -> ${sessionIdAfter}`);
  const followUpVisionUsedTag = await page.locator('.msg.assistant:last-child .meta .tag', { hasText: 'vision_used' }).count();
  if (followUpVisionUsedTag === 0) throw new Error('El follow-up no reutilizó la imagen activa (vision_used ausente) — continuidad de sesión rota');
  console.log('session preservada correctamente entre turnos:', sessionIdAfter);

  step = 'vision_requested path (no active image after reset)';
  await page.click('#btnReset');
  await page.waitForFunction(() => document.querySelector('#chat')?.children.length === 0 || document.querySelector('#chat .empty-hint'), { timeout: 3000 });
  await page.fill('#textInput', '¿Qué estoy viendo?');
  await page.click('#btnSend');
  await page.waitForSelector('.msg.assistant:not(:has-text("Pensando"))', { timeout: 8000 });
  const logText = await page.textContent('#log');
  if (!logText.includes('pidió visión')) throw new Error('No se registró el mensaje esperado de vision_requested tras un reset');
  console.log('--- log tail ---');
  console.log(logText.split('\n').slice(-6).join('\n'));
} finally {
  await browser.close();
  server.close();
  await rm(tmpDir, { recursive: true, force: true });
}

if (consoleErrors.length) {
  console.error(`JS ERRORS DETECTED (durante "${step}"):\n` + consoleErrors.join('\n'));
  process.exit(1);
}
console.log(`\nOK: dev console E2E completo sin errores de JS (imagen -> respuesta -> audio -> follow-up -> reset -> vision_requested).`);
