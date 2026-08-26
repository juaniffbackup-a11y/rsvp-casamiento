#!/usr/bin/env python3
"""
El latido del RSVP tiene que avisar cuando se cae, y NO avisar por un hipo.

Es el inadmisible numero 3 del casamiento: el unico fallo que no tiene sintoma.
Si esto no funciona, el formulario puede dejar de guardar un martes y Juani se
entera diez dias despues.
"""
import importlib.util, json, os, shutil, sys, tempfile

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "latido.py")

fallos = []
def check(n, cond, det=""):
    print(f"  {'PASA' if cond else 'FALLA'}  {n}" + (f"  -> {det}" if det else ""))
    if not cond:
        fallos.append(n)


def cargar(endpoint="https://script.google.com/fake/exec"):
    """Cada caso en su propio directorio: si comparten estado, se contaminan."""
    tmp = tempfile.mkdtemp(prefix="test-latido-")
    shutil.copy(SRC, os.path.join(tmp, "rsvp_latido.py"))
    os.environ["RSVP_ENDPOINT"] = endpoint
    os.environ["NTFY_TOPIC"] = ""          # nada de notificaciones reales
    spec = importlib.util.spec_from_file_location("lat", os.path.join(tmp, "rsvp_latido.py"))
    M = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(M)
    M.ESTADO = os.path.join(tmp, "rsvp_estado.json")
    M.HISTORIA = os.path.join(tmp, "rsvp_latido.jsonl")
    notis = []
    M.notificar = lambda t, m, urgente=False: notis.append((t, m, urgente))
    # que nadie toque la red de verdad
    M.urllib.request.urlopen = lambda *a, **k: (_ for _ in ()).throw(
        RuntimeError("red mockeada en tests"))
    return M, notis, tmp


print("\n[1] Sin RSVP_ENDPOINT no hace nada y no rompe")
M, notis, tmp = cargar(endpoint="")
M.main()
check("no notifica", notis == [], str(notis))
check("no deja estado", not os.path.exists(M.ESTADO))
shutil.rmtree(tmp, ignore_errors=True)

print("\n[2] Un fallo suelto NO alarma")
M, notis, tmp = cargar()
M.probar = lambda: (False, "timeout", None)
M.main()
check("no notifica todavia", notis == [], str(notis))
check("cuenta 1 fallo", json.load(open(M.ESTADO))["fallos"] == 1)
shutil.rmtree(tmp, ignore_errors=True)

print("\n[3] Dos fallos seguidos SI alarman, y como urgente")
M, notis, tmp = cargar()
M.probar = lambda: (False, "connection refused", None)
M.main(); M.main()
check("notifica una vez", len(notis) == 1, f"{len(notis)} notificaciones")
check("es urgente", notis and notis[0][2] is True)
check("el titulo dice CAIDO", notis and "CAIDO" in notis[0][0], notis[0][0] if notis else "")
check("el mensaje explica el motivo", notis and "connection refused" in notis[0][1])
shutil.rmtree(tmp, ignore_errors=True)

print("\n[4] No repite la alarma cada hora mientras sigue caido")
M, notis, tmp = cargar()
M.probar = lambda: (False, "timeout", None)
for _ in range(8):
    M.main()
check("una sola notificacion en 8 corridas", len(notis) == 1, f"{len(notis)}")
check("sigue contando los fallos", json.load(open(M.ESTADO))["fallos"] == 8)
shutil.rmtree(tmp, ignore_errors=True)

print("\n[5] Cuando se recupera, avisa que volvio")
M, notis, tmp = cargar()
M.probar = lambda: (False, "timeout", None)
M.main(); M.main()                      # cae y alarma
notis.clear()
M.probar = lambda: (True, "ok", 42)     # vuelve
M.main()
check("avisa la recuperacion", len(notis) == 1, f"{len(notis)}")
check("no es urgente", notis and notis[0][2] is False)
check("informa cuantas hay", notis and "42" in notis[0][1], notis[0][1] if notis else "")
est = json.load(open(M.ESTADO))
check("resetea el contador", est["fallos"] == 0, str(est["fallos"]))
check("baja la bandera", est["avisado"] is False)
shutil.rmtree(tmp, ignore_errors=True)

print("\n[6] Si vuelve a caer despues, alarma de nuevo")
M, notis, tmp = cargar()
M.probar = lambda: (False, "x", None)
M.main(); M.main()
M.probar = lambda: (True, "ok", 10)
M.main()
notis.clear()
M.probar = lambda: (False, "y", None)
M.main(); M.main()
check("vuelve a alarmar", len(notis) == 1, f"{len(notis)}")
shutil.rmtree(tmp, ignore_errors=True)

print("\n[7] Andando normal no molesta con notificaciones")
M, notis, tmp = cargar()
M.probar = lambda: (True, "ok", 7)
for _ in range(24):                     # un dia entero de corridas
    M.main()
check("cero notificaciones en 24 corridas", notis == [], str(notis))
check("guarda el conteo", json.load(open(M.ESTADO))["confirmaciones"] == 7)
shutil.rmtree(tmp, ignore_errors=True)

print("\n[8] La historia queda registrada para poder mirarla despues")
M, notis, tmp = cargar()
M.probar = lambda: (True, "ok", 3)
M.main()
M.probar = lambda: (False, "cayo", None)
M.main()
lineas = [json.loads(l) for l in open(M.HISTORIA)]
check("dos entradas", len(lineas) == 2, str(len(lineas)))
check("la primera ok", lineas[0]["ok"] is True)
check("la segunda no", lineas[1]["ok"] is False)
check("guarda el motivo", lineas[1]["detalle"] == "cayo")
shutil.rmtree(tmp, ignore_errors=True)

print("\n[9] Un deploy mal configurado se detecta (devuelve HTML, no JSON)")
#     Pasa cuando el Apps Script queda con acceso "solo yo" en vez de "cualquiera".
#     Es el error de configuracion mas comun y desde afuera parece que anda.
M, notis, tmp = cargar()
class RespHTML:
    status = 200
    def read(self): return b"<!DOCTYPE html><html>Sign in</html>"
    def __enter__(self): return self
    def __exit__(self, *a): return False
M.urllib.request.urlopen = lambda *a, **k: RespHTML()
ok, detalle, n = M.probar()
check("no lo da por bueno", ok is False)
check("explica que el deploy no esta publico", "publico" in detalle, detalle)
shutil.rmtree(tmp, ignore_errors=True)

print("\n[10] Si la hoja no existe en la planilla, tampoco lo da por bueno")
M, notis, tmp = cargar()
class RespSinHoja:
    status = 200
    def read(self): return json.dumps({"ok": True, "hoja": "Respuestas",
                                       "existe": False}).encode()
    def __enter__(self): return self
    def __exit__(self, *a): return False
M.urllib.request.urlopen = lambda *a, **k: RespSinHoja()
ok, detalle, n = M.probar()
check("no lo da por bueno", ok is False)
check("dice cual hoja falta", "Respuestas" in detalle, detalle)
shutil.rmtree(tmp, ignore_errors=True)

print("\n[11] Respuesta sana: la lee bien")
M, notis, tmp = cargar()
class RespOk:
    status = 200
    def read(self): return json.dumps({"ok": True, "hoja": "Respuestas",
                                       "existe": True, "confirmaciones": 137}).encode()
    def __enter__(self): return self
    def __exit__(self, *a): return False
M.urllib.request.urlopen = lambda *a, **k: RespOk()
ok, detalle, n = M.probar()
check("ok", ok is True, detalle)
check("lee el conteo", n == 137, str(n))
shutil.rmtree(tmp, ignore_errors=True)

print("\n[12] Reintenta dentro de la misma corrida antes de darlo por caido")
M, notis, tmp = cargar()
llamadas = {"n": 0}
class RespIntermitente:
    status = 200
    def read(self): return json.dumps({"ok": True, "hoja": "Respuestas",
                                       "existe": True, "confirmaciones": 5}).encode()
    def __enter__(self): return self
    def __exit__(self, *a): return False
def urlopen_flaky(*a, **k):
    llamadas["n"] += 1
    if llamadas["n"] < 3:
        raise OSError("hipo de red")
    return RespIntermitente()
M.urllib.request.urlopen = urlopen_flaky
ok, detalle, n = M.probar()
check("se recupera dentro de la corrida", ok is True, detalle)
check("hizo 3 intentos", llamadas["n"] == 3, str(llamadas["n"]))
shutil.rmtree(tmp, ignore_errors=True)

print("\n[13] El simulacro manda la alarma sin tocar el estado real")
os.environ["RSVP_SIMULACRO"] = "1"
M, notis, tmp = cargar()
M.probar = lambda: (_ for _ in ()).throw(AssertionError("el simulacro no debe tocar la red"))
M.main()
check("notifica", len(notis) == 1, str(len(notis)))
check("es urgente", notis and notis[0][2] is True)
check("se identifica como prueba", notis and "SIMULACRO" in notis[0][0], notis[0][0] if notis else "")
check("aclara que no pasa nada", notis and "PRUEBA" in notis[0][1])
check("NO escribe estado", not os.path.exists(M.ESTADO))
check("NO escribe historia", not os.path.exists(M.HISTORIA))
os.environ.pop("RSVP_SIMULACRO", None)
shutil.rmtree(tmp, ignore_errors=True)

print("\n[14] Sin la variable, el simulacro no se dispara solo")
M, notis, tmp = cargar()
M.probar = lambda: (True, "ok", 0)
M.main()
check("corre normal", notis == [], str(notis))
shutil.rmtree(tmp, ignore_errors=True)

print("\n" + "=" * 58)
print("TODOS LOS TESTS PASAN" if not fallos else f"FALLAN: {fallos}")
sys.exit(1 if fallos else 0)
