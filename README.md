# RSVP del casamiento — Mica & Juani, 28/11/2026

Confirmaciones de asistencia para 275 invitados.

**Repo separado del monitor de turnos a propósito.** Aquel mide algo
irreversible: si se pierde el día que el Registro Civil publica las fechas,
no hay segunda oportunidad. Este no tiene esa propiedad. Lo nuevo no puede
poner en riesgo lo que ya funciona.

## Qué hay acá

| | |
|---|---|
| `web/index.html` | La invitación. Se sube a Netlify arrastrando la carpeta `web` |
| `apps-script.gs` | Recibe las confirmaciones y las escribe en el Google Sheet |
| `latido.py` | Vigila que el formulario siga guardando. Corre cada hora |
| `analizar.py` | Cruza confirmados contra la lista del planner y detecta duplicados |
| `INADMISIBLES.md` | Los siete errores que no se pueden arreglar después |

## Secrets que necesita el workflow

- `RSVP_ENDPOINT`: la URL del Apps Script, la que termina en `/exec`
- `NTFY_TOPIC`: el mismo topic que usa el monitor de turnos

Sin `RSVP_ENDPOINT` el latido sale en silencio y no hace nada.

## Probar la alarma

Actions → Latido del RSVP → Run workflow → marcar el simulacro.
Manda la notificación real, con prioridad urgente, sin tocar la red ni el
estado guardado. Probar una alarma solo cuando algo se rompe es probarla tarde.

## Analizar las confirmaciones

    python3 analizar.py respuestas.json lista.csv

Reporta cubiertos confirmados, diferencias contra lo reservado por el planner,
nombres repetidos, y las alergias severas en una lista aparte.
