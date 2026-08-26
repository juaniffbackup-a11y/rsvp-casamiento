# Publicar la web del casamiento

> ESTADO al 26/08/2026: la planilla, el Apps Script y los secrets ya estan
> hechos. Lo que falta es el paso 3 (subir a Netlify) y el 4 (el piloto).

## 1. La planilla (5 min) — hacelo PRIMERO
1. Google Sheet nuevo, ponele "Confirmaciones casamiento".
2. Extensiones > Apps Script. Borrá lo que haya y pegá todo `apps-script.gs`.
3. Guardar (disquete).
4. Implementar > Nueva implementación > engranaje > **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**  ← si esto queda en "solo yo", no funciona
5. Implementar. Te va a pedir autorizar: aceptá (va a decir "Google no verificó
   esta app", entrá en Configuración avanzada > Ir a...). Es tu propio script.
6. Copiá la **URL de la aplicación web** (termina en `/exec`).
7. Probala: pegala en el navegador. Tiene que decir "ok, el endpoint responde".

## 2. Conectar la web a la planilla (1 min)
En `web/index.html`, buscá la línea:

    const ENDPOINT = "";

y pegá la URL adentro de las comillas.

Si no hacés esto, la web muestra una franja roja arriba avisándote.

## 2b. Enchufar el latido de vigilancia (2 min)
Con la misma URL que pegaste arriba, cargala como secret en GitHub:

1. github.com/juaniffbackup-a11y/turnos-sigeci
2. Settings > Secrets and variables > Actions > New repository secret
3. Nombre: `RSVP_ENDPOINT`
4. Valor: la URL del Apps Script (la que termina en `/exec`)

Desde ahí, cada hora se verifica que el formulario siga guardando. Si se cae,
te llega una notificación urgente a las 2 horas. Sin este secret el latido
no hace nada y no te enterás si el RSVP deja de funcionar.

## 3. Publicar (5 min)
1. Cuenta gratis en netlify.com
2. Arrastrá la carpeta **`web`** de este repo (la carpeta entera, no el archivo).
3. Ya tenés URL viva.
4. Domain settings > Add custom domain > tu dominio.
5. Netlify te da 2 nameservers: pegalos en el panel del registrador.

## 4. ANTES de mandar el link a nadie
Entrá a la web publicada y **confirmá vos mismo una vez**. Fijate que la fila
aparezca en la planilla. Si no aparece, no mandes el link.

## Para cambiar algo después
Editás el HTML, entrás a Netlify > Deploys, arrastrás la carpeta de nuevo.

## Pendientes tuyos en el HTML
- Línea ~305: dress code, dice "Elegante"
- Línea ~331: fecha límite, dice "31 de octubre de 2026"
- Falta `publicar/og.jpg`: una foto de ustedes de 1200x630 px. Es la imagen que
  se ve cuando mandás el link por WhatsApp. Sin eso aparece un link pelado.

## La pregunta disruptiva (pendiente)
Se saco del formulario el 26/08 para poder publicar limpio. Para volver a
ponerla: un campo de texto mas antes del mensaje, y agregar 'extra' a las
COLUMNAS del Apps Script. Son 5 minutos.
