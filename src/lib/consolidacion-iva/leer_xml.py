#!/usr/bin/env python3
"""
Lector de XML de facturacion electronica DIAN (UBL 2.1).

A diferencia del listado del token, el XML SI trae el IVA discriminado por
tarifa. Este modulo desempaca el AttachedDocument (contenedor con la factura
embebida en CDATA) y devuelve las bases reales: exenta, gravada al 19% y al 5%.

Uso directo (debug):
    python3 leer_xml.py <archivo.xml | archivo.zip | carpeta>

Requiere: pip install lxml --break-system-packages
"""
import sys
import io
import os
import json
import zipfile
from lxml import etree

NS = {
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
}

TOTAL_TAG = {
    "Invoice": "cac:LegalMonetaryTotal",
    "CreditNote": "cac:LegalMonetaryTotal",
    "DebitNote": "cac:RequestedMonetaryTotal",
}


def _text(node, xpath):
    el = node.find(xpath, NS)
    return el.text.strip() if el is not None and el.text else None


def _num(node, xpath):
    t = _text(node, xpath)
    try:
        return float(t) if t is not None else 0.0
    except ValueError:
        return 0.0


def desempacar(root):
    """Si es AttachedDocument, devuelve la factura real embebida en el CDATA."""
    local = etree.QName(root).localname
    if local == "AttachedDocument":
        desc = root.find("cac:Attachment/cac:ExternalReference/cbc:Description", NS)
        if desc is None or not desc.text:
            raise ValueError("AttachedDocument sin documento embebido")
        inner = etree.fromstring(desc.text.encode("utf-8"))
        return inner, etree.QName(inner).localname
    return root, local


def discriminar_iva(root):
    """
    Devuelve las bases reales del documento, separando IVA 19% / 5% / exento.
    base_exenta se calcula como (subtotal de lineas) - base_19 - base_5, asi
    captura todo lo que no genero IVA aunque no venga como subtotal al 0%.
    """
    root, tipo = desempacar(root)
    total_tag = TOTAL_TAG.get(tipo, "cac:LegalMonetaryTotal")

    base_19 = iva_19 = base_5 = iva_5 = otros_impuestos = 0.0
    for sub in root.findall("cac:TaxTotal/cac:TaxSubtotal", NS):
        nombre = (_text(sub, "cac:TaxCategory/cac:TaxScheme/cbc:Name") or "").upper()
        esquema_id = _text(sub, "cac:TaxCategory/cac:TaxScheme/cbc:ID") or ""
        pct = _num(sub, "cac:TaxCategory/cbc:Percent")
        base = _num(sub, "cbc:TaxableAmount")
        valor = _num(sub, "cbc:TaxAmount")
        es_iva = ("IVA" in nombre) or (esquema_id == "01")
        if es_iva and abs(pct - 19) < 0.5:
            base_19 += base
            iva_19 += valor
        elif es_iva and abs(pct - 5) < 0.5:
            base_5 += base
            iva_5 += valor
        elif not es_iva:
            otros_impuestos += valor  # INC, ICA, bolsas, etc.
        # IVA 0% / exento se absorbe en base_exenta via el subtotal de lineas

    subtotal = _num(root, f"{total_tag}/cbc:LineExtensionAmount")
    base_exenta = round(subtotal - base_19 - base_5, 2)

    return {
        "cufe": _text(root, "cbc:UUID"),
        "tipo": tipo,
        "base_exenta": base_exenta,
        "base_19": round(base_19, 2),
        "base_5": round(base_5, 2),
        "iva_19": round(iva_19, 2),
        "iva_5": round(iva_5, 2),
        "otros_impuestos": round(otros_impuestos, 2),
        "total": _num(root, f"{total_tag}/cbc:PayableAmount"),
    }


def cargar_xmls(ruta):
    """
    Lee uno o varios XML (archivo, carpeta o zip) y devuelve un dict
    indexado por CUFE -> discriminacion de IVA. Las fallas no abortan el lote.
    """
    indexado, errores = {}, []

    def procesar(nombre, data):
        try:
            d = discriminar_iva(etree.fromstring(data))
            if d["cufe"]:
                indexado[d["cufe"]] = d
            else:
                errores.append({"archivo": nombre, "error": "XML sin CUFE"})
        except Exception as e:
            errores.append({"archivo": nombre, "error": str(e)})

    if os.path.isdir(ruta):
        for f in os.listdir(ruta):
            if f.lower().endswith(".xml"):
                with open(os.path.join(ruta, f), "rb") as fh:
                    procesar(f, fh.read())
    elif ruta.lower().endswith(".zip"):
        with zipfile.ZipFile(ruta) as z:
            for nombre in z.namelist():
                if nombre.lower().endswith(".xml"):
                    procesar(nombre, z.read(nombre))
    elif ruta.lower().endswith(".xml"):
        with open(ruta, "rb") as fh:
            procesar(os.path.basename(ruta), fh.read())

    return indexado, errores


if __name__ == "__main__":
    if hasattr(sys.stdout, "buffer"):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    if len(sys.argv) < 2:
        print("Uso: python3 leer_xml.py <xml|zip|carpeta>", file=sys.stderr)
        sys.exit(1)
    idx, errs = cargar_xmls(sys.argv[1])
    print(json.dumps({"documentos": list(idx.values()), "errores": errs},
                     ensure_ascii=False, indent=2))