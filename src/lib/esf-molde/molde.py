#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
molde.py — Motor "ESF por molde" de CALA.

Filosofía: el sistema NO decide la estructura del ESF. La copia de la
contadora. Ella sube su ESF histórico (ya formulado) y cada mes solo
se le agrega la columna del mes nuevo.

Dos comandos:

  aprender  <esf.xlsx> <balance.json> <molde_out.json>
      Analiza el ESF SIN modificarlo. Para cada hoja con columnas de mes,
      toma la columna del mes más reciente y clasifica cada celda:
        FORMULA   → fórmula que no mira el mes anterior (estructura)
        CADENA    → fórmula que referencia la columna del mes anterior
        BALANCE   → número duro que cruza con el balance (regla aprendida)
        CONSTANTE → número duro igual en los meses anteriores (capital, etc.)
        MANUAL    → número duro que no cruza con nada (criterio de ella)
      Imprime por stdout un JSON con el molde y el reporte de cruce.

  extender  <esf.xlsx> <molde.json> <balance_nuevo.json> <salida.xlsx>
      Inserta la columna del mes nuevo en cada hoja (corriendo TODAS las
      referencias cruzadas entre hojas), clona fórmulas y estilos, escribe
      los valores BALANCE desde el balance nuevo, arrastra CONSTANTE/MANUAL,
      inserta filas para terceros nuevos, y escribe salida.xlsx.
      Imprime por stdout un JSON con el reporte de revisión.

El balance.json lo produce balanceAJson.ts (usa el parser existente).
Dependencias: openpyxl.
"""
import sys, json, re, copy, unicodedata, zipfile, shutil, os, tempfile
from collections import defaultdict, Counter
from itertools import combinations

import openpyxl
from openpyxl.utils import get_column_letter, column_index_from_string
from openpyxl.formula.tokenizer import Tokenizer, Token

# ─────────────────────────────────────────────────────────────────────────
# Constantes
# ─────────────────────────────────────────────────────────────────────────
MESES = {
    'ene': 1, 'enero': 1, 'feb': 2, 'febrero': 2, 'mar': 3, 'marzo': 3,
    'abr': 4, 'abril': 4, 'may': 5, 'mayo': 5, 'jun': 6, 'junio': 6,
    'jul': 7, 'julio': 7, 'ago': 8, 'agos': 8, 'agosto': 8,
    'sep': 9, 'sept': 9, 'septiembre': 9, 'oct': 10, 'octubre': 10,
    'nov': 11, 'noviembre': 11, 'dic': 12, 'diciembre': 12,
}
ABREV = {1: 'ENE', 2: 'FEB', 3: 'MAR', 4: 'ABR', 5: 'MAY', 6: 'JUN',
         7: 'JUL', 8: 'AGO', 9: 'SEP', 10: 'OCT', 11: 'NOV', 12: 'DIC'}
TOL = 1.0            # tolerancia en pesos para cruzar valores
MAX_FILAS = 6000     # tope de filas a escanear por hoja (hay hojas con 1M de filas formateadas)
MAX_HEADER = 12      # filas donde se buscan encabezados de mes/año


def norm(s):
    if s is None:
        return ''
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().lower()


def es_formula(v):
    return isinstance(v, str) and v.startswith('=')


def es_numero(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# ─────────────────────────────────────────────────────────────────────────
# Balance: índice de cuentas y terceros
# ─────────────────────────────────────────────────────────────────────────
class Balance:
    def __init__(self, data):
        self.meta = {k: data.get(k) for k in ('empresa', 'nit', 'periodo', 'mes', 'anio', 'formato')}
        self.sf = defaultdict(float)      # codigo → saldo final (suma de filas con ese código, sin terceros)
        self.mov = defaultdict(float)     # codigo → movimiento neto (debito - credito) del mes
        self.nombre = {}                  # codigo → nombre de cuenta
        self.terceros = defaultdict(dict) # codigo(auxiliar) → {nit: {'nombre','sf','mov'}}
        self.codigos_tercero_por_nit = defaultdict(set)
        for c in data['cuentas']:
            cod = str(c['codigo'])
            sf = float(c.get('saldoFinal') or 0)
            mv = float(c.get('movDebito') or 0) - float(c.get('movCredito') or 0)
            nit = (c.get('nit') or '').strip()
            if c['nivel'] in ('Auxiliar', 'Subauxiliar') and nit:
                t = self.terceros[cod].setdefault(nit, {'nombre': c.get('tercero') or '', 'sf': 0.0, 'mov': 0.0})
                t['sf'] += sf
                t['mov'] += mv
                self.codigos_tercero_por_nit[nit].add(cod)
                # el auxiliar agregado (suma de sus terceros) también es un código consultable
                self.sf[cod] += sf
                self.mov[cod] += mv
                self.nombre.setdefault(cod, c.get('nombre') or '')
            else:
                self.sf[cod] += sf
                self.mov[cod] += mv
                self.nombre[cod] = c.get('nombre') or ''
        # índices por valor (clave = pesos enteros; la verificación fina usa TOL)
        self.por_valor_sf = defaultdict(list)
        self.por_valor_mov = defaultdict(list)
        for cod, v in self.sf.items():
            if abs(v) > 0.004:
                self.por_valor_sf[int(round(abs(v)))].append(cod)
        for cod, v in self.mov.items():
            if abs(v) > 0.004:
                self.por_valor_mov[int(round(abs(v)))].append(cod)
        self.terceros_por_valor = defaultdict(list)
        self.terceros_por_valor_mov = defaultdict(list)
        for cod, d in self.terceros.items():
            for nit, t in d.items():
                if abs(t['sf']) > 0.004:
                    self.terceros_por_valor[int(round(abs(t['sf'])))].append((cod, nit))
                if abs(t['mov']) > 0.004:
                    self.terceros_por_valor_mov[int(round(abs(t['mov'])))].append((cod, nit))

    # ── consultas ──
    def valor(self, regla):
        """Evalúa una regla aprendida contra este balance. Devuelve (valor, encontrado)."""
        tipo = regla['tipo']
        campo = regla.get('campo', 'sf')
        signo = regla.get('signo', 1)
        src = self.sf if campo == 'sf' else self.mov
        if tipo == 'cuenta':
            cod = regla['codigo']
            return signo * src.get(cod, 0.0), cod in src
        if tipo == 'suma':
            total, alguno = 0.0, False
            for cod in regla['codigos']:
                if cod in src:
                    alguno = True
                    total += src[cod]
            return signo * total, alguno
        if tipo == 'tercero':
            total, alguno = 0.0, False
            for cod in regla['codigos']:
                t = self.terceros.get(cod, {}).get(regla['nit'])
                if t:
                    alguno = True
                    total += t[campo]
            return signo * total, alguno
        if tipo == 'resto_cuentas':
            # cuenta menos las subcuentas que ya tienen su propio renglón (ej. Rete fuente = 2365 - 236575)
            base = src.get(regla['codigo'], 0.0) - sum(src.get(c, 0.0) for c in regla.get('excluir', []))
            return signo * base, regla['codigo'] in src
        if tipo == 'resto':
            # cuenta menos los terceros que ya tienen su propio renglón
            base = src.get(regla['codigo'], 0.0)
            for nit in regla['excluir_nits']:
                for cod in self.terceros:
                    if cod.startswith(regla['codigo']):
                        t = self.terceros[cod].get(nit)
                        if t:
                            base -= t[campo]
            return signo * base, regla['codigo'] in src
        return 0.0, False

    def buscar_valor(self, v, preferir_mov=False):
        """Busca qué código(s) del balance explican el valor v. Devuelve lista de reglas candidatas."""
        k = int(round(abs(v)))
        cands = []
        ordenes = [('mov', self.por_valor_mov), ('sf', self.por_valor_sf)] if preferir_mov else [('sf', self.por_valor_sf), ('mov', self.por_valor_mov)]
        for campo, idx in ordenes:
            for kk in (k, k - 1, k + 1):
                for cod in idx.get(kk, []):
                    src = self.sf if campo == 'sf' else self.mov
                    if abs(abs(src[cod]) - abs(v)) <= TOL:
                        signo = 1 if (src[cod] >= 0) == (v >= 0) else -1
                        cands.append({'tipo': 'cuenta', 'codigo': cod, 'campo': campo, 'signo': signo})
            if cands:
                break
        return cands

    def buscar_tercero(self, v, etiqueta='', preferir_mov=False):
        k = int(round(abs(v)))
        orden = [('mov', self.terceros_por_valor_mov), ('sf', self.terceros_por_valor)] if preferir_mov \
            else [('sf', self.terceros_por_valor), ('mov', self.terceros_por_valor_mov)]
        for campo, idx in orden:
            cands = []
            for kk in (k, k - 1, k + 1):
                for cod, nit in idx.get(kk, []):
                    t = self.terceros[cod][nit]
                    if abs(abs(t[campo]) - abs(v)) <= TOL:
                        signo = 1 if (t[campo] >= 0) == (v >= 0) else -1
                        cands.append({'tipo': 'tercero', 'codigos': [cod], 'nit': nit, 'campo': campo,
                                      'signo': signo, 'nombre': t['nombre'], 'score': similitud(etiqueta, t['nombre'])})
            if cands:
                cands.sort(key=lambda c: -c['score'])
                return cands
            if not preferir_mov:
                break      # en hojas de balance no se aceptan cruces por movimiento de un tercero
        return []

    def buscar_suma(self, v, max_items=3):
        """Combinaciones de 2-3 cuentas del mismo grupo (2 dígitos) o misma clase a nivel cuenta (4 díg)."""
        res = []
        for campo, src in (('sf', self.sf),):
            # candidatos: cuentas de 4 y 6 dígitos con saldo
            por_grupo = defaultdict(list)
            for cod, val in src.items():
                if len(cod) in (4, 6, 8) and abs(val) > 0.004:
                    por_grupo[(cod[:2], len(cod))].append(cod)
            for (grp, ln), cods in por_grupo.items():
                if len(cods) > 60:
                    continue
                for n in (2, 3):
                    if n > max_items:
                        break
                    for combo in combinations(cods, n):
                        s = sum(src[c] for c in combo)
                        if abs(abs(s) - abs(v)) <= TOL:
                            signo = 1 if (s >= 0) == (v >= 0) else -1
                            res.append({'tipo': 'suma', 'codigos': list(combo), 'campo': campo, 'signo': signo})
                    if res:
                        break
                if res:
                    break
        return res

    def terceros_bajo(self, codigo):
        """Todos los terceros cuyo código auxiliar empieza por `codigo` (str o lista de prefijos):
        {nit: {'nombre','sf','mov','codigos':[...]}}."""
        prefijos = [codigo] if isinstance(codigo, str) else list(codigo)
        out = {}
        for cod, d in self.terceros.items():
            if any(cod.startswith(pf) for pf in prefijos):
                for nit, t in d.items():
                    o = out.setdefault(nit, {'nombre': t['nombre'], 'sf': 0.0, 'mov': 0.0, 'codigos': []})
                    o['sf'] += t['sf']
                    o['mov'] += t['mov']
                    o['codigos'].append(cod)
        return out


STOP_NOMBRE = {'de', 'del', 'la', 'las', 'el', 'los', 'y', 'a', 'al', 'en', 'por', 'para', 'o', 'u', 'e'}


ABREV_NOMBRE = {'sueldo': 'salario', 'sueldos': 'salario', 'salarios': 'salario', 'imp': 'impuesto', 'imptos': 'impuesto', 'prov': 'provision', 'gtos': 'gasto', 'gto': 'gasto',
                'cxp': 'pagar', 'cxc': 'cobrar', 'admon': 'administracion', 'adm': 'administracion',
                'dep': 'depreciacion', 'amort': 'amortizacion', 'int': 'interes', 'fin': 'financiero'}
CALIFICADORES = {'menos', 'mas', 'mas/menos', 'total'}


def _tokens_nombre(s):
    t = re.sub(r'\([^)]*\)', ' ', norm(s))          # '(menos) Impuesto de renta' -> 'impuesto de renta'
    t = re.sub(r'[^a-z0-9 ]', ' ', t)
    out = []
    for w in t.split():
        w = ABREV_NOMBRE.get(w, w)
        if w in STOP_NOMBRE or w in CALIFICADORES or len(w) < 2:
            continue
        if len(w) > 4 and w.endswith('es'):
            w = w[:-2]
        elif len(w) > 3 and w.endswith('s'):
            w = w[:-1]
        out.append(w)
    return out


def similitud_cuenta(etiqueta, nombre_cuenta):
    """Qué tanto se parece el renglón de la contadora al nombre de una cuenta del balance (0..1).
    Tolera tildes, plurales, abreviaturas ('Trab' ~ 'trabajadores') y prefijos tipo 'Honorarios - '."""
    import difflib
    a = re.sub(r'\([^)]*\)', ' ', norm(etiqueta)).strip()
    a = ' '.join(ABREV_NOMBRE.get(w, w) for w in re.sub(r'[^a-z0-9 ]', ' ', a).split())
    b = norm(nombre_cuenta)
    cand_b = [b] + ([b.split(' - ', 1)[1]] if ' - ' in b else [])
    mejor = 0.0
    ta = _tokens_nombre(a)
    for bb in cand_b:
        r = difflib.SequenceMatcher(None, a, bb).ratio()
        tb = _tokens_nombre(bb)
        if ta and tb:
            hits = 0
            for x in ta:
                if any(x == y or (len(x) >= 4 and (y.startswith(x) or x.startswith(y))) or
                       difflib.SequenceMatcher(None, x, y).ratio() >= 0.85 for y in tb):
                    hits += 1
            cont = hits / len(ta)
            cubre_b = sum(1 for y in tb if any(x == y or (len(x) >= 4 and (y.startswith(x) or x.startswith(y))) or
                                                  difflib.SequenceMatcher(None, x, y).ratio() >= 0.85 for x in ta)) / len(tb)
            r = max(r, min(cont, 0.5 + 0.5 * cubre_b) if len(ta) >= 1 else 0)
        mejor = max(mejor, r)
    return mejor


def contenido_nombre(etiqueta, nombre_cuenta):
    """Fracción de palabras del renglón que aparecen en el nombre de la cuenta, y cuántas palabras tiene."""
    import difflib
    ta = _tokens_nombre(etiqueta)
    tb = _tokens_nombre(nombre_cuenta)
    if not ta or not tb:
        return 0.0, len(ta)
    hits = sum(1 for x in ta if any(x == y or (len(x) >= 4 and (y.startswith(x) or x.startswith(y))) or
                                    difflib.SequenceMatcher(None, x, y).ratio() >= 0.85 for y in tb))
    return hits / len(ta), len(ta)


def cuenta_cercana_por_nombre(bal, v, etiqueta, clases, es_eri, usados):
    """Cuenta del balance con el MISMO nombre que el renglón y un valor casi igual (diferencias de
    centavos/pesos por redondeo o un ajuste viejo). Devuelve (regla, diferencia) o None."""
    if not etiqueta or not es_numero(v) or abs(v) < 1000:
        return None
    src = bal.mov if es_eri else bal.sf
    tol = min(max(10.0, abs(v) * 0.001), 50000.0)
    mejor = None
    for cod, x in src.items():
        if cod[:1] not in clases or len(cod) < 4 or abs(x) < TOL:
            continue
        dif = abs(abs(x) - abs(v))
        if dif > tol:
            continue
        nom = bal.nombre.get(cod, '')
        sc = similitud_cuenta(etiqueta, nom)
        cont_, n_ = contenido_nombre(etiqueta, nom)
        if sc < 0.75 and not (cont_ >= 1.0 and n_ >= 1):
            continue
        clave = (cod in usados, dif, len(cod) != 6, -len(cod))
        if mejor is None or clave < mejor[0]:
            mejor = (clave, cod, dif, x)
    if not mejor:
        return None
    _, cod, dif, x = mejor
    if cod in usados:
        return None
    signo = 1 if (x >= 0) == (v >= 0) else -1
    return {'tipo': 'cuenta', 'codigo': cod, 'campo': 'mov' if es_eri else 'sf', 'signo': signo}, dif


ENLACE_RE = re.compile(r"^=\+?'?([^'!]+)'?!\$?([A-Z]{1,3})\$?(\d+)$", re.I)


def enlace_de_fila(ws, r, col):
    """Si en OTROS meses el renglón trae el valor de otra hoja (ej. =+'NOTAS ERI'!H114) y en este
    mes la contadora dejó un 0 escrito, se recuerda la hoja para enlazar el mes nuevo."""
    vistos = Counter()
    for c in range(1, min(ws.max_column, 80) + 1):
        if c == col:
            continue
        v = ws.cell(r, c).value
        if isinstance(v, str):
            m = ENLACE_RE.match(v.strip())
            if m and m.group(1) != ws.title:
                vistos[m.group(1)] += 1
    return vistos.most_common(1)[0][0] if vistos else None


def cuentas_con_valor(bal):
    """Subcuentas (6 dígitos) con valor en el balance del mes. Si un renglón por nombre estaba vacío
    aunque su cuenta SÍ tenía valor, la contadora lleva ese valor en otro lado: no se llena solo."""
    return {'mov': sorted(c for c, v in bal.mov.items() if len(c) in (4, 6) and abs(v) > TOL),
            'sf': sorted(c for c, v in bal.sf.items() if len(c) in (4, 6) and abs(v) > TOL)}


def padres_de_filas(ws, col, max_fila):
    """Para cada fila de la columna, la fila-encabezado (más cercana arriba) cuya fórmula la suma.
    Ej. HONORARIOS '=+C466+C467+C465' es padre de 465..467; DIVERSOS '=SUM(C543:C558)' de 543..558."""
    letra = get_column_letter(col)
    padre = {}
    abajo = {}
    for r in range(1, max_fila + 1):
        v = ws.cell(r, col).value
        if not es_formula(v):
            continue
        try:
            toks = Tokenizer(v).items
        except Exception:
            continue
        hijos = set()
        for t in toks:
            if t.type == Token.OPERAND and t.subtype == Token.RANGE and '!' not in t.value:
                partes = t.value.replace('$', '').split(':')
                ms = [REF_RE.match(x) for x in partes]
                if not all(ms) or any(m.group(2).upper() != letra for m in ms):
                    continue
                a = int(ms[0].group(4)); b = int(ms[-1].group(4))
                for rr in range(min(a, b), max(a, b) + 1):
                    if rr != r:
                        hijos.add(rr)
        for h in hijos:
            if h > r:                                   # padre arriba (encabezado de sección)
                if h not in padre or padre[h] > h or padre[h] < r:
                    padre[h] = r
            elif h not in padre:                        # padre abajo (total al pie), solo si no tiene otro
                abajo.setdefault(h, r)
    for h, r in abajo.items():
        padre.setdefault(h, r)
    return padre


def es_nit(v):
    if es_numero(v):
        return float(v).is_integer() and 10_000 <= abs(v) < 10**15
    if isinstance(v, str):
        t = re.sub(r'[\s.\-]', '', v)
        return t.isdigit() and 5 <= len(t) <= 15
    return False


def nit_texto(v):
    if es_numero(v):
        return str(int(v))
    return re.sub(r'[\s.\-]', '', str(v))


def similitud(a, b):
    """Similitud simple entre nombres (tokens en común). 0..1"""
    ta = set(t for t in norm(a).replace('.', ' ').split() if len(t) > 1 and t not in ('sas', 's', 'a', 'de', 'y', 'la', 'el', 'ltda'))
    tb = set(t for t in norm(b).replace('.', ' ').split() if len(t) > 1 and t not in ('sas', 's', 'a', 'de', 'y', 'la', 'el', 'ltda'))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))


# ─────────────────────────────────────────────────────────────────────────
# Optimización del archivo: hojas con cientos de miles de filas VACÍAS con
# formato (p.ej. una hoja oculta de 62 MB) hacen que openpyxl tarde minutos.
# Se quitan las filas sin ningún valor/fórmula de las hojas gigantes.
# ─────────────────────────────────────────────────────────────────────────
ROW_RE_XML = re.compile(rb'<row\b[^>]*?(?:/>|>.*?</row>)', re.S)
# celda vacía (solo estilo) en columna de 3 letras (AAA en adelante = col 703+): nunca hay datos ahí
CELDA_VACIA_LEJANA_RE = re.compile(rb'<c r="[A-Z]{3}\d+"(?: [^>]*?)?/>')


def _fila_vacia(m):
    s = m.group(0)
    return b'<v>' not in s and b'<f' not in s and b'<is>' not in s


def optimizar_styles(data, umbral_estilos=2000):
    """
    Excel acumula miles de estilos con nombre ("20% - Énfasis1 10 2 2 2 2") al copiar hojas
    entre libros. openpyxl crea un objeto por cada uno y se come la RAM. Se conservan solo
    los cellStyleXfs/cellStyles referenciados por las celdas (xfId) y se renumeran.
    """
    m_csx = re.search(rb'<cellStyleXfs count="(\d+)">(.*?)</cellStyleXfs>', data, re.S)
    m_cs = re.search(rb'<cellStyles count="(\d+)">(.*?)</cellStyles>', data, re.S)
    m_cx = re.search(rb'<cellXfs count="(\d+)">(.*?)</cellXfs>', data, re.S)
    if not (m_csx and m_cs and m_cx) or int(m_csx.group(1)) < umbral_estilos:
        return data
    xfs = re.findall(rb'<xf\b[^>]*?(?:/>|>.*?</xf>)', m_csx.group(2), re.S)
    usados = {0} | {int(x) for x in re.findall(rb'xfId="(\d+)"', m_cx.group(2))}
    usados = sorted(i for i in usados if i < len(xfs))
    nuevo_idx = {old: new for new, old in enumerate(usados)}
    nuevos_xfs = b''.join(xfs[i] for i in usados)
    estilos = re.findall(rb'<cellStyle\b[^>]*?(?:/>|>.*?</cellStyle>)', m_cs.group(2), re.S)
    nuevos_estilos = []
    vistos = set()
    for e in estilos:
        mm = re.search(rb'xfId="(\d+)"', e)
        if not mm:
            continue
        old = int(mm.group(1))
        if old in nuevo_idx and old not in vistos:
            vistos.add(old)
            nuevos_estilos.append(re.sub(rb'xfId="\d+"', b'xfId="%d"' % nuevo_idx[old], e, count=1))
    cellxfs = re.sub(rb'xfId="(\d+)"', lambda mm: b'xfId="%d"' % nuevo_idx.get(int(mm.group(1)), 0), m_cx.group(2))
    data = (data[:m_csx.start()] + b'<cellStyleXfs count="%d">' % len(usados) + nuevos_xfs + b'</cellStyleXfs>' + data[m_csx.end():])
    # recalcular posiciones tras el primer reemplazo
    m_cx = re.search(rb'<cellXfs count="(\d+)">(.*?)</cellXfs>', data, re.S)
    data = data[:m_cx.start()] + b'<cellXfs count="%s">' % m_cx.group(1) + cellxfs + b'</cellXfs>' + data[m_cx.end():]
    m_cs = re.search(rb'<cellStyles count="(\d+)">(.*?)</cellStyles>', data, re.S)
    data = data[:m_cs.start()] + b'<cellStyles count="%d">' % len(nuevos_estilos) + b''.join(nuevos_estilos) + b'</cellStyles>' + data[m_cs.end():]
    return data


MERGE_RE_XML = re.compile(rb'<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"')
ROW_NUM_RE_XML = re.compile(rb'<row r="(\d+)"')


def recortar_merges(data, max_area=50_000):
    """
    Rangos combinados gigantes (una columna separadora combinada de la fila 1 a la 1.048.576)
    hacen que openpyxl cree un millón de celdas por cada uno. Se recortan a la última fila
    con datos de la hoja. Solo afecta merges con área > max_area.
    """
    filas = [int(x) for x in ROW_NUM_RE_XML.findall(data)]
    ultima = max(filas) if filas else 1
    def fix(m):
        c1, r1, c2, r2 = m.group(1), int(m.group(2)), m.group(3), int(m.group(4))
        area = (r2 - r1 + 1) * (column_index_from_string(c2.decode()) - column_index_from_string(c1.decode()) + 1)
        if area <= max_area:
            return m.group(0)
        r2n = max(r1, min(r2, ultima))
        if r2n == r1 and c1 == c2:
            r2n = r1 + 1        # merge mínimo de 2 celdas para no dejar un rango inválido
        return b'<mergeCell ref="%s%d:%s%d"' % (c1, r1, c2, r2n)
    return MERGE_RE_XML.sub(fix, data)


def optimizar_xlsx(src, dst, umbral=3_000_000):
    """
    Copia src → dst aligerando las hojas cuyo XML pese más de `umbral` bytes:
      - quita filas sin ningún valor/fórmula (hojas con 1M de filas formateadas), y
      - quita celdas vacías con solo formato en columnas lejanas (AAA en adelante),
        que algunas hojas arrastran por miles en cada fila.
    Sin esto openpyxl puede necesitar varios GB de RAM.
    """
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.startswith('xl/worksheets/sheet') and item.filename.endswith('.xml'):
                if len(data) > umbral:
                    data = ROW_RE_XML.sub(lambda m: b'' if _fila_vacia(m) else m.group(0), data)
                    data = CELDA_VACIA_LEJANA_RE.sub(b'', data)
                if b'<mergeCell ' in data:
                    data = recortar_merges(data)
            elif item.filename == 'xl/styles.xml':
                data = optimizar_styles(data)
            zout.writestr(item, data)


class Valores:
    """Valores cacheados (resultado de fórmulas) leídos en modo read_only, solo hasta MAX_FILAS."""
    def __init__(self, path, hojas):
        self.v = {}
        wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        for nombre in hojas:
            if nombre not in wb.sheetnames:
                continue
            ws = wb[nombre]
            d = {}
            for r, fila in enumerate(ws.iter_rows(min_row=1, max_row=MAX_FILAS, values_only=True), start=1):
                for c, val in enumerate(fila, start=1):
                    if val is not None:
                        d[(r, c)] = val
            self.v[nombre] = d
        wb.close()

    def get(self, hoja, r, c):
        return self.v.get(hoja, {}).get((r, c))


def constantes_sueltas(formula):
    """
    Números 'sueltos' dentro de una fórmula: sumandos/restandos literales, p.ej.
    =28614668+200000-4276000 → [28614668, 200000, 4276000]; =-((C7/5)/12)+D8-3 → [3].
    Devuelve lista de (indice_token, valor_float, signo_previo).
    """
    try:
        toks = Tokenizer(formula).items
    except Exception:
        return []
    out = []
    for i, t in enumerate(toks):
        if t.type == Token.OPERAND and t.subtype == Token.NUMBER:
            prev = toks[i - 1] if i > 0 else None
            nxt = toks[i + 1] if i + 1 < len(toks) else None
            prev_ok = prev is None or (prev.type in (Token.OP_IN, Token.OP_PRE) and prev.value in ('+', '-'))
            nxt_ok = nxt is None or (nxt.type == Token.OP_IN and nxt.value in ('+', '-')) or nxt.type == Token.PAREN
            if prev_ok and nxt_ok:
                try:
                    val = float(t.value)
                except ValueError:
                    continue
                signo = -1 if (prev is not None and prev.value == '-') else 1
                out.append((i, val, signo))
    return out


def formula_con_placeholder(formula, idx):
    toks = Tokenizer(formula).items
    partes = ['=']
    for i, t in enumerate(toks):
        partes.append('{V}' if i == idx else t.value)
    return ''.join(partes)


# ─────────────────────────────────────────────────────────────────────────
# Detección de columnas de período en cada hoja
# ─────────────────────────────────────────────────────────────────────────
FECHA_RE = re.compile(r'^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$')
FECHA_ISO_RE = re.compile(r'^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})$')


def parse_fecha(v):
    """Reconoce un encabezado-fecha ('31.12.2025', '31/12/2025', '2025-12-31') o un datetime.
    Devuelve (anio, mes, dia) o None. No confunde un anio suelto (2025) con una fecha."""
    import datetime as _dt
    if isinstance(v, (_dt.datetime, _dt.date)):
        return (v.year, v.month, v.day)
    if not isinstance(v, str):
        return None
    t = v.strip()
    m = FECHA_ISO_RE.match(t)
    if m:
        y, mes, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = FECHA_RE.match(t)
        if not m:
            return None
        d, mes, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
    if not (1 <= mes <= 12 and 1 <= d <= 31 and 1990 <= y <= 2100):
        return None
    return (y, mes, d)


def _ultimo_dia(anio, mes):
    import calendar
    return calendar.monthrange(anio, mes)[1]


def fecha_como(plantilla, anio, mes, dia=None):
    """Escribe (anio, mes) imitando una fecha de plantilla: '30.11.2025' -> '31.12.2025',
    '01.11.2025' -> '01.12.2025'. Si la plantilla es día 1 se usa 1; si no, el último día del mes.
    Si la plantilla es un datetime, devuelve datetime."""
    import datetime as _dt
    f = parse_fecha(plantilla)
    if dia is None:
        dia = 1 if (f and f[2] == 1) else _ultimo_dia(anio, mes)
    if isinstance(plantilla, (_dt.datetime, _dt.date)):
        return _dt.datetime(anio, mes, dia)
    t = str(plantilla).strip()
    if FECHA_ISO_RE.match(t):
        sep = re.search(r'\d{4}([./\-])', t).group(1)
        return f"{anio:04d}{sep}{mes:02d}{sep}{dia:02d}"
    m = re.match(r'^(\d{1,2})([./\-])(\d{1,2})[./\-](\d{2,4})$', t)
    sep = m.group(2) if m else '.'
    yy = f"{anio:04d}" if (not m or len(m.group(4)) == 4) else f"{anio % 100:02d}"
    return f"{dia:02d}{sep}{mes:02d}{sep}{yy}"


NOMBRE_MES = {1: 'ENERO', 2: 'FEBRERO', 3: 'MARZO', 4: 'ABRIL', 5: 'MAYO', 6: 'JUNIO', 7: 'JULIO',
              8: 'AGOSTO', 9: 'SEPTIEMBRE', 10: 'OCTUBRE', 11: 'NOVIEMBRE', 12: 'DICIEMBRE'}


MES_ANIO_RE = re.compile(r'^([a-z]+)[\s\-/.]*(\d{2}|\d{4})$')


def texto_mes(mes, ejemplo, anio=None):
    """Escribe el mes nuevo con el mismo estilo del encabezado de ejemplo ('ABR', 'AGOSTO', 'Agosto', 'AGO-26')."""
    ej = str(ejemplo or '').strip()
    mm = MES_ANIO_RE.match(norm(ej))
    if mm and anio is not None:
        sep = re.sub(r'[a-zA-Z0-9]', '', ej).strip() or ''
        sep = sep if sep else ''
        m_sep = re.search(r'[A-Za-z]+([\s\-/.]*)\d', ej)
        sep = m_sep.group(1) if m_sep else ''
        yy = str(anio) if len(mm.group(2)) == 4 else str(anio)[-2:]
        base = ABREV[mes] if len(mm.group(1)) <= 4 else NOMBRE_MES[mes]
        if ej[:1].islower():
            base = base.lower()
        elif ej[:1].isupper() and ej[1:2].islower():
            base = base.capitalize()
        return f"{base}{sep}{yy}"
    completo = norm(ej) in NOMBRE_MES.get(MESES.get(norm(ej), 0), '').lower() and len(norm(ej)) > 4
    txt = NOMBRE_MES[mes] if completo else ABREV[mes]
    if ej and ej == ej.lower():
        return txt.lower()
    if ej and ej == ej.capitalize():
        return txt.capitalize()
    return txt


def detectar_periodos(ws, getval=None):
    """
    Detecta las columnas de período de una hoja. Devuelve dict o None:
      col_actual   → columna del mes más reciente CON DATOS (no el último encabezado:
                     algunas contadoras dejan creadas las columnas de todo el año)
      periodos     → [(col, anio, mes)] todas las columnas con encabezado de mes
      placeholders → {(anio, mes): col} columnas con encabezado pero sin datos
      fila_mes, fila_anio, col_anio, anio, mes, orden, grupo_cols, formato_mes
    getval(r, c) → valor cacheado (resultado de fórmula) para medir si la columna tiene datos.
    """
    anios = []   # (fila, col, anio)
    meses = []   # (fila, col, mes)
    anio_emb = {}  # (fila, col) → año embebido en el encabezado ("AGO-26")
    fechas = defaultdict(dict)   # col → {fila: (anio, mes, dia)}  (encabezados tipo 31.12.2025)
    max_r = min(ws.max_row, MAX_HEADER)
    max_c = min(ws.max_column, 80)
    for r in range(1, max_r + 1):
        for c in range(1, max_c + 1):
            v = ws.cell(r, c).value
            if v is None or es_formula(v):
                continue
            f = parse_fecha(v)
            if f:
                fechas[c][r] = f
                continue
            if es_numero(v) and 2000 <= v <= 2100 and float(v).is_integer():
                anios.append((r, c, int(v)))
            elif isinstance(v, str):
                t = norm(v)
                if re.fullmatch(r'(19|20)\d{2}', t):
                    anios.append((r, c, int(t)))
                elif t in MESES:
                    meses.append((r, c, MESES[t]))
                else:
                    mm = MES_ANIO_RE.match(t)
                    if mm and mm.group(1) in MESES:
                        yy = int(mm.group(2))
                        meses.append((r, c, MESES[mm.group(1)]))
                        anio_emb[(r, c)] = yy if yy > 1900 else 2000 + yy
    # ── encabezados con fecha: ESF ('31.12.2025') o ERI (rango desde/hasta en dos filas) ──
    acumuladas = set()      # columnas cuyo rango abarca varios meses (no son un mes puntual)
    fila_fecha = None
    if fechas and len(fechas) >= max(3, len(meses)):
        # fila donde se escribe el período = la fila-fecha más baja (la de 'hasta' en un rango)
        filas_fecha = sorted({r for col in fechas.values() for r in col})
        fila_fecha = filas_fecha[-1]
        for c, porfila in fechas.items():
            ff = sorted(porfila.values())           # por fecha ascendente
            ini, fin = ff[0], ff[-1]
            meses.append((fila_fecha, c, fin[1]))
            anio_emb[(fila_fecha, c)] = fin[0]
            if (ini[0], ini[1]) != (fin[0], fin[1]):   # el rango cruza de mes → acumulada
                acumuladas.add(c)
    if not meses:
        return None
    por_fila = defaultdict(list)
    for r, c, m in meses:
        por_fila[r].append((c, m))
    fila_mes = max(por_fila, key=lambda r: len(por_fila[r]))
    cols = sorted(por_fila[fila_mes])
    # año de cada columna: la celda de año (en una fila de arriba) con col <= c más cercana
    periodos = []
    anios_arriba = [(r, c, a) for r, c, a in anios if r < fila_mes]
    fuente_anio = {}     # col → columna de la celda de año que se usó (para saber si es propia del grupo)
    for c, m in cols:
        if (fila_mes, c) in anio_emb:
            periodos.append([c, anio_emb[(fila_mes, c)], m])
            fuente_anio[c] = None          # año escrito en la misma celda/fecha: no se corrige
            continue
        cand = [(cc, a, r) for r, cc, a in anios_arriba if cc <= c]
        if cand:
            cand.sort(key=lambda x: (-x[0], -x[2]))
            a = cand[0][1]
            fuente_anio[c] = cand[0][0]
        else:
            a = None
        periodos.append([c, a, m])
    ult = None
    for i, (c, a, m) in enumerate(periodos):
        if a is None and ult is not None:
            periodos[i][1] = ult
        if periodos[i][1] is not None:
            ult = periodos[i][1]
    periodos = [p for p in periodos if p[1] is not None and p[0] not in acumuladas]
    if not periodos:
        return None
    key = lambda p: p[1] * 100 + p[2]

    # orden: ¿los meses bajan hacia la derecha (reciente a la izquierda) o suben?
    bajan = sum(1 for i in range(1, len(periodos)) if key(periodos[i]) < key(periodos[i - 1]))
    suben = sum(1 for i in range(1, len(periodos)) if key(periodos[i]) > key(periodos[i - 1]))
    orden = 'reciente_izquierda' if bajan >= suben else 'reciente_derecha'

    # corregir años fuera de secuencia (un grupo sin encabezado de año hereda el año equivocado).
    # No se tocan los años explícitos: fecha completa (31.08.2026) o año escrito dentro del propio grupo.
    grupo_de = {}
    _g = []
    for pp in periodos:
        if _g and pp[0] - _g[-1][0] <= 1:
            _g.append(pp)
        else:
            _g = [pp]
        grupo_de[pp[0]] = _g
    def _propio(col_):
        f_ = fuente_anio.get(col_, 0)
        if f_ is None:
            return True
        g_ = grupo_de[col_]
        return g_[0][0] <= f_ <= g_[-1][0]
    if orden == 'reciente_izquierda':
        for i in range(1, len(periodos)):
            if _propio(periodos[i][0]):
                continue
            while key(periodos[i]) > key(periodos[i - 1]) and periodos[i][1] > 1990:
                periodos[i][1] -= 1
    else:
        for i in range(1, len(periodos)):
            if _propio(periodos[i][0]):
                continue
            while key(periodos[i]) < key(periodos[i - 1]) and periodos[i][1] < 2100:
                periodos[i][1] += 1
    # grupos de columnas contiguas (separados por una columna vacía)
    grupos_c = []
    for pp in periodos:
        if grupos_c and pp[0] - grupos_c[-1][-1][0] <= 1:
            grupos_c[-1].append(pp)
        else:
            grupos_c.append([pp])
    corregidos_anio = []
    # dos grupos con su PROPIO año escrito igual y meses que no siguen (ej. 2026 rotulado '2025'
    # a la izquierda de 'DICIEMBRE 2025'): el grupo más reciente tiene el año mal escrito → se sube
    if orden == 'reciente_izquierda' and len(grupos_c) >= 2:
        for gi in range(len(grupos_c) - 2, -1, -1):
            izq, der = grupos_c[gi], grupos_c[gi + 1]
            propio_der = any(fuente_anio.get(x[0]) is not None and der[0][0] <= fuente_anio[x[0]] <= der[-1][0] for x in der)
            propio_izq = all(fuente_anio.get(x[0]) is not None for x in izq) and \
                any(izq[0][0] <= fuente_anio[x[0]] <= izq[-1][0] for x in izq)
            if propio_der and propio_izq and key(izq[-1]) <= key(der[0]):
                antes = izq[0][1]
                while key(izq[-1]) <= key(der[0]):
                    for x in izq:
                        x[1] += 1
                corregidos_anio.append((izq[0][0], izq[-1][0], antes, izq[0][1]))
    periodos = [tuple(p) for p in periodos]

    # ¿qué columnas tienen datos? (números distintos de cero, con valores cacheados si hay)
    # Columnas con datos vs. columnas dejadas vacías para meses futuros ("placeholders"):
    #  - si en la hoja hay números TECLEADOS, una columna tiene datos si tiene alguno
    #    (los placeholders no tienen ninguno);
    #  - si la hoja es 100% fórmulas (ESF, NOTAS), se usan los valores calculados y se
    #    compara contra la mediana de las columnas no vacías.
    max_fila = min(ws.max_row, 600)
    def contar(c, duros):
        n = 0
        for r in range(fila_mes + 1, max_fila + 1):
            raw = ws.cell(r, c).value
            v = raw if duros else (getval(r, c) if getval else raw)
            if duros and es_formula(raw):
                continue
            if es_numero(v) and abs(v) > 0.004:
                n += 1
        return n
    duros = {c: contar(c, True) for c, a, m in periodos}
    if max(duros.values(), default=0) > 0:
        conteo = duros
    else:
        conteo = {c: contar(c, False) for c, a, m in periodos}
    cached = {c: contar(c, False) for c, a, m in periodos}
    positivos = sorted(v for v in cached.values() if v > 0)
    mediana = positivos[len(positivos) // 2] if positivos else 0
    umbral = max(1, 0.25 * mediana)
    # una columna tiene datos si tiene números tecleados, o si sus fórmulas dan valores a un ritmo normal
    datos = {c: (duros[c] >= 1 or cached[c] >= umbral) for c, a, m in periodos}
    con_datos = [p for p in periodos if datos[p[0]]] or periodos
    mx = max(key(p) for p in con_datos)
    info = {'fila_mes': fila_mes, 'orden': orden, 'periodos': periodos, 'datos': datos,
            'anios_arriba': anios_arriba, 'ws': ws, 'fila_fecha': fila_fecha,
            'acumuladas': sorted(acumuladas), 'corregidos_anio': corregidos_anio,
            'duros': duros}
    fijar_actual(info, mx)
    return info


def fijar_actual(info, periodo_global):
    """
    Alinea la hoja al período actual global del libro: su columna de ese período es la actual
    (aunque esté en ceros); las columnas de períodos posteriores son placeholders (meses que la
    contadora dejó creados vacíos). Si la hoja no llega a ese período, su actual es el último
    anterior con datos (y el llamador la tratará como hoja vieja).
    """
    ws = info['ws']
    periodos = info['periodos']
    key = lambda p: p[1] * 100 + p[2]
    exactas = [p for p in periodos if key(p) == periodo_global]
    if exactas:
        actual = exactas[0]
    else:
        previas = [p for p in periodos if key(p) < periodo_global and info['datos'].get(p[0])]
        actual = max(previas, key=key) if previas else max(periodos, key=key)
    col_actual, anio, mes = actual
    mx = key(actual)
    placeholders = {(a, m): c for c, a, m in periodos if key((c, a, m)) > mx}
    fila_anio = None
    col_anio = None
    for r, c, a in info['anios_arriba']:
        if a == anio and c <= col_actual:
            if col_anio is None or c > col_anio:
                fila_anio, col_anio = r, c
    grupo = sorted(p[0] for p in periodos if p[1] == anio and key(p) <= mx)
    info.update({
        'col_actual': col_actual, 'fila_anio': fila_anio, 'col_anio': col_anio,
        'anio': anio, 'mes': mes, 'grupo_cols': grupo, 'placeholders': placeholders,
        'formato_mes': str(ws.cell(info['fila_mes'], col_actual).value),
        'fila_fecha': info.get('fila_fecha'), 'acumuladas': info.get('acumuladas', []),
    })
    return info


def periodo_global(infos):
    """Período más reciente con datos en al menos 2 hojas (o en 1 si no hay más)."""
    conteo = defaultdict(set)
    for nombre, p in infos.items():
        for c, a, m in p['periodos']:
            if p['datos'].get(c):
                conteo[a * 100 + m].add(nombre)
    if not conteo:
        return max(p['anio'] * 100 + p['mes'] for p in infos.values())
    repetidos = [k for k, v in conteo.items() if len(v) >= 2]
    return max(repetidos) if repetidos else max(conteo)


# ─────────────────────────────────────────────────────────────────────────
# Manipulación de fórmulas (desplazar referencias al insertar columnas/filas)
# ─────────────────────────────────────────────────────────────────────────
REF_RE = re.compile(r'^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$')
COL_RE = re.compile(r'^(\$?)([A-Za-z]{1,3})$')
ROW_RE = re.compile(r'^(\$?)(\d+)$')


def _split_sheet(ref):
    """'Hoja'!A1:B2 → ('Hoja', 'A1:B2'); A1 → (None, 'A1')"""
    if '!' in ref:
        i = ref.rfind('!')
        hoja = ref[:i]
        if hoja.startswith("'") and hoja.endswith("'"):
            hoja = hoja[1:-1].replace("''", "'")
        return hoja, ref[i + 1:]
    return None, ref


def _shift_col(letras, abs_, ins_cols, expandir_fin=False):
    c = column_index_from_string(letras.upper())
    n = sum(1 for ic in ins_cols if c >= ic)
    return get_column_letter(c + n) if n else letras.upper()


def _shift_row(num, ins_rows):
    r = int(num)
    n = sum(k for (ir, k) in ins_rows if r >= ir)
    return str(r + n)


def desplazar_ref(ref, ins_cols, ins_rows):
    """Desplaza una referencia (sin hoja) según columnas/filas insertadas en ESA hoja."""
    if ref.startswith('#'):
        return ref
    partes = ref.split(':')
    if len(partes) == 1:
        m = REF_RE.match(ref)
        if m:
            return f"{m.group(1)}{_shift_col(m.group(2), m.group(1), ins_cols)}{m.group(3)}{_shift_row(m.group(4), ins_rows)}"
        return ref
    if len(partes) != 2:
        return ref
    a, b = partes
    ma, mb = REF_RE.match(a), REF_RE.match(b)
    if ma and mb:
        ca, cb = column_index_from_string(ma.group(2).upper()), column_index_from_string(mb.group(2).upper())
        ra, rb = int(ma.group(4)), int(mb.group(4))
        # columnas: un rango horizontal que contiene la inserción se EXPANDE (Excel) y además,
        # si la inserción cae exactamente en su inicio, también se expande (queremos que el mes
        # nuevo quede dentro del acumulado, p.ej. SUM(C8:F8) con mes nuevo en C).
        na = sum(1 for ic in ins_cols if ca >= ic)
        nb = sum(1 for ic in ins_cols if cb >= ic)
        if ca < cb or (ca == cb and ra == rb):
            # (X13:X13 = acumulado de un solo mes, el que deja el cambio de año: también se expande)
            na = sum(1 for ic in ins_cols if ca > ic)   # inicio no se corre si inserción == inicio
        # filas: igual lógica para rangos verticales
        ka = sum(k for (ir, k) in ins_rows if ra >= ir)
        kb = sum(k for (ir, k) in ins_rows if rb >= ir)
        if ra < rb:
            ka = sum(k for (ir, k) in ins_rows if ra > ir)
        return (f"{ma.group(1)}{get_column_letter(ca + na)}{ma.group(3)}{ra + ka}:"
                f"{mb.group(1)}{get_column_letter(cb + nb)}{mb.group(3)}{rb + kb}")
    # rangos de columna completa A:A o fila completa 1:1
    ca_, cb_ = COL_RE.match(a), COL_RE.match(b)
    if ca_ and cb_:
        return f"{ca_.group(1)}{_shift_col(ca_.group(2), '', ins_cols)}:{cb_.group(1)}{_shift_col(cb_.group(2), '', ins_cols)}"
    ra_, rb_ = ROW_RE.match(a), ROW_RE.match(b)
    if ra_ and rb_:
        return f"{ra_.group(1)}{_shift_row(ra_.group(2), ins_rows)}:{rb_.group(1)}{_shift_row(rb_.group(2), ins_rows)}"
    return ref


def _quote(hoja):
    if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.]*', hoja):
        return hoja
    return "'" + hoja.replace("'", "''") + "'"


def reescribir_formula(formula, hoja_actual, ins_cols_por_hoja, ins_rows_por_hoja):
    """Reescribe todas las referencias de una fórmula según inserciones por hoja."""
    if not es_formula(formula):
        return formula
    try:
        tok = Tokenizer(formula)
    except Exception:
        return formula
    out = ['=']
    for t in tok.items:
        if t.type == Token.OPERAND and t.subtype == Token.RANGE:
            hoja, ref = _split_sheet(t.value)
            if hoja is not None and '[' in hoja:      # libro externo: no tocar
                out.append(t.value)
                continue
            h = hoja if hoja is not None else hoja_actual
            ic = ins_cols_por_hoja.get(h, [])
            ir = ins_rows_por_hoja.get(h, [])
            if not ic and not ir:
                out.append(t.value)
                continue
            nuevo = desplazar_ref(ref, ic, ir)
            out.append((_quote(hoja) + '!' + nuevo) if hoja is not None else nuevo)
        else:
            out.append(t.value)
    return ''.join(out)


RE_EJERCICIO = re.compile(r'\b(resultado|resultados|utilidad|utilidades|perdida|perdidas|excedente|excedentes|ganancia)\b.*\b(ejercicio|periodo)\b')
RE_ANTERIORES = re.compile(r'\b(anterior|anteriores|acumulad[oa]s?)\b')


def cierre_de_anio(formula, fila, letra_ant, etiqueta, fila_ejercicio):
    """Primer mes del año nuevo en el balance general:
    - 'Resultado del ejercicio' = mes anterior + resultado del mes  → se reinicia (solo el resultado del mes)
    - 'Resultados de ejercicios anteriores' = mes anterior          → + resultado del ejercicio que cerró
    Devuelve (fórmula nueva, motivo) o (None, None)."""
    if not es_formula(formula) or not etiqueta:
        return None, None
    et = norm(etiqueta)
    propia = f'{letra_ant}{fila}'
    try:
        toks = [t for t in Tokenizer(formula).items if t.type != Token.WSPACE]
    except Exception:
        return None, None
    def es_propia(t):
        return t.type == Token.OPERAND and t.subtype == Token.RANGE and '!' not in t.value and t.value.replace('$', '').upper() == propia.upper()
    n_prop = sum(1 for t in toks if es_propia(t))
    if n_prop != 1:
        return None, None
    if RE_ANTERIORES.search(et):
        if fila_ejercicio and len([t for t in toks if t.type == Token.OPERAND]) == 1:
            return f"{formula}+{letra_ant}{fila_ejercicio}", 'se le suma el resultado del ejercicio que cerró'
        return None, None
    if RE_EJERCICIO.search(et):
        out = []
        i = 0
        while i < len(toks):
            t = toks[i]
            if es_propia(t):
                # quitar el operador que la acompaña
                if out and out[-1].type == Token.OP_IN and out[-1].value == '+':
                    out.pop()
                elif i + 1 < len(toks) and toks[i + 1].type == Token.OP_IN and toks[i + 1].value == '+':
                    i += 1
                elif out and out[-1].type == Token.OP_PRE:
                    out.pop()
                i += 1
                continue
            out.append(t)
            i += 1
        cuerpo = ''.join(t.value for t in out).lstrip('+')
        if not cuerpo or cuerpo == formula.lstrip('='):
            return None, None
        return '=+' + cuerpo, 'año nuevo: el resultado del ejercicio arranca de cero (ya no suma el año anterior)'
    return None, None


def normalizar_resultado(formula, fila, letra_ant, etiqueta, hojas_eri, col_mes_por_hoja):
    """Meses 2..12 en el balance general (plantillas cuyo enero quedó con la fórmula de cierre):
    - 'Resultado del ejercicio' que solo trae el resultado del mes del ERI → + mes anterior (acumulado del año)
    - 'Ejercicios anteriores' = anteriores + resultado del mes anterior (cierre) → solo el mes anterior"""
    if not es_formula(formula) or not etiqueta:
        return None, None
    et = norm(etiqueta)
    try:
        toks = [t for t in Tokenizer(formula).items if t.type != Token.WSPACE]
    except Exception:
        return None, None
    ops = [t for t in toks if t.type == Token.OPERAND and t.subtype == Token.RANGE]
    propia = f'{letra_ant}{fila}'.upper()
    tiene_propia = any('!' not in t.value and t.value.replace('$', '').upper() == propia for t in ops)
    if RE_ANTERIORES.search(et):
        if len(ops) == 2 and tiene_propia and all('!' not in t.value and REF_RE.match(t.value.replace('$', ''))
                                                  and REF_RE.match(t.value.replace('$', '')).group(2).upper() == letra_ant.upper() for t in ops) \
                and len([t for t in toks if t.type == Token.OP_IN]) == 1 and '+' in formula:
            return f'=+{letra_ant}{fila}', 'ejercicios anteriores no cambian dentro del año (el cierre ya se sumó en enero)'
        return None, None
    if RE_EJERCICIO.search(et) and not tiene_propia:
        for t in ops:
            if '!' in t.value:
                hoja, ref = _split_sheet(t.value)
                m = REF_RE.match(ref.replace('$', ''))
                if hoja in hojas_eri and m and m.group(2).upper() == col_mes_por_hoja.get(hoja, '').upper() and len(ops) == 1:
                    return f"{formula}+{letra_ant}{fila}", 'el resultado del ejercicio se acumula en el año (mes anterior + resultado del mes)'
    return None, None


SEP_POR_HOJA = {}    # columna separadora (cambio de año) por hoja, para no apuntar fórmulas a ella
SEP_HACIA = {'lado': 'viejo'}   # si una referencia cae en el separador: 'viejo' = mes del año anterior, 'nuevo' = año nuevo


def trasladar_formula(formula, hoja_actual, col_origen, col_destino, col_min_por_hoja):
    """
    Clona la fórmula de la columna origen (mes anterior) a la columna destino (mes nuevo).
    Solo desplaza las referencias RELATIVAS cuya columna está dentro del área de meses de la
    hoja referenciada (col >= col_min de esa hoja). Las referencias a columnas de etiquetas
    (A, B...) se dejan igual, como haría la contadora al copiar.
    """
    delta = col_destino - col_origen
    if not es_formula(formula):
        return formula
    try:
        tok = Tokenizer(formula)
    except Exception:
        return formula
    out = ['=']
    for t in tok.items:
        if t.type == Token.OPERAND and t.subtype == Token.RANGE:
            hoja, ref = _split_sheet(t.value)
            if hoja is not None and '[' in hoja:
                out.append(t.value)
                continue
            h = hoja if hoja is not None else hoja_actual
            col_min = col_min_por_hoja.get(h)
            if col_min is None or ref.startswith('#'):
                out.append(t.value)
                continue

            def mov(part):
                m = REF_RE.match(part)
                if not m:
                    return part
                if m.group(1) == '$':
                    return part
                c = column_index_from_string(m.group(2).upper())
                if c >= col_min and c + delta >= 1:
                    c2 = c + delta
                    if delta and SEP_POR_HOJA.get(h) == c2:
                        # caería en la columna separadora del año nuevo: es 'el mes anterior' → salta el separador
                        paso = (1 if delta > 0 else -1)
                        c2 = c2 - paso if SEP_HACIA['lado'] == 'viejo' else c2 + paso
                    return f"{get_column_letter(c2)}{m.group(3)}{m.group(4)}"
                return part
            partes = ref.split(':')
            nuevo = ':'.join(mov(p) for p in partes)
            out.append((_quote(hoja) + '!' + nuevo) if hoja is not None else nuevo)
        else:
            out.append(t.value)
    return ''.join(out)


def referencias_de(formula, hoja_actual):
    """Lista de (hoja, col, fila) referenciadas (solo celdas simples y extremos de rango)."""
    refs = []
    if not es_formula(formula):
        return refs
    try:
        tok = Tokenizer(formula)
    except Exception:
        return refs
    for t in tok.items:
        if t.type == Token.OPERAND and t.subtype == Token.RANGE:
            hoja, ref = _split_sheet(t.value)
            if hoja is not None and '[' in hoja:
                continue
            h = hoja if hoja is not None else hoja_actual
            for part in ref.split(':'):
                m = REF_RE.match(part)
                if m:
                    refs.append((h, column_index_from_string(m.group(2).upper()), int(m.group(4)), m.group(1) == '$'))
    return refs


# ─────────────────────────────────────────────────────────────────────────
# FASE A — APRENDER
# ─────────────────────────────────────────────────────────────────────────
def columna_etiqueta(ws, fila, col_actual):
    """Texto de etiqueta del renglón: primera celda con texto a la izquierda de la columna actual."""
    for c in range(1, col_actual):
        v = ws.cell(fila, c).value
        if isinstance(v, str) and v.strip() and not es_formula(v):
            return v.strip()
    return ''


def etiqueta_valor(vals, ws, fila, col_actual):
    """Etiqueta evaluada (si la etiqueta es fórmula, usa el valor cacheado)."""
    for c in range(1, col_actual):
        v = ws.cell(fila, c).value
        if v is None:
            continue
        if es_formula(v):
            vv = vals.get(ws.title, fila, c)
            if isinstance(vv, str) and vv.strip():
                return vv.strip()
        elif isinstance(v, str) and v.strip():
            return v.strip()
    return ''


def etiqueta_valor_ws(ws, fila, col_actual):
    for c in range(1, col_actual):
        v = ws.cell(fila, c).value
        if isinstance(v, str) and v.strip() and not es_formula(v):
            return v.strip()
    return ''


def detectar_bloques(ws, col_actual, max_fila):
    """Bloques = rangos verticales sumados por una fórmula SUM(Xa:Xb) en la columna actual."""
    bloques = []
    letra = get_column_letter(col_actual)
    pat = re.compile(r'(?:SUM|SUBTOTAL\(\s*9\s*,)\s*\(?\$?' + letra + r'\$?(\d+):\$?' + letra + r'\$?(\d+)\)', re.I)
    for r in range(1, max_fila + 1):
        v = ws.cell(r, col_actual).value
        if es_formula(v):
            for m in pat.finditer(v):
                a, b = int(m.group(1)), int(m.group(2))
                # el total puede estar arriba (fila 8 suma 9:40) o abajo del detalle
                if a <= b and not (a <= r <= b):
                    bloques.append({'fila_total': r, 'inicio': a, 'fin': b})
    return bloques


def cargar_optimizado(esf_path):
    """Devuelve ruta a una copia optimizada (filas vacías de hojas gigantes removidas)."""
    tmp = tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False)
    tmp.close()
    optimizar_xlsx(esf_path, tmp.name)
    return tmp.name


def aprender(esf_path, balance_path, molde_out, reglas_path=None):
    bal = Balance(json.load(open(balance_path, encoding='utf-8')))
    reglas = json.load(open(reglas_path, encoding='utf-8')) if reglas_path else {}
    esf_opt = cargar_optimizado(esf_path)
    wb = openpyxl.load_workbook(esf_opt)                       # fórmulas
    molde = {'version': 1, 'empresa': bal.meta['empresa'] or '', 'nit': bal.meta['nit'] or '',
             'periodo_base': {'anio': bal.meta['anio'], 'mes': bal.meta['mes']},
             'hojas': {}, 'hojas_omitidas': {}, 'orden_hojas': wb.sheetnames}
    reporte = {'hojas': {}, 'hojas_omitidas': {}, 'manual': [], 'constante': [], 'dudosos': [], 'sin_ubicar': [], 'resumen': {}}
    codigos_usados = set()

    # Primera pasada: períodos por hoja. Solo se aprenden las hojas que van en el
    # mes más reciente del libro; las que quedaron en años viejos no se tocan.
    candidatas = [ws.title for ws in wb.worksheets if detectar_periodos(ws)]
    if not candidatas:
        raise SystemExit('No se encontraron columnas de meses (ENE, FEB, ...) en ninguna hoja.')
    vals = Valores(esf_opt, candidatas)
    periodos_por_hoja = {}
    for ws in wb.worksheets:
        if ws.title not in candidatas:
            continue
        p = detectar_periodos(ws, getval=lambda r, c, _h=ws.title: vals.get(_h, r, c))
        if p:
            periodos_por_hoja[ws.title] = p
    periodo_max = periodo_global(periodos_por_hoja)
    # plantillas con los meses futuros ya creados con fórmulas (dan valores aunque estén 'vacías'):
    # si el libro tiene la columna del mes del balance, ese es el mes actual
    per_bal = (bal.meta['anio'] or 0) * 100 + (bal.meta['mes'] or 0)
    if bal.meta['mes'] and periodo_max > per_bal:
        con_col = [n for n, p in periodos_por_hoja.items()
                   if any(a * 100 + m == per_bal and p['datos'].get(c) for c, a, m in p['periodos'])]
        con_duros = [n for n, p in periodos_por_hoja.items()
                     if any(a * 100 + m == per_bal and p.get('duros', {}).get(c) for c, a, m in p['periodos'])]
        if con_duros or len(con_col) >= 2:
            reporte.setdefault('advertencias', []).append(
                f"La plantilla trae creadas columnas de meses posteriores a {ABREV[bal.meta['mes']]} {bal.meta['anio']} "
                f"(con fórmulas). Se tomó {ABREV[bal.meta['mes']]} {bal.meta['anio']}, el mes del balance, como mes actual; "
                f"las columnas siguientes se llenarán mes a mes.")
            periodo_max = per_bal
    for nombre, p in periodos_por_hoja.items():
        for c1, c2, antes, despues in p.get('corregidos_anio', []):
            reporte.setdefault('advertencias', []).append(
                f"{nombre}: las columnas {get_column_letter(c1)}–{get_column_letter(c2)} dicen año {antes} pero por el orden de los meses "
                f"son de {despues}; se tomaron como {despues} (corrige el año en tu plantilla).")
    for p in periodos_por_hoja.values():
        fijar_actual(p, periodo_max)
    for nombre, p in list(periodos_por_hoja.items()):
        if p['anio'] * 100 + p['mes'] != periodo_max:
            molde['hojas_omitidas'][nombre] = {'anio': p['anio'], 'mes': p['mes']}
            reporte['hojas_omitidas'][nombre] = f"va en {ABREV[p['mes']]} {p['anio']} (no se actualiza mes a mes)"
            del periodos_por_hoja[nombre]
    pm_anio, pm_mes = divmod(periodo_max, 100)
    if (pm_anio, pm_mes) != (bal.meta['anio'], bal.meta['mes']) and bal.meta['mes']:
        raise SystemExit(
            f"El ESF va en {ABREV[pm_mes]} {pm_anio} pero el balance es de {ABREV.get(bal.meta['mes'], '?')} {bal.meta['anio']}. "
            f"Para aprender el molde, el balance debe ser del MISMO mes en que va el ESF ({ABREV[pm_mes]} {pm_anio}).")
    molde['periodo_base'] = {'anio': pm_anio, 'mes': pm_mes}

    for ws in wb.worksheets:
        p = periodos_por_hoja.get(ws.title)
        if not p:
            continue
        col = p['col_actual']
        max_fila = min(ws.max_row, MAX_FILAS)
        _tit = ws.title.upper()
        _titc = _tit.replace(' ', '')
        es_eri = ('ER' in _tit.split() or _tit.startswith('ERI') or 'NOTAS ER' in _tit
                  or 'PYG' in _titc or 'PYG' in _tit.replace('&', ' ').split()
                  or 'PERDIDAS Y GANANCIAS' in _tit or 'PERDIDAS Y GANACIAS' in _tit
                  or 'ESTADO DE RESULTADO' in _tit or 'NOTAS PYG' in _tit)
        bloques = detectar_bloques(ws, col, max_fila)
        celdas = {}
        cont = defaultdict(int)
        # columnas anteriores del mismo año (para detectar constantes)
        anteriores = [c for c in p['grupo_cols'] if (c > col if p['orden'] == 'reciente_izquierda' else c < col)]
        anteriores = sorted(anteriores, key=lambda c: abs(c - col))[:3]

        for r in range(1, max_fila + 1):
            cell = ws.cell(r, col)
            v = cell.value
            if v is None or r == p['fila_mes'] or r == p['fila_anio']:
                continue
            if r < p['fila_mes'] and ((es_numero(v) and float(v).is_integer() and 2000 <= v <= 2100) or
                                      (isinstance(v, str) and re.fullmatch(r'\s*(19|20)\d{2}\s*', v))):
                continue      # año del encabezado
            etiqueta = etiqueta_valor(vals, ws, r, col)
            if es_formula(v):
                refs = referencias_de(v, ws.title)
                mira_anterior = any(h == ws.title and (cc == col + 1 if p['orden'] == 'reciente_izquierda' else cc == col - 1) for h, cc, rr, ab in refs)
                sueltas = [(i, val, sg) for i, val, sg in constantes_sueltas(v) if abs(val) >= 100]
                # ¿Alguna constante suelta ES un valor del balance? (ej. =28614668+200000-4276000)
                # → se trata como BALANCE con ajuste: el número se actualiza, el ajuste se conserva y se avisa.
                regla_emb = None
                clases_hoja_ = '4567' if es_eri else '123'
                v_calc = vals.get(ws.title, r, col)
                if sueltas and mira_anterior and not es_eri and es_numero(v_calc) and abs(v_calc) > TOL:
                    # 'mes anterior + lo del mes' cuyo resultado ES el saldo de una cuenta del balance:
                    # la contadora acumula a mano lo que el balance ya trae acumulado → se toma el saldo
                    cs_ = [x for x in bal.buscar_valor(v_calc) if x['campo'] == 'sf' and x['codigo'][:1] in clases_hoja_]
                    if cs_:
                        cs_.sort(key=lambda c: (c['codigo'] in codigos_usados, len(c['codigo']) != 6, -len(c['codigo'])))
                        regla = cs_[0]
                        celdas[r] = {'tipo': 'BALANCE', 'etiqueta': etiqueta, 'regla': regla, 'valor_base': v_calc,
                                     'formula_base': v}
                        codigos_usados.add(regla['codigo'])
                        cont['BALANCE'] += 1
                        reporte['dudosos'].append({'hoja': ws.title, 'fila': r, 'etiqueta': etiqueta, 'valor': v,
                                                   'motivo': f"la fórmula acumula a mano y su resultado es el saldo de {regla['codigo']} "
                                                             f"{bal.nombre.get(regla['codigo'], '')}; se toma el saldo del balance"})
                        continue
                if sueltas:
                    for i, val, sg in sueltas:
                        cands = bal.buscar_valor(sg * val, preferir_mov=es_eri)
                        en_clase = [c for c in cands if c['codigo'][:1] in clases_hoja_]
                        if en_clase:
                            cands = en_clase
                        if cands:
                            cands.sort(key=lambda c: (c['codigo'] in codigos_usados, len(c['codigo']) != 6, -len(c['codigo'])))
                            regla_emb = (i, cands[0])
                            break
                if regla_emb is not None:
                    i, regla = regla_emb
                    celdas[r] = {'tipo': 'BALANCE', 'etiqueta': etiqueta, 'regla': regla,
                                 'valor_base': v, 'ajuste': formula_con_placeholder(v, i), 'ajuste_idx': i,
                                 'ajuste_signo': sg}
                    codigos_usados.add(regla['codigo'])
                    cont['BALANCE'] += 1
                    reporte['manual'].append({'hoja': ws.title, 'fila': r, 'etiqueta': etiqueta, 'valor': v,
                                              'motivo': f"cruza con {regla['codigo']} pero tiene ajuste a mano; se conserva el ajuste"})
                    continue
                tipo = 'CADENA' if mira_anterior else 'FORMULA'
                celdas[r] = {'tipo': tipo, 'etiqueta': etiqueta}
                if sueltas and not re.fullmatch(r'=[+\-]?\d+(\.\d+)?', v):
                    # fórmula con número suelto adentro (ajuste a mano) → avisar
                    celdas[r]['ajuste_manual'] = v
                    reporte['manual'].append({'hoja': ws.title, 'fila': r, 'etiqueta': etiqueta, 'valor': v,
                                              'motivo': 'fórmula con ajuste manual'})
                cont[tipo] += 1
                continue
            if isinstance(v, str):
                celdas[r] = {'tipo': 'TEXTO', 'etiqueta': etiqueta, 'valor': v}
                continue
            if not es_numero(v):
                continue
            if abs(v) < 0.005:
                celdas[r] = {'tipo': 'CONSTANTE', 'etiqueta': etiqueta, 'valor': 0}
                cont['CONSTANTE'] += 1
                continue
            # ── número duro: cruzar con el balance ──
            regla = None
            cands = bal.buscar_valor(v, preferir_mov=es_eri)
            if cands:
                # preferir la clase de la hoja (en el balance general 240405 antes que el gasto 540505),
                # luego el código más específico (largo); entre iguales, el que aún no se usó
                _cl = '4567' if es_eri else '123'
                cands.sort(key=lambda c: (c['codigo'][:1] not in _cl, c['codigo'] in codigos_usados, len(c['codigo']) != 6, -len(c['codigo'])))
                regla = cands[0]
                if regla['campo'] == 'mov' and not es_eri:
                    reporte['dudosos'].append({'hoja': ws.title, 'fila': r, 'etiqueta': etiqueta, 'valor': v,
                                               'motivo': f"cruzó con el MOVIMIENTO del mes de {regla['codigo']}, no con el saldo. Confirmar."})
                if regla['tipo'] == 'cuenta' and regla['codigo'] in bal.terceros:
                    tcs = [t for t in bal.buscar_tercero(v, etiqueta, preferir_mov=es_eri)
                           if t['codigos'][0].startswith(regla['codigo']) and t['score'] >= 0.5]
                    if tcs:
                        regla = {k: tcs[0][k] for k in ('tipo', 'codigos', 'nit', 'campo', 'signo')}
                        regla['nombre'] = tcs[0]['nombre']
                        regla['score'] = round(tcs[0]['score'], 2)
            if regla is None:
                tc = bal.buscar_tercero(v, etiqueta, preferir_mov=es_eri)
                if tc:
                    if len(tc) == 1 or tc[0]['score'] >= 0.5:
                        regla = {k: tc[0][k] for k in ('tipo', 'codigos', 'nit', 'campo', 'signo')}
                        regla['nombre'] = tc[0]['nombre']
                        regla['score'] = round(tc[0]['score'], 2)
            if regla is None:
                sc = bal.buscar_suma(v)
                if sc:
                    regla = sc[0]
            if regla is not None:
                celdas[r] = {'tipo': 'BALANCE', 'etiqueta': etiqueta, 'regla': regla, 'valor_base': v}
                cont['BALANCE'] += 1
                if regla['tipo'] == 'cuenta':
                    codigos_usados.add(regla['codigo'])
                elif regla['tipo'] == 'suma':
                    codigos_usados.update(regla['codigos'])
                else:
                    codigos_usados.update(regla['codigos'])
                continue
            # constante (igual en meses anteriores)?
            vals_ant = [ws.cell(r, c).value for c in anteriores]
            if vals_ant and all(es_numero(x) and abs(x - v) <= TOL for x in vals_ant):
                celdas[r] = {'tipo': 'CONSTANTE', 'etiqueta': etiqueta, 'valor': v}
                cont['CONSTANTE'] += 1
                reporte['constante'].append({'hoja': ws.title, 'fila': r, 'etiqueta': etiqueta, 'valor': v})
                continue
            cerca = cuenta_cercana_por_nombre(bal, v, etiqueta, '4567' if es_eri else '123', es_eri, codigos_usados)
            if cerca:
                regla, dif_ = cerca
                celdas[r] = {'tipo': 'BALANCE', 'etiqueta': etiqueta, 'regla': regla, 'valor_base': v, 'origen': 'aprox'}
                cont['BALANCE'] += 1
                codigos_usados.add(regla['codigo'])
                reporte['dudosos'].append({'hoja': ws.title, 'fila': r, 'etiqueta': etiqueta, 'valor': v,
                                           'motivo': f"difiere {dif_:,.2f} del saldo de {regla['codigo']} {bal.nombre.get(regla['codigo'], '')}; "
                                                     f"se vinculó por nombre y desde ahora toma el valor del balance"})
                continue
            celdas[r] = {'tipo': 'MANUAL', 'etiqueta': etiqueta, 'valor': v}
            cont['MANUAL'] += 1
            reporte['manual'].append({'hoja': ws.title, 'fila': r, 'etiqueta': etiqueta, 'valor': v,
                                      'motivo': 'no cruza con el balance'})

        # ── renglones que repiten el mes anterior ('=+D136'): la contadora copia el valor cuando no
        #    cambia, pero el mes nuevo SÍ puede cambiar. Si el valor que muestran cruza con el balance
        #    (cuenta o tercero, de la clase que corresponde a la hoja), se vinculan a esa cuenta. ──
        letra_prev = get_column_letter(col + 1 if p['orden'] == 'reciente_izquierda' else col - 1)
        clases_hoja = '4567' if es_eri else '123'
        for r, c_ in list(celdas.items()):
            if c_['tipo'] != 'CADENA':
                continue
            f_ = ws.cell(r, col).value
            if not (es_formula(f_) and re.fullmatch(r'=\+?\$?' + letra_prev + r'\$?' + str(r), f_.replace(' ', ''), re.I)):
                continue
            v_ = vals.get(ws.title, r, col)
            if not es_numero(v_) or abs(v_) <= TOL:
                continue
            et_ = c_['etiqueta']
            regla_ = None
            cands_ = [x for x in bal.buscar_valor(v_, preferir_mov=es_eri) if x['codigo'][:1] in clases_hoja]
            if cands_:
                cands_.sort(key=lambda x: (x['codigo'] in codigos_usados, len(x['codigo']) != 6, -len(x['codigo'])))
                regla_ = cands_[0]
                if regla_['codigo'] in bal.terceros or len(regla_['codigo']) >= 6:
                    tcs = [t for t in bal.buscar_tercero(v_, et_, preferir_mov=es_eri)
                           if t['codigos'][0].startswith(regla_['codigo'][:6]) and t['score'] >= 0.5]
                    if tcs:
                        regla_ = {k: tcs[0][k] for k in ('tipo', 'codigos', 'nit', 'campo', 'signo')}
                        regla_.update({'nombre': tcs[0]['nombre'], 'score': round(tcs[0]['score'], 2)})
            if regla_ is None:
                tcs = [t for t in bal.buscar_tercero(v_, et_, preferir_mov=es_eri)
                       if t['codigos'][0][:1] in clases_hoja and t['score'] >= 0.5]
                if tcs:
                    regla_ = {k: tcs[0][k] for k in ('tipo', 'codigos', 'nit', 'campo', 'signo')}
                    regla_.update({'nombre': tcs[0]['nombre'], 'score': round(tcs[0]['score'], 2)})
            if regla_ is None:
                continue
            celdas[r] = {'tipo': 'BALANCE', 'etiqueta': et_, 'regla': regla_, 'valor_base': v_, 'origen': 'cadena'}
            cont['CADENA'] -= 1
            cont['BALANCE'] += 1
            codigos_usados.update([regla_['codigo']] if 'codigo' in regla_ else regla_['codigos'])
            reporte.setdefault('cadenas_vinculadas', []).append(
                {'hoja': ws.title, 'fila': r, 'etiqueta': et_, 'valor': v_,
                 'regla': regla_.get('codigo') or ','.join(regla_.get('codigos', [])) + (f" NIT {regla_['nit']}" if regla_.get('nit') else '')})

        # ── segunda pasada: 'resto' dentro de bloques (subcuenta menos terceros con renglón propio) ──
        for b in bloques:
            filas = [r for r in range(b['inicio'], b['fin'] + 1) if r in celdas]
            manuales = [r for r in filas if celdas[r]['tipo'] == 'MANUAL']
            terc = [r for r in filas if celdas[r]['tipo'] == 'BALANCE' and celdas[r]['regla']['tipo'] == 'tercero']
            if not manuales or not terc:
                continue
            # prefijos de cuenta comunes a los terceros del bloque
            prefijos = set()
            for r in terc:
                for cod in celdas[r]['regla']['codigos']:
                    for ln in (4, 6, 8):
                        if len(cod) >= ln:
                            prefijos.add(cod[:ln])
            for r in manuales:
                v = celdas[r]['valor']
                for pref in sorted(prefijos, key=len, reverse=True):
                    base = bal.sf.get(pref)
                    if base is None:
                        continue
                    nits = [celdas[x]['regla']['nit'] for x in terc if any(c.startswith(pref) for c in celdas[x]['regla']['codigos'])]
                    resto = base
                    for nit in nits:
                        for cod, d in bal.terceros.items():
                            if cod.startswith(pref) and nit in d:
                                resto -= d[nit]['sf']
                    if abs(abs(resto) - abs(v)) <= TOL:
                        signo = 1 if (resto >= 0) == (v >= 0) else -1
                        celdas[r] = {'tipo': 'BALANCE', 'etiqueta': celdas[r]['etiqueta'], 'valor_base': v,
                                     'regla': {'tipo': 'resto', 'codigo': pref, 'excluir_nits': nits, 'campo': 'sf', 'signo': signo}}
                        cont['MANUAL'] -= 1
                        cont['BALANCE'] += 1
                        reporte['manual'] = [m for m in reporte['manual'] if not (m['hoja'] == ws.title and m['fila'] == r)]
                        codigos_usados.add(pref)
                        break

        # ── bloques con terceros: aprender la "nómina" (fila → NIT) y la cuenta padre ──
        bloques_out = []
        for b in bloques:
            filas = list(range(b['inicio'], b['fin'] + 1))
            terc = [r for r in filas if r in celdas and celdas[r]['tipo'] == 'BALANCE' and celdas[r]['regla']['tipo'] == 'tercero']
            total_val = vals.get(ws.title, b['fila_total'], col)

            # ¿Hay una columna con el NIT de cada tercero (anexos de cartera)? → emparejar por NIT, no por nombre
            nit_col = None
            for cc in range(1, col):
                n_nit = sum(1 for r in filas if es_nit(ws.cell(r, cc).value))
                if n_nit >= 3 and n_nit >= 0.5 * len(filas):
                    nit_col = cc
                    break
            nits_col = {r: nit_texto(ws.cell(r, nit_col).value) for r in filas if nit_col and es_nit(ws.cell(r, nit_col).value)}

            cuenta_padre = None
            if nits_col:
                # la cuenta padre es el prefijo (8 o 6 dígitos) bajo el que los VALORES de la hoja cruzan
                # con el saldo del tercero (un NIT puede aparecer en muchas cuentas: ventas, cartera...).
                # Si ninguna fila tiene valor, se usa cobertura de NITs, limitada a cuentas de balance (o de
                # resultado si la hoja es del ERI).
                clases_ok = ('4', '5', '6', '7') if es_eri else ('1', '2', '3')
                mejor, mejor_n = None, 0
                for ln in (8, 6):
                    score = defaultdict(int)
                    for r, nit in nits_col.items():
                        v = ws.cell(r, col).value
                        if not es_numero(v) or abs(v) <= TOL:
                            continue
                        for cod in bal.codigos_tercero_por_nit.get(nit, ()):
                            t = bal.terceros[cod].get(nit)
                            if t and abs(abs(t['mov' if es_eri else 'sf']) - abs(v)) <= TOL:
                                score[cod[:ln]] += 1
                    if score:
                        pf, n = max(score.items(), key=lambda kv: kv[1])
                        if n > mejor_n:
                            mejor, mejor_n = pf, n
                if not mejor:
                    for ln in (8, 6):
                        cobertura = defaultdict(int)
                        for nit in nits_col.values():
                            for cod in bal.codigos_tercero_por_nit.get(nit, ()):
                                if cod[0] in clases_ok:
                                    cobertura[cod[:ln]] += 1
                        if cobertura:
                            pf, n = max(cobertura.items(), key=lambda kv: kv[1])
                            if n > mejor_n:
                                mejor, mejor_n = pf, n
                if mejor and mejor_n >= 3:
                    cuenta_padre = mejor
            if cuenta_padre is None and terc:
                # umbral: un solo cruce por valor con un tercero suele ser coincidencia (ej. "Sueldos")
                n_num = sum(1 for r in filas if r in celdas and celdas[r]['tipo'] in ('BALANCE', 'MANUAL', 'CONSTANTE'))
                un_solo_seguro = len(terc) == 1 and celdas[terc[0]]['regla'].get('score', 0) >= 0.6
                if un_solo_seguro or (len(terc) >= 2 and (len(terc) >= 5 or len(terc) >= 0.2 * max(1, n_num))):
                    cods = [c for r in terc for c in celdas[r]['regla']['codigos']]
                    pref = cods[0]
                    for c in cods[1:]:
                        i = 0
                        while i < min(len(pref), len(c)) and pref[i] == c[i]:
                            i += 1
                        pref = pref[:i]
                    if len(pref) >= 4:
                        cuenta_padre = pref
                    if es_numero(total_val):
                        for cand in bal.buscar_valor(total_val):
                            if cuenta_padre is None or cand['codigo'].startswith(cuenta_padre[:4]):
                                cuenta_padre = cand['codigo']
                                break
            if not cuenta_padre:
                # no es un bloque de terceros. Un ÚNICO cruce "por valor" con un tercero es coincidencia
                # (ej. "Sueldos" = saldo de un empleado); varios cruces se respetan aunque no compartan cuenta.
                for r in (terc if len(terc) < 2 else []):
                    v = celdas[r].get('valor_base')
                    celdas[r] = {'tipo': 'MANUAL', 'etiqueta': celdas[r]['etiqueta'], 'valor': v}
                    cont['BALANCE'] -= 1
                    cont['MANUAL'] += 1
                    reporte['manual'].append({'hoja': ws.title, 'fila': r, 'etiqueta': celdas[r]['etiqueta'], 'valor': v,
                                              'motivo': 'coincidencia aislada con un tercero; se trata como manual'})
                continue

            nomina = {}
            terceros_balance = bal.terceros_bajo(cuenta_padre)
            signo_bloque = celdas[terc[0]]['regla']['signo'] if terc else None
            for r in filas:
                et = etiqueta_valor(vals, ws, r, col)
                nit = nits_col.get(r)
                if not et and not nit:
                    continue
                if nit is None:
                    if r in celdas and celdas[r]['tipo'] == 'BALANCE' and celdas[r]['regla']['tipo'] == 'tercero':
                        nit = celdas[r]['regla']['nit']
                    else:
                        mejor = max(terceros_balance.items(), key=lambda kv: similitud(et, kv[1]['nombre']), default=None)
                        if mejor and similitud(et, mejor[1]['nombre']) >= 0.6:
                            nit = mejor[0]
                nomina[str(r)] = {'etiqueta': et, 'nit': nit}
                # con columna NIT, el renglón se alimenta por NIT aunque el valor no cruce
                if nits_col and nit:
                    tb = terceros_balance.get(nit)
                    cod_nit = tb['codigos'] if tb else [cuenta_padre] if isinstance(cuenta_padre, str) else list(cuenta_padre)
                    v = ws.cell(r, col).value
                    _cf = 'mov' if es_eri else 'sf'
                    if es_numero(v) and tb and abs(tb[_cf]) > 0.004 and signo_bloque is None:
                        signo_bloque = 1 if (tb[_cf] >= 0) == (v >= 0) else -1
                    prev = celdas.get(r)
                    if prev and prev['tipo'] in ('BALANCE', 'MANUAL', 'CONSTANTE'):
                        if prev['tipo'] != 'BALANCE':
                            cont[prev['tipo']] -= 1
                            cont['BALANCE'] += 1
                            reporte['manual'] = [m for m in reporte['manual'] if not (m['hoja'] == ws.title and m['fila'] == r)]
                        celdas[r] = {'tipo': 'BALANCE', 'etiqueta': et, 'valor_base': prev.get('valor_base', prev.get('valor')),
                                     'regla': {'tipo': 'tercero', 'codigos': cod_nit, 'nit': nit, 'campo': 'mov' if es_eri else 'sf',
                                               'signo': signo_bloque or 1, 'nombre': tb['nombre'] if tb else et}}
            if not es_eri:
                for r in filas:
                    c_ = celdas.get(r)
                    nit_ = nomina.get(str(r), {}).get('nit')
                    if c_ and c_['tipo'] == 'CADENA' and nit_ and terceros_balance.get(nit_):
                        f_ = ws.cell(r, col).value
                        letra_prev_ = get_column_letter(col + 1 if p['orden'] == 'reciente_izquierda' else col - 1)
                        if es_formula(f_) and re.fullmatch(r'=\+?\$?' + letra_prev_ + r'\$?' + str(r), f_.replace(' ', ''), re.I):
                            tb_ = terceros_balance[nit_]
                            celdas[r] = {'tipo': 'BALANCE', 'etiqueta': c_['etiqueta'], 'origen': 'cadena',
                                         'valor_base': vals.get(ws.title, r, col),
                                         'regla': {'tipo': 'tercero', 'codigos': tb_['codigos'], 'nit': nit_, 'campo': 'sf',
                                                   'signo': signo_bloque or (celdas[terc[0]]['regla'].get('signo', 1) if terc else 1),
                                                   'nombre': tb_['nombre']}}
                            cont['CADENA'] -= 1
                            cont['BALANCE'] += 1
            pf4 = {str(pf)[:4] for pf in (cuenta_padre if isinstance(cuenta_padre, list) else [cuenta_padre])}
            sg_bloque = signo_bloque or (celdas[terc[0]]['regla'].get('signo', 1) if terc else 1)
            for r in filas:
                c_ = celdas.get(r)
                if not c_ or c_['tipo'] != 'BALANCE' or c_['regla']['tipo'] == 'tercero' or c_.get('origen') == 'contadora':
                    continue
                rg_ = c_['regla']
                cods_ = [rg_['codigo']] if 'codigo' in rg_ else rg_.get('codigos', [])
                if any(str(cc)[:4] in pf4 for cc in cods_):
                    continue
                nit_ = nomina.get(str(r), {}).get('nit')
                tb_ = terceros_balance.get(nit_) if nit_ else None
                if tb_:
                    celdas[r] = {'tipo': 'BALANCE', 'etiqueta': c_['etiqueta'], 'valor_base': c_.get('valor_base'),
                                 'regla': {'tipo': 'tercero', 'codigos': tb_['codigos'], 'nit': nit_,
                                           'campo': 'mov' if es_eri else 'sf', 'signo': sg_bloque, 'nombre': tb_['nombre']}}
                    motivo = f"cruzó por coincidencia con {cods_} (otra cuenta); se vinculó como tercero del bloque por NIT"
                else:
                    celdas[r] = {'tipo': 'MANUAL', 'etiqueta': c_['etiqueta'], 'valor': c_.get('valor_base')}
                    cont['BALANCE'] -= 1
                    cont['MANUAL'] += 1
                    motivo = f"cruzó por coincidencia con {cods_} (otra cuenta) y no se encontró el tercero; queda manual"
                    reporte['manual'].append({'hoja': ws.title, 'fila': r, 'etiqueta': c_['etiqueta'], 'valor': c_.get('valor_base'), 'motivo': motivo})
                reporte['dudosos'].append({'hoja': ws.title, 'fila': r, 'etiqueta': c_['etiqueta'], 'valor': c_.get('valor_base'), 'motivo': motivo})

            # reglas de tercero dentro del bloque que cruzaron con OTRA cuenta (coincidencia de valor):
            # si el NIT existe bajo la cuenta padre, se re-vincula; si no, se marca dudoso
            prefijos_b = cuenta_padre if isinstance(cuenta_padre, list) else [cuenta_padre]
            # subcuenta (6 díg.) que usa la mayoría del bloque: al re-vincular un NIT se usa solo esa,
            # para no arrastrar otra subcuenta que la contadora lista aparte (220505 vs 220506)
            sub_comun = Counter(cc[:6] for r in terc for cc in celdas[r]['regla']['codigos']
                                if any(cc.startswith(pf) for pf in prefijos_b))
            sub_comun = sub_comun.most_common(1)[0][0] if sub_comun else None
            for r in terc:
                rg = celdas[r]['regla']
                if any(any(cc.startswith(pf) for pf in prefijos_b) for cc in rg['codigos']):
                    continue
                tb = terceros_balance.get(rg['nit'])
                if tb:
                    cods_ok = [cc for cc in tb['codigos'] if sub_comun and cc.startswith(sub_comun)] or tb['codigos']
                    rg['codigos'] = cods_ok
                    # el signo se calculó contra la cuenta equivocada: se toma el del bloque
                    sg_ok = Counter(celdas[x]['regla'].get('signo', 1) for x in terc
                                    if x != r and any(any(cc.startswith(pf) for pf in prefijos_b) for cc in celdas[x]['regla']['codigos']))
                    if sg_ok:
                        rg['signo'] = sg_ok.most_common(1)[0][0]
                    elif signo_bloque:
                        rg['signo'] = signo_bloque
                    reporte['dudosos'].append({'hoja': ws.title, 'fila': r, 'etiqueta': celdas[r]['etiqueta'], 'valor': celdas[r].get('valor_base'),
                                               'motivo': f"cruzó con otra cuenta por coincidencia; se vinculó a {','.join(prefijos_b)} por NIT"})
                else:
                    reporte['dudosos'].append({'hoja': ws.title, 'fila': r, 'etiqueta': celdas[r]['etiqueta'], 'valor': celdas[r].get('valor_base'),
                                               'motivo': f"cruzó con {rg['codigos']} pero el bloque es de {','.join(prefijos_b)}. Confirmar."})
            puro = True
            cods_terc = [cc for r in terc for cc in celdas[r]['regla']['codigos']]
            for r in filas:
                c = celdas.get(r)
                if c and c['tipo'] == 'BALANCE' and c['regla']['tipo'] in ('cuenta', 'suma', 'resto'):
                    cods = [c['regla']['codigo']] if 'codigo' in c['regla'] else c['regla']['codigos']
                    if any(t.startswith(cc) for cc in cods for t in cods_terc):
                        puro = False
            bloques_out.append({'fila_total': b['fila_total'], 'inicio': b['inicio'], 'fin': b['fin'],
                                'cuenta_padre': cuenta_padre, 'nomina': nomina, 'puro': puro,
                                'nit_col': nit_col, 'signo': signo_bloque or 1})

        # ── estado de resultados: cada columna mensual = movimiento del mes (débito − crédito),
        #    nunca el saldo final (que en ingresos/gastos es el acumulado del año) ──
        if es_eri:
            def _es_resultado(cods):
                return cods and all(str(cc)[:1] in ('4', '5', '6', '7') for cc in cods)
            for r, c in celdas.items():
                if c['tipo'] != 'BALANCE':
                    continue
                rg = c['regla']
                cods = [rg['codigo']] if 'codigo' in rg else rg.get('codigos', [])
                if _es_resultado(cods) and rg.get('campo') != 'mov':
                    rg['campo'] = 'mov'
                    reporte.setdefault('ajustes_eri', []).append(
                        {'hoja': ws.title, 'fila': r, 'etiqueta': c['etiqueta'], 'detalle': 'pasado a movimiento del mes (débito − crédito)'})
            for b in bloques_out:
                b['campo'] = 'mov'

        # ── estado de resultados: renglones VACÍOS este mes (la cuenta no tuvo movimiento) no se pueden
        #    aprender por valor. Se guardan con su sección para asignarlos por NOMBRE de cuenta cuando
        #    un mes traiga movimiento (ej. 'Asesoria Contable' en HONORARIOS -> 511030). ──
        if True:
            clases_h = '4567' if es_eri else '123'
            campo_h = 'mov' if es_eri else 'sf'
            src_h = bal.mov if es_eri else bal.sf
            padre = padres_de_filas(ws, col, max_fila)
            hijos = defaultdict(list)
            for h_, pd_ in padre.items():
                hijos[pd_].append(h_)
            nombres4 = {cod: bal.nombre.get(cod, '') for cod in bal.sf if len(cod) == 4 and cod[:1] in clases_h}

            def _codigos_regla(rg_):
                return [rg_['codigo']] if 'codigo' in rg_ else list(rg_.get('codigos', []))

            # (a) coherencia de sección: en una sección de pasivos, un renglón que cruzó con un gasto
            #     (ej. 'Prima' = 510530) es coincidencia → se busca dentro de la cuenta de sus hermanos
            for pd_, hs in hijos.items():
                reglas_h = [(hh, celdas[hh]) for hh in hs if celdas.get(hh, {}).get('tipo') == 'BALANCE'
                            and celdas[hh].get('origen') != 'contadora']
                if len(reglas_h) < 2:
                    continue
                primero = Counter(str(_codigos_regla(c_['regla'])[0])[:1] for hh, c_ in reglas_h
                                  if str(_codigos_regla(c_['regla'])[0])[:1] in clases_h)
                if not primero:
                    continue
                dom, n_dom = primero.most_common(1)[0]
                if n_dom < 2:
                    continue
                pref2 = Counter(str(_codigos_regla(c_['regla'])[0])[:2] for hh, c_ in reglas_h
                                if str(_codigos_regla(c_['regla'])[0])[:1] == dom).most_common(1)[0][0]
                for hh, c_ in reglas_h:
                    cods_ = _codigos_regla(c_['regla'])
                    if str(cods_[0])[:1] in clases_h or c_['regla']['tipo'] == 'tercero':
                        continue
                    v_ = c_.get('valor_base')
                    nuevo = None
                    if es_numero(v_):
                        cands_ = [x for x in bal.buscar_valor(v_, preferir_mov=es_eri) if x['codigo'].startswith(pref2)]
                        if cands_:
                            cands_.sort(key=lambda x: (x['codigo'] in codigos_usados, -len(x['codigo'])))
                            nuevo = cands_[0]
                    if nuevo:
                        celdas[hh] = dict(c_, regla=nuevo)
                        motivo = f"cruzó con {cods_} (otra clase de cuenta); se corrigió a {nuevo['codigo']} dentro de su sección"
                    else:
                        celdas[hh] = {'tipo': 'MANUAL', 'etiqueta': c_['etiqueta'], 'valor': v_}
                        cont['BALANCE'] -= 1
                        cont['MANUAL'] += 1
                        motivo = f"cruzó con {cods_} (otra clase de cuenta que su sección); queda manual"
                        reporte['manual'].append({'hoja': ws.title, 'fila': hh, 'etiqueta': c_['etiqueta'], 'valor': v_, 'motivo': motivo})
                    reporte['dudosos'].append({'hoja': ws.title, 'fila': hh, 'etiqueta': c_['etiqueta'], 'valor': v_, 'motivo': motivo})

            # (b) "lo que queda de la cuenta": renglón manual = cuenta − subcuentas de sus hermanos
            #     (ej. 'Rete fuente' = 2365 − 236575 Autorretención)
            for pd_, hs in hijos.items():
                for hh in hs:
                    c_ = celdas.get(hh)
                    if not c_ or c_['tipo'] != 'MANUAL' or not es_numero(c_.get('valor')):
                        continue
                    v_ = c_['valor']
                    herm = [cc for h2 in hs if h2 != hh and celdas.get(h2, {}).get('tipo') == 'BALANCE'
                            and celdas[h2]['regla']['tipo'] == 'cuenta' for cc in [celdas[h2]['regla']['codigo']]]
                    hecho = False
                    for ln in (4, 6):
                        for pref_ in sorted({cc[:ln] for cc in herm if len(cc) > ln}):
                            excl = [cc for cc in herm if cc.startswith(pref_)]
                            if pref_ not in src_h:
                                continue
                            resto_ = src_h[pref_] - sum(src_h.get(cc, 0.0) for cc in excl)
                            if abs(resto_) > TOL and abs(abs(resto_) - abs(v_)) <= TOL:
                                sg_ = 1 if (resto_ >= 0) == (v_ >= 0) else -1
                                celdas[hh] = {'tipo': 'BALANCE', 'etiqueta': c_['etiqueta'], 'valor_base': v_,
                                              'regla': {'tipo': 'resto_cuentas', 'codigo': pref_, 'excluir': excl,
                                                        'campo': campo_h, 'signo': sg_}}
                                cont['MANUAL'] -= 1
                                cont['BALANCE'] += 1
                                reporte['manual'] = [m for m in reporte['manual'] if not (m['hoja'] == ws.title and m['fila'] == hh)]
                                codigos_usados.add(pref_)
                                hecho = True
                                break
                        if hecho:
                            break
            def _prefijo_seccion(fila):
                pd_ = padre.get(fila)
                visto = set()
                while pd_ and pd_ not in visto and len(visto) < 1:
                    visto.add(pd_)
                    pref = Counter()
                    for hh in hijos.get(pd_, []):
                        c_ = celdas.get(hh)
                        if c_ and c_['tipo'] == 'BALANCE':
                            rg_ = c_['regla']
                            for cc in ([rg_['codigo']] if 'codigo' in rg_ else rg_.get('codigos', [])):
                                if len(cc) >= 4 and cc[:1] in clases_h:
                                    pref[cc[:4]] += 1
                    if pref:
                        return pref.most_common(1)[0][0], etiqueta_valor(vals, ws, pd_, col)
                    enc = etiqueta_valor(vals, ws, pd_, col)
                    if enc and nombres4:
                        cod4, sc = max(((k, similitud_cuenta(enc, n)) for k, n in nombres4.items()), key=lambda x: x[1])
                        if sc >= 0.75:
                            return cod4, enc
                    pd_ = padre.get(pd_)
                return None, etiqueta_valor(vals, ws, padre[fila], col) if fila in padre else ''
            # secciones de terceros VACÍAS este mes (ej. 'Honorarios' y 'Transportes' dentro de COSTO DE
            # VENTAS): se vinculan por el nombre del encabezado a la auxiliar del balance, buscando solo
            # dentro de la cuenta que usan sus secciones hermanas (ej. 617015).
            hechos = {(b['inicio'], b['fin']) for b in bloques_out}
            usados_pad = set()
            for b in bloques_out:
                cp_ = b['cuenta_padre']
                usados_pad.update(cp_ if isinstance(cp_, list) else [cp_])
            for c_ in celdas.values():           # cuentas que ya alimentan otro renglón: nunca se reutilizan
                if c_.get('tipo') == 'BALANCE':
                    rg_ = c_['regla']
                    usados_pad.update([rg_['codigo']] if 'codigo' in rg_ else rg_.get('codigos', []))
            nombres4_ = {cod: bal.nombre.get(cod, '') for cod in bal.nombre if len(cod) == 4 and cod[:1] in '4567'}
            for b in (bloques if es_eri else []):
                if (b['inicio'], b['fin']) in hechos:
                    continue
                rng = range(b['inicio'], b['fin'] + 1)
                if any(celdas.get(rr, {}).get('tipo') in ('BALANCE', 'CADENA', 'FORMULA') for rr in rng):
                    continue
                if not any(etiqueta_valor(vals, ws, rr, col) for rr in rng):
                    continue
                enc = etiqueta_valor(vals, ws, b['fila_total'], col)
                if not enc:
                    continue
                gp = padre.get(b['fila_total'])
                herm = [x for x in bloques_out if gp and padre.get(x['fila_total']) == gp and isinstance(x['cuenta_padre'], str)]
                com = None
                if herm:
                    com = herm[0]['cuenta_padre']
                    for x in herm[1:]:
                        k = 0
                        while k < min(len(com), len(x['cuenta_padre'])) and com[k] == x['cuenta_padre'][k]:
                            k += 1
                        com = com[:k]
                    if len(com) < 4:
                        com = None
                if com is None and gp:
                    # sin secciones hermanas: la cuenta la da el encabezado padre (ej. HONORARIOS -> 5110)
                    enc_gp = etiqueta_valor(vals, ws, gp, col)
                    if enc_gp and nombres4_:
                        c4, s4 = max(((k, similitud_cuenta(enc_gp, n)) for k, n in nombres4_.items()), key=lambda x: x[1])
                        if s4 >= 0.75:
                            com = c4
                if com is None:
                    continue          # sin referencia de cuenta no se adivina (evita 'Otros' -> cualquier 'Otros')
                cands_ = [cod for cod in bal.nombre if len(cod) >= 6 and cod[:1] in '4567'
                          and (com is None or (cod.startswith(com) and len(cod) > len(com)))
                          and not any(cod.startswith(u) or u.startswith(cod) for u in usados_pad)]
                if not cands_:
                    continue
                mejor_ = max(cands_, key=lambda cod: (similitud_cuenta(enc, bal.nombre[cod]), len(cod)))
                sc_ = similitud_cuenta(enc, bal.nombre[mejor_])
                if sc_ < 0.8:
                    continue
                tb_all = bal.terceros_bajo(mejor_)
                nomina_ = {}
                for rr in rng:
                    et = etiqueta_valor(vals, ws, rr, col)
                    if not et:
                        continue
                    nit_ = None
                    if tb_all:
                        mm_ = max(tb_all.items(), key=lambda kv: similitud(et, kv[1]['nombre']))
                        if similitud(et, mm_[1]['nombre']) >= 0.6:
                            nit_ = mm_[0]
                    nomina_[str(rr)] = {'etiqueta': et, 'nit': nit_}
                sg_ = Counter(x.get('signo', 1) for x in herm).most_common(1)[0][0] if herm else 1
                bloques_out.append({'fila_total': b['fila_total'], 'inicio': b['inicio'], 'fin': b['fin'],
                                    'cuenta_padre': mejor_, 'nomina': nomina_, 'puro': True, 'nit_col': None,
                                    'signo': sg_, 'campo': 'mov', 'origen': 'encabezado'})
                usados_pad.add(mejor_)
                reporte['dudosos'].append({'hoja': ws.title, 'fila': b['fila_total'], 'etiqueta': enc, 'valor': None,
                                           'motivo': f"sección vacía este mes; se vinculó por nombre a {mejor_} {bal.nombre[mejor_]}"})
            en_bloque = set()
            for b in bloques_out:
                en_bloque.update(range(b['inicio'], b['fin'] + 1))
            letra_ant = get_column_letter(col + 1 if p['orden'] == 'reciente_izquierda' else col - 1)
            for r in range(1, max_fila + 1):
                if r == p['fila_mes'] or r in en_bloque or r not in padre:
                    continue
                v = ws.cell(r, col).value
                et = etiqueta_valor(vals, ws, r, col)
                if not et:
                    continue
                c_prev = celdas.get(r)
                era_cero = False
                if c_prev and c_prev['tipo'] == 'FORMULA' and es_formula(v):
                    m_ = re.fullmatch(r'=\+?SUM\(\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)\)', v.replace(' ', ''), re.I)
                    vv_ = vals.get(ws.title, r, col)
                    if m_ and int(m_.group(2)) == r and int(m_.group(4)) == r and (not es_numero(vv_) or abs(vv_) < 0.005):
                        c1_, c2_ = column_index_from_string(m_.group(1).upper()), column_index_from_string(m_.group(3).upper())
                        if not (min(c1_, c2_) <= col <= max(c1_, c2_)):
                            cont['FORMULA'] -= 1
                            c_prev = None
                            era_cero = True
                            v = None
                if c_prev and c_prev['tipo'] == 'CONSTANTE' and not c_prev.get('valor'):
                    cont['CONSTANTE'] -= 1
                    c_prev = None
                    era_cero = True
                if es_eri and c_prev and c_prev['tipo'] == 'CADENA' and es_formula(v) and \
                        re.fullmatch(r'=\+?\$?' + letra_ant + r'\$?' + str(r), v.replace(' ', ''), re.I):
                    # renglón que repite el mes anterior: se intenta por nombre; si no, queda la fórmula
                    pref, enc = _prefijo_seccion(r)
                    c_prev.update({'por_nombre': True, 'prefijo': pref, 'seccion': enc,
                                   'valor_ant': vals.get(ws.title, r, col)})
                    continue
                if c_prev:
                    continue
                if v is not None and not (es_numero(v) and abs(v) < 0.005):
                    continue
                pref, enc = _prefijo_seccion(r)
                sg_h = Counter(celdas[hh]['regla'].get('signo', 1) for hh in hijos.get(padre[r], [])
                               if celdas.get(hh, {}).get('tipo') == 'BALANCE')
                celdas[r] = {'tipo': 'PENDIENTE', 'etiqueta': et, 'prefijo': pref, 'seccion': enc,
                             'campo': campo_h, 'signo': sg_h.most_common(1)[0][0] if sg_h else None,
                             'cero': era_cero}
                enl_ = enlace_de_fila(ws, r, col)
                if enl_:
                    celdas[r]['enlace'] = enl_
                cont['PENDIENTE'] += 1
            # sección que la contadora dejó COMPLETA en blanco (ej. gastos de administración que ella
            # lleva dentro de la sección de ventas): se marca para no llenarla sola si su cuenta ya tenía valor
            for pd_, hs in hijos.items():
                con_et = [hh for hh in hs if etiqueta_valor(vals, ws, hh, col)]
                if len(con_et) >= 2 and all(celdas.get(hh, {}).get('tipo') == 'PENDIENTE' for hh in con_et):
                    for hh in con_et:
                        celdas[hh]['seccion_vacia'] = True

        # ── filas ENTRE el encabezado y el inicio de su SUM (ej. 'Servicios'=SUM(C44:C322) con un
        #    tercero en la fila 43): nunca entran en el total ──
        for b in bloques:
            if b['fila_total'] < b['inicio'] - 1:
                huerf = [r for r in range(b['fila_total'] + 1, b['inicio'])
                         if etiqueta_valor(vals, ws, r, col) and not es_formula(ws.cell(r, col).value)]
                if huerf:
                    reporte.setdefault('advertencias', []).append(
                        f"{ws.title}: la suma de la fila {b['fila_total']} empieza en la fila {b['inicio']}, así que "
                        + ', '.join(f"la fila {r} ('{etiqueta_valor(vals, ws, r, col)}')" for r in huerf[:3])
                        + " no entra en el total. Si ese tercero tiene movimiento, el sistema le crea una fila dentro de la suma; "
                          "conviene corregir el rango en tu plantilla.")
        # ── filas con datos DEBAJO del rango que suma el total (error típico de la plantilla) ──
        for b in bloques:
            fuera = []
            for r in range(b['fin'] + 1, min(max_fila, b['fin'] + 400) + 1):
                v = ws.cell(r, col).value
                if es_formula(v):
                    break          # empieza otra sección
                if es_numero(v) and abs(v) > TOL and etiqueta_valor(vals, ws, r, col):
                    fuera.append(r)
            # una sola fila suele ser un renglón aparte (p.ej. "Provisión"); varias seguidas son el bloque que siguió creciendo
            if len(fuera) >= 3:
                reporte.setdefault('advertencias', []).append(
                    f"{ws.title}: el total de la fila {b['fila_total']} suma hasta la fila {b['fin']}, pero hay {len(fuera)} filas con valores "
                    f"más abajo (desde la {fuera[0]}) que NO entran en el total. Revisa el rango de esa fórmula en tu ESF.")

        # ── reglas de la contadora para esta hoja ──
        for rg in reglas.get('celdas', []):
            if norm(rg.get('hoja', '')) != norm(ws.title):
                continue
            objetivo = []
            if rg.get('fila'):
                objetivo = [int(rg['fila'])]
            elif rg.get('etiqueta'):
                objetivo = [r for r in range(1, max_fila + 1) if norm(rg['etiqueta']) in norm(etiqueta_valor(vals, ws, r, col))]
                objetivo = objetivo[:1]
            for r in objetivo:
                prev = celdas.get(r, {})
                if prev.get('tipo'):
                    cont[prev['tipo']] -= 1
                cont['BALANCE'] += 1
                reporte['manual'] = [m for m in reporte['manual'] if not (m['hoja'] == ws.title and m['fila'] == r)]
                celdas[r] = {'tipo': 'BALANCE', 'etiqueta': etiqueta_valor(vals, ws, r, col), 'regla': rg['regla'],
                             'valor_base': prev.get('valor_base', prev.get('valor')), 'origen': 'contadora'}
                reporte.setdefault('reglas_aplicadas', []).append({'hoja': ws.title, 'fila': r, 'etiqueta': celdas[r]['etiqueta'], 'regla': rg['regla']})
        for rg in reglas.get('bloques', []):
            if norm(rg.get('hoja', '')) != norm(ws.title):
                continue
            padre = rg['padre'] if isinstance(rg['padre'], list) else [rg['padre']]
            encontrado = False
            for b in bloques:
                if b['fila_total'] == int(rg.get('fila_total', -1)) or b['inicio'] == int(rg.get('inicio', -1)):
                    encontrado = True
                    bo = next((x for x in bloques_out if x['fila_total'] == b['fila_total']), None)
                    if bo is None:
                        bo = {'fila_total': b['fila_total'], 'inicio': b['inicio'], 'fin': b['fin'], 'nomina': {}, 'puro': True, 'nit_col': None, 'signo': rg.get('signo', 1)}
                        bloques_out.append(bo)
                    bo['cuenta_padre'] = padre
                    bo['origen'] = 'contadora'
                    bo['campo'] = rg.get('campo', 'mov' if es_eri else 'sf')
                    # re-vincular nómina y reglas de las filas por NIT con la nueva padre
                    tb_all = bal.terceros_bajo(padre)
                    for r in range(b['inicio'], b['fin'] + 1):
                        nit = bo['nomina'].get(str(r), {}).get('nit')
                        if bo.get('nit_col') and es_nit(ws.cell(r, bo['nit_col']).value):
                            nit = nit_texto(ws.cell(r, bo['nit_col']).value)
                        if not nit:
                            continue
                        et = etiqueta_valor(vals, ws, r, col)
                        bo['nomina'][str(r)] = {'etiqueta': et, 'nit': nit}
                        tb = tb_all.get(nit)
                        celdas[r] = {'tipo': 'BALANCE', 'etiqueta': et, 'origen': 'contadora',
                                     'regla': {'tipo': 'tercero', 'codigos': tb['codigos'] if tb else padre, 'nit': nit,
                                               'campo': rg.get('campo', 'mov' if es_eri else 'sf'), 'signo': rg.get('signo', bo.get('signo', 1)), 'nombre': tb['nombre'] if tb else et}}
                    reporte.setdefault('reglas_aplicadas', []).append({'hoja': ws.title, 'fila': b['fila_total'], 'etiqueta': f"bloque {b['inicio']}-{b['fin']}", 'regla': {'padre': padre}})
            if not encontrado:
                reporte.setdefault('advertencias', []).append(f"Regla de bloque en '{ws.title}' (fila_total {rg.get('fila_total')}) no encontró un SUM en esa fila.")
        if any(norm(x) == norm(ws.title) for x in reglas.get('sin_terceros', [])):
            bloques_out = []   # la contadora no quiere filas de terceros en esta hoja

        molde['hojas'][ws.title] = {
            'col_actual': col, 'fila_mes': p['fila_mes'], 'fila_anio': p['fila_anio'], 'col_anio': p['col_anio'],
            'orden': p['orden'], 'anio': p['anio'], 'mes': p['mes'], 'formato_mes': p['formato_mes'],
            'grupo_cols': p['grupo_cols'], 'es_eri': es_eri,
            'celdas': {str(k): v for k, v in celdas.items()},
            'bloques': bloques_out,
        }
        reporte['hojas'][ws.title] = dict(cont)

    # ── hojas sin columnas de mes que alimentan celdas del mes actual (anexos que ella reemplaza) ──
    anexos = defaultdict(set)
    for nombre, h in molde['hojas'].items():
        ws = wb[nombre]
        for fila_s, c in h['celdas'].items():
            if c['tipo'] in ('FORMULA', 'CADENA'):
                v = ws.cell(int(fila_s), h['col_actual']).value
                for hoja_ref, cc, rr, ab in referencias_de(v, nombre):
                    if hoja_ref in wb.sheetnames and hoja_ref not in molde['hojas'] and hoja_ref not in periodos_por_hoja:
                        anexos[hoja_ref].add(f"{nombre}!{ws.cell(int(fila_s), h['col_actual']).coordinate}")
    reporte['anexos'] = [{'hoja': k, 'usada_en': sorted(v)[:5]} for k, v in anexos.items()]
    molde['anexos'] = sorted(anexos)
    molde['reglas'] = reglas
    molde['con_valor'] = cuentas_con_valor(bal)

    # ── cobertura: subcuentas del balance con saldo que ningún renglón usa ──
    def cubierto(cod):
        return any(u == cod or cod.startswith(u) or u.startswith(cod) for u in codigos_usados)
    for cod, v in sorted(bal.sf.items()):
        if len(cod) == 6 and abs(v) > TOL and cod[0] in '123' and not cubierto(cod):
            reporte['sin_ubicar'].append({'codigo': cod, 'nombre': bal.nombre.get(cod, ''), 'saldo': round(v, 2)})

    tot = defaultdict(int)
    for h, c in reporte['hojas'].items():
        for k, n in c.items():
            tot[k] += n
    reporte['resumen'] = dict(tot)
    n_bal = tot.get('BALANCE', 0)
    n_num = n_bal + tot.get('MANUAL', 0)
    if n_bal == 0 or (n_num >= 10 and n_bal < 0.3 * n_num):
        raise SystemExit(
            f"Solo {n_bal} de {n_num} números del ESF cruzan con el balance. Casi seguro NO son de la misma empresa "
            f"o del mismo mes (ESF: {molde['empresa'] or '?'} / balance: {bal.meta['empresa'] or '?'} NIT {bal.meta['nit'] or '?'}). No se guardó nada.")
    reporte['resumen']['hojas_con_meses'] = len(molde['hojas'])
    reporte['resumen']['hojas_total'] = len(wb.sheetnames)
    reporte['resumen']['periodo_base'] = molde['periodo_base']

    json.dump(molde, open(molde_out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    try:
        os.unlink(esf_opt)
    except OSError:
        pass
    print(json.dumps({'ok': True, 'reporte': reporte, 'empresa': bal.meta['empresa'], 'nit': bal.meta['nit'],
                      'periodo_base': molde['periodo_base']}, ensure_ascii=False))


# ─────────────────────────────────────────────────────────────────────────
# FASE B — EXTENDER
# ─────────────────────────────────────────────────────────────────────────
def copiar_estilo(origen, destino):
    if origen.has_style:
        destino._style = copy.copy(origen._style)


def insertar_columna_hoja(wb, ws, col, n=1):
    """Inserta n columnas en `col` moviendo celdas, estilos, merges, anchos (NO fórmulas: eso va aparte)."""
    ws.insert_cols(col, n)
    # merges
    nuevos = []
    for m in list(ws.merged_cells.ranges):
        ws.merged_cells.remove(m)
        min_c, max_c = m.min_col, m.max_col
        if min_c >= col:
            min_c += n
            max_c += n
        elif max_c >= col:
            max_c += n
        nuevos.append((min_c, m.min_row, max_c, m.max_row))
    for (a, b, c, d) in nuevos:
        ws.merge_cells(start_row=b, start_column=a, end_row=d, end_column=c)
    # anchos
    dims = {}
    for k, d in list(ws.column_dimensions.items()):
        try:
            ci = column_index_from_string(k)
        except Exception:
            continue
        dims[ci] = (d.width, d.hidden)
    for k in list(ws.column_dimensions.keys()):
        del ws.column_dimensions[k]
    for ci, (w, h) in dims.items():
        nc = ci + n if ci >= col else ci
        cd = ws.column_dimensions[get_column_letter(nc)]
        if w:
            cd.width = w
        cd.hidden = h
    # freeze panes
    if ws.freeze_panes:
        m = REF_RE.match(ws.freeze_panes)
        if m:
            c = column_index_from_string(m.group(2))
            if c >= col:
                ws.freeze_panes = f"{get_column_letter(c + n)}{m.group(4)}"


def insertar_fila_hoja(ws, fila, n=1):
    ws.insert_rows(fila, n)
    nuevos = []
    for m in list(ws.merged_cells.ranges):
        ws.merged_cells.remove(m)
        min_r, max_r = m.min_row, m.max_row
        if min_r >= fila:
            min_r += n
            max_r += n
        elif max_r >= fila:
            max_r += n
        nuevos.append((m.min_col, min_r, m.max_col, max_r))
    for (a, b, c, d) in nuevos:
        ws.merge_cells(start_row=b, start_column=a, end_row=d, end_column=c)
    dims = {}
    for k, d in list(ws.row_dimensions.items()):
        dims[k] = (d.height, d.hidden)
    for k in list(ws.row_dimensions.keys()):
        del ws.row_dimensions[k]
    for ri, (h, hid) in dims.items():
        nr = ri + n if ri >= fila else ri
        rd = ws.row_dimensions[nr]
        if h:
            rd.height = h
        rd.hidden = hid
    if ws.freeze_panes:
        m = REF_RE.match(ws.freeze_panes)
        if m and int(m.group(4)) >= fila:
            ws.freeze_panes = f"{m.group(2)}{int(m.group(4)) + n}"


def reescribir_todo(wb, ins_cols, ins_rows):
    for ws in wb.worksheets:
        max_fila = min(ws.max_row, MAX_FILAS)
        for row in ws.iter_rows(min_row=1, max_row=max_fila):
            for cell in row:
                v = cell.value
                if es_formula(v):
                    nv = reescribir_formula(v, ws.title, ins_cols, ins_rows)
                    if nv != v:
                        cell.value = nv


def proper(nombre):
    out = []
    for w in str(nombre).strip().split():
        lw = w.lower().strip('.,')
        if '.' in w or lw in ('sas', 'sa', 'ltda', 'eu', 'sca', 'bic', 'esp', 'eps', 'arl'):
            out.append(w.upper())
        else:
            out.append(w.capitalize())
    return ' '.join(out)


def extender(esf_path, molde_path, balance_path, salida_path):
    molde = json.load(open(molde_path, encoding='utf-8'))
    bal = Balance(json.load(open(balance_path, encoding='utf-8')))
    esf_opt = cargar_optimizado(esf_path)
    wb = openpyxl.load_workbook(esf_opt)
    nuevo_anio, nuevo_mes = bal.meta['anio'], bal.meta['mes']
    base = molde['periodo_base']
    reporte = {'periodo_nuevo': {'anio': nuevo_anio, 'mes': nuevo_mes}, 'periodo_anterior': base,
               'hojas': {}, 'revisar': [], 'terceros_nuevos': [], 'terceros_sin_fila': [], 'sin_ubicar': [], 'advertencias': []}

    if (nuevo_anio * 100 + nuevo_mes) <= (base['anio'] * 100 + base['mes']):
        raise SystemExit(
            f"El ESF ya va en {ABREV[base['mes']]} {base['anio']} y el balance es de {ABREV.get(nuevo_mes, '?')} {nuevo_anio}. "
            f"Solo se puede agregar un mes POSTERIOR. Si quieres rehacer un mes, borra esa versión y vuelve a agregarlo.")
    if molde.get('nit') and bal.meta['nit'] and norm(molde['nit']).replace('-', '').replace('.', '') != norm(bal.meta['nit']).replace('-', '').replace('.', ''):
        reporte['advertencias'].append(f"NIT distinto: molde {molde['nit']} vs balance {bal.meta['nit']}.")

    # 1) Re-detectar columnas actuales en el archivo (por si cambió) y planear inserciones
    plan = {}
    vals = Valores(esf_opt, [n for n in molde['hojas'] if n in wb.sheetnames])
    for nombre, h in molde['hojas'].items():
        if nombre not in wb.sheetnames:
            reporte['advertencias'].append(f"La hoja '{nombre}' del molde no está en el archivo.")
            continue
        ws = wb[nombre]
        p = detectar_periodos(ws, getval=lambda r, c, _h=nombre: vals.get(_h, r, c))
        if not p:
            continue
        fijar_actual(p, base['anio'] * 100 + base['mes'])
        col = p['col_actual']
        cambia_anio = (nuevo_anio != p['anio'])
        # ¿La contadora ya dejó creada la columna del mes nuevo (vacía)? → modo LLENAR, sin insertar
        col_ph = p['placeholders'].get((nuevo_anio, nuevo_mes))
        if col_ph is not None:
            plan[nombre] = {'p': p, 'col_vieja': col, 'n': 0, 'cambia_anio': False, 'ins_en': col_ph,
                            'modo': 'llenar', 'col_mes': col_ph, 'col_sep': None, 'col_ant': col}
            continue
        if p['orden'] == 'reciente_izquierda':
            col_nueva = col
            n = 2 if cambia_anio else 1       # columna separadora + mes nuevo
        else:
            col_nueva = col + 1
            n = 2 if cambia_anio else 1
        plan[nombre] = {'p': p, 'col_vieja': col, 'n': n, 'cambia_anio': cambia_anio, 'ins_en': col_nueva, 'modo': 'insertar'}

    # 2) Insertar columnas y reescribir TODAS las fórmulas del libro
    ins_cols = {nombre: [pl['ins_en']] * pl['n'] for nombre, pl in plan.items() if pl['n']}
    for nombre, pl in plan.items():
        if pl['n']:
            insertar_columna_hoja(wb, wb[nombre], pl['ins_en'], pl['n'])
    reescribir_todo(wb, ins_cols, {})

    # posición de las columnas después de insertar
    for nombre, pl in plan.items():
        p = pl['p']
        if pl['modo'] == 'llenar':
            continue
        if p['orden'] == 'reciente_izquierda':
            pl['col_mes'] = pl['ins_en']                       # mes nuevo
            pl['col_sep'] = pl['ins_en'] + 1 if pl['cambia_anio'] else None
            pl['col_ant'] = pl['col_vieja'] + pl['n']           # mes anterior (se corrió)
        else:
            pl['col_sep'] = pl['ins_en'] if pl['cambia_anio'] else None
            pl['col_mes'] = pl['ins_en'] + (1 if pl['cambia_anio'] else 0)
            pl['col_ant'] = pl['col_vieja']
    col_min_por_hoja = {nombre: min(pl['col_mes'], pl['col_ant']) for nombre, pl in plan.items()}
    # separador entre años: el que se crea ahora (cambio de año) o el que quedó de un cambio anterior
    SEP_POR_HOJA.clear()
    hay_cambio = any(pl.get('cambia_anio') for pl in plan.values())
    for nombre, pl in plan.items():
        if pl.get('col_sep'):
            SEP_POR_HOJA[nombre] = pl['col_sep']
        elif molde['hojas'][nombre].get('col_sep'):
            sp_ = molde['hojas'][nombre]['col_sep']
            if pl['n'] and pl['ins_en'] <= sp_:
                sp_ += pl['n']
            molde['hojas'][nombre]['col_sep'] = sp_
            SEP_POR_HOJA[nombre] = sp_
    for nombre, pl in plan.items():
        if pl.get('col_sep'):
            molde['hojas'][nombre]['col_sep'] = pl['col_sep']
    # al cambiar de año, una referencia que cae en el separador es 'el mes anterior' (diciembre);
    # en los meses siguientes, es el mes anterior del año nuevo
    SEP_HACIA['lado'] = 'viejo' if hay_cambio else 'nuevo'
    # febrero: si enero quedó pegado a una columna vacía que lo separa de diciembre (plantillas que la
    # contadora armó a mano), esa columna es el separador del año
    if not hay_cambio and nuevo_mes == 2:
        for nombre, pl in plan.items():
            if nombre in SEP_POR_HOJA or pl['p']['mes'] != 1:
                continue
            ws_ = wb[nombre]
            cand = pl['col_ant'] + (1 if pl['p']['orden'] == 'reciente_izquierda' else -1)
            if 1 <= cand <= ws_.max_column and cand != pl['col_mes'] and \
                    all(ws_.cell(rr, cand).value is None for rr in range(1, min(ws_.max_row, 300) + 1)):
                SEP_POR_HOJA[nombre] = cand
                molde['hojas'][nombre]['col_sep'] = cand

    # 3) Por hoja: estilos, encabezados, fórmulas clonadas, valores
    ins_rows_total = defaultdict(list)
    for nombre, pl in plan.items():
        ws = wb[nombre]
        h = molde['hojas'][nombre]
        p = pl['p']
        cm, ca = pl['col_mes'], pl['col_ant']
        max_fila = min(ws.max_row, MAX_FILAS)
        cont = defaultdict(int)

        # estilos + ancho
        for r in range(1, max_fila + 1):
            copiar_estilo(ws.cell(r, ca), ws.cell(r, cm))
        if ws.column_dimensions[get_column_letter(ca)].width:
            ws.column_dimensions[get_column_letter(cm)].width = ws.column_dimensions[get_column_letter(ca)].width
        if pl['col_sep']:
            # separador: copiar estilo/ancho de un separador existente (columna antes del grupo anterior)
            sep_ref = None
            grupo_ant = [c + (pl['n'] if c >= pl['ins_en'] else 0) for c in p['grupo_cols']]
            cand = max(grupo_ant) + 1 if p['orden'] == 'reciente_izquierda' else min(grupo_ant) - 1
            if 1 <= cand <= ws.max_column:
                sep_ref = cand
            if sep_ref:
                for r in range(1, max_fila + 1):
                    copiar_estilo(ws.cell(r, sep_ref), ws.cell(r, pl['col_sep']))
                w = ws.column_dimensions[get_column_letter(sep_ref)].width
                if w:
                    ws.column_dimensions[get_column_letter(pl['col_sep'])].width = w

        # encabezados
        fm = p['fila_mes']
        if pl['modo'] == 'llenar':
            # año mal escrito en la columna que la contadora dejó creada (ej. '2025' sobre FEBRERO 2026)
            for rr in range(1, min(ws.max_row, MAX_HEADER) + 1):
                vy = ws.cell(rr, cm).value
                if rr != fm and ((es_numero(vy) and float(vy).is_integer() and 2000 <= vy <= 2100) or
                                 (isinstance(vy, str) and re.fullmatch(r'\s*(19|20)\d{2}\s*', vy))):
                    if int(str(vy).strip().split('.')[0]) != nuevo_anio:
                        ws.cell(rr, cm).value = nuevo_anio if es_numero(vy) else str(nuevo_anio)
                        reporte.setdefault('acumulados', []).append(
                            f"{nombre}!{ws.cell(rr, cm).coordinate}: el año decía {vy}; se corrigió a {nuevo_anio}")
        mes_txt = texto_mes(nuevo_mes, ws.cell(fm, ca).value, nuevo_anio)
        es_fecha = bool(p.get('fila_fecha'))
        if es_fecha:
            # hojas con fechas de encabezado (ESF '30.11.2025'; ERI rango desde/hasta en 2 filas):
            # cada fila-fecha de la columna anterior se replica con el mes nuevo
            for rr in range(1, min(ws.max_row, MAX_HEADER) + 1):
                v_ant = ws.cell(rr, ca).value
                if parse_fecha(v_ant):
                    if pl['modo'] == 'insertar' or ws.cell(rr, cm).value is None or parse_fecha(ws.cell(rr, cm).value):
                        ws.cell(rr, cm).value = fecha_como(v_ant, nuevo_anio, nuevo_mes)
                        copiar_estilo(ws.cell(rr, ca), ws.cell(rr, cm))
            # columnas acumuladas (rango que termina en el mes anterior, ej. 01.01.2025–30.11.2025):
            # se corre su fecha final al mes nuevo si es el mismo año; su SUM ya se expandió al insertar
            for c_ac in p.get('acumuladas', []):
                c_now = c_ac + (pl['n'] if c_ac >= pl['ins_en'] else 0)
                fechas_col = [(rr, parse_fecha(ws.cell(rr, c_now).value)) for rr in range(1, min(ws.max_row, MAX_HEADER) + 1)]
                fechas_col = [(rr, f) for rr, f in fechas_col if f]
                if len(fechas_col) < 2:
                    continue
                (r_ini, f_ini), (r_fin, f_fin) = min(fechas_col, key=lambda x: x[1]), max(fechas_col, key=lambda x: x[1])
                if f_ini[0] == nuevo_anio and f_ini[1] == 1 and (f_fin[0], f_fin[1]) < (p['anio'], p['mes']):
                    # acumulado desde enero con la fecha final atrasada (la plantilla no la venía cambiando)
                    viejo_ = ws.cell(r_fin, c_now).value
                    ws.cell(r_fin, c_now).value = fecha_como(viejo_, nuevo_anio, nuevo_mes)
                    reporte.setdefault('acumulados', []).append(
                        f"{nombre}!{ws.cell(r_fin, c_now).coordinate}: el acumulado decía {viejo_}; ahora {ws.cell(r_fin, c_now).value}")
                elif (f_fin[0], f_fin[1]) == (p['anio'], p['mes']):
                    if f_ini[0] == nuevo_anio:
                        ws.cell(r_fin, c_now).value = fecha_como(ws.cell(r_fin, c_now).value, nuevo_anio, nuevo_mes)
                        reporte.setdefault('acumulados', []).append(
                            f"{nombre}!{ws.cell(r_fin, c_now).coordinate}: acumulado extendido hasta {ws.cell(r_fin, c_now).value}")
                    else:
                        reporte['advertencias'].append(
                            f"{nombre}: la columna acumulada {ws.cell(r_fin, c_now).column_letter} es del año {f_ini[0]} y el mes nuevo "
                            f"es de {nuevo_anio}. No se tocó: revisa si debes abrir el acumulado del año nuevo.")
        elif pl['modo'] == 'insertar':
            ws.cell(fm, cm).value = mes_txt
        # etiquetas tipo "ACUMULADO <mes>" que repiten el nombre del mes anterior en la fila de meses
        # pero no son una columna de período → pasan al mes nuevo
        cols_periodo = {c + (pl['n'] if c >= pl['ins_en'] else 0) for c, a, m in p['periodos']} | {cm}
        viejos = {norm(NOMBRE_MES[p['mes']]), norm(ABREV[p['mes']])}
        for cc in range(1, min(ws.max_column, 80) + 1):
            vv = ws.cell(fm, cc).value
            if cc not in cols_periodo and isinstance(vv, str) and not es_formula(vv) and norm(vv) in viejos:
                ws.cell(fm, cc).value = texto_mes(nuevo_mes, vv, nuevo_anio)
                reporte.setdefault('acumulados', []).append(f"{nombre}!{ws.cell(fm, cc).coordinate}: encabezado '{vv}' → '{ws.cell(fm, cc).value}'")
        # textos de encabezado que mencionan el mes anterior ("ACUMULADO A ABR") → mes nuevo
        viejo = ABREV[p['mes']]
        pat_mes = re.compile(r'\b(' + NOMBRE_MES[p['mes']] + '|' + viejo + r')\b', re.I)
        for rr in range(max(1, fm - 3), fm + 2):
            for cc in range(1, min(ws.max_column, 80) + 1):
                vv = ws.cell(rr, cc).value
                if isinstance(vv, str) and not es_formula(vv) and cc != cm and pat_mes.search(vv) and norm(vv) not in MESES:
                    ws.cell(rr, cc).value = pat_mes.sub(mes_txt.upper() if vv.isupper() else mes_txt, vv)
        if p['fila_anio'] and pl['modo'] == 'insertar':
            fa = p['fila_anio']
            # la celda de año del grupo actual se corrió junto con las columnas
            col_anio_ahora = p['col_anio'] + (pl['n'] if p['col_anio'] >= pl['ins_en'] else 0)
            if pl['cambia_anio']:
                ws.cell(fa, cm).value = nuevo_anio
                copiar_estilo(ws.cell(fa, col_anio_ahora), ws.cell(fa, cm))
            elif p['orden'] == 'reciente_izquierda' and col_anio_ahora == ca:
                # el año estaba en la columna del mes actual: moverlo a la nueva y, si estaba
                # combinado (B4:E4), extender la combinación para que arranque en la columna nueva
                ws.cell(fa, cm).value = ws.cell(fa, col_anio_ahora).value
                ws.cell(fa, col_anio_ahora).value = None
                for m in list(ws.merged_cells.ranges):
                    if m.min_row == fa and m.min_col == col_anio_ahora:
                        ws.merged_cells.remove(m)
                        ws.merge_cells(start_row=m.min_row, start_column=cm, end_row=m.max_row, end_column=m.max_col)
                        break

        # celdas
        bloques = h.get('bloques', [])
        escritos = {}   # (nit, cuentas) → fila donde ya se escribió este mes
        for fila_s, c in sorted(h['celdas'].items(), key=lambda kv: int(kv[0])):
            r = int(fila_s)
            tipo = c['tipo']
            dst = ws.cell(r, cm)
            if tipo in ('FORMULA', 'CADENA'):
                f_ant = ws.cell(r, ca).value
                c_src = ca
                if c.pop('cierre', None) and not pl.get('cambia_anio'):
                    # el mes anterior fue el primero del año (fórmula de cierre): se clona la del último
                    # mes del año anterior, que está al otro lado de la columna separadora
                    c_dic = ca + 2 if p['orden'] == 'reciente_izquierda' else ca - 2
                    if 1 <= c_dic <= ws.max_column and es_formula(ws.cell(r, c_dic).value) and ws.cell(r, ca + (1 if p['orden'] == 'reciente_izquierda' else -1)).value is None:
                        f_ant, c_src = ws.cell(r, c_dic).value, c_dic
                if es_formula(f_ant):
                    dst.value = trasladar_formula(f_ant, nombre, c_src, cm, col_min_por_hoja)
                    if not pl.get('cambia_anio') and nuevo_mes != 1 and not h.get('es_eri'):
                        f_n, mot_n = normalizar_resultado(dst.value, r, get_column_letter(ca), c.get('etiqueta'),
                                                          {n2 for n2, h2 in molde['hojas'].items() if h2.get('es_eri')},
                                                          {n2: get_column_letter(pl2['col_mes']) for n2, pl2 in plan.items()})
                        if f_n:
                            reporte.setdefault('cierre_anio', []).append(f"{nombre}!{dst.coordinate} ({c['etiqueta']}): {dst.value} → {f_n}; {mot_n}")
                            dst.value = f_n
                    if pl.get('cambia_anio') and not h.get('es_eri'):
                        f_ej = next((int(k) for k, x in h['celdas'].items() if x.get('etiqueta')
                                     and RE_EJERCICIO.search(norm(x['etiqueta'])) and not RE_ANTERIORES.search(norm(x['etiqueta']))), None)
                        f_c, mot_c = cierre_de_anio(dst.value, r, get_column_letter(ca), c.get('etiqueta'), f_ej)
                        if f_c:
                            reporte.setdefault('cierre_anio', []).append(f"{nombre}!{dst.coordinate} ({c['etiqueta']}): {dst.value} → {f_c}; {mot_c}")
                            dst.value = f_c
                            c['cierre'] = True     # el mes siguiente vuelve a la fórmula normal (la de diciembre)
                    if c.get('ajuste_manual'):
                        reporte['revisar'].append({'hoja': nombre, 'celda': dst.coordinate, 'etiqueta': c['etiqueta'],
                                                   'tipo': 'ajuste_manual', 'detalle': f"La fórmula del mes anterior tenía un ajuste a mano: {c['ajuste_manual']}"})
                cont[tipo] += 1
            elif tipo == 'BALANCE':
                val, ok = bal.valor(c['regla'])
                val = round(val, 2) if ok else 0
                if c['regla']['tipo'] == 'tercero' and (not ok or abs(val) <= 0.004):
                    # tercero sin saldo este mes: la celda queda vacía, como lo hace la contadora
                    dst.value = None
                    cont['BALANCE'] += 1
                    continue
                if c['regla']['tipo'] == 'tercero':
                    clave = (c['regla']['nit'], tuple(sorted(c['regla']['codigos'])))
                    if clave in escritos:
                        # el mismo tercero ya tiene su saldo en otra fila de esta hoja (fila repetida en la plantilla)
                        dst.value = None
                        reporte['revisar'].append({'hoja': nombre, 'celda': dst.coordinate, 'etiqueta': c['etiqueta'], 'tipo': 'duplicado',
                                                   'detalle': f"El tercero NIT {c['regla']['nit']} ya está en la fila {escritos[clave]}; esta fila repetida se dejó vacía."})
                        continue
                    escritos[clave] = r
                if c.get('ajuste'):
                    # fórmula con ajuste a mano: número nuevo del balance + el ajuste de ella, y se avisa.
                    # Se parte de la fórmula viva del mes anterior (ya con referencias corridas), se cambia
                    # solo el token numérico y se traslada a la columna nueva.
                    f_ant = ws.cell(r, ca).value
                    texto = repr(abs(val)) if isinstance(val, float) and not float(val).is_integer() else str(int(abs(val)))
                    if es_formula(f_ant):
                        try:
                            toks = Tokenizer(f_ant).items
                            idx = c.get('ajuste_idx')
                            if idx is not None and idx < len(toks) and toks[idx].subtype == Token.NUMBER:
                                partes = ['=']
                                for i, t in enumerate(toks):
                                    partes.append(texto if i == idx else t.value)
                                f_nueva = ''.join(partes)
                            else:
                                f_nueva = c['ajuste'].replace('{V}', texto)
                        except Exception:
                            f_nueva = c['ajuste'].replace('{V}', texto)
                        dst.value = trasladar_formula(f_nueva, nombre, ca, cm, col_min_por_hoja)
                    else:
                        dst.value = c['ajuste'].replace('{V}', texto)
                    reporte['revisar'].append({'hoja': nombre, 'celda': dst.coordinate, 'etiqueta': c['etiqueta'],
                                               'tipo': 'ajuste_manual', 'detalle': f"Se actualizó el valor del balance pero se conservó el ajuste a mano del mes anterior: {dst.value}"})
                else:
                    dst.value = val
                if not ok:
                    reporte['revisar'].append({'hoja': nombre, 'celda': dst.coordinate, 'etiqueta': c['etiqueta'],
                                               'tipo': 'cuenta_ausente', 'detalle': f"La regla {c['regla']} no encontró la cuenta en el balance nuevo. Se dejó en 0."})
                cont['BALANCE'] += 1
            elif tipo == 'CONSTANTE':
                dst.value = c['valor']
                cont['CONSTANTE'] += 1
            elif tipo == 'MANUAL':
                dst.value = c['valor']
                reporte['revisar'].append({'hoja': nombre, 'celda': dst.coordinate, 'etiqueta': c['etiqueta'],
                                           'tipo': 'manual', 'detalle': f"Valor del mes anterior arrastrado ({c['valor']:,.0f}). No viene del balance: revísalo."})
                cont['MANUAL'] += 1
            elif tipo == 'TEXTO':
                es_anio_enc = r <= MAX_HEADER and re.fullmatch(r'\s*(19|20)\d{2}\s*', str(c['valor']))
                if es_anio_enc:
                    if dst.value is None or str(dst.value).strip() == str(c['valor']).strip():
                        dst.value = str(nuevo_anio)
                elif not parse_fecha(c['valor']):      # las fechas de encabezado ya se escribieron arriba
                    dst.value = c['valor']
            elif tipo == 'PENDIENTE':
                if c.get('enlace'):
                    # fila resumen que otros meses trae de otra hoja: se enlaza igual en el mes nuevo
                    hoja_e = c['enlace']
                    filas_e = Counter(); cols_e = Counter()
                    for cc in range(1, min(ws.max_column, 80) + 1):
                        vv = ws.cell(r, cc).value
                        m_ = ENLACE_RE.match(vv.strip()) if isinstance(vv, str) else None
                        if m_ and m_.group(1) == hoja_e and cc != cm:
                            filas_e[int(m_.group(3))] += 1
                    for rr in range(1, min(ws.max_row, MAX_FILAS) + 1):
                        vv = ws.cell(rr, cm).value
                        m_ = ENLACE_RE.match(vv.strip()) if isinstance(vv, str) else None
                        if m_ and m_.group(1) == hoja_e:
                            cols_e[m_.group(2).upper()] += 1
                    if filas_e and cols_e:
                        q_ = f"'{hoja_e}'" if not re.fullmatch(r'\w+', hoja_e) else hoja_e
                        dst.value = f"=+{q_}!{cols_e.most_common(1)[0][0]}{filas_e.most_common(1)[0][0]}"
                        h['celdas'][str(r)] = {'tipo': 'FORMULA', 'etiqueta': c['etiqueta']}
                        reporte.setdefault('enlazados', []).append(f"{nombre}!{dst.coordinate} ({c['etiqueta']}) → {dst.value}")
                        continue
                if c.get('cero'):
                    dst.value = 0          # la contadora tenía un 0 escrito; si este mes hay movimiento, 3a lo reemplaza

        # 3a) estado de resultados: renglones pendientes por nombre (vacíos cuando se aprendió)
        pend = {int(k): c for k, c in h['celdas'].items() if c['tipo'] == 'PENDIENTE' or c.get('por_nombre')}
        if pend:
            usados = set()
            for c in h['celdas'].values():
                if c['tipo'] == 'BALANCE':
                    rg = c['regla']
                    usados.update([rg['codigo']] if 'codigo' in rg else rg.get('codigos', []))
            for b in bloques:
                cp = b['cuenta_padre']
                usados.update(cp if isinstance(cp, list) else [cp])
            def _usado(cod):
                return any(cod.startswith(u) or u.startswith(cod) for u in usados)
            signos = Counter(c['regla'].get('signo', 1) for c in h['celdas'].values()
                             if c['tipo'] == 'BALANCE' and str((c['regla'].get('codigo') or (c['regla'].get('codigos') or ['5'])[0]))[:1] in '567')
            signo_gasto = signos.most_common(1)[0][0] if signos else 1
            es_eri_h = h.get('es_eri')
            src_p = bal.mov if es_eri_h else bal.sf
            cand = [cod for cod, v in src_p.items() if len(cod) == 6 and cod[:1] in ('4567' if es_eri_h else '123')
                    and abs(v) > TOL and not _usado(cod)]
            ya_tenia = set((molde.get('con_valor') or {}).get('mov' if es_eri_h else 'sf', []))
            pares = []
            for r, c in pend.items():
                if c.get('seccion_vacia') and c.get('prefijo') and c['prefijo'][:4] in ya_tenia:
                    continue          # sección entera en blanco aunque su cuenta tenía valor: la lleva en otro lado
                for cod in cand:
                    if cod in ya_tenia and not c.get('por_nombre'):
                        continue      # el mes anterior la cuenta ya tenía valor y el renglón estaba vacío: lo lleva en otro lado
                    fuera_pref = False
                    if c.get('prefijo') and not cod.startswith(c['prefijo']):
                        # misma sección del balance (ej. 'Sueldo' en beneficios a empleados → 250505), solo con nombre exacto
                        if cod[:2] != c['prefijo'][:2]:
                            continue
                        ct_, nt_ = contenido_nombre(c['etiqueta'], bal.nombre.get(cod, ''))
                        if not (ct_ >= 1.0 and nt_ >= 1):
                            continue
                        fuera_pref = True
                    sc = similitud_cuenta(c['etiqueta'], bal.nombre.get(cod, ''))
                    if cod.startswith('5405') and re.search(r'\b(imp|impto|impuesto|provision)\b.*\brenta\b', norm(c['etiqueta'])):
                        sc = max(sc, 0.95)       # 'Provisión imp. renta' = gasto de impuesto de renta (5405)
                    tb_ = bal.terceros_bajo(cod)
                    if len(tb_) == 1 and c.get('prefijo'):
                        # renglón con el nombre del ÚNICO tercero de la cuenta (ej. 'Cámara de Comercio' → 514010)
                        t_ = next(iter(tb_.values()))
                        ct_, nt_ = contenido_nombre(c['etiqueta'], t_['nombre'])
                        if ct_ >= 1.0 and nt_ >= 2:
                            sc = max(sc, 0.9)
                    umbral = 0.75 if c.get('prefijo') else 0.92
                    if fuera_pref:
                        sc = max(sc, 0.8)
                    if not c.get('prefijo'):
                        cont_, n_ = contenido_nombre(c['etiqueta'], bal.nombre.get(cod, ''))
                        if cont_ >= 1.0 and n_ >= 2:
                            umbral = 0.8
                    # renglón encadenado cuyo valor anterior coincide con el movimiento: corrobora el nombre
                    va = c.get('valor_ant')
                    if c.get('prefijo') and es_numero(va) and abs(abs(va) - abs(src_p[cod])) <= TOL:
                        umbral = 0.5
                        sc += 0.01
                    if sc >= umbral:
                        pares.append((sc, r, cod))
            pares.sort(reverse=True)
            asig_r, asig_c = set(), set()
            for sc, r, cod in pares:
                if r in asig_r or cod in asig_c:
                    continue
                asig_r.add(r); asig_c.add(cod)
                if pend[r].get('signo') is not None:
                    sg = pend[r]['signo']
                elif es_eri_h:
                    sg = -1 if cod[:1] == '4' else signo_gasto
                else:
                    sg = 1 if cod[:1] == '1' else -1
                val = round(sg * src_p[cod], 2)
                ws.cell(r, cm).value = val
                if pend[r].get('por_nombre'):
                    reporte.setdefault('acumulados', []).append(
                        f"{nombre}!{ws.cell(r, cm).coordinate}: '{pend[r]['etiqueta']}' repetía el mes anterior; ahora toma el movimiento de {cod}")
                h['celdas'][str(r)] = {'tipo': 'BALANCE', 'etiqueta': pend[r]['etiqueta'], 'origen': 'nombre',
                                       'regla': {'tipo': 'cuenta', 'codigo': cod, 'campo': 'mov' if es_eri_h else 'sf', 'signo': sg}}
                reporte.setdefault('asignados_por_nombre', []).append(
                    {'hoja': nombre, 'celda': ws.cell(r, cm).coordinate, 'etiqueta': pend[r]['etiqueta'], 'codigo': cod,
                     'cuenta': bal.nombre.get(cod, ''), 'valor': val, 'similitud': round(sc, 2)})
                cont['BALANCE'] += 1

        # 3b) terceros ya conocidos (con fila) que este mes traen saldo y el mes anterior estaban vacíos
        def codigos_cubiertos(b):
            out = []
            for fila_s in range(b['inicio'], b['fin'] + 1):
                c = h['celdas'].get(str(fila_s))
                if c and c['tipo'] == 'BALANCE' and c['regla']['tipo'] in ('cuenta', 'suma', 'resto'):
                    out += [c['regla']['codigo']] if 'codigo' in c['regla'] else c['regla']['codigos']
            return out
        for b in bloques:
            tb_all = bal.terceros_bajo(b['cuenta_padre'])
            cubiertos_b = codigos_cubiertos(b)
            for fila_s, info in b['nomina'].items():
                nit = info.get('nit')
                c_fila = h['celdas'].get(fila_s)
                # fila de tercero que el mes base estaba en 0 o vacía: se llena si este mes tiene movimiento
                if not nit or (c_fila and not (c_fila['tipo'] == 'CONSTANTE' and not c_fila.get('valor'))):
                    continue
                cf = b.get('campo', 'sf')
                t = tb_all.get(nit)
                if t and cubiertos_b:
                    libres = [cc for cc in t['codigos'] if not any(cc.startswith(k) for k in cubiertos_b)]
                    t = dict(t, codigos=libres, sf=sum(bal.terceros[cc][nit]['sf'] for cc in libres),
                             mov=sum(bal.terceros[cc][nit]['mov'] for cc in libres)) if libres else None
                if t and abs(t[cf]) > TOL:
                    clave = (nit, tuple(sorted(t['codigos'])))
                    if clave in escritos:
                        continue   # ya escrito en otra fila de la hoja
                    escritos[clave] = int(fila_s)
                    r = int(fila_s)
                    ws.cell(r, cm).value = round(b.get('signo', 1) * t[cf], 2)
                    h['celdas'][fila_s] = {'tipo': 'BALANCE', 'etiqueta': info.get('etiqueta', ''),
                                           'regla': {'tipo': 'tercero', 'codigos': t['codigos'], 'nit': nit, 'campo': cf,
                                                     'signo': b.get('signo', 1), 'nombre': t['nombre']}}
                    cont['BALANCE'] += 1

        # 4) terceros nuevos por bloque → insertar filas dentro del bloque (en orden alfabético)
        nits_hoja = set()
        for bb in bloques:
            nits_hoja.update(v['nit'] for v in bb['nomina'].values() if v.get('nit'))
        for c in h['celdas'].values():
            if c['tipo'] == 'BALANCE' and c['regla']['tipo'] == 'tercero':
                nits_hoja.add(c['regla']['nit'])
            if c['tipo'] == 'BALANCE' and c['regla']['tipo'] == 'resto':
                nits_hoja.update(c['regla'].get('excluir_nits', []))
        # ¿en qué bloques aparece cada subcuenta (6 díg.)? Si una subcuenta está repartida entre varios
        # bloques (ej. terceros de 2380 en "Otros" y en "Acreedores varios"), es criterio de la contadora
        # dónde va cada tercero nuevo: no se inserta, se lista para que ella decida.
        # filas (fuera de cada bloque) donde aparecen terceros de cada subcuenta
        filas_por_cod = defaultdict(set)
        rangos_bloques = [(bb['inicio'], bb['fin']) for bb in bloques]
        # también cuentan los bloques "sin padre" (mezclan cuentas): se detectan por su SUM
        for bb in detectar_bloques(ws, cm, min(ws.max_row, MAX_FILAS)):
            rangos_bloques.append((bb['inicio'], bb['fin']))
        for fila_s, c in h['celdas'].items():
            if c['tipo'] == 'BALANCE' and c['regla']['tipo'] == 'tercero':
                f = int(fila_s)
                if any(a <= f <= z for a, z in rangos_bloques):   # solo filas que están dentro de algún bloque
                    for cc in c['regla']['codigos']:
                        filas_por_cod[cc].add(f)
        terceros_sin_fila = []
        for i_b, b in sorted(enumerate(bloques), key=lambda x: -x[1]['inicio']):
            cp = b['cuenta_padre']
            prefijos = cp if isinstance(cp, list) else [cp]
            # bloques hermanos MÁS específicos (ej. 'Servicios'=617015 y 'Honorarios'=61701504): sus
            # códigos son de ellos, no hacen 'repartida' a la cuenta general ni se insertan aquí
            especificos = set()
            for bb in bloques:
                if bb is b:
                    continue
                for q in (bb['cuenta_padre'] if isinstance(bb['cuenta_padre'], list) else [bb['cuenta_padre']]):
                    if any(str(q).startswith(str(pf)) and len(str(q)) > len(str(pf)) for pf in prefijos):
                        especificos.add(str(q))
            repartida = b.get('origen') != 'contadora' and any(
                any(f < b['inicio'] or f > b['fin']
                    for cc, fs in filas_por_cod.items()
                    if cc.startswith(pf) and not any(cc.startswith(sp) for sp in especificos) for f in fs)
                for pf in prefijos)
            cubierto_por_contadora = any(
                bb is not b and bb.get('origen') == 'contadora' and
                any(pf[:6] == q[:6] for pf in prefijos for q in (bb['cuenta_padre'] if isinstance(bb['cuenta_padre'], list) else [bb['cuenta_padre']]))
                for bb in bloques)
            if cubierto_por_contadora:
                continue
            # un tercero es "conocido" para ESTE bloque solo si ya tiene fila para esta misma cuenta
            # (el mismo NIT puede estar en Servicios y en Honorarios: son cuentas distintas)
            def _solapa(a, bb_):
                return any(str(x).startswith(str(y)) or str(y).startswith(str(x)) for x in a for y in bb_)
            nits_conocidos = set(v['nit'] for v in b['nomina'].values() if v.get('nit'))
            for bb in bloques:
                cpb = bb['cuenta_padre']
                if bb is not b and _solapa(prefijos, cpb if isinstance(cpb, list) else [cpb]):
                    nits_conocidos.update(v['nit'] for v in bb['nomina'].values() if v.get('nit'))
            for c in h['celdas'].values():
                if c['tipo'] == 'BALANCE' and c['regla']['tipo'] == 'tercero' and _solapa(prefijos, c['regla'].get('codigos', [])):
                    nits_conocidos.add(c['regla']['nit'])
                if c['tipo'] == 'BALANCE' and c['regla']['tipo'] == 'resto' and _solapa(prefijos, [c['regla']['codigo']]):
                    nits_conocidos.update(c['regla'].get('excluir_nits', []))
            # códigos que un renglón a nivel de cuenta DENTRO del bloque ya incluye (ej. "Remisiones" = 220506):
            # los terceros de esos códigos no se insertan, ya están sumados ahí
            cubiertos = codigos_cubiertos(b)
            cf = b.get('campo', 'sf')
            nuevos = []
            for nit, t in bal.terceros_bajo(cp).items():
                if nit in nits_conocidos:
                    continue
                if cubiertos or especificos:
                    cods_libres = [cc for cc in t['codigos'] if not any(cc.startswith(k) for k in list(cubiertos) + list(especificos))]
                    if not cods_libres:
                        continue
                    t = dict(t, codigos=cods_libres,
                             sf=sum(bal.terceros[cc][nit]['sf'] for cc in cods_libres),
                             mov=sum(bal.terceros[cc][nit]['mov'] for cc in cods_libres))
                if abs(t[cf]) <= TOL:
                    continue
                nuevos.append((nit, t))
            if not nuevos:
                continue
            if not b.get('puro', True) or repartida:
                for nit, t in nuevos:
                    terceros_sin_fila.append({'hoja': nombre, 'nit': nit, 'nombre': proper(t['nombre']), 'valor': round(t[cf], 2),
                                              'cuenta': ','.join(sorted({c[:6] for c in t['codigos']})),
                                              'motivo': 'la cuenta está repartida en varios bloques; decide en cuál va' if repartida else 'el bloque ya tiene un renglón a nivel de cuenta que lo incluye'})
                continue
            nuevos.sort(key=lambda x: norm(proper(x[1]['nombre'])))
            # posición alfabética dentro del bloque; nunca en la primera fila (para que el SUM se expanda)
            # ni después de la última (quedaría fuera del rango)
            primero = norm(proper(nuevos[0][1]['nombre']))
            pos = b['fin'] + 1
            for rr in range(b['inicio'], b['fin'] + 1):
                et = norm(b['nomina'].get(str(rr), {}).get('etiqueta') or etiqueta_valor_ws(ws, rr, cm))
                if et and et > primero:
                    pos = rr
                    break
            fila_ins = min(max(pos, b['inicio'] + 1), b['fin'])
            n = len(nuevos)
            insertar_fila_hoja(ws, fila_ins, n)
            reescribir_todo(wb, {}, {nombre: [(fila_ins, n)]})
            if b['fin'] == b['inicio']:
                # bloque de una sola fila: el SUM(Xa:Xa) no se expande solo → arreglarlo
                fila_total = b['fila_total'] + (n if b['fila_total'] >= fila_ins else 0)
                ft = ws.cell(fila_total, cm).value
                letra = get_column_letter(cm)
                if es_formula(ft):
                    ws.cell(fila_total, cm).value = re.sub(
                        r'SUM\(' + letra + r'(\d+):' + letra + r'(\d+)\)',
                        lambda m: f"SUM({letra}{m.group(1)}:{letra}{int(m.group(2)) + n})", ft, flags=re.I)
            ref_row = fila_ins - 1
            col_et = 1
            for cc in range((b.get('nit_col') or 0) + 1, cm):
                if isinstance(ws.cell(ref_row, cc).value, str):
                    col_et = cc
                    break
            for i, (nit, t) in enumerate(nuevos):
                rr = fila_ins + i
                for cc in range(1, min(ws.max_column, 60) + 1):
                    copiar_estilo(ws.cell(ref_row, cc), ws.cell(rr, cc))
                ws.cell(rr, col_et).value = proper(t['nombre']) if not b.get('nit_col') else str(t['nombre']).strip()
                if b.get('nit_col'):
                    ws.cell(rr, b['nit_col']).value = int(nit) if nit.isdigit() else nit
                ws.cell(rr, cm).value = round(b.get('signo', 1) * t[cf], 2)
                reporte['terceros_nuevos'].append({'hoja': nombre, 'celda': ws.cell(rr, cm).coordinate, 'nit': nit,
                                                   'nombre': proper(t['nombre']), 'valor': round(t[cf], 2),
                                                   'cuenta': ','.join(b['cuenta_padre']) if isinstance(b['cuenta_padre'], list) else b['cuenta_padre']})
            # correr en el molde todo lo que quedó debajo de la inserción (en esta hoja)
            def corre(x):
                return x + n if x >= fila_ins else x
            for bb in bloques:
                bb['inicio'] = corre(bb['inicio'])
                bb['fin'] = corre(bb['fin'])
                bb['fila_total'] = corre(bb['fila_total'])
                bb['nomina'] = {str(corre(int(k))): v for k, v in bb['nomina'].items()}
            h['celdas'] = {str(corre(int(k))): v for k, v in h['celdas'].items()}
            for i, (nit, t) in enumerate(nuevos):
                b['nomina'][str(fila_ins + i)] = {'etiqueta': proper(t['nombre']), 'nit': nit}
                h['celdas'][str(fila_ins + i)] = {'tipo': 'BALANCE', 'etiqueta': proper(t['nombre']),
                                                  'regla': {'tipo': 'tercero', 'codigos': t['codigos'], 'nit': nit,
                                                            'campo': b.get('campo', 'sf'), 'signo': b.get('signo', 1), 'nombre': t['nombre']}}

        if terceros_sin_fila:
            reporte.setdefault('terceros_sin_fila', []).extend(terceros_sin_fila)
            # los que ya están incluidos por un renglón de cuenta no son un faltante; los repartidos sí
            n_rep = sum(1 for x in terceros_sin_fila if 'repartida' in x['motivo'])
            if n_rep:
                reporte['advertencias'].append(
                    f"{nombre}: {n_rep} tercero(s) nuevo(s) con saldo no tienen fila porque su cuenta está repartida entre varios bloques "
                    f"(ver 'terceros sin fila'). Agrégalos donde correspondan; mientras tanto el total de esa cuenta queda incompleto.")
        reporte['hojas'][nombre] = dict(cont)
        # actualizar molde: nueva columna actual
        h['col_actual'] = cm
        h['anio'], h['mes'] = nuevo_anio, nuevo_mes
        h['fila_anio'] = p['fila_anio']
        h['col_anio'] = cm if (pl['cambia_anio'] or (p['orden'] == 'reciente_izquierda')) else (p['col_anio'] or cm)
        h['grupo_cols'] = ([cm] if pl['cambia_anio'] else sorted(set([cm] + [c + pl['n'] for c in p['grupo_cols']])))
        reporte['hojas'][nombre]['modo'] = pl['modo']

    # 5) cobertura del balance nuevo
    codigos_usados = set()
    for h in molde['hojas'].values():
        for c in h['celdas'].values():
            if c['tipo'] == 'BALANCE':
                rg = c['regla']
                if 'codigo' in rg:
                    codigos_usados.add(rg['codigo'])
                else:
                    codigos_usados.update(rg['codigos'])
        for b in h.get('bloques', []):
            cp = b['cuenta_padre']
            codigos_usados.update(cp if isinstance(cp, list) else [cp])

    def cubierto(cod):
        return any(u == cod or cod.startswith(u) or u.startswith(cod) for u in codigos_usados)
    for cod, v in sorted(bal.sf.items()):
        if len(cod) == 6 and abs(v) > TOL and cod[0] in '123' and not cubierto(cod):
            reporte['sin_ubicar'].append({'codigo': cod, 'nombre': bal.nombre.get(cod, ''), 'saldo': round(v, 2)})

    for hoja in molde.get('anexos', []):
        reporte['advertencias'].append(
            f"La hoja '{hoja}' no tiene columnas de meses (es un anexo que se reemplaza cada mes) y alimenta el ESF. "
            f"El sistema NO la actualiza: pega ahí el anexo de {ABREV[nuevo_mes]} {nuevo_anio} y revisa los renglones que dependen de ella.")
    hojas_eri = [n for n, h in molde['hojas'].items() if h.get('es_eri')]
    if hojas_eri:
        usados_eri = set()
        for n in hojas_eri:
            for c in molde['hojas'][n]['celdas'].values():
                if c['tipo'] == 'BALANCE':
                    rg = c['regla']
                    usados_eri.update([rg['codigo']] if 'codigo' in rg else rg.get('codigos', []))
            for b in molde['hojas'][n].get('bloques', []):
                cp = b['cuenta_padre']
                usados_eri.update(cp if isinstance(cp, list) else [cp])
        valores_cadena = set()
        for n in hojas_eri:
            for c in molde['hojas'][n]['celdas'].values():
                if c.get('por_nombre') and c['tipo'] == 'CADENA' and es_numero(c.get('valor_ant')):
                    valores_cadena.add(int(round(abs(c['valor_ant']))))
        cub_total = set()        # cuentas cubiertas completas (renglón de cuenta/suma o bloque de terceros)
        cub_ter = set()          # (auxiliar, nit) cubiertos por un renglón de tercero suelto
        for n in hojas_eri:
            for c in molde['hojas'][n]['celdas'].values():
                if c['tipo'] != 'BALANCE':
                    continue
                rg = c['regla']
                if rg['tipo'] == 'tercero':
                    for cc in rg.get('codigos', []):
                        cub_ter.add((cc, rg['nit']))
                else:
                    cub_total.update([rg['codigo']] if 'codigo' in rg else rg.get('codigos', []))
            for b in molde['hojas'][n].get('bloques', []):
                cp = b['cuenta_padre']
                cub_total.update(cp if isinstance(cp, list) else [cp])
        con_mov = {cod: v for cod, v in bal.mov.items() if cod[:1] in '4567' and len(cod) >= 6 and abs(v) > TOL}
        hojas_cod = [cod for cod in con_mov if not any(o != cod and o.startswith(cod) for o in con_mov)]
        for cod in sorted(hojas_cod):
            v = con_mov[cod]
            if any(cod.startswith(u) for u in cub_total) or int(round(abs(v))) in valores_cadena:
                continue
            falt = v
            detalle = []
            if cod in bal.terceros:
                falt = 0.0
                for nit, t in bal.terceros[cod].items():
                    if (cod, nit) in cub_ter or abs(t['mov']) <= TOL:
                        continue
                    falt += t['mov']
                    detalle.append(f"{proper(t['nombre'])} {t['mov']:,.0f}")
            if abs(falt) > TOL:
                reporte.setdefault('sin_ubicar_eri', []).append(
                    {'codigo': cod, 'nombre': bal.nombre.get(cod, ''), 'movimiento': round(falt, 2),
                     'terceros': detalle[:8]})
        if reporte.get('sin_ubicar_eri'):
            tot = sum(x['movimiento'] for x in reporte['sin_ubicar_eri'])
            reporte['advertencias'].append(
                f"Estado de resultados: {len(reporte['sin_ubicar_eri'])} subcuenta(s) con movimiento este mes no tienen renglón "
                f"en las notas (neto {tot:,.0f}). Agrégalas a la nota o el resultado del mes no cuadrará con el balance.")
    # ── ESF: 'resultado del ejercicio' / 'ejercicios anteriores' que no vienen de las notas
    #    (cadena propia) se enlazan al renglón con el mismo nombre de la hoja de notas ──
    hojas_bg = [n for n in plan if not molde['hojas'][n].get('es_eri')]
    for nombre in hojas_bg:
        pl = plan[nombre]
        ws = wb[nombre]
        cm = pl['col_mes']
        refs_a = Counter()
        for rr in range(1, min(ws.max_row, MAX_FILAS) + 1):
            vv = ws.cell(rr, cm).value
            if es_formula(vv):
                for hj, cc_, rr_, ab_ in referencias_de(vv, nombre):
                    if hj != nombre and hj in hojas_bg:
                        refs_a[hj] += 1
        if not refs_a:
            continue
        notas, n_refs = refs_a.most_common(1)[0]
        if n_refs < 3:
            continue
        cel_n = molde['hojas'][notas]['celdas']
        for fila_s, c in molde['hojas'][nombre]['celdas'].items():
            et = norm(c.get('etiqueta') or '')
            if c['tipo'] not in ('FORMULA', 'CADENA') or not et:
                continue
            es_ant = bool(RE_ANTERIORES.search(et))
            es_ej = bool(RE_EJERCICIO.search(et)) and not es_ant
            if not (es_ant or es_ej):
                continue
            vv = ws.cell(int(fila_s), cm).value
            if not es_formula(vv):
                continue
            hojas_ref = {hj for hj, *_ in referencias_de(vv, nombre) if hj != nombre}
            # ejercicio: solo si es una cadena propia; anteriores: también si (por error) trae el ERI del mes
            if hojas_ref and (es_ej or not all(molde['hojas'].get(hj, {}).get('es_eri') for hj in hojas_ref)):
                continue
            cands = []
            for fn, cn in cel_n.items():
                en = norm(cn.get('etiqueta') or '')
                if not en or bool(RE_ANTERIORES.search(en)) != es_ant:
                    continue
                if not es_ant and not RE_EJERCICIO.search(en):
                    continue
                cands.append((similitud_cuenta(et, en), int(fn)))
            if not cands:
                continue
            sc_, fn_ = max(cands)
            if sc_ < 0.7:
                continue
            q_ = f"'{notas}'" if not re.fullmatch(r'\w+', notas) else notas
            nueva = f"=+{q_}!{get_column_letter(plan[notas]['col_mes'])}{fn_}"
            reporte.setdefault('cierre_anio', []).append(
                f"{nombre}!{ws.cell(int(fila_s), cm).coordinate} ({c['etiqueta']}): {vv} → {nueva}; se toma de {notas} como los demás renglones")
            ws.cell(int(fila_s), cm).value = nueva

    # ── cambio de año: los acumulados horizontales no deben mezclar años ──
    #    (al insertar enero al inicio de 'SUM(C13:N13)' quedaba enero + todo el año anterior)
    for nombre, pl in plan.items():
        if not pl.get('cambia_anio') or not pl.get('col_sep'):
            continue
        ws = wb[nombre]
        p = pl['p']
        cm, cs = pl['col_mes'], pl['col_sep']
        nuevos_cols = {cm}
        viejo_lado = (lambda c: c > cs) if p['orden'] == 'reciente_izquierda' else (lambda c: c < cs)
        nombres_nuevos = {norm(NOMBRE_MES[nuevo_mes]), norm(ABREV[nuevo_mes])}

        def es_col_nueva(cc):
            v = ws.cell(p['fila_mes'], cc).value
            if isinstance(v, str) and norm(v).strip() in nombres_nuevos:
                return True
            fechas = [parse_fecha(ws.cell(rr, cc).value) for rr in range(1, min(ws.max_row, MAX_HEADER) + 1)]
            fechas = [f for f in fechas if f]
            return bool(fechas) and max(fechas)[0] == nuevo_anio

        cambios = 0
        for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, MAX_FILAS)):
            for cell in row:
                v = cell.value
                if not es_formula(v) or ':' not in v or cell.column in (cm, cs):
                    continue
                try:
                    toks = Tokenizer(v).items
                except Exception:
                    continue
                cambio = False
                partes = ['=']
                for t in toks:
                    val = t.value
                    if t.type == Token.OPERAND and t.subtype == Token.RANGE and '!' not in val:
                        ms = [REF_RE.match(x) for x in val.split(':')]
                        if len(ms) == 2 and all(ms) and ms[0].group(4) == ms[1].group(4):
                            a = column_index_from_string(ms[0].group(2).upper())
                            z = column_index_from_string(ms[1].group(2).upper())
                            a, z = min(a, z), max(a, z)
                            if a <= cm <= z and any(viejo_lado(c) for c in range(a, z + 1)):
                                fila = ms[0].group(4)
                                if es_col_nueva(cell.column):
                                    val = f"{get_column_letter(cm)}{fila}:{get_column_letter(cm)}{fila}"
                                else:
                                    viejos = [c for c in range(a, z + 1) if viejo_lado(c)]
                                    val = f"{get_column_letter(min(viejos))}{fila}:{get_column_letter(max(viejos))}{fila}"
                                cambio = True
                    partes.append(val)
                if cambio:
                    cell.value = ''.join(partes)
                    cambios += 1
        if cambios:
            reporte.setdefault('cierre_anio', []).append(
                f"{nombre}: {cambios} suma(s) acumulada(s) separadas por año (el acumulado del año nuevo arranca en {NOMBRE_MES[nuevo_mes].lower()}; "
                f"el del año anterior queda solo con sus meses)")

    molde['periodo_base'] = {'anio': nuevo_anio, 'mes': nuevo_mes}
    molde['con_valor'] = cuentas_con_valor(bal)
    wb.save(salida_path)
    try:
        os.unlink(esf_opt)
    except OSError:
        pass
    json.dump(molde, open(molde_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    reporte['resumen'] = {
        'celdas_balance': sum(c.get('BALANCE', 0) for c in reporte['hojas'].values()),
        'celdas_formula': sum(c.get('FORMULA', 0) + c.get('CADENA', 0) for c in reporte['hojas'].values()),
        'revisar': len(reporte['revisar']), 'terceros_nuevos': len(reporte['terceros_nuevos']),
        'terceros_sin_fila': len(reporte.get('terceros_sin_fila', [])),
        'asignados_por_nombre': len(reporte.get('asignados_por_nombre', [])),
        'sin_ubicar_eri': len(reporte.get('sin_ubicar_eri', [])),
        'sin_ubicar': len(reporte['sin_ubicar']), 'hojas': len(reporte['hojas']),
    }
    print(json.dumps({'ok': True, 'reporte': reporte}, ensure_ascii=False))


# ─────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    args = sys.argv[1:]
    try:
        if len(args) in (4, 5) and args[0] == 'aprender':
            aprender(args[1], args[2], args[3], args[4] if len(args) == 5 else None)
        elif len(args) == 5 and args[0] == 'extender':
            extender(args[1], args[2], args[3], args[4])
        else:
            print(__doc__)
            sys.exit(2)
    except SystemExit as e:
        if e.code and not isinstance(e.code, int):
            print(json.dumps({'ok': False, 'error': str(e.code)}, ensure_ascii=False))
            sys.exit(1)
        raise
    except Exception as e:
        import traceback
        sys.stderr.write(traceback.format_exc())
        print(json.dumps({'ok': False, 'error': str(e)}, ensure_ascii=False))
        sys.exit(1)
