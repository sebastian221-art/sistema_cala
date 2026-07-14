#!/usr/bin/env python3
"""
Motor de Consolidacion de IVA (modulo CALA).

Recibe el LISTADO de la DIAN (el Excel "token dian", Rp_Doc_*) y, opcionalmente,
los XML de las facturas (carpeta o zip). Cruza por CUFE y genera un Excel con:
  - Hojas VENTAS, COMPRAS, NOMINA, DOCUMENTO SOPORTE (detalle)
  - Hoja ACUMULADO (resumen del periodo)

Cuando hay XML, el IVA se discrimina REAL al 19% / 5% / exento.
Cuando falta el XML de un CUFE, cae a un supuesto de 19% (IVA/19%) y lo marca
en la columna "Origen" como "Asumido 19%" para que la contadora lo revise.

Uso:
    python3 consolidar_iva.py <listado.xlsx> <salida.xlsx> [xml: carpeta|zip]

Salida: el archivo .xlsx en la ruta indicada + un JSON-resumen a stdout.
Requiere: pip install openpyxl lxml --break-system-packages
"""
import sys
import io
import json
import unicodedata
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from leer_xml import cargar_xmls

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# ---- Indices de columna (0-based) del listado DIAN (Rp_Doc) ----
C_TIPO, C_CUFE, C_FOLIO, C_PREFIJO = 0, 1, 2, 3
C_FORMA_PAGO, C_MEDIO_PAGO = 5, 6
C_FECHA_EMI = 7
C_NIT_EMI, C_NOM_EMI, C_NIT_REC, C_NOM_REC = 9, 10, 11, 12
C_IVA = 13
C_RETE_IVA, C_RETE_RENTA, C_RETE_ICA = 26, 27, 28
C_TOTAL, C_ESTADO, C_GRUPO = 29, 30, 31
# Impuestos de consumo (no IVA, no retencion) que SI hacen parte del total
C_OTROS = list(range(14, 26))  # ICA..ICUI


def _norm(s):
    s = (s or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def clasificar(tipo, grupo):
    """Devuelve (hoja, es_nota_credito) o (None, _) si se debe excluir."""
    t, g = _norm(tipo), _norm(grupo)
    if "application response" in t:
        return None, False            # eventos, no son facturas
    es_nc = "nota" in t and "credito" in t
    if g == "emitido":
        if "nomina" in t:
            return "NOMINA", False
        if "documento soporte" in t:
            return "DOCUMENTO SOPORTE", False
        return "VENTAS", es_nc        # factura, nota debito/credito, contingencia
    if g == "recibido":
        return "COMPRAS", es_nc        # incluye doc equivalente / POS
    return None, False


def fnum(v):
    try:
        return float(v) if v not in (None, "") else 0.0
    except (TypeError, ValueError):
        return 0.0


# ---- Layout de las hojas de detalle ----
ENCABEZADOS = [
    "Tipo de documento", "CUFE/CUDE", "Folio", "Prefijo", "Fecha Emisión",
    "NIT Emisor", "Nombre Emisor", "NIT Receptor", "Nombre Receptor", "Forma Pago",
    "Base Exenta", "Base Gravada 19%", "Base Gravada 5%",
    "IVA 19%", "IVA 5%", "IVA Total", "Otros Impuestos",
    "Rete IVA", "Rete Renta", "Rete ICA",
    "TOTAL Calculado", "Total DIAN", "Diferencia", "Origen", "Estado",
]
# Letras de columna por nombre, para construir formulas
COL = {name: get_column_letter(i + 1) for i, name in enumerate(ENCABEZADOS)}

AZUL = Font(color="0000FF")
NEGRO = Font(color="000000")
NEGRITA = Font(bold=True, color="FFFFFF")
RELLENO_HEAD = PatternFill("solid", fgColor="1F4E78")
RELLENO_TOT = PatternFill("solid", fgColor="DDEBF7")
BORDE = Border(*[Side(style="thin", color="BFBFBF")] * 4)
MONEDA = '#,##0;(#,##0);"-"'


def construir(listado_path, salida_path, xml_path=None):
    wb_in = load_workbook(listado_path, read_only=True, data_only=True)
    ws_in = wb_in[wb_in.sheetnames[0]]
    filas = list(ws_in.iter_rows(values_only=True))[1:]  # sin encabezado

    xml_idx, xml_err = ({}, [])
    if xml_path:
        xml_idx, xml_err = cargar_xmls(xml_path)

    # Agrupar filas por hoja de destino
    hojas = {"VENTAS": [], "COMPRAS": [], "NOMINA": [], "DOCUMENTO SOPORTE": []}
    resumen = {"total_filas": 0, "excluidas": 0, "con_xml": 0, "asumidas": 0}

    for r in filas:
        if r is None or r[C_TIPO] is None:
            continue
        resumen["total_filas"] += 1
        hoja, es_nc = clasificar(r[C_TIPO], r[C_GRUPO])
        if hoja is None:
            resumen["excluidas"] += 1
            continue

        cufe = r[C_CUFE]
        iva_tok = fnum(r[C_IVA])
        total = fnum(r[C_TOTAL])
        otros = sum(fnum(r[i]) for i in C_OTROS)

        x = xml_idx.get(cufe)
        if x:                                   # IVA real del XML
            base_ex, base19, base5 = x["base_exenta"], x["base_19"], x["base_5"]
            iva19, iva5 = x["iva_19"], x["iva_5"]
            origen = "XML"
            resumen["con_xml"] += 1
        else:                                   # supuesto 19% (sin XML)
            iva19, iva5 = iva_tok, 0.0
            base19 = round(iva_tok / 0.19, 2) if iva_tok else 0.0
            base5 = 0.0
            base_ex = round(total - base19 - iva19 - otros, 2)
            origen = "Asumido 19%"
            resumen["asumidas"] += 1

        signo = -1 if es_nc else 1
        hojas[hoja].append({
            "tipo": r[C_TIPO], "cufe": cufe, "folio": r[C_FOLIO],
            "prefijo": r[C_PREFIJO], "fecha": r[C_FECHA_EMI],
            "nit_emi": r[C_NIT_EMI], "nom_emi": r[C_NOM_EMI],
            "nit_rec": r[C_NIT_REC], "nom_rec": r[C_NOM_REC],
            "forma": r[C_FORMA_PAGO],
            "base_ex": signo * base_ex, "base19": signo * base19,
            "base5": signo * base5, "iva19": signo * iva19, "iva5": signo * iva5,
            "otros": signo * otros,
            "rete_iva": signo * fnum(r[C_RETE_IVA]),
            "rete_renta": signo * fnum(r[C_RETE_RENTA]),
            "rete_ica": signo * fnum(r[C_RETE_ICA]),
            "total_dian": signo * total, "origen": origen, "estado": r[C_ESTADO],
        })

    wb = Workbook()
    wb.remove(wb.active)
    totales_por_hoja = {}
    for nombre in ["VENTAS", "COMPRAS", "NOMINA", "DOCUMENTO SOPORTE"]:
        fila_tot = _escribir_hoja(wb, nombre, hojas[nombre])
        totales_por_hoja[nombre] = fila_tot

    _escribir_acumulado(wb, totales_por_hoja)
    wb.save(salida_path)

    resumen["errores_xml"] = xml_err
    return resumen


def _escribir_hoja(wb, nombre, registros):
    ws = wb.create_sheet(nombre)
    for j, h in enumerate(ENCABEZADOS, start=1):
        c = ws.cell(1, j, h)
        c.font = NEGRITA
        c.fill = RELLENO_HEAD
        c.alignment = Alignment(horizontal="center", wrap_text=True)

    fila = 2
    for reg in registros:
        vals = [reg["tipo"], reg["cufe"], reg["folio"], reg["prefijo"], reg["fecha"],
                reg["nit_emi"], reg["nom_emi"], reg["nit_rec"], reg["nom_rec"], reg["forma"],
                reg["base_ex"], reg["base19"], reg["base5"], reg["iva19"], reg["iva5"]]
        for j, v in enumerate(vals, start=1):
            ws.cell(fila, j, v)
        # IVA Total, TOTAL Calculado y Diferencia como FORMULAS
        ws.cell(fila, 16, f"={COL['IVA 19%']}{fila}+{COL['IVA 5%']}{fila}")
        ws.cell(fila, 17, reg["otros"])
        ws.cell(fila, 18, reg["rete_iva"])
        ws.cell(fila, 19, reg["rete_renta"])
        ws.cell(fila, 20, reg["rete_ica"])
        ws.cell(fila, 21, (f"={COL['Base Exenta']}{fila}+{COL['Base Gravada 19%']}{fila}"
                           f"+{COL['Base Gravada 5%']}{fila}+{COL['IVA 19%']}{fila}"
                           f"+{COL['IVA 5%']}{fila}+{COL['Otros Impuestos']}{fila}"))
        ws.cell(fila, 22, reg["total_dian"])
        ws.cell(fila, 23, f"={COL['Total DIAN']}{fila}-{COL['TOTAL Calculado']}{fila}")
        ws.cell(fila, 24, reg["origen"])
        ws.cell(fila, 25, reg["estado"])
        for j in range(11, 24):
            ws.cell(fila, j).number_format = MONEDA
            ws.cell(fila, j).font = NEGRO
        fila += 1

    # Fila de totales
    ult = fila - 1
    ws.cell(fila, 10, "TOTALES").font = Font(bold=True)
    if ult >= 2:
        for j in range(11, 24):
            L = get_column_letter(j)
            t = ws.cell(fila, j, f"=SUM({L}2:{L}{ult})")
            t.number_format = MONEDA
            t.font = Font(bold=True)
            t.fill = RELLENO_TOT
    anchos = [22, 30, 9, 9, 13, 13, 26, 13, 26, 9] + [15] * 13 + [12, 22]
    for i, w in enumerate(anchos, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    return fila  # fila de totales (para referenciar desde ACUMULADO)


def _escribir_acumulado(wb, tot):
    ws = wb.create_sheet("ACUMULADO")
    ws["B2"] = "CONSOLIDACIÓN DE IVA DEL PERIODO"
    ws["B2"].font = Font(bold=True, size=13)

    def ref(hoja, col):
        return f"='{hoja}'!{COL[col]}{tot[hoja]}"

    bloques = [
        ("VENTAS", "VENTAS"),
        ("COMPRAS", "COMPRAS"),
    ]
    fila = 4
    headers = ["Concepto", "Base Exenta (No Gravado)", "Base Gravada 19%",
               "Base Gravada 5%", "IVA 19%", "IVA 5%", "IVA Total"]
    for j, h in enumerate(headers, start=2):
        c = ws.cell(fila, j, h)
        c.font = NEGRITA
        c.fill = RELLENO_HEAD
        c.alignment = Alignment(horizontal="center", wrap_text=True)
    fila += 1
    for etiqueta, hoja in bloques:
        ws.cell(fila, 2, etiqueta).font = Font(bold=True)
        ws.cell(fila, 3, ref(hoja, "Base Exenta"))
        ws.cell(fila, 4, ref(hoja, "Base Gravada 19%"))
        ws.cell(fila, 5, ref(hoja, "Base Gravada 5%"))
        ws.cell(fila, 6, ref(hoja, "IVA 19%"))
        ws.cell(fila, 7, ref(hoja, "IVA 5%"))
        ws.cell(fila, 8, ref(hoja, "IVA Total"))
        for j in range(3, 9):
            ws.cell(fila, j).number_format = MONEDA
        fila += 1

    f_ven, f_com = 5, 6
    fila += 1
    ws.cell(fila, 2, "IVA A PAGAR (Ventas - Compras)").font = Font(bold=True, size=12)
    ws.cell(fila, 8, f"=H{f_ven}-H{f_com}")
    ws.cell(fila, 8).number_format = MONEDA
    ws.cell(fila, 8).font = Font(bold=True, size=12)
    ws.cell(fila, 8).fill = PatternFill("solid", fgColor="FFF2CC")

    for i, w in enumerate([3, 32, 18, 18, 18, 16, 16, 18], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python3 consolidar_iva.py <listado.xlsx> <salida.xlsx> [xml]",
              file=sys.stderr)
        sys.exit(1)
    listado, salida = sys.argv[1], sys.argv[2]
    xmls = sys.argv[3] if len(sys.argv) > 3 else None
    res = construir(listado, salida, xmls)
    print(json.dumps(res, ensure_ascii=False, indent=2, default=str))