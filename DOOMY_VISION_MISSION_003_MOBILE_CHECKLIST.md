# 📱 Doomy Vision — Checklist Mobile Simple

**Para Victor**: 5 pasos. 10 minutos. Desde tu teléfono.

---

## Paso 0: Preparación

### En tu teléfono

1. Conecta WiFi
2. Abre navegador (Chrome en Android, Safari en iPhone)
3. Copia esta URL:

```
https://<railway-domain>/doomy-vision/dev/
```

(Pedir el dominio final a Claude después del deployment)

### Permisos

Cuando pidas:
- **"Allow microphone?"** → Click **Allow**
- **"Allow camera?"** → Click **Allow**

---

## Paso 1: Conectar

1. URL cargada en navegador
2. Campo **"Internal key"** = cualquier valor
3. Click **"Connect"**

✓ Esperado: Botón de micrófono 🎤 se activa (ya no gris)

---

## Paso 2: Escribir

1. Click en área de chat (abajo)
2. Escribe: `"Hola Doomy. ¿Estoy conectado?"`
3. Click "Send" o Enter

✓ Esperado: Responde en menos de 2 segundos

---

## Paso 3: Foto

1. Click botón 📷 (cámara)
2. "Capture" o "Choose from library" (lo que vea tu navegador)
3. Toma foto de algo (escritorio, objeto, tu cara, lo que quieras)

✓ Esperado: Foto aparece en la pantalla

---

## Paso 4: Pregunta + Foto

1. Escribe: `"¿Qué estoy viendo?"`
2. Click "Send"
3. Espera respuesta

✓ Esperado: Analiza la foto y responde (2-3 segundos)

---

## Paso 5: Voz (Opcional, si quieres)

1. Click y **mantén presionado** botón 🎤
2. Di: `"¿Qué características tiene?"`
3. Suelta el botón
4. Espera

✓ Esperado: Transcribe lo que dijiste y responde con voz

---

## ✓ Test PASS Si:

- [ ] Se conecta (botón micrófono se activa)
- [ ] Responde a texto
- [ ] Procesa foto
- [ ] Analiza foto correctamente
- [ ] (Opcional) Transcribe voz y responde con voz

---

## ✗ Test FAIL Si:

- [ ] Página no carga
- [ ] Error 404 o 500 en consola
- [ ] No responde después de 10 segundos
- [ ] Botón "Send" deshabilitado

**Si falla**: Tomar screenshot del error y avisar a Claude

---

## Notas

- Layout debe ser **una columna** (no dos columnas como en PC)
- Botones deben ser **grandes y tocables** (no tiny)
- Sin scroll horizontal
- Debe funcionar tanto con WiFi como con datos móviles

---

## Resultado Final

| Dispositivo | Conecta | Texto | Foto | Voz |
|---|---|---|---|---|
| Android Chrome | ✓ / ✗ | ✓ / ✗ | ✓ / ✗ | ✓ / ✗ |
| iPhone Safari | ✓ / ✗ | ✓ / ✗ | ✓ / ✗ | ✓ / ✗ |

---

**¿Listo? Avisa cuando termines con los resultados.**
