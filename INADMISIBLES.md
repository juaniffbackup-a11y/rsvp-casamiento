# Errores inadmisibles y cómo se prueba cada uno

Criterio: **fallar ruidoso se arregla, fallar en silencio no.**
Un inadmisible que no se puede probar está mal escrito.

Escritos el 26/08/2026 con la lista real a la vista (275 personas, un teléfono
por fila, Cantidad declarada por el planner, solo la fiesta del sábado 28).

---

## 1. Una alergia severa no llega a la cocina
Único fallo con consecuencia física.

**Prueba:** enviar un RSVP marcando alergia severa. Verificar que en el export
sale en columna propia, no mezclada con "no como cerdo", y que sobrevive al CSV
(el color de un formato condicional NO sobrevive: si la marca es solo visual,
falla la prueba).

**Estado:** por construir.

---

## 2. Una respuesta se pierde
**Prueba A:** forzar que el endpoint devuelva 500. El invitado tiene que ver el
error, NO la pantalla de gracias, y poder reintentar. → ya probado el 23/08, pasa.

**Prueba B:** completar medio formulario, cerrar la pestaña, volver a abrir.
Lo escrito tiene que seguir ahí. → HOY FALLA. No hay guardado de borrador.

---

## 3. Se pierden y no te enterás
El peor, porque no tiene síntoma.

**Prueba:** apagar el endpoint a propósito un martes cualquiera. Tiene que
llegarte una notificación dentro de las 2 horas. Si no llega, falla.

OJO: una fórmula en el Sheet que muestre "último recibido hace 3 días" NO sirve.
No distingue "se rompió" de "nadie confirmó hoy", y en una campaña de RSVP los
días sin respuestas son normales. Es el mismo error que ya cometí con el monitor
de turnos. Hace falta un latido activo, no un cartel pasivo.

**Estado:** por construir, sobre la infra del monitor que ya corre.

---

## 4. El número de cubiertos que le das al salón está mal
Cambió respecto de la versión anterior: ahora la Cantidad la declara el planner,
no el invitado. Eso es mucho mejor.

**Prueba:** para cada fila confirmada, el sistema tiene que poder comparar
"cuántos dijeron que van" contra "cuántos tenían reservados" y listar las
diferencias. Si el total sale de sumar a mano celdas de texto, falla.

**Nota:** el doble conteo entre parejas YA NO APLICA. Los acompañantes no tienen
teléfono, así que no reciben el link y no pueden confirmarse por separado.

---

## 5. La misma persona confirma dos veces y cuenta doble
NUEVO. Aparece justo porque ahora el conteo es numérico: dos envíos de Pedro
suman 4 cubiertos en vez de 2.

**Prueba:** enviar dos veces el mismo nombre. El sistema tiene que marcarlo como
duplicado, no sumarlo callado.

---

## 6. Las respuestas no se pueden consultar cuando hacen falta
**Prueba:** que Mica abra la planilla desde su celular y vea las confirmaciones.
Si hace falta que Juani se la pase, falla.

**Acción:** compartir el Sheet con Mica el día que se cree, no en noviembre.

---

## 7. El sistema se cae justo el día que mandás el link
El peor momento posible. 275 mensajes de WhatsApp salen casi juntos y el pico
de confirmaciones es en las primeras horas.

**Prueba:** disparar 30 envíos simultáneos contra el endpoint real y verificar
que ninguno se pierde. Los que fallen tienen que ver un error claro, no un
falso "gracias".

---

## Cómo se usa esta lista
1. Se construye mirando esto, no al revés.
2. Antes de mandar el link, se corren las 8 pruebas.
3. Las que no pasen se arreglan o se declaran explícitamente como riesgo aceptado.
4. Recién después, el piloto con 3 personas reales.
5. Recién después, los 275.
