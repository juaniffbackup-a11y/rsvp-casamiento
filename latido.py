#!/usr/bin/env python3
"""
Latido del RSVP del casamiento (28/11/2026).

El problema que resuelve: si el formulario deja de guardar confirmaciones un
martes cualquiera, no hay ningun sintoma. Los invitados ven "gracias", el Sheet
no crece, y te enteras cuando lo abris. Una semana de silencio son 40 o 50
personas que ya dijeron que si y que no vas a poder distinguir de las que nunca
contestaron.

Lo que NO sirve, y ya me equivoque asi una vez con el monitor de turnos: una
formula en el Sheet que diga "ultimo recibido hace 3 dias". Eso no distingue
"se rompio" de "nadie confirmo hoy", y en una campania de RSVP los dias sin
respuestas son normales.

Por eso el latido PRUEBA el endpoint activamente. El doGet del Apps Script
intenta leer la hoja de verdad, asi que si responde ok, el POST tambien va a
poder escribir.
"""
import json, os, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

TZ_BA = timezone(timedelta(hours=-3))

ENDPOINT  = os.environ.get("RSVP_ENDPOINT", "").strip()
SIMULACRO = bool(os.environ.get("RSVP_SIMULACRO", "").strip())
NTFY     = os.environ.get("NTFY_TOPIC", "").strip()

ESTADO   = "estado.json"
HISTORIA = "latido.jsonl"

TIMEOUT  = 25
INTENTOS = 3          # dentro de la misma corrida, para no alarmar por un hipo
FALLOS_PARA_ALARMA = 2   # corridas seguidas. Con cron horario: aviso en ~2 h


def ahora_ba():
    return datetime.now(TZ_BA)


def notificar(titulo, mensaje, urgente=False):
    if not NTFY:
        print(f"[sin ntfy] {titulo}: {mensaje}")
        return
    try:
        urllib.request.urlopen(urllib.request.Request(
            f"https://ntfy.sh/{NTFY}",
            data=mensaje.encode("utf-8"),
            headers={"Title": titulo,
                     "Priority": "urgent" if urgente else "low",
                     "Tags": "rotating_light" if urgente else "white_check_mark"}),
            timeout=15).read()
    except Exception as e:
        print(f"no se pudo notificar: {e}")


def probar():
    """Devuelve (ok, detalle, confirmaciones). Nunca lanza."""
    ultimo = "sin intentos"
    for i in range(INTENTOS):
        try:
            req = urllib.request.Request(ENDPOINT, headers={"User-Agent": "latido-rsvp"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                cuerpo = r.read().decode("utf-8", "replace")
                if r.status != 200:
                    ultimo = f"HTTP {r.status}"
                    continue
            try:
                d = json.loads(cuerpo)
            except json.JSONDecodeError:
                # Apps Script devuelve HTML cuando el deploy quedo mal
                # configurado (por ejemplo, acceso restringido a "solo yo")
                ultimo = "respuesta no es JSON: el deploy no esta publico"
                continue
            if not d.get("ok"):
                ultimo = f"el script respondio con error: {d.get('error', 'sin detalle')}"
                continue
            if not d.get("existe"):
                ultimo = f"la hoja '{d.get('hoja')}' no existe en la planilla"
                continue
            return True, "ok", int(d.get("confirmaciones", 0))
        except urllib.error.HTTPError as e:
            ultimo = f"HTTP {e.code}"
        except Exception as e:
            ultimo = f"{type(e).__name__}: {e}"
    return False, ultimo, None


def cargar():
    try:
        with open(ESTADO) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"fallos": 0, "avisado": False, "ultimo_ok": None, "confirmaciones": None}


def guardar(e):
    with open(ESTADO, "w") as f:
        json.dump(e, f, indent=1, ensure_ascii=False)


def simulacro():
    """Dispara la alarma real sin romper nada ni ensuciar el estado.

    Probar una alarma solo cuando de verdad se rompe algo es probarla tarde.
    Esto manda la notificacion con el texto y la prioridad reales, para
    confirmar que llega al celular y que se distingue del resto."""
    notificar(
        "SIMULACRO - RSVP CAIDO",
        "Esto es una PRUEBA, no pasa nada.\n\n"
        "Asi se ve la alerta de verdad:\n"
        "El formulario del casamiento no responde hace 2 chequeos.\n"
        "Los invitados que confirmen ahora ven un error.\n\n"
        "Si suena y vibra, el canal de alarma funciona.",
        urgente=True)
    print("simulacro disparado: la alarma se envio, el estado no se toco")


def main():
    if SIMULACRO:
        simulacro()
        return
    if not ENDPOINT:
        # Todavia no existe la planilla. No es un error: es que el proyecto
        # no llego a esa etapa. Salir en silencio para no ensuciar el log.
        print("RSVP_ENDPOINT vacio: el latido del casamiento todavia no aplica")
        return

    ok, detalle, confirmaciones = probar()
    est = cargar()
    ahora = ahora_ba().isoformat(timespec="seconds")

    with open(HISTORIA, "a") as f:
        f.write(json.dumps({"ts_ba": ahora, "ok": ok, "detalle": detalle,
                            "confirmaciones": confirmaciones}, ensure_ascii=False) + "\n")

    if ok:
        if est.get("avisado"):
            notificar("RSVP: volvio a andar",
                      f"El formulario del casamiento responde de nuevo.\n"
                      f"Confirmaciones cargadas: {confirmaciones}")
        est = {"fallos": 0, "avisado": False, "ultimo_ok": ahora,
               "confirmaciones": confirmaciones}
        print(f"ok - {confirmaciones} confirmaciones")
    else:
        est["fallos"] = est.get("fallos", 0) + 1
        print(f"FALLO ({est['fallos']}): {detalle}")
        if est["fallos"] >= FALLOS_PARA_ALARMA and not est.get("avisado"):
            desde = est.get("ultimo_ok") or "nunca"
            notificar(
                "RSVP CAIDO - no se estan guardando confirmaciones",
                f"El formulario del casamiento no responde hace {est['fallos']} chequeos.\n"
                f"Motivo: {detalle}\n"
                f"Ultima vez que anduvo: {desde}\n\n"
                f"Los invitados que confirmen ahora ven un error. "
                f"Revisa el deploy del Apps Script.",
                urgente=True)
            est["avisado"] = True

    guardar(est)


if __name__ == "__main__":
    main()
