#!/usr/bin/env python3
"""
Analisis de las confirmaciones del casamiento (28/11/2026).

Cierra dos de los inadmisibles:

  4. El numero de cubiertos que le das al salon esta mal
     -> cruza lo confirmado contra la Cantidad que declaro el planner
        y lista las diferencias

  5. La misma persona confirma dos veces y cuenta doble
     -> detecta nombres repetidos antes de que el total los sume callado

El match de nombres tiene que aguantar que la lista del planner este como
"Brandoni Pedro" y que la gente escriba "Pedro Brandoni". Se normaliza a
palabras ordenadas, asi el orden deja de importar.

Uso:
    python3 analizar_rsvp.py respuestas.json lista.csv
"""
import csv, json, sys, unicodedata
from collections import defaultdict
from difflib import SequenceMatcher

# por debajo de esto no se sugiere nada: mejor "no encontrado" que un match falso
UMBRAL_PARECIDO = 0.82


def normalizar(nombre):
    """'Brandoni  Pedro' y 'pedro brandoni' dan lo mismo."""
    s = unicodedata.normalize("NFKD", str(nombre or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = "".join(c if c.isalnum() or c.isspace() else " " for c in s)
    return " ".join(sorted(s.split()))


def parecido(a, b):
    return SequenceMatcher(None, a, b).ratio()


def cargar_respuestas(ruta):
    """Acepta el JSON del Sheet o un CSV exportado."""
    if ruta.endswith(".json"):
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, list) else d.get("respuestas", [])
    with open(ruta, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def cargar_lista(ruta):
    """Lista del planner: nombre + cantidad de lugares reservados."""
    out = []
    with open(ruta, encoding="utf-8-sig") as f:
        for fila in csv.DictReader(f):
            nombre = (fila.get("nombre") or fila.get("Nombre & Apellido") or "").strip()
            if not nombre or nombre.lower() == "total":
                continue
            crudo = str(fila.get("cantidad") or fila.get("Cantidad") or "").strip()
            # el planner escribe cosas como "2 (TBC)"
            digitos = "".join(c for c in crudo if c.isdigit())
            out.append({"nombre": nombre,
                        "cantidad": int(digitos) if digitos else None,
                        "tbc": "tbc" in crudo.lower()})
    return out


def analizar(respuestas, lista):
    indice = {normalizar(p["nombre"]): p for p in lista}

    vistos = defaultdict(list)
    for i, r in enumerate(respuestas):
        vistos[normalizar(r.get("nombre"))].append(i)

    duplicados, filas = [], []
    for r in respuestas:
        clave = normalizar(r.get("nombre"))
        invitado = indice.get(clave)
        sugerido = None
        if invitado is None and clave:
            cand = max(indice, key=lambda k: parecido(clave, k), default=None)
            if cand and parecido(clave, cand) >= UMBRAL_PARECIDO:
                sugerido = indice[cand]

        viene = str(r.get("asiste", "")).strip().lower().startswith("s")
        try:
            confirmados = int(str(r.get("cuantos", "")).strip() or 0)
        except ValueError:
            confirmados = 0

        reservados = (invitado or sugerido or {}).get("cantidad")
        filas.append({
            "nombre": r.get("nombre", ""),
            "viene": viene,
            "confirmados": confirmados if viene else 0,
            "reservados": reservados,
            "estado": ("exacto" if invitado else
                       f"parecido a '{sugerido['nombre']}'" if sugerido else
                       "NO ESTA EN LA LISTA"),
            "diferencia": (None if reservados is None or not viene
                           else confirmados - reservados),
            "severa": str(r.get("severa", "")).strip().lower().startswith("s"),
            "dieta": r.get("dieta", ""),
            "detalle": r.get("detalle", ""),
            "dietaAcomp": r.get("dietaAcomp", ""),
            "menoresDetalle": r.get("menoresDetalle", ""),
        })

    for clave, idxs in vistos.items():
        if len(idxs) > 1 and clave:
            duplicados.append({"nombre": respuestas[idxs[0]].get("nombre"),
                               "veces": len(idxs),
                               "cuantos": [respuestas[i].get("cuantos") for i in idxs]})

    contestaron = {normalizar(r.get("nombre")) for r in respuestas}
    faltan = [p for p in lista if normalizar(p["nombre"]) not in contestaron]
    return filas, duplicados, faltan


def informe(filas, duplicados, faltan, lista):
    vienen = [f for f in filas if f["viene"]]
    # los duplicados NO se suman: se cuenta una sola vez cada nombre
    unicos, ya = [], set()
    for f in vienen:
        k = normalizar(f["nombre"])
        if k not in ya:
            ya.add(k); unicos.append(f)

    total = sum(f["confirmados"] for f in unicos)
    print("=" * 62)
    print("  CONFIRMACIONES - Mica & Juani - 28/11/2026")
    print("=" * 62)
    print(f"  respuestas recibidas : {len(filas)}")
    print(f"  vienen               : {len(unicos)} grupos")
    print(f"  no vienen            : {len(filas) - len(vienen)}")
    print(f"  CUBIERTOS CONFIRMADOS: {total}")
    print(f"  faltan contestar     : {len(faltan)} de {len(lista)} filas de la lista")

    if duplicados:
        print(f"\n  >> {len(duplicados)} NOMBRE(S) REPETIDO(S) - revisalos antes de contar")
        for d in duplicados:
            print(f"     {d['nombre']}: {d['veces']} veces, dijo {d['cuantos']}")
    else:
        print("\n  sin nombres repetidos")

    raros = [f for f in filas if f["estado"] != "exacto"]
    if raros:
        print(f"\n  >> {len(raros)} NO COINCIDEN CON LA LISTA")
        for f in raros:
            print(f"     '{f['nombre']}' -> {f['estado']}")

    difs = [f for f in filas if f["diferencia"] not in (None, 0)]
    if difs:
        print(f"\n  >> {len(difs)} CONFIRMARON DISTINTO DE LO RESERVADO")
        for f in difs:
            signo = "+" if f["diferencia"] > 0 else ""
            print(f"     {f['nombre']}: reservados {f['reservados']}, "
                  f"confirmo {f['confirmados']} ({signo}{f['diferencia']})")

    sev = [f for f in filas if f["severa"]]
    print(f"\n  ALERGIAS SEVERAS: {len(sev)}")
    for f in sev:
        print(f"     {f['nombre']}: {f['detalle'] or f['dieta']}")

    otras = [f for f in filas if f["viene"] and not f["severa"]
             and f["dieta"] and f["dieta"] != "Como de todo"]
    if otras:
        print(f"\n  otras restricciones: {len(otras)}")
        for f in otras:
            print(f"     {f['nombre']}: {f['dieta']}"
                  + (f" ({f['detalle']})" if f["detalle"] else ""))

    acomp = [f for f in filas if f["viene"] and f["dietaAcomp"].strip()]
    if acomp:
        print(f"\n  restricciones de acompanantes: {len(acomp)}")
        for f in acomp:
            print(f"     con {f['nombre']}: {f['dietaAcomp']}")

    chicos = [f for f in filas if f["viene"] and f["menoresDetalle"].strip()]
    if chicos:
        print(f"\n  vienen con chicos: {len(chicos)}")
        for f in chicos:
            print(f"     {f['nombre']}: {f['menoresDetalle']}")
    print("=" * 62)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("uso: analizar_rsvp.py respuestas.json lista.csv")
    resp = cargar_respuestas(sys.argv[1])
    lista = cargar_lista(sys.argv[2])
    informe(*analizar(resp, lista), lista)
