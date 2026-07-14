/**
 * esf-parser v2.0 — Parser definitivo para estados financieros CALA ASOCIADOS
 *
 * Soporta 2 formatos generados por el Motor Contable:
 *
 * PJ (Persona Jurídica) — generador_pj.ts:
 *   ESF: colTexto=1(B), colNota=2(C), colDatos=[3(D)...]  header fila 10/11
 *   ERI: colTexto=1(B), colNota=3(D), colDatos=[4(E)...]  header fila 7/8
 *   NOTAS ESF: hoja='NOTAS ESF', colTexto=0(A), colDatos=2(C)  header fila 5
 *   NOTAS ERI: hoja='NOTAS ER',  colTexto=0(A), colDatos=2(C)  header fila 4
 *
 * PN (Persona Natural) — generador_pn.ts:
 *   ESF: colTexto=2(C), colNota=4(E), colDatos=[6(G)...]  header fila 6
 *   ERI: colTexto=1(B), colNota=3(D), colDatos=[5(F)...]  header fila 6/7
 *   NOTAS ESF: hoja='NOTAS - ESF ', colTexto=2(C), colDatos=3(D)
 *   NOTAS ERI: hoja='NOTAS - ERI',  colTexto=2(C), colDatos=3(D)
 *
 * Detección automática PN vs PJ por nombre de hojas y posición de empresa en ESF.
 */

export type TipoEntidadParser = 'PJ' | 'PN' | 'DESCONOCIDO'

export interface FinancialRow {
  cuenta:  string
  nota?:   number
  valores: Record<string, number>
}

export interface ParsedSheet {
  hoja:          string
  empresa:       string
  nit:           string
  periodos:      string[]
  filas:         FinancialRow[]
  tipo:          'balance' | 'pyg' | 'notas'
  periodoActual: string
  processedData: Record<string, number>
  tipoEntidad:   TipoEntidadParser
}

type CellRow = (string | number | null | undefined)[]

// ── Helpers ──────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim().replace(/\s+/g, ' ')
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v
  return undefined
}

function isIgnorable(cuenta: string): boolean {
  const u = cuenta.toUpperCase()
  return (
    u.includes('REPRESENTANTE') || u.includes('REVISOR') ||
    u.includes('CONTADOR') || u.includes('C.C.') ||
    u.includes('T.P.') || u.startsWith('NIT')
  )
}

function formatPeriodoLabel(v: unknown): string {
  if (!v) return ''
  const s = String(v).trim()
  // "DD.MM.YYYY"
  const m = s.match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/)
  if (m) {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    return `${meses[parseInt(m[2])-1]} ${m[3]}`
  }
  // Número de año
  if (typeof v === 'number' && v > 2000 && v < 2100) return String(v)
  // "2025\nDICIEMBRE" o "2025 DICIEMBRE"
  const nl = s.replace('\n', ' ').replace(/\s+/,' ')
  if (nl.match(/^\d{4}\s+\w+$/)) return nl
  return s
}

// ── Detección de tipo entidad ─────────────────────────────────────────────

function detectarTipo(sheetNames: string[], esfRows: CellRow[]): TipoEntidadParser {
  // Por nombres de hojas de notas
  const tieneNotasPJ = sheetNames.includes('NOTAS ESF') || sheetNames.includes('NOTAS ER')
  const tieneNotasPN = sheetNames.some(n => n.startsWith('NOTAS - '))

  if (tieneNotasPJ && !tieneNotasPN) return 'PJ'
  if (tieneNotasPN && !tieneNotasPJ) return 'PN'

  // Por posición de empresa en ESF
  // PJ: fila 2 (idx=1), col B (idx=1)
  // PN: fila 2 (idx=1), col C (idx=2)
  const fila2 = esfRows[1] ?? []
  const enColB = str(fila2[1])
  const enColC = str(fila2[2])

  if (enColB.length > 5 && !enColB.startsWith('NIT')) return 'PJ'
  if (enColC.length > 5 && !enColC.startsWith('NIT')) return 'PN'

  return 'DESCONOCIDO'
}

// ── Parser ESF PJ ─────────────────────────────────────────────────────────
// ColTexto=1(B), ColNota=2(C), ColDatos=3+(D...)
// Fila 10: header con 'DETALLE' en idx=1, año en idx=3+
// Fila 11: mes en idx=3+
// Datos desde fila 13

function parseESF_PJ(rows: CellRow[], empresa: string, nit: string): ParsedSheet {
  const periodos: string[] = []
  const periodoIdxs: number[] = []

  // Header en fila 10 (idx=9) y fila 11 (idx=10)
  const hdrAnio = rows[9]  ?? []
  const hdrMes  = rows[10] ?? []

  // Datos en idx=3 en adelante
  for (let i = 3; i < Math.max(hdrAnio.length, hdrMes.length); i++) {
    const anio = str(hdrAnio[i])
    const mes  = str(hdrMes[i])
    const label = mes
      ? (anio ? `${mes} ${anio}` : mes)
      : (anio || '')
    if (label) {
      periodos.push(label)
      periodoIdxs.push(i)
    }
  }

  const filas: FinancialRow[] = []
  let seccion = ''

  // Datos desde fila 13 (idx=12)
  for (const row of rows.slice(12)) {
    const cuenta = str(row[1])
    if (!cuenta || cuenta.length < 2 || isIgnorable(cuenta)) continue

    const upper = cuenta.toUpperCase()
    // Secciones sin valores
    if (['ACTIVO','PASIVO','PASIVOS','PATRIMONIO'].includes(upper)) {
      seccion = cuenta; continue
    }
    if (['CORRIENTE','NO CORRIENTE','NO CORRIENTE.'].includes(upper)) continue

    const nota = num(row[2])
    const valores: Record<string, number> = {}
    periodoIdxs.forEach((idx, pi) => {
      const v = num(row[idx])
      if (v !== undefined) valores[periodos[pi]] = v
    })

    if (Object.keys(valores).length > 0) {
      filas.push({
        cuenta: seccion ? `${seccion} / ${cuenta}` : cuenta,
        nota,
        valores,
      })
    }
  }

  const periodoActual = periodos[0] ?? ''
  return {
    hoja: 'ESF', empresa, nit, periodos, filas,
    tipo: 'balance', periodoActual,
    processedData: extractESFProcessed(filas, periodoActual),
    tipoEntidad: 'PJ',
  }
}

// ── Parser ERI PJ ─────────────────────────────────────────────────────────
// ColTexto=1(B), ColNota=idx nota real (varía), ColDatos=4+(E...)
// Fila 7 (idx=6): año en idx=4+
// Fila 8 (idx=7): mes en idx=4+
// Datos desde fila 10 (idx=9)

function parseERI_PJ(rows: CellRow[], empresa: string, nit: string): ParsedSheet {
  const periodos: string[] = []
  const periodoIdxs: number[] = []

  const hdrAnio = rows[6] ?? []
  const hdrMes  = rows[7] ?? []

  for (let i = 4; i < Math.max(hdrAnio.length, hdrMes.length); i++) {
    const anio = str(hdrAnio[i])
    const mes  = str(hdrMes[i])
    const label = mes ? (anio ? `${mes} ${anio}` : mes) : anio
    if (label) {
      periodos.push(label)
      periodoIdxs.push(i)
    }
  }

  const filas: FinancialRow[] = []

  for (const row of rows.slice(9)) {
    const cuenta = str(row[1])
    if (!cuenta || cuenta.length < 2 || isIgnorable(cuenta)) continue

    // Nota puede estar en idx=2 o idx=3
    const nota = num(row[2]) ?? num(row[3])
    const valores: Record<string, number> = {}
    periodoIdxs.forEach((idx, pi) => {
      const v = num(row[idx])
      if (v !== undefined) valores[periodos[pi]] = v
    })

    if (Object.keys(valores).length > 0) {
      filas.push({ cuenta, nota, valores })
    }
  }

  const periodoActual = periodos[0] ?? ''
  return {
    hoja: 'ERI', empresa, nit, periodos, filas,
    tipo: 'pyg', periodoActual,
    processedData: extractERIProcessed(filas, periodoActual),
    tipoEntidad: 'PJ',
  }
}

// ── Parser NOTAS PJ ───────────────────────────────────────────────────────
// ColTexto=0(A), ColDatos=2(C)
// Header: fila 5 (idx=4), idx=2 con valor '2025\nDICIEMBRE'
// Datos: intercalados con headers NOTA X

function parseNotas_PJ(rows: CellRow[], empresa: string, nit: string, hoja: 'NOTAS ESF' | 'NOTAS ER'): ParsedSheet {
  // Buscar períodos en idx=2 de las primeras 8 filas
  const periodos: string[] = []

  for (const row of rows.slice(0, 8)) {
    const v = str(row[2])
    if (v && (v.match(/\d{4}/) || v.includes('DICIEMBRE') || v.includes('DIC'))) {
      const label = formatPeriodoLabel(v.replace('\n', ' '))
      if (label && !periodos.includes(label)) periodos.push(label)
    }
  }

  if (periodos.length === 0) periodos.push('Período')

  const filas: FinancialRow[] = []
  let seccion = ''

  for (const row of rows.slice(4)) {
    const cuenta = str(row[0])
    if (!cuenta || cuenta.length < 2 || isIgnorable(cuenta)) continue

    const upper = cuenta.toUpperCase()

    // Encabezados de sección (NOTA X ...)
    if (upper.startsWith('NOTA ') || upper === 'CONCEPTO' || upper === 'INGRESOS' || upper === 'GASTOS') {
      if (upper.startsWith('NOTA ')) seccion = cuenta
      continue
    }

    // Ignorar textos descriptivos (sin valores)
    const v = num(row[2])
    if (v === undefined) continue

    const valores: Record<string, number> = { [periodos[0]]: v }
    filas.push({
      cuenta: seccion ? `${seccion} / ${cuenta}` : cuenta,
      valores,
    })
  }

  const periodoActual = periodos[0] ?? ''
  return {
    hoja, empresa, nit, periodos, filas,
    tipo: 'notas', periodoActual,
    processedData: {},
    tipoEntidad: 'PJ',
  }
}

// ── Parser ESF PN ─────────────────────────────────────────────────────────
// ColTexto=2(C), ColNota=4(E), ColDatos=6+(G...)
// Header: fila 6 (idx=5), idx=6 con fecha '31.12.2025'
// Datos desde fila 9

function parseESF_PN(rows: CellRow[], empresa: string, nit: string): ParsedSheet {
  const periodos: string[] = []
  const periodoIdxs: number[] = []

  const hdrRow = rows[5] ?? []
  for (let i = 6; i < hdrRow.length; i++) {
    const label = formatPeriodoLabel(hdrRow[i])
    if (label) {
      periodos.push(label)
      periodoIdxs.push(i)
    }
  }

  const filas: FinancialRow[] = []
  let seccion = ''

  for (const row of rows.slice(8)) {
    const cuenta = str(row[2])
    if (!cuenta || cuenta.length < 2 || isIgnorable(cuenta)) continue

    const upper = cuenta.toUpperCase()
    if (['ACTIVOS','PASIVOS','PATRIMONIO'].includes(upper)) {
      seccion = cuenta; continue
    }
    if (['CORRIENTE','NO CORRIENTE'].includes(upper)) continue

    const nota = num(row[4])
    const valores: Record<string, number> = {}
    periodoIdxs.forEach((idx, pi) => {
      const v = num(row[idx])
      if (v !== undefined) valores[periodos[pi]] = v
    })

    if (Object.keys(valores).length > 0) {
      filas.push({
        cuenta: seccion ? `${seccion} / ${cuenta}` : cuenta,
        nota,
        valores,
      })
    }
  }

  const periodoActual = periodos[0] ?? ''
  return {
    hoja: 'ESF', empresa, nit, periodos, filas,
    tipo: 'balance', periodoActual,
    processedData: extractESFProcessed(filas, periodoActual),
    tipoEntidad: 'PN',
  }
}

// ── Parser ERI PN ─────────────────────────────────────────────────────────
// ColTexto=1(B), ColNota=3(D), ColDatos=5+(F...)
// Header: fila 6 (idx=5) inicio, fila 7 (idx=6) fin
// Datos desde fila 10

function parseERI_PN(rows: CellRow[], empresa: string, nit: string): ParsedSheet {
  const periodos: string[] = []
  const periodoIdxs: number[] = []

  const hdr1 = rows[5] ?? []
  const hdr2 = rows[6] ?? []

  for (let i = 5; i < Math.max(hdr1.length, hdr2.length); i++) {
    const v = hdr1[i] ?? hdr2[i]
    const label = formatPeriodoLabel(v)
    if (label) {
      // Período "inicio - fin" o solo el fin
      const label2 = formatPeriodoLabel(hdr2[i])
      const final = label2 && label2 !== label ? `${label} / ${label2}` : label
      periodos.push(final)
      periodoIdxs.push(i)
    }
  }

  const filas: FinancialRow[] = []

  for (const row of rows.slice(9)) {
    const cuenta = str(row[1])
    if (!cuenta || cuenta.length < 2 || isIgnorable(cuenta)) continue

    const nota = num(row[3])
    const valores: Record<string, number> = {}
    periodoIdxs.forEach((idx, pi) => {
      const v = num(row[idx])
      if (v !== undefined) valores[periodos[pi]] = v
    })

    if (Object.keys(valores).length > 0) {
      filas.push({ cuenta, nota, valores })
    }
  }

  const periodoActual = periodos[0] ?? ''
  return {
    hoja: 'ERI', empresa, nit, periodos, filas,
    tipo: 'pyg', periodoActual,
    processedData: extractERIProcessed(filas, periodoActual),
    tipoEntidad: 'PN',
  }
}

// ── Parser NOTAS PN ───────────────────────────────────────────────────────
// ColTexto=2(C), ColDatos=3(D)
// Datos intercalados con headers 'NOTA X...' y 'CONCEPTO'

function parseNotas_PN(
  rows: CellRow[], empresa: string, nit: string,
  hoja: 'NOTAS ESF' | 'NOTAS ERI'
): ParsedSheet {
  const periodos: string[] = []

  // Buscar header de período en las primeras 15 filas col D (idx=3)
  for (const row of rows.slice(0, 15)) {
    const v = str(row[3])
    if (v && (v.match(/\d{4}/) || v.toUpperCase().includes('DIC') || v.toUpperCase().includes('ENE'))) {
      if (!periodos.includes(v)) periodos.push(v)
    }
  }
  if (periodos.length === 0) periodos.push('Período')

  const filas: FinancialRow[] = []
  let seccion = ''

  for (const row of rows) {
    const cuenta = str(row[2])
    if (!cuenta || cuenta.length < 2 || isIgnorable(cuenta)) continue

    const upper = cuenta.toUpperCase()
    // Headers de sección
    if (upper.startsWith('NOTA ') || upper === 'CONCEPTO' || upper.startsWith('NIT')) {
      if (upper.startsWith('NOTA ')) seccion = cuenta
      continue
    }
    // Ignorar textos largos descriptivos sin valores
    const v = num(row[3])
    if (v === undefined) continue

    filas.push({
      cuenta: seccion ? `${seccion} / ${cuenta}` : cuenta,
      valores: { [periodos[0]]: v },
    })
  }

  const periodoActual = periodos[0] ?? ''
  return {
    hoja, empresa, nit, periodos, filas,
    tipo: 'notas', periodoActual,
    processedData: {},
    tipoEntidad: 'PN',
  }
}

// ── Extractores de processedData ──────────────────────────────────────────

export function extractESFProcessed(filas: FinancialRow[], periodo: string): Record<string, number> {
  // Busca el primer match entre los valores de la hoja
  const get = (...kws: string[]): number => {
    for (const f of filas) {
      const c = f.cuenta.toLowerCase()
      if (kws.some(k => c.includes(k.toLowerCase()))) {
        const v = f.valores[periodo] ?? 0
        if (v !== 0) return v
      }
    }
    return 0
  }
  // Buscar el máximo entre varios candidatos (para totales)
  const max = (...kws: string[]): number => {
    let best = 0
    for (const f of filas) {
      const c = f.cuenta.toLowerCase()
      if (kws.some(k => c.includes(k.toLowerCase()))) {
        const v = Math.abs(f.valores[periodo] ?? 0)
        if (v > best) best = v
      }
    }
    return best
  }

  const activos_corrientes  = get('corriente / corriente', 'total activo corriente') || max('corriente')
  const total_activos       = get('total activo.', 'total activos.', 'total activo') || max('total activo')
  const pasivos_corrientes  = get('corriente / corriente', 'pasivo corriente') ||
                              max('pasivo corriente', 'corriente / total') || 0
  const total_pasivos       = get('total pasivo.', 'total pasivos.', 'total pasivo') || max('total pasivo')
  const patrimonio          = get('total patrimonio.', 'total patrimonio') || max('total patrimonio')
  const activos_nc          = get('no corriente / total', 'no corriente') || (total_activos - activos_corrientes)

  return {
    efectivo:              get('efectivo'),
    inversiones:           get('inversiones'),
    cxc:                   get('cuentas por cobrar', 'cxc clientes'),
    inventarios:           get('inventarios'),
    activos_corrientes,
    activos_no_corrientes: activos_nc > 0 ? activos_nc : 0,
    total_activos,
    pasivos_corrientes,
    total_pasivos,
    patrimonio,
    ppye:                  get('propiedad planta', 'ppye'),
  }
}

export function extractERIProcessed(filas: FinancialRow[], periodo: string): Record<string, number> {
  const get = (...kws: string[]): number => {
    for (const f of filas) {
      const c = f.cuenta.toLowerCase()
      if (kws.some(k => c.includes(k.toLowerCase()))) {
        const v = f.valores[periodo] ?? 0
        if (v !== 0) return v
      }
    }
    return 0
  }
  // Para totales buscar el valor más alto
  const maxVal = (...kws: string[]): number => {
    let best = 0
    for (const f of filas) {
      const c = f.cuenta.toLowerCase()
      if (kws.some(k => c.includes(k.toLowerCase()))) {
        const v = Math.abs(f.valores[periodo] ?? 0)
        if (v > best) best = v
      }
    }
    return best
  }

  const ingresos        = get('ingresos por actividades ordinarias', 'total ingresos por actividades') ||
                          maxVal('ingresos por actividades', 'total ingresos')
  const costo_ventas    = get('costo de ventas', '(menos) costo de ventas')
  const ganancia_bruta  = get('ganancia bruta del periodo', 'ganancia bruta del período') ||
                          get('ganancia bruta')
  const gtos_admin      = get('gastos de ventas y de administración', 'total gastos efectivos de administr') ||
                          get('gastos de administracion', 'gastos efectivos de adminis')
  const ebitda          = get('ebitda.')  || get('ebitda')
  const util_op         = get('utilidad o perdida operacional', 'ganancia operacional.') ||
                          get('utilidad operacional', 'ganancia operacional')
  const gtos_fin        = get('gastos financieros ', 'gastos financiero e interes') ||
                          get('gastos financiero', 'gastos financieros')
  const util_neta       = get('resultado integral del periodo', 'resultado integral del período') ||
                          get('ganancias antes de impuestos', 'ganancia antes de impuesto') ||
                          get('resultado total', 'utilidad neta')

  return {
    ingresos,
    costo_ventas,
    utilidad_bruta:       ganancia_bruta || (ingresos - costo_ventas),
    gastos_operacionales: gtos_admin,
    ebitda,
    utilidad_operacional: util_op,
    gastos_financieros:   gtos_fin,
    utilidad_neta:        util_neta,
    // Alias para compatibilidad con ProcessedFinancialData
    utilidad_antes_impuestos: get('ganancias antes de impuestos', 'ganancia antes de financieros') || util_neta,
  }
}

// ── Extractor de empresa y NIT ────────────────────────────────────────────

function extractEmpresaNit(rows: CellRow[], colIdx: number): { empresa: string; nit: string } {
  let empresa = ''
  let nit = ''

  for (const row of rows.slice(0, 6)) {
    const v = str(row[colIdx])
    if (!v) continue
    if (!empresa && v.length > 4 && !v.startsWith('NIT') && !v.startsWith('ESTADO') && !v.startsWith('(')) {
      empresa = v
    }
    if (!nit && v.startsWith('NIT')) {
      nit = v.replace(/^NIT[.:]\s*/i, '').trim()
    }
  }
  return { empresa, nit }
}

// ── Función principal ─────────────────────────────────────────────────────

export async function parseESFFile(buffer: Buffer): Promise<ParsedSheet[]> {
  const XLSX = await import('xlsx')
  const wb   = XLSX.read(buffer, { type: 'buffer' })
  const names = wb.SheetNames

  const readSheet = (name: string): CellRow[] => {
    const ws = wb.Sheets[name]
    if (!ws) return []
    return XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      blankrows: true,
    }) as CellRow[]
  }

  // Leer ESF para detectar tipo
  const esfRows = readSheet('ESF')
  if (esfRows.length === 0) return []

  const tipo = detectarTipo(names, esfRows)

  // Extraer empresa y NIT según tipo
  const empCol = tipo === 'PN' ? 2 : 1
  const { empresa, nit } = extractEmpresaNit(esfRows, empCol)

  const results: ParsedSheet[] = []

  if (tipo === 'PJ') {
    // ESF PJ
    results.push(parseESF_PJ(esfRows, empresa, nit))

    // ERI PJ
    const eriRows = readSheet('ERI')
    if (eriRows.length > 0) results.push(parseERI_PJ(eriRows, empresa, nit))

    // NOTAS ESF PJ
    const nEsfRows = readSheet('NOTAS ESF')
    if (nEsfRows.length > 0) results.push(parseNotas_PJ(nEsfRows, empresa, nit, 'NOTAS ESF'))

    // NOTAS ERI PJ — hoja se llama 'NOTAS ER' (sin I)
    const nEriRows = readSheet('NOTAS ER')
    if (nEriRows.length > 0) results.push(parseNotas_PJ(nEriRows, empresa, nit, 'NOTAS ER'))

  } else if (tipo === 'PN') {
    // ESF PN
    results.push(parseESF_PN(esfRows, empresa, nit))

    // ERI PN
    const eriRows = readSheet('ERI')
    if (eriRows.length > 0) results.push(parseERI_PN(eriRows, empresa, nit))

    // NOTAS ESF PN — hoja se llama 'NOTAS - ESF ' (con guión y espacio al final)
    const nEsfName = names.find(n => n.startsWith('NOTAS - ESF')) ?? ''
    const nEsfRows = nEsfName ? readSheet(nEsfName) : []
    if (nEsfRows.length > 0) results.push(parseNotas_PN(nEsfRows, empresa, nit, 'NOTAS ESF'))

    // NOTAS ERI PN — hoja se llama 'NOTAS - ERI'
    const nEriName = names.find(n => n.startsWith('NOTAS - ERI')) ?? ''
    const nEriRows = nEriName ? readSheet(nEriName) : []
    if (nEriRows.length > 0) results.push(parseNotas_PN(nEriRows, empresa, nit, 'NOTAS ERI'))

  } else {
    // Tipo desconocido — intentar detección por contenido (fallback)
    results.push(...await parseFallback(esfRows, names, readSheet, empresa, nit))
  }

  return results
}

// ── Fallback para formatos no reconocidos ─────────────────────────────────

async function parseFallback(
  esfRows: CellRow[],
  names: string[],
  readSheet: (n: string) => CellRow[],
  empresa: string,
  nit: string,
): Promise<ParsedSheet[]> {
  // Intentar detectar columna de texto buscando la primera con texto largo
  const fila2 = esfRows[1] ?? []
  let colTexto = 0
  for (let i = 0; i < fila2.length; i++) {
    const v = str(fila2[i])
    if (v.length > 5) { colTexto = i; break }
  }

  // Buscar columnas de datos (primera columna numérica con valores > 1000)
  let colDatos = colTexto + 1
  for (const row of esfRows.slice(5, 20)) {
    for (let i = colTexto + 1; i < row.length; i++) {
      const v = num(row[i])
      if (v !== undefined && Math.abs(v) > 1000) { colDatos = i; break }
    }
    if (colDatos > colTexto + 1) break
  }

  const periodos = ['Período']
  const filas: FinancialRow[] = []

  for (const row of esfRows.slice(5)) {
    const cuenta = str(row[colTexto])
    if (!cuenta || cuenta.length < 2 || isIgnorable(cuenta)) continue
    const v = num(row[colDatos])
    if (v !== undefined) {
      filas.push({ cuenta, valores: { 'Período': v } })
    }
  }

  return [{
    hoja: 'ESF', empresa, nit, periodos, filas,
    tipo: 'balance', periodoActual: 'Período',
    processedData: extractESFProcessed(filas, 'Período'),
    tipoEntidad: 'DESCONOCIDO',
  }]
}