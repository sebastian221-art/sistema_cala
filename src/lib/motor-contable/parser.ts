/**
 * ============================================================
 * PARSER DE BALANCE — SIIGO + WORLD OFFICE + SIESA (COLOMBIA)
 * ============================================================
 * Versión: 6.0.0
 *
 * GENÉRICO: funciona para cualquier empresa colombiana en Siigo,
 * World Office O SIESA. Detecta el formato automáticamente por los
 * nombres de columna y adapta el mapeo.
 *
 * ─── FORMATO SIIGO ("Balance de prueba por tercero") ───
 *   Filas 1-7: metadata (empresa, NIT, período)
 *   Fila 8:    headers (Nivel, Transaccional, Código cuenta contable, ...)
 *   Columna "Nivel" indica Clase/Grupo/Cuenta/Subcuenta/Auxiliar.
 *   Tercero: filas con nivel = Auxiliar/Subauxiliar.
 *
 * ─── FORMATO WORLD OFFICE ("Mayor y balances con terceros") ───
 *   Fila 1:    headers (Cuenta, Nombre cuenta, Tercero, Nombre tercero, ...)
 *   NO hay columna "Nivel" → el nivel se infiere por longitud de código.
 *   Tercero: filas con la columna "Tercero" con valor.
 *
 * ─── FORMATO SIESA ("Balance por terceros") ───
 *   Fila 1:    headers (Auxiliar, Desc. auxiliar, Razón social tercero movto.,
 *              Tercero, Saldo inicial, Débitos, Créditos, Saldo final)
 *   El CÓDIGO de cuenta está en la columna "Auxiliar". Puede venir como
 *   código solo ("11050501") o pegado al nombre ("1105 - CAJA"): se toma
 *   solo el número inicial.
 *   NO hay columna "Nivel" → el nivel se infiere por longitud de código.
 *   Tercero: filas con la columna "Tercero" (NIT) con valor; el nombre está
 *   en "Razón social tercero movto.". El nombre de la cuenta está en
 *   "Desc. auxiliar".
 *   NO trae metadata de empresa/NIT/período → se infiere del nombre de
 *   archivo o se deja editable (no rompe).
 *
 * MODO DE SIGNOS (los tres, NEGATIVO estándar Colombia):
 *   Clase 1 (Activo)  → SF positivo
 *   Clase 2 (Pasivo)  → SF negativo
 *   Clase 3 (Patrim.) → SF negativo
 *   Clase 4 (Ingreso) → SF negativo
 *   Clase 5 (Gasto)   → SF positivo
 *   Clase 6 (Costo)   → SF positivo
 * ============================================================
 */

import * as XLSX from 'xlsx'

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

export type NivelPUC = 'Clase' | 'Grupo' | 'Cuenta' | 'Subcuenta' | 'Auxiliar' | 'Subauxiliar'
export type ModoSignos = 'POSITIVO' | 'NEGATIVO'
export type FormatoBalance = 'SIIGO' | 'WORLD_OFFICE' | 'SIESA' | 'SYD'

export interface MetadataBalance {
  empresa: string
  nit: string
  periodo: string
  mes: number
  anio: number
  modoSignos: ModoSignos
  formato: FormatoBalance
  totalDebitos: number
  totalCreditos: number
}

export interface CuentaPUC {
  codigo: string           // Sin decimales. Ej: "110505"
  nombre: string
  nivel: NivelPUC
  nivelNumerico: number    // 1=Clase … 6=Subauxiliar
  codigoPadre: string
  saldoInicial: number
  movimientoDebito: number
  movimientoCredito: number
  saldoFinal: number
  nit?: string
  nombreTercero?: string
  sucursal?: string
  tieneMovimiento: boolean
  esBasura: boolean        // 229999, 9999, etc.
}

export interface TerceroAgrupado {
  codigoSubcuenta: string
  nit: string
  nombreTercero: string
  saldoInicial: number
  movimientoDebito: number
  movimientoCredito: number
  saldoFinal: number
  nivel: 'Auxiliar' | 'Subauxiliar'
}

export interface BalanceParseado {
  metadata: MetadataBalance
  cuentas: CuentaPUC[]
  clases: CuentaPUC[]
  grupos: CuentaPUC[]
  cuentasN3: CuentaPUC[]
  subcuentas: CuentaPUC[]
  auxiliares: CuentaPUC[]
  subauxiliares: CuentaPUC[]
  tercerosPorSubcuenta: Map<string, TerceroAgrupado[]>
  cuadrado: boolean
  advertencias: string[]
}

export interface BalancesMultiPeriodo {
  empresa: string
  nit: string
  modoSignos: ModoSignos
  periodos: BalanceParseado[]
  advertencias: string[]
}

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const CODIGOS_BASURA = new Set(['229999', '9999', '99999999', '999999', '9999999'])

const MESES_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

const NIVEL_NUM: Record<string, number> = {
  clase: 1, grupo: 2, cuenta: 3, subcuenta: 4, auxiliar: 5, subauxiliar: 6,
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function limpiarCodigo(raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw).trim().replace(/\.0*$/, '').replace(/\.\d+$/, '')
  return s.replace(/[^\d]/g, '')
}

// SIESA: el código viene en "Auxiliar", a veces solo ("11050501") y a veces
// pegado al nombre ("1105 - CAJA") o con espacios de indentación. Se toma el
// PRIMER bloque numérico, así el nombre (aunque tenga números) no lo contamina.
function limpiarCodigoSiesa(raw: unknown): string {
  if (raw == null) return ''
  const m = String(raw).trim().match(/^(\d+)/)
  return m ? m[1] : ''
}

function limpiarNum(raw: unknown): number {
  if (raw == null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, '.'))
  return isNaN(n) ? 0 : n
}

function parsearPeriodo(texto: string): { mes: number; anio: number } {
  const t = norm(texto)
  let mes = 0, anio = 0
  for (const [nombre, num] of Object.entries(MESES_ES)) {
    if (t.includes(nombre)) { mes = num; break }
  }
  const m = t.match(/\b(20\d{2})\b/)
  if (m) anio = parseInt(m[1])
  return { mes, anio }
}

function inferirNivel(len: number): NivelPUC {
  if (len === 1) return 'Clase'
  if (len === 2) return 'Grupo'
  if (len === 4) return 'Cuenta'
  if (len === 6) return 'Subcuenta'
  if (len === 8) return 'Auxiliar'
  return 'Subauxiliar'
}

function codigoPadre(codigo: string, nivel: NivelPUC): string {
  const cuts: Record<NivelPUC, number> = {
    Clase: 0, Grupo: 1, Cuenta: 2, Subcuenta: 4, Auxiliar: 6, Subauxiliar: 8,
  }
  return codigo.substring(0, cuts[nivel])
}

// ─────────────────────────────────────────────────────────────
// CORRECCIÓN DEL !ref DEFECTUOSO DE SIIGO
// ─────────────────────────────────────────────────────────────
function corregirRef(ws: XLSX.WorkSheet): XLSX.WorkSheet {
  if (!ws['!ref']) return ws
  const rng = XLSX.utils.decode_range(ws['!ref'])
  if (rng.e.c > 0) return ws

  let maxCol = 0
  for (let r = 0; r <= Math.min(15, rng.e.r); r++) {
    for (let c = 0; c <= 15; c++) {
      if (ws[XLSX.utils.encode_cell({ r, c })] !== undefined && c > maxCol) maxCol = c
    }
  }
  if (maxCol > 0) {
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rng.e.r, c: maxCol } })
  }
  return ws
}

// ─────────────────────────────────────────────────────────────
// DETECCIÓN DE FILA HEADER (Siigo fila 8, World Office / SIESA fila 1)
// ─────────────────────────────────────────────────────────────
function encontrarHeader(filas: unknown[][]): number {
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const textos = (filas[i] ?? [])
      .filter(v => v != null)
      .map(v => norm(String(v)))
    // Siigo: tiene "nivel" + algo con "codigo"
    if (textos.some(t => t === 'nivel') && textos.some(t => t.includes('codigo'))) return i
    // SIESA: "auxiliar" + "tercero" + "saldo final"
    const tieneAux = textos.some(t => t === 'auxiliar')
    const tieneTercero = textos.some(t => t === 'tercero')
    const tieneSF = textos.some(t => t === 'saldo final')
    if (tieneAux && tieneTercero && tieneSF) return i
    // SYD: "codigo" + "nombre" + "debito actual"/"debito anterior"
    const tieneCodigo = textos.some(t => t === 'codigo')
    const tieneNombre = textos.some(t => t === 'nombre')
    const tieneDebAct = textos.some(t => t === 'debito actual' || t === 'debito anterior')
    if (tieneCodigo && tieneNombre && tieneDebAct) return i
    // World Office: "cuenta" + "nombre cuenta" + "saldo"
    const tieneCuenta = textos.some(t => t === 'cuenta')
    const tieneNombreCta = textos.some(t => t === 'nombre cuenta' || t.includes('nombre cuenta'))
    const tieneSaldo = textos.some(t => t === 'saldo' || t === 'saldo anterior')
    if (tieneCuenta && tieneNombreCta && tieneSaldo) return i
  }
  return 0 // fallback: primera fila (World Office / SIESA). Siigo cae en 7 por su propio header.
}

// ─────────────────────────────────────────────────────────────
// MAPEO DE COLUMNAS (robusto, por alias — Siigo + World Office + SIESA)
// ─────────────────────────────────────────────────────────────
interface ColMap {
  nivel?: number
  trans?: number
  codigo?: number
  nombre?: number
  nit?: number
  sucursal?: number
  tercero?: number
  si?: number
  deb?: number
  cre?: number
  sf?: number
  // SYD: saldos partidos en débito/crédito (anterior = inicial, actual = final)
  debAnt?: number
  credAnt?: number
  debAct?: number
  credAct?: number
}

function mapCols(headers: string[]): ColMap {
  const h = headers.map(norm)
  // find exacto primero, luego "incluye"
  const find = (...aliases: string[]) => {
    for (const a of aliases) {
      const iEx = h.findIndex(x => x === a)
      if (iEx >= 0) return iEx
    }
    for (const a of aliases) {
      const iIn = h.findIndex(x => x.includes(a))
      if (iIn >= 0) return iIn
    }
    return undefined
  }
  return {
    nivel:    find('nivel'),
    trans:    find('transaccional'),
    // Siigo: "codigo cuenta contable" | World Office: "cuenta" | SIESA: "auxiliar"
    codigo:   find('codigo cuenta contable', 'codigo cuenta', 'codigo', 'cuenta', 'auxiliar'),
    // Siigo: "nombre cuenta contable" | WO: "nombre cuenta" | SIESA: "desc. auxiliar" | SYD: "nombre"
    nombre:   find('nombre cuenta contable', 'nombre cuenta', 'nombre cta', 'desc. auxiliar', 'desc auxiliar', 'nombre'),
    // Siigo: "identificacion" | World Office / SIESA: "tercero" (el NIT del tercero)
    nit:      find('identificacion', 'nit', 'tercero'),
    sucursal: find('sucursal'),
    // Siigo/WO: "nombre tercero" | SIESA: "razon social tercero movto."
    tercero:  find('nombre tercero', 'razon social tercero'),
    // Siigo: "saldo inicial" | World Office: "saldo anterior" | SIESA: "saldo inicial"
    si:       find('saldo inicial', 'saldo anterior'),
    // Siigo: "movimiento debito" | World Office / SIESA: "debito(s)" | SYD: "debito"
    deb:      find('movimiento debito', 'debito', 'debitos'),
    // Siigo: "movimiento credito" | World Office / SIESA: "credito(s)" | SYD: "credito"
    cre:      find('movimiento credito', 'credito', 'creditos'),
    // Siigo: "saldo final" | World Office: "saldo" | SIESA: "saldo final"
    sf:       find('saldo final', 'saldo'),
    // SYD: saldos partidos débito/crédito
    debAnt:   find('debito anterior', 'debitos anterior'),
    credAnt:  find('credito anterior', 'creditos anterior'),
    debAct:   find('debito actual', 'debitos actual'),
    credAct:  find('credito actual', 'creditos actual'),
  }
}

// ─────────────────────────────────────────────────────────────
// DETECCIÓN DE FORMATO
// ─────────────────────────────────────────────────────────────
function detectarFormato(headers: string[]): FormatoBalance {
  const h = headers.map(norm)
  // Siigo tiene columna "Nivel" y "Transaccional"
  if (h.some(x => x === 'nivel')) return 'SIIGO'
  // SIESA: columna "Auxiliar" (código) + "Tercero" + "Desc. auxiliar"
  if (h.some(x => x === 'auxiliar') && h.some(x => x === 'tercero')) return 'SIESA'
  // SYD ("Balance Detallado"): "codigo" + "debito actual" (saldos partidos deb/cred)
  if (h.some(x => x === 'codigo') && h.some(x => x === 'debito actual' || x === 'debitos actual')) {
    return 'SYD'
  }
  // World Office: "cuenta" + "saldo anterior"/"referencia"
  if (h.some(x => x === 'cuenta') && h.some(x => x === 'saldo anterior' || x === 'referencia')) {
    return 'WORLD_OFFICE'
  }
  // fallback: si no hay "nivel", asumimos World Office (infiere por longitud)
  return h.some(x => x === 'nivel') ? 'SIIGO' : 'WORLD_OFFICE'
}

// ─────────────────────────────────────────────────────────────
// EXTRACCIÓN DE METADATA
// ─────────────────────────────────────────────────────────────
function extraerMetaSiigo(filas: unknown[][], filaHeader: number) {
  let empresa = '', nit = '', periodo = ''
  for (let i = 0; i < filaHeader; i++) {
    const fila = filas[i] ?? []
    const vals = fila.filter(v => v != null).map(v => String(v).trim()).filter(Boolean)
    if (!vals.length) continue
    const t = vals[0]
    if (!nit && /^[\d.\-]{8,15}$/.test(t.replace(/\s/g, ''))) { nit = t; continue }
    if (!periodo && /\bde\b/i.test(t) && Object.keys(MESES_ES).some(m => norm(t).includes(m))) {
      periodo = t; continue
    }
    if (!empresa && t.length > 4 && !/balance de prueba/i.test(t) && !/^\d/.test(t)) {
      empresa = t
    }
  }
  const { mes, anio } = parsearPeriodo(periodo)
  return { empresa, nit, periodo, mes, anio }
}

// SYD trae metadata en las filas de arriba: empresa, "Nit. 901437355-4",
// "Balance Detallado a Enero 31 de 2024".
function extraerMetaSyd(filas: unknown[][], filaHeader: number) {
  let empresa = '', nit = '', periodo = ''
  for (let i = 0; i < filaHeader; i++) {
    const vals = (filas[i] ?? []).filter(v => v != null).map(v => String(v).trim()).filter(Boolean)
    if (!vals.length) continue
    const t = vals[0]
    // NIT: puede venir como "Nit. 901437355-4" → extraer los dígitos/guion
    const mNit = t.match(/nit[.:\s]*([\d.\-]{6,15})/i)
    if (!nit && mNit) { nit = mNit[1]; continue }
    if (!nit && /^[\d.\-]{8,15}$/.test(t.replace(/\s/g, ''))) { nit = t; continue }
    // Período: "Balance Detallado a Enero 31 de 2024"
    if (!periodo && Object.keys(MESES_ES).some(m => norm(t).includes(m))) { periodo = t; continue }
    if (!empresa && t.length > 4 && !/^\d/.test(t) && !/balance|detallado|^nit/i.test(norm(t))) {
      empresa = t
    }
  }
  const { mes, anio } = parsearPeriodo(periodo)
  return { empresa, nit, periodo, mes, anio }
}

// World Office y SIESA no traen metadata en el Excel. Se infiere del nombre de
// archivo (si se pasó) o se dejan valores por defecto editables — nunca rompe.
function extraerMetaSinEncabezado(
  filas: unknown[][],
  filaHeader: number,
  nombreArchivo: string | undefined,
  etiquetaFormato: string
) {
  let empresa = '', nit = '', periodo = ''

  // A veces hay un título en las filas de arriba (si filaHeader>0)
  for (let i = 0; i < filaHeader; i++) {
    const vals = (filas[i] ?? []).filter(v => v != null).map(v => String(v).trim()).filter(Boolean)
    for (const t of vals) {
      if (!nit && /^[\d.\-]{8,15}$/.test(t.replace(/\s/g, ''))) nit = t
      else if (!empresa && t.length > 4 && !/^\d/.test(t) && !/mayor|balance|tercero|auxiliar/i.test(t)) empresa = t
      if (!periodo && Object.keys(MESES_ES).some(m => norm(t).includes(m))) periodo = t
    }
  }

  // Inferir del nombre de archivo (ej. "..._JUNIO_2026.xlsx")
  if (nombreArchivo) {
    const nf = norm(nombreArchivo)
    if (!periodo) {
      for (const m of Object.keys(MESES_ES)) {
        if (nf.includes(m)) { periodo = m; break }
      }
    }
    const my = nf.match(/\b(20\d{2})\b/)
    if (my && !periodo.match(/20\d{2}/)) periodo = (periodo ? periodo + ' ' : '') + my[1]
  }

  const { mes, anio } = parsearPeriodo(periodo)
  return {
    empresa: empresa || `EMPRESA (${etiquetaFormato})`,
    nit: nit || '',
    periodo: periodo || '',
    mes: mes || 0,
    anio: anio || new Date().getFullYear(),
  }
}

// ─────────────────────────────────────────────────────────────
// DETECCIÓN MODO DE SIGNOS
// ─────────────────────────────────────────────────────────────
function detectarModo(cuentas: CuentaPUC[]): ModoSignos {
  // Pasivo (2) y Patrimonio (3) son el indicador más confiable del signo:
  // siempre son de naturaleza crédito. Ingresos (4) a veces viene invertido
  // en algunos exports (ej. SYD), así que se revisa de último.
  for (const clase of ['2', '3', '4']) {
    const c = cuentas.find(x => x.nivel === 'Clase' && x.codigo === clase && Math.abs(x.saldoFinal) > 100_000)
    if (c) return c.saldoFinal < 0 ? 'NEGATIVO' : 'POSITIVO'
  }
  for (const g of ['22', '42', '41']) {
    const c = cuentas.find(x => x.nivel === 'Grupo' && x.codigo === g && Math.abs(x.saldoFinal) > 100_000)
    if (c) return c.saldoFinal < 0 ? 'NEGATIVO' : 'POSITIVO'
  }
  return 'NEGATIVO'
}

// ─────────────────────────────────────────────────────────────
// AGRUPACIÓN DE TERCEROS
// ─────────────────────────────────────────────────────────────
function agruparTerceros(cuentas: CuentaPUC[]): Map<string, TerceroAgrupado[]> {
  const mapa = new Map<string, TerceroAgrupado[]>()
  for (const c of cuentas) {
    if ((c.nivel !== 'Auxiliar' && c.nivel !== 'Subauxiliar') || c.esBasura) continue

    const nitVal    = (c.nit           || '').trim()
    const nombreVal = (c.nombreTercero || '').trim()
    if (!nitVal && !nombreVal) continue

    // El tercero se agrupa bajo su subcuenta padre (6 dígitos)
    const subcta = c.codigo.length >= 6 ? c.codigo.substring(0, 6) : c.codigo
    if (!mapa.has(subcta)) mapa.set(subcta, [])
    mapa.get(subcta)!.push({
      codigoSubcuenta:  subcta,
      nit:              nitVal,
      nombreTercero:    nombreVal,
      saldoInicial:     c.saldoInicial,
      movimientoDebito: c.movimientoDebito,
      movimientoCredito:c.movimientoCredito,
      saldoFinal:       c.saldoFinal,
      nivel:            c.nivel as 'Auxiliar' | 'Subauxiliar',
    })
  }
  return mapa
}

// ─────────────────────────────────────────────────────────────
// PARSER PRINCIPAL — UN BUFFER
// ─────────────────────────────────────────────────────────────
export function parsearBalance(
  buffer: Buffer | ArrayBuffer,
  nombreArchivo?: string
): BalanceParseado {
  const adv: string[] = []

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, sheetStubs: true })
  const hoja = elegirHoja(wb)
  const ws = corregirRef(wb.Sheets[hoja])

  const rawFilas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
  const headerIdx = encontrarHeader(rawFilas)

  // FIX desfase: si el !ref no empieza en A1 (hay filas vacías arriba, como el
  // "Balance Detallado" de TEXTAMPA), el range absoluto debe sumar ese origen.
  const origenRef = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0
  const datos = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: 0, range: headerIdx + origenRef, defval: null, raw: true,
  })
  if (!datos.length) throw new Error(`Hoja "${hoja}" sin datos`)

  const headers = Object.keys(datos[0])
  const formato = detectarFormato(headers)
  const col = mapCols(headers)

  if (col.codigo === undefined) {
    throw new Error(
      `No se encontró la columna de código de cuenta. ` +
      `Encabezados detectados: ${headers.join(', ')}`
    )
  }
  // SYD no tiene "saldo final" único: se calcula (Débito Actual − Crédito Actual).
  if (col.sf === undefined && !(formato === 'SYD' && col.debAct !== undefined)) {
    throw new Error(
      `No se encontró la columna de saldo final. ` +
      `Encabezados detectados: ${headers.join(', ')}`
    )
  }

  // Metadata según formato
  const meta = formato === 'SIIGO'
    ? extraerMetaSiigo(rawFilas, headerIdx)
    : formato === 'SYD'
    ? extraerMetaSyd(rawFilas, headerIdx)
    : extraerMetaSinEncabezado(
        rawFilas, headerIdx, nombreArchivo,
        formato === 'SIESA' ? 'SIESA' : 'World Office'
      )

  // En World Office y SIESA la columna "Tercero" es el NIT. Para separar
  // "fila de cuenta" de "fila de tercero" usamos: si esa columna tiene valor,
  // es una fila de tercero (nivel Auxiliar/Subauxiliar).
  const esWO = formato === 'WORLD_OFFICE'
  const inferirPorTercero = formato === 'WORLD_OFFICE' || formato === 'SIESA'

  const cuentas: CuentaPUC[] = []
  let totalDeb = 0, totalCre = 0

  // ── SYD: la columna "Código" mezcla el código de cuenta (PUC) y el NIT del
  // tercero. Las cuentas tienen longitud 1/2/4/6 (o 8 si continúa la subcuenta);
  // lo demás son terceros, que se asocian POSICIONALMENTE a la última cuenta o
  // subcuenta impresa arriba. Los saldos vienen partidos en débito/crédito:
  //   saldo inicial = Débito Anterior − Crédito Anterior
  //   saldo final   = Débito Actual   − Crédito Actual
  if (formato === 'SYD') {
    const num = (fila: Record<string, unknown>, i?: number) =>
      i !== undefined ? limpiarNum(fila[headers[i]]) : 0
    let parent = '' // última cuenta/subcuenta (len 4 o 6) para colgar terceros
    for (const fila of datos) {
      const codigo = limpiarCodigo(fila[headers[col.codigo]])
      if (!codigo || !/^\d+$/.test(codigo) || codigo.length > 15) continue
      const nombre = col.nombre !== undefined ? String(fila[headers[col.nombre]] ?? '').trim() : ''
      if (!nombre || nombre === 'nan' || nombre === 'null') continue

      const saldoInicial     = num(fila, col.debAnt) - num(fila, col.credAnt)
      const movimientoDebito  = num(fila, col.deb)
      const movimientoCredito = num(fila, col.cre)
      const saldoFinal        = num(fila, col.debAct) - num(fila, col.credAct)

      const L = codigo.length
      const esCuenta =
        L === 1 || L === 2 || L === 4 || L === 6 ||
        (L === 8 && parent !== '' && codigo.startsWith(parent.substring(0, 6)))

      if (esCuenta) {
        if (L === 4 || L === 6) parent = codigo
        const nivel = inferirNivel(L)
        if (L === 1) { totalDeb += num(fila, col.debAct); totalCre += num(fila, col.credAct) }
        cuentas.push({
          codigo, nombre, nivel,
          nivelNumerico: NIVEL_NUM[nivel.toLowerCase()] ?? 3,
          codigoPadre: codigoPadre(codigo, nivel),
          saldoInicial, movimientoDebito, movimientoCredito, saldoFinal,
          nit: undefined, nombreTercero: undefined, sucursal: undefined,
          tieneMovimiento: movimientoDebito !== 0 || movimientoCredito !== 0,
          esBasura: CODIGOS_BASURA.has(codigo),
        })
      } else {
        // Tercero: su "código" ES el NIT. Se cuelga bajo la subcuenta 'parent'.
        const codCuenta = parent || codigo
        cuentas.push({
          codigo: codCuenta, nombre, nivel: 'Auxiliar',
          nivelNumerico: 5,
          codigoPadre: codCuenta.substring(0, 6),
          saldoInicial, movimientoDebito, movimientoCredito, saldoFinal,
          nit: codigo, nombreTercero: nombre, sucursal: undefined,
          tieneMovimiento: movimientoDebito !== 0 || movimientoCredito !== 0,
          esBasura: false,
        })
      }
    }
    // Diferencia de 1-2 pesos = redondeo de la fuente, no descuadre real.
    if (Math.abs(totalDeb - totalCre) < 2) totalCre = totalDeb
  } else
  for (const fila of datos) {
    const prim = norm(String(fila[headers[0]] ?? ''))

    if (prim.includes('total general')) {
      if (col.deb !== undefined) totalDeb = limpiarNum(fila[headers[col.deb]])
      if (col.cre !== undefined) totalCre = limpiarNum(fila[headers[col.cre]])
      continue
    }
    if (prim.includes('procesado en')) continue

    // Nivel Siigo (si existe columna)
    const nivelRaw = col.nivel !== undefined ? norm(String(fila[headers[col.nivel]] ?? '')) : ''
    const nivelesValidos = ['clase', 'grupo', 'cuenta', 'subcuenta', 'auxiliar', 'subauxiliar']
    if (col.nivel !== undefined && nivelRaw && !nivelesValidos.includes(nivelRaw)) continue

    // Código (SIESA usa extractor de bloque numérico inicial)
    const codigoRaw = fila[headers[col.codigo]]
    const codigo = formato === 'SIESA' ? limpiarCodigoSiesa(codigoRaw) : limpiarCodigo(codigoRaw)
    if (!codigo || !/^\d+$/.test(codigo) || codigo.length > 12) continue

    // Nombre de la cuenta
    let nombre = col.nombre !== undefined ? String(fila[headers[col.nombre]] ?? '').trim() : ''
    // SIESA: las filas de subtotal (Clase/Grupo/Cuenta/Subcuenta) traen el nombre
    // pegado en la columna del código ("1105 - CAJA") y la columna "Desc. auxiliar"
    // vacía. Se recupera el nombre de la parte después de " - ".
    if (formato === 'SIESA' && !nombre) {
      const rawCod = String(codigoRaw ?? '')
      const idx = rawCod.indexOf(' - ')
      if (idx >= 0) nombre = rawCod.substring(idx + 3).trim()
    }
    if (!nombre || nombre === 'nan' || nombre === 'null') continue

    // Valor de la columna NIT/Tercero
    const nitCol = col.nit !== undefined ? String(fila[headers[col.nit]] ?? '').trim() : ''
    const terceroNombre = col.tercero !== undefined ? String(fila[headers[col.tercero]] ?? '').trim() : ''

    // ── Determinar el NIVEL ──────────────────────────────────
    let nivel: NivelPUC
    if (col.nivel !== undefined && nivelRaw) {
      // Siigo: usar la columna Nivel
      if (nivelRaw === 'clase') nivel = 'Clase'
      else if (nivelRaw === 'grupo') nivel = 'Grupo'
      else if (nivelRaw === 'cuenta') nivel = 'Cuenta'
      else if (nivelRaw === 'subcuenta') nivel = 'Subcuenta'
      else if (nivelRaw === 'auxiliar') nivel = 'Auxiliar'
      else if (nivelRaw === 'subauxiliar') nivel = 'Subauxiliar'
      else nivel = inferirNivel(codigo.length)
    } else if (inferirPorTercero && nitCol && nitCol !== '0') {
      // World Office / SIESA: fila con "Tercero" lleno → es un tercero,
      // sin importar la longitud del código de la cuenta a la que pertenece.
      nivel = codigo.length >= 8 ? 'Subauxiliar' : 'Auxiliar'
    } else {
      // Sin columna Nivel y sin tercero → inferir por longitud
      nivel = inferirNivel(codigo.length)
    }

    // NIT y nombre de tercero
    const nitFinal = nitCol && nitCol !== '0' ? nitCol : undefined
    const nombreTerceroFinal = terceroNombre || undefined

    const transRaw = col.trans !== undefined ? norm(String(fila[headers[col.trans]] ?? '')) : ''
    const tieneMovimiento = inferirPorTercero
      ? (limpiarNum(fila[headers[col.deb!]]) !== 0 || limpiarNum(fila[headers[col.cre!]]) !== 0)
      : (transRaw === 'sí' || transRaw === 'si' || transRaw === 'yes')

    const sucursal = col.sucursal !== undefined ? String(fila[headers[col.sucursal]] ?? '').trim() : ''

    cuentas.push({
      codigo,
      nombre,
      nivel,
      nivelNumerico: NIVEL_NUM[nivel.toLowerCase()] ?? 3,
      codigoPadre: codigoPadre(codigo, nivel),
      saldoInicial: col.si !== undefined ? limpiarNum(fila[headers[col.si]]) : 0,
      movimientoDebito: col.deb !== undefined ? limpiarNum(fila[headers[col.deb]]) : 0,
      movimientoCredito: col.cre !== undefined ? limpiarNum(fila[headers[col.cre]]) : 0,
      saldoFinal: col.sf !== undefined ? limpiarNum(fila[headers[col.sf]]) : 0,
      nit: nitFinal,
      nombreTercero: nombreTerceroFinal,
      sucursal: sucursal && sucursal !== '0' ? sucursal : undefined,
      tieneMovimiento,
      esBasura: CODIGOS_BASURA.has(codigo),
    })
  }

  const modoSignos = detectarModo(cuentas)

  const clases        = cuentas.filter(c => c.nivel === 'Clase')
  const grupos        = cuentas.filter(c => c.nivel === 'Grupo')
  const cuentasN3     = cuentas.filter(c => c.nivel === 'Cuenta')
  const subcuentas    = cuentas.filter(c => c.nivel === 'Subcuenta' && !c.esBasura)
  const auxiliares    = cuentas.filter(c => c.nivel === 'Auxiliar'  && !c.esBasura)
  const subauxiliares = cuentas.filter(c => c.nivel === 'Subauxiliar' && !c.esBasura)
  const tercerosPorSubcuenta = agruparTerceros(cuentas)

  const cuadrado = Math.abs(totalDeb - totalCre) < 1
  if (!cuadrado && totalDeb > 0) {
    adv.push(`Balance no cuadra: débitos=${totalDeb.toFixed(0)}, créditos=${totalCre.toFixed(0)}`)
  }
  if (clases.length === 0) adv.push('No se encontraron cuentas de Clase — verificar archivo')
  if ((formato === 'WORLD_OFFICE' || formato === 'SIESA') && !meta.mes) {
    adv.push(`${formato}: no se detectó el mes en el nombre de archivo — verificar período`)
  }

  return {
    metadata: { ...meta, modoSignos, formato, totalDebitos: totalDeb, totalCreditos: totalCre },
    cuentas, clases, grupos, cuentasN3, subcuentas, auxiliares, subauxiliares,
    tercerosPorSubcuenta, cuadrado, advertencias: adv,
  }
}

// ─────────────────────────────────────────────────────────────
// SELECCIÓN DE HOJA
// ─────────────────────────────────────────────────────────────
function elegirHoja(wb: XLSX.WorkBook): string {
  const hojas: string[] = wb.SheetNames
  if (hojas.length === 1) return hojas[0]
  const prio = [
    'exportarexcelbpmetodo2', 'exportarexcel', 'balance de prueba',
    'rept mov. ctas. aux', 'reptmovctasaux', 'mayor y balances',
    'sheet1', 'hoja1', 'balance',
  ]
  for (const p of prio) {
    const h = hojas.find(x => norm(x).replace(/\s/g, '') === p.replace(/\s/g, ''))
    if (h) return h
  }
  return hojas[0]
}

// ─────────────────────────────────────────────────────────────
// PARSER MULTI-PERÍODO
// ─────────────────────────────────────────────────────────────
export function parsearBalancesMultiples(
  buffers: (Buffer | ArrayBuffer)[],
  nombresArchivo?: string[]
): BalancesMultiPeriodo {
  if (!buffers.length) throw new Error('Se requiere al menos un balance')
  const adv: string[] = []

  const balances: BalanceParseado[] = buffers.map((b, i) => {
    try { return parsearBalance(b, nombresArchivo?.[i]) }
    catch (e) { throw new Error(`Error archivo ${i + 1}: ${e instanceof Error ? e.message : e}`) }
  })

  const nits = new Set(balances.map(b => b.metadata.nit).filter(Boolean))
  if (nits.size > 1) adv.push(`⚠️ Balances de empresas diferentes: ${[...nits].join(', ')}`)

  balances.sort((a, b) => (a.metadata.anio * 100 + a.metadata.mes) - (b.metadata.anio * 100 + b.metadata.mes))

  for (let i = 0; i < balances.length - 1; i++) {
    const a = balances[i], b = balances[i + 1]
    const sfA = a.clases.find(c => c.codigo === '1')?.saldoFinal ?? 0
    const siB = b.clases.find(c => c.codigo === '1')?.saldoInicial ?? 0
    if (Math.abs(sfA - siB) > 1) {
      adv.push(`⚠️ Discontinuidad entre ${a.metadata.periodo} y ${b.metadata.periodo}: SF=${sfA.toFixed(0)}, SI siguiente=${siB.toFixed(0)}`)
    }
  }

  const p0 = balances[0]
  return {
    empresa: p0.metadata.empresa,
    nit: p0.metadata.nit,
    modoSignos: p0.metadata.modoSignos,
    periodos: balances,
    advertencias: adv,
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS DE CONSULTA (para el motor)
// ─────────────────────────────────────────────────────────────

export function obtenerSF(balance: BalanceParseado, codigo: string): number {
  return balance.cuentas
    .filter(c => c.codigo === codigo && !c.esBasura)
    .reduce((s, c) => s + c.saldoFinal, 0)
}

export function obtenerSFPrefijo(
  balance: BalanceParseado,
  prefijo: string,
  nivel: NivelPUC
): number {
  return balance.cuentas
    .filter(c => c.codigo.startsWith(prefijo) && c.nivel === nivel && !c.esBasura)
    .reduce((s, c) => s + c.saldoFinal, 0)
}

export function obtenerTerceros(
  balance: BalanceParseado,
  codigoSubcuenta: string
): TerceroAgrupado[] {
  return (balance.tercerosPorSubcuenta.get(codigoSubcuenta) ?? [])
    .filter(t => Math.abs(t.saldoFinal) > 0)
    .sort((a, b) => Math.abs(b.saldoFinal) - Math.abs(a.saldoFinal))
}

export function obtenerTercerosPrefijo(
  balance: BalanceParseado,
  prefijo: string
): TerceroAgrupado[] {
  const terceroMap = new Map<string, TerceroAgrupado>()

  for (const [cod, lista] of balance.tercerosPorSubcuenta) {
    if (!cod.startsWith(prefijo)) continue
    for (const t of lista) {
      const nitVal    = (t.nit           || '').trim()
      const nombreVal = (t.nombreTercero || '').trim()
      const esNitReal = /^\d{7,}$/.test(nitVal)
      const key       = esNitReal ? nitVal : (nombreVal || nitVal)
      if (!key) continue

      const prev = terceroMap.get(key)
      if (prev) {
        prev.saldoFinal        += t.saldoFinal
        prev.movimientoDebito  += t.movimientoDebito
        prev.movimientoCredito += t.movimientoCredito
        prev.saldoInicial      += t.saldoInicial
      } else {
        terceroMap.set(key, { ...t })
      }
    }
  }

  return [...terceroMap.values()]
    .filter(t => Math.abs(t.saldoFinal) > 0)
    .sort((a, b) => Math.abs(b.saldoFinal) - Math.abs(a.saldoFinal))
}