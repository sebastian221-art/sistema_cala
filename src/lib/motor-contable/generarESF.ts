/**
 * ============================================================
 * GENERADOR ESF — MOTOR CONTABLE
 * ============================================================
 * Versión: 3.0.0
 *
 * ESTRUCTURA: cada hoja es una función independiente.
 * Para refinar una hoja, solo edita su función.
 *
 * HOJAS GENERADAS (16 automáticas):
 *   01. CAJA
 *   02. BANCOS
 *   03. INVERSIONES
 *   04. CXC
 *   05. INVENTARIO
 *   06. OTRAS CXC
 *   07. PYP
 *   08. OBLI. FIN
 *   09. CXP
 *   10. FISCALES
 *   11. OTROS PASIVOS
 *   12. INGRESOS
 *   13. NOTAS PYG
 *   14. COSTOS 2026
 *   15. NOTAS ESF
 *   16. ESF
 *   17. ERI
 *
 * PALETA DE COLORES (del archivo real):
 *   Verde  FF00B050  → headers ACTIVO / PASIVO / PATRIMONIO / NOTA
 *   Rojo   FF903032  → headers de periodos año corriente
 *   Azul   theme:4   → totales principales (Total Activo, Total Pasivo, etc.)
 *   Sin fill          → totales intermedios y filas de dato
 * ============================================================
 */

import { renglonesESF, ETIQUETA_DE, type RenglonId } from './reglas'
import { reglasDesdePerfil } from '@/lib/perfiles/calcularSimilitud'
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado, EriAcumulado } from './motor'
import type { TerceroAgrupado } from './parser' 
// ─────────────────────────────────────────────────────────────
// PALETA DE COLORES (del archivo real analizado)
// ─────────────────────────────────────────────────────────────
const C = {
  VERDE_HEADER : 'FF00B050',  // Headers ACTIVO, PASIVO, PATRIMONIO
  ROJO_PERIODO : 'FF903032',  // Columnas año corriente
  AZUL_TOTAL   : 'FF2F75B6',  // Totales principales (aproximación theme:4)
  GRIS_SUBTOTAL: 'FFF2F2F2',  // Totales intermedios
  BLANCO       : 'FFFFFFFF',
  NEGRO        : 'FF000000',
  GRIS_TEXTO   : 'FF595959',
  AZUL_LINK    : 'FF0070C0',  // Color notas (números de nota)
}

const FMT_PESOS = '#,##0;(#,##0);"-"'
const FMT_PCT   = '0.0%'

type WS = ExcelJS.Worksheet

// ─────────────────────────────────────────────────────────────
// HELPERS DE ESTILO
// ─────────────────────────────────────────────────────────────

const solid = (argb: string): ExcelJS.Fill =>
  ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

const font = (bold = false, argb = C.NEGRO, size = 10): Partial<ExcelJS.Font> =>
  ({ name: 'Arial', bold, color: { argb }, size })

const alin = (h: ExcelJS.Alignment['horizontal'] = 'left', wrap = false): Partial<ExcelJS.Alignment> =>
  ({ horizontal: h, vertical: 'middle', wrapText: wrap })

// ─────────────────────────────────────────────────────────────
// HELPERS DE NOMBRE DE MES
// ─────────────────────────────────────────────────────────────
const MESES: Record<number, string> = {
  1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
  7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
}

const DIAS_FIN: Record<number, string> = {
  1:'31',2:'28',3:'31',4:'30',5:'31',6:'30',
  7:'31',8:'31',9:'30',10:'31',11:'30',12:'31',
}

function fechaCorte(mes: number, anio: number): string {
  const d = DIAS_FIN[mes] ?? '30'
  return `${d}.${String(mes).padStart(2,'0')}.${anio}`
}

// ─────────────────────────────────────────────────────────────
// CABECERA ESTÁNDAR (filas 2-9, igual al real)
// ─────────────────────────────────────────────────────────────
/**
 * Escribe cabecera estilo real:
 *   F2: empresa (bold)
 *   F3: NIT (bold)
 *   F4: título (bold)
 *   F5: cifras en pesos (bold)
 *   F7: header CONCEPTO (verde) + años (rojo para año actual)
 *   F8: CONCEPTO + meses (rojo para año actual)
 *   F9: Fiscal / contable si aplica
 * Retorna la primera fila de datos (10).
 */
function cabecera(
  ws: WS,
  empresa: string,
  nit: string,
  titulo: string,
  periodos: PeriodoCalculado[],
  colInicioDatos: number = 3,  // columna donde empiezan los datos (C=3 para notas, F=6 para ESF)
  maxCols = 8
): number {
  const periOrd = [...periodos].reverse().slice(0, maxCols)

  // F2-F5: info empresa (col B = 2)
  const setHeader = (row: number, txt: string) => {
    const c = ws.getCell(row, 2)
    c.value = txt
    c.font = font(true, C.NEGRO, 10)
  }
  setHeader(2, empresa)
  setHeader(3, `NIT. ${nit}`)
  setHeader(4, titulo)
  setHeader(5, '(Cifra expresadas en pesos Colombianos)')

  // F7-F8: headers de período
  // Col B: CONCEPTO (verde)
  const cConc7 = ws.getCell(7, 2)
  cConc7.value = 'ACTIVO'
  cConc7.font = font(true, C.BLANCO, 10)
  cConc7.fill = solid(C.VERDE_HEADER)

  // También poner NOTA si hay columna para ello (col D = 4 en ESF/ERI)
  // Las hojas de notas usan col A = CONCEPTO

  periOrd.forEach((p, i) => {
    const col = colInicioDatos + i
    const cAno = ws.getCell(7, col)
    cAno.value = p.anio
    cAno.font = font(true, C.BLANCO, 8)
    cAno.fill = solid(C.ROJO_PERIODO)
    cAno.alignment = alin('center')

    const cMes = ws.getCell(8, col)
    cMes.value = MESES[p.mes] ?? String(p.mes)
    cMes.font = font(true, C.BLANCO, 8)
    cMes.fill = solid(C.ROJO_PERIODO)
    cMes.alignment = alin('center')
  })

  const cConc8 = ws.getCell(8, 2)
  cConc8.value = 'CONCEPTO'
  cConc8.font = font(true, C.BLANCO, 9)
  cConc8.fill = solid(C.VERDE_HEADER)
  cConc8.alignment = alin('center')

  ws.views = [{ state: 'frozen', xSplit: colInicioDatos - 1, ySplit: 8 }]
  ws.showGridLines = false
  return 10
}

// ─────────────────────────────────────────────────────────────
// HELPERS DE FILAS
// ─────────────────────────────────────────────────────────────

/** Fila de sección (texto bold, sin fill especial — igual al real) */
function rSeccion(ws: WS, fila: number, colL: number, label: string) {
  const c = ws.getCell(fila, colL)
  c.value = label
  c.font = font(true, C.NEGRO, 10)
}

/** Fila de dato normal */
function rDato(ws: WS, fila: number, colL: number, label: string, vals: (number|null)[], colDatos: number) {
  const c = ws.getCell(fila, colL)
  c.value = label
  c.font = font(false, C.NEGRO, 9)
  c.alignment = alin('left')
  vals.forEach((v, i) => {
    const cv = ws.getCell(fila, colDatos + i)
    cv.value = v ?? null
    cv.font = font(false, C.NEGRO, 9)
    cv.alignment = alin('right')
    cv.numFmt = FMT_PESOS
  })
}

/** Total intermedio (bold, sin fill — igual al real para subtotales) */
function rSubtotal(ws: WS, fila: number, colL: number, label: string, vals: (number|null)[], colDatos: number) {
  const c = ws.getCell(fila, colL)
  c.value = label
  c.font = font(true, C.NEGRO, 9)
  vals.forEach((v, i) => {
    const cv = ws.getCell(fila, colDatos + i)
    cv.value = v ?? null
    cv.font = font(true, C.NEGRO, 9)
    cv.alignment = alin('right')
    cv.numFmt = FMT_PESOS
  })
}

/** Total principal (bold, fill azul — theme:4 del real) */
function rTotal(ws: WS, fila: number, colL: number, label: string, vals: (number|null)[], colDatos: number, span?: number) {
  const numCols = span ?? vals.length
  for (let c = colL; c < colL + 2 + numCols; c++) {
    ws.getCell(fila, c).fill = solid(C.AZUL_TOTAL)
  }
  const c = ws.getCell(fila, colL)
  c.value = label
  c.font = font(true, C.BLANCO, 9)
  c.fill = solid(C.AZUL_TOTAL)
  vals.forEach((v, i) => {
    const cv = ws.getCell(fila, colDatos + i)
    cv.value = v ?? null
    cv.font = font(true, C.BLANCO, 9)
    cv.fill = solid(C.AZUL_TOTAL)
    cv.alignment = alin('right')
    cv.numFmt = FMT_PESOS
  })
}

/** Header de sección tipo PASIVO/PATRIMONIO (verde) */
function rHeaderSeccion(ws: WS, fila: number, colL: number, label: string, nCols: number) {
  const c = ws.getCell(fila, colL)
  c.value = label
  c.font = font(true, C.BLANCO, 10)
  c.fill = solid(C.VERDE_HEADER)
  for (let i = 1; i <= nCols; i++) {
    ws.getCell(fila, colL + i).fill = solid(C.VERDE_HEADER)
  }
}

/** Valores para N períodos ordenados más reciente → más antiguo */
function vals(periodos: PeriodoCalculado[], extractor: (p: PeriodoCalculado) => number, max = 8): number[] {
  return [...periodos].reverse().slice(0, max).map(extractor)
}

/** Anchos de columna */
function setAnchos(ws: WS, mapa: Record<number, number>) {
  for (const [col, w] of Object.entries(mapa)) {
    ws.getColumn(Number(col)).width = w
  }
}
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar función hojaCAJA completa
// ══════════════════════════════════════════════════════════════
export function hojaCAJA(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('CAJA')
  ws.showGridLines = false

  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'
  const GRIS_ITEM = 'FFF2F2F2'
  const NEGRO = 'FF000000'
  const BLANC = 'FFFFFFFF'

  const sfill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, argb = NEGRO, sz = 9, italic = false): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', bold, italic, color: { argb }, size: sz })
  const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
  const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
  const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'double', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bThin: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: NEGRO } },
    bottom: { style: 'thin', color: { argb: NEGRO } },
    left:   { style: 'thin', color: { argb: NEGRO } },
    right:  { style: 'thin', color: { argb: NEGRO } },
  }

  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 5)
  const NA = grpAct.length
  const NB = grpAnt.length
  const COL_SEP = 2 + NA
  const COL_ANT = COL_SEP + 1
  const LAST    = COL_ANT + NB

  ws.getColumn(1).width = 30.0
  for (let i = 0; i < NA; i++) ws.getColumn(2 + i).width = 14.5
  ws.getColumn(COL_SEP).width = 1.0
  for (let i = 0; i < NB; i++) ws.getColumn(COL_ANT + i).width = 14.5
  ws.getColumn(LAST).width = 1.71

  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, sz, italic); c.alignment = alnC
  }
  setTit(2, r.empresa, true, 11)
  setTit(3, `NIT. ${r.nit}`, true, 10)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS', false, 10)

  for (let i = 0; i < NA; i++) {
    const p = grpAct[i]; if (!p) continue
    const c7 = ws.getCell(7, 2+i)
    c7.value = p.anio; c7.font = fnt(true, BLANC, 8)
    c7.fill = sfill(NAVY); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, 2+i)
    c8.value = MESES[p.mes] ?? ''; c8.font = fnt(true, BLANC, 8)
    c8.fill = sfill(NAVY); c8.alignment = alnC; c8.border = bThin
  }
  for (let i = 0; i < NB; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c7 = ws.getCell(7, COL_ANT+i)
    c7.value = p.anio; c7.font = fnt(true, BLANC, 8)
    c7.fill = sfill(NAVY); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, COL_ANT+i)
    c8.value = MESES[p.mes] ?? ''; c8.font = fnt(true, BLANC, 8)
    c8.fill = sfill(NAVY); c8.alignment = alnC; c8.border = bThin
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }]
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 13
  ws.getRow(7).height = 15; ws.getRow(8).height = 14

  const writeRow = (
    rowN: number, label: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders> }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = label; cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = alnL
    if (opts.fillColor) cL.fill = sfill(opts.fillColor)
    if (opts.brd) cL.border = opts.brd
    for (let i = 0; i < NA; i++) {
      const p = grpAct[i] ?? null; const c = ws.getCell(rowN, 2+i)
      c.value = p ? (gAct(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = alnR; c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = sfill(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
    for (let i = 0; i < NB; i++) {
      const p = grpAnt[i] ?? null; const c = ws.getCell(rowN, COL_ANT+i)
      c.value = p ? (gAnt(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = alnR; c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = sfill(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
  }

  // ── Header CAJA ───────────────────────────────────────────
  writeRow(10, 'CAJA',
    p => p.activoCorriente.cajaTotal,
    p => p.activoCorriente.cajaTotal,
    { bold: true, fillColor: AZUL_H, brd: bDblTop })

  // ── FIX: unión de cajaDetalle de TODOS los períodos ───────
  // ANTES: usaba solo el último período con "as any" →
  //   Si Caja Menor tiene saldo en ENERO pero no en MARZO,
  //   el último período (MARZO) no la tiene y desaparece del detalle.
  // AHORA: recorre todos los períodos y acumula todas las cajas
  //   que aparecen en cualquier mes, sin importar cuál es el último.
  const cajaUnion = new Map<string, string>()  // codigo → nombre
  for (const p of r.periodos) {
    for (const item of (p.activoCorriente.cajaDetalle ?? [])) {
      if (!cajaUnion.has(item.codigo)) cajaUnion.set(item.codigo, item.nombre)
    }
  }

  let fila = 12

  if (cajaUnion.size > 0) {
    // Hay subcuentas 1105xx → mostrar cada caja discriminada
    // Ej: Caja General (110505), Caja Menor (110510), etc.
    for (const [codigo, nombre] of cajaUnion) {
      writeRow(fila, nombre,
        p => p.activoCorriente.cajaDetalle?.find(x => x.codigo === codigo)?.valor ?? null,
        p => p.activoCorriente.cajaDetalle?.find(x => x.codigo === codigo)?.valor ?? null,
        { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
      fila++
    }
  } else {
    // Fallback: sin subcuentas → mostrar total como línea única "Caja"
    writeRow(fila, 'Caja',
      p => p.activoCorriente.cajaTotal,
      p => p.activoCorriente.cajaTotal,
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
  }

  ws.getRow(9).height = 15; ws.getRow(10).height = 14; ws.getRow(11).height = 14
}

// ══════════════════════════════════════════════════════════════
// HOJA 2 GENERADOR — reemplazar función hojaBANCOS completa
// ══════════════════════════════════════════════════════════════
export function hojaBANCOS(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('BANCOS')
  ws.showGridLines = false

  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'   // ← DISEÑO: header "Bancos"
  const GRIS_ITEM = 'FFF2F2F2'   // ← DISEÑO: nombre de banco (Banco Bogota, Bancolombia...)
  const NEGRO = 'FF000000'
  const BLANC = 'FFFFFFFF'

  const sfill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, argb = NEGRO, sz = 9, italic = false): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', bold, italic, color: { argb }, size: sz })
  const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
  const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
  const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
  const bThin: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin',   color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'double', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'dashed', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  // ── Períodos dinámicos ────────────────────────────────────
  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 5)
  const NA = grpAct.length
  const NB = grpAnt.length
  const COL_SEP = 2 + NA        // spacer
  const COL_ANT = COL_SEP + 1   // primera col años anteriores
  const LAST    = COL_ANT + NB  // trailing spacer

  // ── Anchos ────────────────────────────────────────────────
  ws.getColumn(1).width = 28.0
  for (let i = 0; i < NA; i++) ws.getColumn(2 + i).width = 14.5
  ws.getColumn(COL_SEP).width = 1.0
  for (let i = 0; i < NB; i++) ws.getColumn(COL_ANT + i).width = 14.5
  ws.getColumn(LAST).width = 1.71

  // ── F2-4: títulos cursiva bold centrados ──────────────────
  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, sz, italic); c.alignment = alnC
  }
  setTit(2, r.empresa,                          true,  11)
  setTit(3, `NIT. ${r.nit}`,                   true,  10)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS', false, 10)

  // ── F7: años | F8: meses (NAVY) ───────────────────────────
  for (let i = 0; i < NA; i++) {
    const p = grpAct[i]; if (!p) continue
    const c7 = ws.getCell(7, 2 + i)
    c7.value = p.anio; c7.font = fnt(true, BLANC, 8)
    c7.fill = sfill(NAVY); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, 2 + i)
    c8.value = MESES[p.mes]; c8.font = fnt(true, BLANC, 8)
    c8.fill = sfill(NAVY); c8.alignment = alnC; c8.border = bThin
  }
  for (let i = 0; i < NB; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c7 = ws.getCell(7, COL_ANT + i)
    c7.value = p.anio; c7.font = fnt(true, BLANC, 8)
    c7.fill = sfill(NAVY); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, COL_ANT + i)
    c8.value = MESES[p.mes]; c8.font = fnt(true, BLANC, 8)
    c8.fill = sfill(NAVY); c8.alignment = alnC; c8.border = bThin
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }]

  // ── Alturas ───────────────────────────────────────────────
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 13
  ws.getRow(7).height = 15; ws.getRow(8).height = 14
  ws.getRow(9).height = 15; ws.getRow(10).height = 14

  // ── Helper: escribir fila ─────────────────────────────────
  const writeRow = (
    rowN: number,
    label: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean }
    //                       ← DISEÑO: reemplaza navy (mismo comportamiento)
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value     = (opts.indent ? '   ' : '') + label
    cL.font      = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
    cL.alignment = alnL
    if (opts.fillColor) cL.fill = sfill(opts.fillColor)  // ← DISEÑO
    if (opts.brd) cL.border = opts.brd

    for (let i = 0; i < NA; i++) {
      const p = grpAct[i] ?? null
      const c = ws.getCell(rowN, 2 + i)
      c.value     = p ? (gAct(p) ?? null) : null
      c.font      = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
      c.alignment = alnR
      c.numFmt    = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = sfill(opts.fillColor)  // ← DISEÑO
      if (opts.brd)  c.border = opts.brd
    }
    for (let i = 0; i < NB; i++) {
      const p = grpAnt[i] ?? null
      const c = ws.getCell(rowN, COL_ANT + i)
      c.value     = p ? (gAnt(p) ?? null) : null
      c.font      = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
      c.alignment = alnR
      c.numFmt    = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = sfill(opts.fillColor)  // ← DISEÑO
      if (opts.brd)  c.border = opts.brd
    }
  }

  // ── Helpers de lookup ─────────────────────────────────────
  const getBancoTotal = (p: PeriodoCalculado | null, nombre: string) =>
    p?.activoCorriente.bancos.find(b => b.nombre === nombre)?.totalSaldoFinal ?? null

  const getCuentaVal = (p: PeriodoCalculado | null, banco: string, cuenta: string) =>
    p?.activoCorriente.bancos
      .find(b => b.nombre === banco)
      ?.cuentas.find(c => c.numero === cuenta)?.saldoFinal ?? null

  // ── DATOS — idénticos al original ─────────────────────────

  // F10: Bancos total — ← DISEÑO: AZUL_H
  writeRow(10, 'Bancos',
    p => p.activoCorriente.bancosTotal,
    p => p.activoCorriente.bancosTotal,
    { bold: true, fillColor: AZUL_H, brd: bDblTop })

  // F12+: bloques por banco
  const bancosUlt = r.periodos[r.periodos.length - 1]?.activoCorriente.bancos ?? []
  let fila = 12

  for (const banco of bancosUlt) {
    writeRow(fila, banco.nombre,  // ← DISEÑO: GRIS_ITEM
      p => getBancoTotal(p, banco.nombre),
      p => getBancoTotal(p, banco.nombre),
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    fila++

    for (const cuenta of banco.cuentas) {
      writeRow(fila, cuenta.numero,
        p => getCuentaVal(p, banco.nombre, cuenta.numero),
        p => getCuentaVal(p, banco.nombre, cuenta.numero),
        { bold: false, brd: bDashedTop, indent: true })
      fila++
    }
    fila++ // separador entre bancos
  }
}
// ══════════════════════════════════════════════════════════════
// SECCIÓN 4 — REEMPLAZAR función hojaINVERSIONES COMPLETA en generador
// OBSERVACIÓN: "saldo final de la cuenta 12 por entidad"
// ESTRUCTURA: subcuenta (bold) → auxiliares/entidades debajo (dashed, indent)
// ══════════════════════════════════════════════════════════════

export function hojaINVERSIONES(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('INVERSIONES')
  ws.showGridLines = false

  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'
  const GRIS_ITEM = 'FFF2F2F2'
  const NEGRO = 'FF000000'
  const BLANC = 'FFFFFFFF'

  const sfill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, argb = NEGRO, sz = 9, italic = false): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', bold, italic, color: { argb }, size: sz })
  const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
  const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
  const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
  const bThin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: NEGRO } }, bottom: { style: 'thin', color: { argb: NEGRO } },
    left: { style: 'thin', color: { argb: NEGRO } }, right: { style: 'thin', color: { argb: NEGRO } },
  }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top: { style: 'double', color: { argb: NEGRO } }, bottom: { style: 'thin', color: { argb: NEGRO } },
    left: { style: 'thin', color: { argb: NEGRO } }, right: { style: 'thin', color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top: { style: 'dashed', color: { argb: NEGRO } }, bottom: { style: 'thin', color: { argb: NEGRO } },
    left: { style: 'thin', color: { argb: NEGRO } }, right: { style: 'thin', color: { argb: NEGRO } },
  }
  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 5)
  const NA = grpAct.length
  const NB = grpAnt.length
  const COL_SEP = 2 + NA
  const COL_ANT = COL_SEP + 1
  const LAST    = COL_ANT + NB

  ws.getColumn(1).width = 32.0
  for (let i = 0; i < NA; i++) ws.getColumn(2 + i).width = 14.5
  ws.getColumn(COL_SEP).width = 1.0
  for (let i = 0; i < NB; i++) ws.getColumn(COL_ANT + i).width = 14.5
  ws.getColumn(LAST).width = 1.71

  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, sz, italic); c.alignment = alnC
  }
  setTit(2, r.empresa, true, 11)
  setTit(3, `NIT. ${r.nit}`, true, 10)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS', false, 10)

  for (let i = 0; i < NA; i++) {
    const p = grpAct[i]; if (!p) continue
    ws.getCell(7, 2+i).value = p.anio
    ws.getCell(7, 2+i).font = fnt(true, BLANC, 8)
    ws.getCell(7, 2+i).fill = sfill(NAVY)
    ws.getCell(7, 2+i).alignment = alnC
    ws.getCell(7, 2+i).border = bThin
    ws.getCell(8, 2+i).value = MESES[p.mes]
    ws.getCell(8, 2+i).font = fnt(true, BLANC, 8)
    ws.getCell(8, 2+i).fill = sfill(NAVY)
    ws.getCell(8, 2+i).alignment = alnC
    ws.getCell(8, 2+i).border = bThin
  }
  for (let i = 0; i < NB; i++) {
    const p = grpAnt[i]; if (!p) continue
    ws.getCell(7, COL_ANT+i).value = p.anio
    ws.getCell(7, COL_ANT+i).font = fnt(true, BLANC, 8)
    ws.getCell(7, COL_ANT+i).fill = sfill(NAVY)
    ws.getCell(7, COL_ANT+i).alignment = alnC
    ws.getCell(7, COL_ANT+i).border = bThin
    ws.getCell(8, COL_ANT+i).value = MESES[p.mes]
    ws.getCell(8, COL_ANT+i).font = fnt(true, BLANC, 8)
    ws.getCell(8, COL_ANT+i).fill = sfill(NAVY)
    ws.getCell(8, COL_ANT+i).alignment = alnC
    ws.getCell(8, COL_ANT+i).border = bThin
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }]
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 13
  ws.getRow(7).height = 15; ws.getRow(8).height = 14
  ws.getRow(9).height = 15; ws.getRow(10).height = 14

  const writeRow = (
    rowN: number, label: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9)
    cL.alignment = alnL
    if (opts.fillColor) cL.fill = sfill(opts.fillColor)
    if (opts.brd) cL.border = opts.brd
    for (let i = 0; i < NA; i++) {
      const p = grpAct[i] ?? null
      const c = ws.getCell(rowN, 2 + i)
      c.value = p ? (gAct(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)
      c.alignment = alnR; c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = sfill(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
    for (let i = 0; i < NB; i++) {
      const p = grpAnt[i] ?? null
      const c = ws.getCell(rowN, COL_ANT + i)
      c.value = p ? (gAnt(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)
      c.alignment = alnR; c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = sfill(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
  }

  // ── Header total ─────────────────────────────────────────
  writeRow(10, 'Inversiones',
    p => p.activoCorriente.inversionesTotal || null,
    p => p.activoCorriente.inversionesTotal || null,
    { bold: true, fillColor: AZUL_H, brd: bDblTop })

  // ── FIX 1: unión de subcuentas de TODOS los períodos ─────
  // ANTES: solo usaba ult (último período).
  // Si TURISMO liquidó la inversión en ENERO, MARZO.inversionesDetalle = []
  // → cero filas de detalle aunque ENERO tenía 36M.
  const subcuentasUnion = new Map<string, string>()
  for (const p of r.periodos) {
    for (const sc of (p.activoCorriente.inversionesDetalle ?? [])) {
      if (!subcuentasUnion.has(sc.codigo)) subcuentasUnion.set(sc.codigo, sc.nombre)
    }
  }

  // ── FIX 2: unión de auxiliares de TODOS los períodos ─────
  const auxiliaresUnion = new Map<string, string>()
  for (const p of r.periodos) {
    for (const aux of (p.activoCorriente.inversionesAuxiliares ?? [])) {
      if (!auxiliaresUnion.has(aux.codigo)) auxiliaresUnion.set(aux.codigo, aux.nombre)
    }
  }
  const auxiliares = [...auxiliaresUnion.entries()].map(([codigo, nombre]) => ({ codigo, nombre }))

  let fila = 12

  for (const [scCodigo, scNombre] of subcuentasUnion) {
    writeRow(fila, scNombre,
      p => p.activoCorriente.inversionesDetalle?.find(x => x.codigo === scCodigo)?.valor ?? null,
      p => p.activoCorriente.inversionesDetalle?.find(x => x.codigo === scCodigo)?.valor ?? null,
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    fila++

    const auxDeSc = auxiliares.filter(a => a.codigo.startsWith(scCodigo))

    // ← FIX 3: solo mostrar auxiliares si aportan detalle real
    // Evita fila duplicada de VEGA donde auxiliar y subcuenta tienen
    // el mismo nombre "Aportes Coomultrasan" y el mismo valor
    const aportaDetalle = auxDeSc.length > 1 ||
      (auxDeSc.length === 1 && auxDeSc[0].nombre.trim() !== scNombre.trim())

    if (aportaDetalle) {
      for (const aux of auxDeSc) {
        writeRow(fila, aux.nombre,
          p => p.activoCorriente.inversionesAuxiliares?.find(x => x.codigo === aux.codigo)?.valor ?? null,
          p => p.activoCorriente.inversionesAuxiliares?.find(x => x.codigo === aux.codigo)?.valor ?? null,
          { bold: false, brd: bDashedTop, indent: true })
        fila++
      }
    }
    fila++
  }
}
// ─────────────────────────────────────────────────────────────
// HOJA 04 — CXC
// ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar función hojaCXC COMPLETA
// ══════════════════════════════════════════════════════════════
export function hojaCXC(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('CXC')
  ws.showGridLines = false

  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'   // ← DISEÑO: header "Cuentas Por Cobrar"
  const GRIS_ITEM = 'FFF2F2F2'   // ← DISEÑO: subcategorías
  const NEGRO = 'FF000000'
  const BLANC = 'FFFFFFFF'

  const sfill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, argb = NEGRO, sz = 9, italic = false): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', bold, italic, color: { argb }, size: sz })
  const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
  const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
  const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
  const bThin: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin',   color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'double', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'dashed', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  const toNombrePropio = (s: string): string => {
    if (!s) return ''
    return s.toLowerCase().split(' ').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '').join(' ')
  }
  const esNumerico = (s?: string) => !s || /^\d+$/.test(s.trim())

  // ── Períodos dinámicos ────────────────────────────────────
  const periOrd  = [...r.periodos].reverse()
  const anioAct  = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct   = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt   = periOrd.filter(p => p.anio !== anioAct).slice(0, 5)
  const NA       = grpAct.length
  const NB       = grpAnt.length
  const N_TOT    = NA + NB
  const COL_SEP  = 2 + NA
  const COL_ANT  = COL_SEP + 1
  const LAST     = COL_ANT + NB
  const todosOrd = [...grpAct, ...grpAnt]

  // colMap: columnas reales para cada índice de todosOrd
  const colMap: number[] = [
    ...Array.from({ length: NA }, (_, i) => 2 + i),
    ...Array.from({ length: NB }, (_, i) => COL_ANT + i),
  ]

  // ── Anchos ────────────────────────────────────────────────
  ws.getColumn(1).width = 40.0
  for (let i = 0; i < NA; i++) ws.getColumn(2 + i).width = 16.0
  ws.getColumn(COL_SEP).width = 1.5
  for (let i = 0; i < NB; i++) ws.getColumn(COL_ANT + i).width = 16.0
  ws.getColumn(LAST).width = 1.71

  // ── F2-4: títulos cursiva bold centrados ──────────────────
  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, sz, italic); c.alignment = alnC
  }
  setTit(2, r.empresa,                          true,  11)
  setTit(3, `NIT. ${r.nit}`,                   true,  10)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS', false, 10)

  // ── F6: años | F7: meses (NAVY) ───────────────────────────
  for (let i = 0; i < NA; i++) {
    const p = grpAct[i]; if (!p) continue
    ws.getCell(6, 2+i).value = p.anio;      ws.getCell(6, 2+i).font = fnt(true, BLANC, 8)
    ws.getCell(6, 2+i).fill = sfill(NAVY);  ws.getCell(6, 2+i).alignment = alnC; ws.getCell(6, 2+i).border = bThin
    ws.getCell(7, 2+i).value = MESES[p.mes]; ws.getCell(7, 2+i).font = fnt(true, BLANC, 8)
    ws.getCell(7, 2+i).fill = sfill(NAVY);  ws.getCell(7, 2+i).alignment = alnC; ws.getCell(7, 2+i).border = bThin
  }
  for (let i = 0; i < NB; i++) {
    const p = grpAnt[i]; if (!p) continue
    ws.getCell(6, COL_ANT+i).value = p.anio;       ws.getCell(6, COL_ANT+i).font = fnt(true, BLANC, 8)
    ws.getCell(6, COL_ANT+i).fill = sfill(NAVY);   ws.getCell(6, COL_ANT+i).alignment = alnC; ws.getCell(6, COL_ANT+i).border = bThin
    ws.getCell(7, COL_ANT+i).value = MESES[p.mes]; ws.getCell(7, COL_ANT+i).font = fnt(true, BLANC, 8)
    ws.getCell(7, COL_ANT+i).fill = sfill(NAVY);   ws.getCell(7, COL_ANT+i).alignment = alnC; ws.getCell(7, COL_ANT+i).border = bThin
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 13
  ws.getRow(6).height = 15; ws.getRow(7).height = 14; ws.getRow(8).height = 15; ws.getRow(10).height = 14

  // ── snap helpers ──────────────────────────────────────────
  const snap = (i: number, fn: (p: PeriodoCalculado) => number): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio)
    return per ? (fn(per) || null) : null
  }
  const snapTercero = (i: number, nitKey: string, tipo: 'clientes' | 'anticipos'): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio)
    if (!per) return null
    const arr = tipo === 'clientes'
      ? per.activoCorriente.tercerosCxc
      : (per.activoCorriente.tercerosAnticipios ?? [])
    const t = arr.find(x => (x.nit || x.nombreTercero) === nitKey)
    return t ? t.saldoFinal || null : null
  }

  // ── Helper: escribir fila con layout dinámico ─────────────
  const writeRow = (
    rowN: number, label: string,
    vals: (number | null)[],
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: string }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ?? '') + label
    cL.font  = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
    cL.alignment = alnL
    if (opts.fillColor) cL.fill = sfill(opts.fillColor)  // ← DISEÑO
    if (opts.brd) cL.border = opts.brd

    for (let i = 0; i < N_TOT; i++) {
      const col = colMap[i]
      if (!col) continue
      const c = ws.getCell(rowN, col)
      c.value     = vals[i] ?? null
      c.font      = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
      c.alignment = alnR
      c.numFmt    = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = sfill(opts.fillColor)  // ← DISEÑO
      if (opts.brd)       c.border = opts.brd
    }
  }

  // ── buildUnion ────────────────────────────────────────────
  const buildUnion = (tipo: 'clientes' | 'anticipos'): [string, string][] => {
    const mapa = new Map<string, string>()
    for (const p of r.periodos) {
      const arr = tipo === 'clientes'
        ? p.activoCorriente.tercerosCxc
        : (p.activoCorriente.tercerosAnticipios ?? [])
      for (const t of arr) {
        if (Math.abs(t.saldoFinal) < 1) continue
        const key = t.nit || t.nombreTercero; if (!key) continue
        const dn = !esNumerico(t.nombreTercero) ? t.nombreTercero
          : !esNumerico(t.nit) ? t.nit : (t.nombreTercero ?? t.nit ?? '')
        if (!mapa.has(key)) mapa.set(key, dn ?? '')
      }
    }
    return [...mapa.entries()].sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''))
  }

  // ── DATOS — idénticos al original ─────────────────────────
  const idx = [...Array(N_TOT).keys()]
  let f = 10

  // CUENTAS POR COBRAR — ← DISEÑO: AZUL_H
  writeRow(f, 'Cuentas Por Cobrar',
    idx.map(i => snap(i, p => p.activoCorriente.clientesTotal + p.activoCorriente.anticiposTotal)),
    { bold: true, fillColor: AZUL_H, brd: bDblTop })
  f += 2

  // Clientes Nacionales y del Exterior — ← DISEÑO: GRIS_ITEM
  writeRow(f, 'Clientes Nacionales y del Exterior',
    idx.map(i => snap(i, p => p.activoCorriente.clientesTotal)),
    { bold: true, fillColor: GRIS_ITEM, brd: bDblTop }); f++
  for (const [key, nombre] of buildUnion('clientes')) {
    writeRow(f, toNombrePropio(nombre),
      idx.map(i => snapTercero(i, key, 'clientes')),
      { brd: bDashedTop, indent: '   ' }); f++
  }
  f++

  // Anticipos y Avances — ← DISEÑO: GRIS_ITEM
  writeRow(f, 'Anticipos y Avances',
    idx.map(i => snap(i, p => p.activoCorriente.anticiposTotal)),
    { bold: true, fillColor: GRIS_ITEM, brd: bDblTop }); f++

  const ult = r.periodos[r.periodos.length - 1]
  const anticiposSubcs = ult?.activoCorriente.anticiposDetalle ?? []
  for (const sc of anticiposSubcs) {
    writeRow(f, sc.nombre,
      idx.map(i => {
        const pd = todosOrd[i]; if (!pd) return null
        const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio)
        return per?.activoCorriente.anticiposDetalle?.find(x => x.codigo === sc.codigo)?.total || null
      }),
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop }); f++  // ← DISEÑO: GRIS_ITEM

    const tercerosMapa = new Map<string, string>()
    for (const p of r.periodos) {
      const found = p.activoCorriente.anticiposDetalle?.find(x => x.codigo === sc.codigo)
      for (const t of found?.terceros ?? []) {
        if (Math.abs(t.saldoFinal) < 1) continue
        const key = String(t.nit || t.nombreTercero)
        if (!key || tercerosMapa.has(key)) continue
        const nombre = !esNumerico(t.nombreTercero) ? t.nombreTercero
          : !esNumerico(t.nit) ? String(t.nit) : (t.nombreTercero ?? '')
        tercerosMapa.set(key, nombre)
      }
    }
    for (const [nitKey, nombre] of [...tercerosMapa.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
      writeRow(f, toNombrePropio(nombre),
        idx.map(i => {
          const pd = todosOrd[i]; if (!pd) return null
          const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio)
          if (!per) return null
          const found = per.activoCorriente.anticiposDetalle?.find(x => x.codigo === sc.codigo)
          const t = (found?.terceros ?? []).find(x => String(x.nit || x.nombreTercero) === nitKey)
          return t ? t.saldoFinal || null : null
        }),
        { brd: bDashedTop, indent: '   ' }); f++
    }
    f++
  }

  if (anticiposSubcs.length === 0) {
    for (const [key, nombre] of buildUnion('anticipos')) {
      writeRow(f, toNombrePropio(nombre),
        idx.map(i => snapTercero(i, key, 'anticipos')),
        { brd: bDashedTop, indent: '   ' }); f++
    }
    f++
  }
  // ── SIN OBSERVACIONES ─────────────────────────────────────
}
// ══════════════════════════════════════════════════════════════
// SECCIÓN 5 — REEMPLAZAR función hojaINVENTARIO COMPLETA en generador
// OBSERVACIÓN: "saldo final de la cuenta 14 detallando subcuenta"
// ESTRUCTURA: subcuenta (bold) → auxiliares debajo si existen (dashed, indent)
// ══════════════════════════════════════════════════════════════

export function hojaINVENTARIO(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('INVENTARIO')
  ws.showGridLines = false

  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'   // ← DISEÑO: header "INVENTARIO"
  const GRIS_ITEM = 'FFF2F2F2'   // ← DISEÑO: subcuentas (Panela, Insumos...)
  const NEGRO = 'FF000000'
  const BLANC = 'FFFFFFFF'

  const sfill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, argb = NEGRO, sz = 9, italic = false): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', bold, italic, color: { argb }, size: sz })
  const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
  const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
  const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
  const bThin: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin',   color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'double', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'dashed', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  // ── Períodos dinámicos ────────────────────────────────────
  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 5)
  const NA = grpAct.length
  const NB = grpAnt.length
  const COL_SEP = 2 + NA
  const COL_ANT = COL_SEP + 1
  const LAST    = COL_ANT + NB

  // ── Anchos ────────────────────────────────────────────────
  ws.getColumn(1).width = 30.0
  for (let i = 0; i < NA; i++) ws.getColumn(2 + i).width = 14.5
  ws.getColumn(COL_SEP).width = 1.0
  for (let i = 0; i < NB; i++) ws.getColumn(COL_ANT + i).width = 14.5
  ws.getColumn(LAST).width = 1.71

  // ── F2-4: títulos cursiva bold centrados ──────────────────
  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, sz, italic); c.alignment = alnC
  }
  setTit(2, r.empresa,                          true,  11)
  setTit(3, `NIT. ${r.nit}`,                   true,  10)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS', false, 10)

  // ── F6: años | F7: meses (NAVY) ───────────────────────────
  for (let i = 0; i < NA; i++) {
    const p = grpAct[i]; if (!p) continue
    const c6 = ws.getCell(6, 2 + i)
    c6.value = p.anio; c6.font = fnt(true, BLANC, 8)
    c6.fill = sfill(NAVY); c6.alignment = alnC; c6.border = bThin
    const c7 = ws.getCell(7, 2 + i)
    c7.value = MESES[p.mes]; c7.font = fnt(true, BLANC, 8)
    c7.fill = sfill(NAVY); c7.alignment = alnC; c7.border = bThin
  }
  for (let i = 0; i < NB; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c6 = ws.getCell(6, COL_ANT + i)
    c6.value = p.anio; c6.font = fnt(true, BLANC, 8)
    c6.fill = sfill(NAVY); c6.alignment = alnC; c6.border = bThin
    const c7 = ws.getCell(7, COL_ANT + i)
    c7.value = MESES[p.mes]; c7.font = fnt(true, BLANC, 8)
    c7.fill = sfill(NAVY); c7.alignment = alnC; c7.border = bThin
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  // ── Alturas ───────────────────────────────────────────────
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 13
  ws.getRow(6).height = 15; ws.getRow(7).height = 14
  ws.getRow(8).height = 15; ws.getRow(9).height = 14

  // ── Helper: escribir fila ─────────────────────────────────
  const writeRow = (
    rowN: number, label: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean }
    //                       ← DISEÑO: reemplaza navy (mismo comportamiento)
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value     = (opts.indent ? '   ' : '') + label
    cL.font      = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
    cL.alignment = alnL
    if (opts.fillColor) cL.fill = sfill(opts.fillColor)  // ← DISEÑO
    if (opts.brd) cL.border = opts.brd

    for (let i = 0; i < NA; i++) {
      const p = grpAct[i] ?? null
      const c = ws.getCell(rowN, 2 + i)
      c.value     = p ? (gAct(p) ?? null) : null
      c.font      = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
      c.alignment = alnR; c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = sfill(opts.fillColor)  // ← DISEÑO
      if (opts.brd)  c.border = opts.brd
    }
    for (let i = 0; i < NB; i++) {
      const p = grpAnt[i] ?? null
      const c = ws.getCell(rowN, COL_ANT + i)
      c.value     = p ? (gAnt(p) ?? null) : null
      c.font      = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
      c.alignment = alnR; c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = sfill(opts.fillColor)  // ← DISEÑO
      if (opts.brd)  c.border = opts.brd
    }
  }

  // ── DATOS — idénticos al original ─────────────────────────

  writeRow(9, 'INVENTARIO',
    p => p.activoCorriente.inventarioTotal || null,
    p => p.activoCorriente.inventarioTotal || null,
    { bold: true, fillColor: AZUL_H, brd: bDblTop })  // ← DISEÑO: AZUL_H

  const ult        = r.periodos[r.periodos.length - 1]
  const subcuentas = ult?.activoCorriente.inventarioDetalle ?? []
  const auxiliares = ult?.activoCorriente.inventarioAuxiliares ?? []
  let fila = 11

  for (const sc of subcuentas) {
    const auxDeSc = auxiliares.filter(a => a.codigo.startsWith(sc.codigo))

    writeRow(fila, sc.nombre,
      p => p.activoCorriente.inventarioDetalle?.find(x => x.codigo === sc.codigo)?.valor ?? null,
      p => p.activoCorriente.inventarioDetalle?.find(x => x.codigo === sc.codigo)?.valor ?? null,
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })  // ← DISEÑO: GRIS_ITEM
    fila++

    for (const aux of auxDeSc) {
      writeRow(fila, aux.nombre,
        p => p.activoCorriente.inventarioAuxiliares?.find(x => x.codigo === aux.codigo)?.valor ?? null,
        p => p.activoCorriente.inventarioAuxiliares?.find(x => x.codigo === aux.codigo)?.valor ?? null,
        { bold: false, brd: bDashedTop, indent: true })
      fila++
    }
    fila++
  }
}
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar la función hojaOTRASCXC completa
// ══════════════════════════════════════════════════════════════
export function hojaOTRASCXC(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('OTRAS CXC')
  ws.showGridLines = false
 
  // ── Colores ───────────────────────────────────────────────
  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'   // ← DISEÑO: header principal
  const GRIS_ITEM = 'FFF2F2F2'   // ← DISEÑO: subcategorías
  const NEGRO = 'FF000000'
  const BLANC = 'FFFFFFFF'
 
  // ── Helpers locales ───────────────────────────────────────
  const fill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
 
  const fnt = (bold = false, color = NEGRO, size = 9): Partial<ExcelJS.Font> =>
    ({ name: 'Calibri', bold, color: { argb: color }, size })
 
  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> =>
    ({ horizontal: h, vertical: 'middle' })
 
  const bMedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'medium', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'double', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'dashed', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
 
  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }
 
  // ── Separar períodos por año ──────────────────────────────
  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 3)
 
  // ── Anchos exactos del real ───────────────────────────────
  ws.getColumn(1).width = 34
  ws.getColumn(2).width = 14.71
  ws.getColumn(3).width = 14.71
  ws.getColumn(4).width = 14.71
  ws.getColumn(5).width = 1.71   // separador
  ws.getColumn(6).width = 14.71
  ws.getColumn(7).width = 14.71
  ws.getColumn(8).width = 14.71
  ws.getColumn(9).width = 1.71
 
  // ── F2-4: empresa/NIT/título centrados ────────────────────
  const setTitulo = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1)
    c.value = txt
    c.font = fnt(true, NEGRO, 10)
    c.alignment = aln('center')
  }
  setTitulo(2, r.empresa)
  setTitulo(3, `NIT. ${r.nit}`)
  setTitulo(4, 'NOTAS A LOS ESTADOS FINANCIEROS')
 
  // ── F6: años (navy, medium-top) ───────────────────────────
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(6, 2 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(6, 6 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
 
  // ── F7: meses (navy, medium-top) ──────────────────────────
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(7, 2 + i)
    c.value = MESES[p.mes] ?? ''; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(7, 6 + i)
    c.value = MESES[p.mes] ?? ''; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
 
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]
 
  // ── Helper: escribir una fila de datos ────────────────────
  const writeRow = (
    rowN: number,
    label: string,
    getAct: (p: PeriodoCalculado) => number | null,
    getAnt: (p: PeriodoCalculado) => number | null,
    opts: {
      bold?: boolean
      fillColor?: string   // ← DISEÑO: reemplaza navyFill (mismo comportamiento)
      brd?: Partial<ExcelJS.Borders>
      indent?: boolean     // true = sangría en el label
    }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
    cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = fill(opts.fillColor)  // ← DISEÑO
 
    for (let i = 0; i < 3; i++) {
      const p = grpAct[i] ?? null
      const c = ws.getCell(rowN, 2 + i)
      c.value = p ? (getAct(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
      c.alignment = aln('right')
      c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)  // ← DISEÑO
      if (opts.brd) c.border = opts.brd
    }
 
    for (let i = 0; i < 3; i++) {
      const p = grpAnt[i] ?? null
      const c = ws.getCell(rowN, 6 + i)
      c.value = p ? (getAnt(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
      c.alignment = aln('right')
      c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)  // ← DISEÑO
      if (opts.brd) c.border = opts.brd
    }
  }
 
  // ── F9: "Otras Cuentas Por Cobrar" (total, navy) ──────────
  writeRow(9,
    'Otras Cuentas Por Cobrar',
    p => p.activoCorriente.anticipoImpuestosTotal,
    p => p.activoCorriente.anticipoImpuestosTotal,
    { bold: true, fillColor: AZUL_H, brd: bDblTop }  // ← DISEÑO: AZUL_H
  )
 
  // ── F11: "Anticipo de Impuestos" (subtotal, bold) ─────────
  writeRow(11,
    'Anticipo de Impuestos',
    p => p.activoCorriente.anticipoImpuestosTotal,
    p => p.activoCorriente.anticipoImpuestosTotal,
    { bold: true, fillColor: GRIS_ITEM, brd: bDblTop }  // ← DISEÑO: GRIS_ITEM
  )
 
  // ── F12+: detalle auxiliares agrupados de 1355 ────────────
  // Viene de anticImpuestosDetalle en el motor (calcCXC).
  // Si el campo no existe aún (motor viejo), usa fallback de 3 subcuentas.
  // Unión de todos los items de todos los períodos
  // (evita que items con saldo 0 en el último período desaparezcan)
  const detalleUnion = new Map<string, string>() // codigo → nombre
  for (const p of r.periodos) {
    const d = p.activoCorriente.anticImpuestosDetalle ?? []
    for (const item of d) {
      if (!detalleUnion.has(item.codigo)) detalleUnion.set(item.codigo, item.nombre)
    }
  }
  const detalleItems = [...detalleUnion.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))

  let fila = 12

  if (detalleItems.length > 0) {
    for (const [codigo, nombre] of detalleItems) {
      writeRow(fila,
        nombre,
        p => p.activoCorriente.anticImpuestosDetalle?.find(x => x.codigo === codigo)?.valor ?? null,
        p => p.activoCorriente.anticImpuestosDetalle?.find(x => x.codigo === codigo)?.valor ?? null,
        { bold: false, brd: bDashedTop, indent: true }
      )
      fila++
    }
  } else {
    // Fallback: motor viejo — mostrar 3 subcuentas conocidas
    const items = [
      { label: 'Retención en la Fuente',                  get: (p: PeriodoCalculado) => p.activoCorriente.anticReteFuente },
      { label: 'Anticipo Impuesto Renta',                 get: (p: PeriodoCalculado) => p.activoCorriente.anticRenta },
      { label: 'Impuesto Industria y Comercio Retenido',  get: (p: PeriodoCalculado) => p.activoCorriente.anticICA },
    ]
    for (const item of items) {
      writeRow(fila, item.label, item.get, item.get,
        { bold: false, brd: bDashedTop, indent: true }
      )
      fila++
    }
  }
 
  // ── Alturas de fila ───────────────────────────────────────
  ws.getRow(2).height = 15
  ws.getRow(3).height = 15
  ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45
  ws.getRow(7).height = 13.5
  ws.getRow(8).height = 15.75
  ws.getRow(9).height = 14.25
  ws.getRow(10).height = 14.25
  ws.getRow(11).height = 14.25
}
// ─────────────────────────────────────────────────────────────
// HOJA 07 — PYP (Propiedad Planta y Equipo)
// ─────────────────────────────────────────────────────────────
export function hojaPYP(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('PYP')
  ws.showGridLines = false

  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'   // ← DISEÑO: header principal
  const GRIS_ITEM = 'FFF2F2F2'   // ← DISEÑO: subcuentas y depreciación
  const NEGRO = 'FF000000'
  const BLANC = 'FFFFFFFF'

  const fill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, color = NEGRO, size = 9): Partial<ExcelJS.Font> =>
    ({ name: 'Calibri', bold, color: { argb: color }, size })
  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> =>
    ({ horizontal: h, vertical: 'middle' })

  const bDblTop: Partial<ExcelJS.Borders> = {
    top: { style: 'double', color: { argb: NEGRO } },
    bottom: { style: 'thin', color: { argb: NEGRO } },
    left:  { style: 'thin', color: { argb: NEGRO } },
    right: { style: 'thin', color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'dashed', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }

  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  // ── Períodos más reciente primero ─────────────────────────
  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 3)
  const todosOrd = [...grpAct, ...grpAnt]

  // ── Anchos ───────────────────────────────────────────────
  ws.getColumn(1).width = 42.0
  ws.getColumn(2).width = 16.0; ws.getColumn(3).width = 16.0; ws.getColumn(4).width = 16.0
  ws.getColumn(5).width = 2.0
  ws.getColumn(6).width = 16.0; ws.getColumn(7).width = 16.0; ws.getColumn(8).width = 16.0
  ws.getColumn(9).width = 1.71

  // ── F2-4: títulos ─────────────────────────────────────────
  const setTit = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, 10); c.alignment = aln('center')
  }
  setTit(2, r.empresa); setTit(3, `NIT. ${r.nit}`)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  // ── F6: años | F7: meses ──────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c6 = ws.getCell(6, 2+i); c6.value = p.anio
    c6.font = fnt(true, BLANC, 8); c6.fill = fill(NAVY); c6.alignment = aln('center')
    const c7 = ws.getCell(7, 2+i); c7.value = MESES[p.mes]
    c7.font = fnt(true, BLANC, 8); c7.fill = fill(NAVY); c7.alignment = aln('center')
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c6 = ws.getCell(6, 6+i); c6.value = p.anio
    c6.font = fnt(true, BLANC, 8); c6.fill = fill(NAVY); c6.alignment = aln('center')
    const c7 = ws.getCell(7, 6+i); c7.value = MESES[p.mes]
    c7.font = fnt(true, BLANC, 8); c7.fill = fill(NAVY); c7.alignment = aln('center')
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  // ── Helper: snapshot de un campo ──────────────────────────
  const snap = (i: number, fn: (p: PeriodoCalculado) => number): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio)
    if (!per) return null
    return fn(per) || null
  }

  // ── Helper: snapshot de auxiliar PPyE por nombre ──────────
  const snapAux = (
    i: number,
    scCodigo: string,
    auxNombre: string
  ): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio)
    if (!per) return null
    const sc = per.activoNoCorriente.detallePPyEConAux?.find(x => x.codigo === scCodigo)
    const aux = sc?.auxiliares.find(a => a.nombre.trim() === auxNombre.trim())
    return aux?.valor || null
  }

  // ── Helper: snapshot de auxiliar depreciación por nombre ──
  const snapAuxDep = (i: number, auxNombre: string): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio)
    if (!per) return null
    const sc = per.activoNoCorriente.detalleDepreciacion?.find(
      d => d.nombre.trim() === auxNombre.trim()
    )
    return sc?.valor || null
  }

  // ── Helper: escribir fila ─────────────────────────────────
  const writeRow = (
    rowN: number,
    label: string,
    vals: (number | null)[],
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: string }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ?? '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
    if (opts.fillColor) cL.fill = fill(opts.fillColor)

    const colMap = [2, 3, 4, 6, 7, 8]
    for (let i = 0; i < 6; i++) {
      const c = ws.getCell(rowN, colMap[i])
      c.value = vals[i] ?? null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
      c.alignment = aln('right'); c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
  }

  const ult = r.periodos[r.periodos.length - 1]
  let f = 9

  // ── PROPIEDAD PLANTA Y EQUIPO (navy) ──────────────────────
  const totalVals = [0,1,2,3,4,5].map(i =>
  snap(i, p => p.activoNoCorriente.ppyeNeto)
)

  writeRow(f, 'Propiedad Planta Y Equipo', totalVals,
    { bold: true, fillColor: AZUL_H, brd: bDblTop })  // ← DISEÑO: AZUL_H
  f++; f++

  // ── Subcuentas con auxiliares/detalle ─────────────────────
  // detallePPyEConAux contiene los ítems 4-digit con sus auxiliares.
  // Para cuentas que solo tienen subcuentas (ej: 1584, 1585) sin nivel
  // Auxiliar, el motor ahora devuelve las subcuentas 6-digit como fallback
  // (ver fix en calcPYP de motor.ts).
  const subcuentasPPyE = ult?.activoNoCorriente.detallePPyEConAux ?? []

  for (const sc of subcuentasPPyE) {
    // Subcuenta principal (bold, dblTop)
    const scVals = [0,1,2,3,4,5].map(i =>
      snap(i, p => p.activoNoCorriente.detallePPyEConAux?.find(x => x.codigo === sc.codigo)?.total ?? 0)
    )
    writeRow(f, sc.nombre, scVals, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })  // ← DISEÑO: GRIS_ITEM
    f++

    // Auxiliares de esta subcuenta — unión de todos los períodos
    // (evita que auxiliares presentes en un período pero no en otro desaparezcan)
    const auxUnion = new Set<string>()
    for (const p of r.periodos) {
      const psc = p.activoNoCorriente.detallePPyEConAux?.find(x => x.codigo === sc.codigo)
      psc?.auxiliares.forEach(a => auxUnion.add(a.nombre.trim()))
    }

    for (const auxNombre of auxUnion) {
      const auxVals = [0,1,2,3,4,5].map(i => snapAux(i, sc.codigo, auxNombre))
      writeRow(f, auxNombre, auxVals, { brd: bDashedTop, indent: '   ' })
      f++
    }

    f++ // separador entre cuentas
  }
  f++

  // ── DEPRECIACION ACUMULADA ─────────────────────────────────
  const depVals = [0,1,2,3,4,5].map(i =>
    snap(i, p => p.activoNoCorriente.depreciacionAcumulada)
  )
  writeRow(f, 'Depreciacion Acumulada', depVals, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })  // ← DISEÑO: GRIS_ITEM
  f++

  // Subcuentas de depreciación — unión de todos los períodos
  const depUnion = new Set<string>()
  for (const p of r.periodos) {
    p.activoNoCorriente.detalleDepreciacion?.forEach(d => depUnion.add(d.nombre.trim()))
  }
  for (const auxNombre of depUnion) {
    const depAuxVals = [0,1,2,3,4,5].map(i => snapAuxDep(i, auxNombre))
    writeRow(f, auxNombre, depAuxVals, { brd: bDashedTop, indent: '   ' })
    f++
  }

  // ── Alturas ───────────────────────────────────────────────
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5
  ws.getRow(9).height = 14.25
  // FIX: eliminada sección OBSERVACIONES que era una nota de desarrollo interna
  // y no debía aparecer en el output final del Excel.
}
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar función hojaOBLIFIN completa
// ══════════════════════════════════════════════════════════════
export function hojaOBLIFIN(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('OBLI. FIN')
  ws.showGridLines = false

  const NAVY   = 'FF2F75B6'
  const AZUL_H = 'FFD9E1F2'   // ← DISEÑO: "Bancos Nacionales"
  const NEGRO  = 'FF000000'
  const BLANC  = 'FFFFFFFF'

  const fill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

  const fnt = (bold = false, color = NEGRO, size = 9): Partial<ExcelJS.Font> =>
    ({ name: 'Calibri', bold, color: { argb: color }, size })

  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> =>
    ({ horizontal: h, vertical: 'middle' })

  const bMedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'medium', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'double', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'dashed', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }

  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 3)

  // ── Anchos exactos del real ───────────────────────────────
  ws.getColumn(1).width = 40.14
  ws.getColumn(2).width = 16.71
  ws.getColumn(3).width = 16.71
  ws.getColumn(4).width = 16.71
  ws.getColumn(5).width = 1.86
  ws.getColumn(6).width = 16.71
  ws.getColumn(7).width = 16.71
  ws.getColumn(8).width = 16.71
  ws.getColumn(9).width = 1.71

  // ── F2-4: títulos centrados ───────────────────────────────
  const setTit = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1)
    c.value = txt
    c.font = fnt(true, NEGRO, 10)
    c.alignment = aln('center')
  }
  setTit(2, r.empresa)
  setTit(3, `NIT. ${r.nit}`)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  // ── F6: años (navy, medium-top) ───────────────────────────
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(6, 2 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(6, 6 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }

  // ── F7: meses (navy) ──────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(7, 2 + i)
    c.value = MESES[p.mes] ?? ''
    c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center')
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(7, 6 + i)
    c.value = MESES[p.mes] ?? ''
    c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center')
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  // ── Helper: escribir fila de datos ────────────────────────
  const writeRow = (
    rowN: number,
    label: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null,
    opts: {
      bold?: boolean
      fillColor?: string   // ← DISEÑO: reemplaza navy (mismo comportamiento)
      brd?: Partial<ExcelJS.Borders>
      indent?: boolean
      soloLabel?: boolean
    }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9)
    cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = fill(opts.fillColor)  // ← DISEÑO

    if (opts.soloLabel) return

    for (let i = 0; i < 3; i++) {
      const p = grpAct[i] ?? null
      const c = ws.getCell(rowN, 2 + i)
      c.value = p ? (gAct(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
      c.alignment = aln('right')
      c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)  // ← DISEÑO
      if (opts.brd) c.border = opts.brd
    }
    for (let i = 0; i < 3; i++) {
      const p = grpAnt[i] ?? null
      const c = ws.getCell(rowN, 6 + i)
      c.value = p ? (gAnt(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)  // ← DISEÑO: siempre NEGRO
      c.alignment = aln('right')
      c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)  // ← DISEÑO
      if (opts.brd) c.border = opts.brd
    }
  }

  // ── F8: "Financieros" — solo label, sin datos ─────────────
  writeRow(8, 'Financieros',
    () => null, () => null,
    { bold: true, soloLabel: true }
  )

  // ── F9: "Bancos Nacionales" — total 21xx (navy) ───────────
  writeRow(9, 'Bancos Nacionales',
    p => p.pasivoCorriente.obligFinCorrTotal + p.pasivoNoCorriente.obligFinNCTotal,
    p => p.pasivoCorriente.obligFinCorrTotal + p.pasivoNoCorriente.obligFinNCTotal,
    { bold: true, fillColor: AZUL_H, brd: bDblTop }  // ← DISEÑO: AZUL_H en vez de navy:true
  )

  // ── F11+: detalle auxiliares 21xx ─────────────────────────
  // oblFinDetalle viene de calcOBLIFINNC en motor.ts
  // Contiene: "Credito Bancolombia 8241", "Leasing Camion",
  //           "Intereses causados credito", "Tc MasterCard", etc.
  const ult     = r.periodos[r.periodos.length - 1]
  const detalle = ult?.pasivoNoCorriente.oblFinDetalle ?? []

  let fila = 11
  for (const item of detalle) {
    writeRow(fila,
      item.nombre,   // nombre real del auxiliar — sin código de cuenta
      p => p.pasivoNoCorriente.oblFinDetalle?.find(x => x.codigo === item.codigo)?.valor ?? null,
      p => p.pasivoNoCorriente.oblFinDetalle?.find(x => x.codigo === item.codigo)?.valor ?? null,
      { bold: false, brd: bDashedTop, indent: true }
    )
    fila++
  }

  // ── Alturas de fila ───────────────────────────────────────
  ws.getRow(2).height = 15
  ws.getRow(3).height = 15
  ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45
  ws.getRow(7).height = 13.5
  ws.getRow(8).height = 14.25
  ws.getRow(9).height = 14.25
  ws.getRow(10).height = 14.25
}
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar función hojaCXP COMPLETA
// ══════════════════════════════════════════════════════════════
//
export function hojaCXP(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('CXP')
  ws.showGridLines = false

  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'   // ← DISEÑO: header principal
  const GRIS_ITEM = 'FFF2F2F2'   // ← DISEÑO: subcuentas
  const NEGRO = 'FF000000'
  const BLANC = 'FFFFFFFF'

  const fill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, color = NEGRO, size = 9): Partial<ExcelJS.Font> =>
    ({ name: 'Calibri', bold, color: { argb: color }, size })
  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> =>
    ({ horizontal: h, vertical: 'middle' })

  const bDblTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'double', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'dashed', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }

  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  // ── Períodos ──────────────────────────────────────────────
  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 3)
  const todosOrd = [...grpAct, ...grpAnt]

  // ── Anchos ────────────────────────────────────────────────
  ws.getColumn(1).width = 46.0
  ws.getColumn(2).width = 16.0; ws.getColumn(3).width = 16.0; ws.getColumn(4).width = 16.0
  ws.getColumn(5).width = 2.0
  ws.getColumn(6).width = 16.0; ws.getColumn(7).width = 16.0; ws.getColumn(8).width = 16.0
  ws.getColumn(9).width = 1.71

  // ── F2-4: títulos ─────────────────────────────────────────
  const setTit = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, 10); c.alignment = aln('center')
  }
  setTit(2, r.empresa); setTit(3, `NIT. ${r.nit}`)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  // ── F6: años | F7: meses ──────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c6 = ws.getCell(6, 2+i); c6.value = p.anio
    c6.font = fnt(true, BLANC, 8); c6.fill = fill(NAVY); c6.alignment = aln('center')
    const c7 = ws.getCell(7, 2+i); c7.value = MESES[p.mes]
    c7.font = fnt(true, BLANC, 8); c7.fill = fill(NAVY); c7.alignment = aln('center')
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c6 = ws.getCell(6, 6+i); c6.value = p.anio
    c6.font = fnt(true, BLANC, 8); c6.fill = fill(NAVY); c6.alignment = aln('center')
    const c7 = ws.getCell(7, 6+i); c7.value = MESES[p.mes]
    c7.font = fnt(true, BLANC, 8); c7.fill = fill(NAVY); c7.alignment = aln('center')
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  // ── Helpers ───────────────────────────────────────────────
  const snap = (i: number, fn: (p: PeriodoCalculado) => number): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio)
    if (!per) return null
    return fn(per) || null
  }

  // Snapshot del total de una subcuenta CXP por código
  const snapSub = (i: number, codigo: string): number | null => {
    return snap(i, p => {
      const sc = p.pasivoCorriente.cxpDetalle.find(x => x.codigo === codigo)
      return sc?.total ?? 0
    })
  }

  // Snapshot del total de un tercero dentro de una subcuenta CXP
  // Identifica tercero por NIT (si tiene) o nombre
  const snapTercero = (i: number, codigo: string, nitKey: string): number | null => {
    return snap(i, p => {
      const sc = p.pasivoCorriente.cxpDetalle.find(x => x.codigo === codigo)
      if (!sc) return 0
      const t = sc.terceros.find(
        x => (x.nit || x.nombreTercero) === nitKey
      )
      return t ? -t.saldoFinal : 0
    })
  }

  // Nombre propio: capitaliza cada palabra
  const toNombrePropio = (s: string): string =>
    (s ?? '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  // ── writeRow ──────────────────────────────────────────────
  const writeRow = (
    rowN: number,
    label: string,
    vals: (number | null)[],
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: string }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ?? '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9) // ← DISEÑO: siempre NEGRO (antes BLANC si fillColor)
    if (opts.fillColor) cL.fill = fill(opts.fillColor)

    const colMap = [2, 3, 4, 6, 7, 8]
    for (let i = 0; i < 6; i++) {
      const c = ws.getCell(rowN, colMap[i])
      c.value = vals[i] ?? null
      c.font = fnt(opts.bold ?? false, NEGRO, 9) // ← DISEÑO: siempre NEGRO (antes BLANC si fillColor)
      c.alignment = aln('right'); c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
  }

  const ult = r.periodos[r.periodos.length - 1]
  let f = 9

  // ── TOTAL CXP (encabezado navy) ───────────────────────────
  // Total = suma de todas las subcuentas válidas (22+23 sin 2365/2368/2370/2380)
  const totalCxpVals = [0,1,2,3,4,5].map(i =>
    snap(i, p => p.pasivoCorriente.cxpDetalle.reduce((s, x) => s + x.total, 0))
  )
  writeRow(f, 'Cuentas Por Pagar', totalCxpVals,
    { bold: true, fillColor: AZUL_H, brd: bDblTop }) // ← DISEÑO: AZUL_H en vez de NAVY
  f++; f++

  // ── Subcuentas con sus terceros ───────────────────────────
  // Unión de subcuentas de todos los períodos (para no perder
  // subcuentas que existían en enero pero no en febrero)
  const subUnion = new Map<string, string>()  // codigo → nombre
  for (const p of r.periodos) {
    for (const sc of p.pasivoCorriente.cxpDetalle) {
      if (!subUnion.has(sc.codigo)) subUnion.set(sc.codigo, sc.nombre)
    }
  }

  for (const [codigo, nombre] of subUnion) {
    // ── Subcuenta bold (header) ────────────────────────────
    const subVals = [0,1,2,3,4,5].map(i => snapSub(i, codigo))
    writeRow(f, nombre, subVals, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop }) // ← DISEÑO: GRIS_ITEM agregado
    f++

    // ── Terceros de esta subcuenta — unión de todos los períodos ─
    const terceroUnion = new Map<string, string>()  // nitKey → nombreTercero
    for (const p of r.periodos) {
      const sc = p.pasivoCorriente.cxpDetalle.find(x => x.codigo === codigo)
      if (!sc) continue
      for (const t of sc.terceros) {
        const key = (t.nit || t.nombreTercero || '').trim()
        if (key && !terceroUnion.has(key)) {
          terceroUnion.set(key, t.nombreTercero || t.nit || key)
        }
      }
    }

    for (const [nitKey, nombreTercero] of terceroUnion) {
      const tVals = [0,1,2,3,4,5].map(i => snapTercero(i, codigo, nitKey))
      // Solo mostrar si tiene saldo en al menos un período
      const tieneSaldo = tVals.some(v => v !== null && v !== 0)
      if (!tieneSaldo) continue
      writeRow(f, toNombrePropio(nombreTercero), tVals,
        { brd: bDashedTop, indent: '   ' })
      f++
    }

    f++  // separador entre subcuentas
  }

  // ── Alturas ───────────────────────────────────────────────
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5
  ws.getRow(9).height = 14.25
}
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar función hojaFISCALES completa
// ══════════════════════════════════════════════════════════════

export function hojaFISCALES(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('FISCALES')
  ws.showGridLines = false

  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'   // ← NUEVO
  const GRIS_ITEM = 'FFF2F2F2'   // ← NUEVO
  const NEGRO     = 'FF000000'
  const BLANC     = 'FFFFFFFF'
  const AMARILLO  = 'FFFFFF00'

  const fill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, color = NEGRO, size = 9): Partial<ExcelJS.Font> =>
    ({ name: 'Calibri', bold, color: { argb: color }, size })
  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> =>
    ({ horizontal: h, vertical: 'middle' })

  const bMedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'medium', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'double', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'dashed', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }

  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 3)

  ws.getColumn(1).width = 30.71
  ws.getColumn(2).width = 14.0; ws.getColumn(3).width = 14.0; ws.getColumn(4).width = 14.0
  ws.getColumn(5).width = 2.0
  ws.getColumn(6).width = 14.0; ws.getColumn(7).width = 14.0; ws.getColumn(8).width = 14.0
  ws.getColumn(9).width = 1.71

  const setTit = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, 10); c.alignment = aln('center')
  }
  setTit(2, r.empresa); setTit(3, `NIT. ${r.nit}`); setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(6, 2 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(6, 6 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(7, 2 + i)
    c.value = MESES[p.mes] ?? ''; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center')
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(7, 6 + i)
    c.value = MESES[p.mes] ?? ''; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center')
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  const labelRete = (codigo: string, nombreOriginal: string): string => {
    const mapa: Record<string, string> = {
      '236505': 'Salarios y pagos laborales',
      '236515': 'Honorarios 10%',
      '236525': 'Servicios 6%',
      '236530': 'Arrendamientos 3.5%',
      '236535': 'Honorarios al exterior 10%',
      '236540': 'Compras 2.5%',
      '236545': 'Contratos de construcción 2%',
      '236550': 'Dividendos 20%',
      '236560': 'Rendimientos financieros 7%',
      '236565': 'Loterías y rifas 20%',
      '236570': 'Pagos al exterior',
      '236575': 'Autorretenciones',
      '236580': 'Otras retenciones',
    }
    return mapa[codigo] ?? nombreOriginal
  }

  const writeRow = (
    rowN: number,
    label: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null,
    opts: {
      bold?: boolean
      fillColor?: string        // ← reemplaza navy
      brd?: Partial<ExcelJS.Borders>
      indent?: boolean
      yellowFill?: boolean
    }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = fill(opts.fillColor)

    for (let i = 0; i < 3; i++) {
      const p = grpAct[i] ?? null
      const c = ws.getCell(rowN, 2 + i)
      c.value = p ? (gAct(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)   // ← siempre NEGRO
      c.alignment = aln('right'); c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)
      if (opts.yellowFill && p && (gAct(p) ?? 0) < 0) c.fill = fill(AMARILLO)
      if (opts.brd) c.border = opts.brd
    }
    for (let i = 0; i < 3; i++) {
      const p = grpAnt[i] ?? null
      const c = ws.getCell(rowN, 6 + i)
      c.value = p ? (gAnt(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)   // ← siempre NEGRO
      c.alignment = aln('right'); c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)
      if (opts.yellowFill && p && (gAnt(p) ?? 0) < 0) c.fill = fill(AMARILLO)
      if (opts.brd) c.border = opts.brd
    }
  }

  const getDetalle = (
    p: PeriodoCalculado | null,
    detalleKey: keyof PasivoCorriente,
    cod: string
  ): number | null => {
    const arr = p?.pasivoCorriente[detalleKey] as ItemDetalle[] | undefined
    return arr?.find(x => x.codigo === cod)?.valor ?? null
  }

  const totalFiscalesSheet = (p: PeriodoCalculado) =>
    p.pasivoCorriente.reteTotal +
    p.pasivoCorriente.icaRetenido +
    p.pasivoCorriente.icaTotal +
    p.pasivoCorriente.ivaTotal +
    p.pasivoCorriente.impuestosRenta

  // ← AZUL_H en vez de navy: true
  writeRow(9, ' Fiscales ',
    p => totalFiscalesSheet(p),
    p => totalFiscalesSheet(p),
    { bold: true, fillColor: AZUL_H, brd: bDblTop }
  )

  let fila = 11

  const writeSection = (
    titulo: string,
    subtotalFn: (p: PeriodoCalculado) => number,
    detalleKey: keyof PasivoCorriente,
    opts: {
      ivaMode?: boolean
      labelFn?: (codigo: string, nombre: string) => string
    } = {}
  ) => {
    const itemsUnion = new Map<string, string>()
    for (const p of r.periodos) {
      const arr = (p.pasivoCorriente[detalleKey] as ItemDetalle[]) ?? []
      for (const item of arr) {
        if (!itemsUnion.has(item.codigo)) itemsUnion.set(item.codigo, item.nombre)
      }
    }
    const detalle = [...itemsUnion.entries()].sort((a, b) => a[0].localeCompare(b[0]))

    // ← GRIS_ITEM en vez de sin fill
    writeRow(fila, titulo,
      p => subtotalFn(p),
      p => subtotalFn(p),
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop }
    )
    fila++

    for (const [codigo, nombreOriginal] of detalle) {
      const label = opts.labelFn ? opts.labelFn(codigo, nombreOriginal) : nombreOriginal
      writeRow(fila, label,
        p => getDetalle(p, detalleKey, codigo),
        p => getDetalle(p, detalleKey, codigo),
        { bold: false, brd: bDashedTop, indent: true, yellowFill: opts.ivaMode }
      )
      fila++
    }
    fila++
  }

  writeSection('Retencion Fuente',
    p => p.pasivoCorriente.reteTotal,
    'reteDetalleSubcuentas' as keyof PasivoCorriente,
    { labelFn: labelRete }
  )
  writeSection('Impuesto Industria y Comercio',
    p => p.pasivoCorriente.icaTotal,
    'icaDetalleSubcuentas' as keyof PasivoCorriente
  )
  writeSection('Impuesto al ICA Retenido',
    p => p.pasivoCorriente.icaRetenido,
    'icaRetenidoDetalleSubcuentas' as keyof PasivoCorriente
  )
  writeSection('Impuesto a las Ventas',
    p => {
      const d = (p.pasivoCorriente as any).ivaDetalleSubcuentas as ItemDetalle[] | undefined
      return d?.reduce((s, x) => s + x.valor, 0) ?? p.pasivoCorriente.ivaTotal
    },
    'ivaDetalleSubcuentas' as keyof PasivoCorriente,
    { ivaMode: true }
  )
  writeSection('De renta y complementarios',
    p => p.pasivoCorriente.impuestosRenta,
    'rentaDetalleSubcuentas' as keyof PasivoCorriente
  )

  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5
  ws.getRow(8).height = 15.75; ws.getRow(9).height = 14.25
}
// ══════════════════════════════════════════════════════════════
// SECCIÓN 6 — REEMPLAZAR función hojaOTROSPASIVOS COMPLETA en generador
// ══════════════════════════════════════════════════════════════
export function hojaOTROSPASIVOS(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('OTROS PASIVOS')
  ws.showGridLines = false

  const NAVY  = 'FF2F75B6'
  const NEGRO = 'FF000000'
  const BLANC = 'FFFFFFFF'

  const fill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, color = NEGRO, size = 9): Partial<ExcelJS.Font> =>
    ({ name: 'Calibri', bold, color: { argb: color }, size })
  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> =>
    ({ horizontal: h, vertical: 'middle' })

  const bMedTop: Partial<ExcelJS.Borders> = {
    top: { style: 'medium', color: { argb: NEGRO } }, bottom: { style: 'thin', color: { argb: NEGRO } },
    left: { style: 'thin', color: { argb: NEGRO } }, right: { style: 'thin', color: { argb: NEGRO } },
  }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top: { style: 'double', color: { argb: NEGRO } }, bottom: { style: 'thin', color: { argb: NEGRO } },
    left: { style: 'thin', color: { argb: NEGRO } }, right: { style: 'thin', color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top: { style: 'dashed', color: { argb: NEGRO } }, bottom: { style: 'thin', color: { argb: NEGRO } },
    left: { style: 'thin', color: { argb: NEGRO } }, right: { style: 'thin', color: { argb: NEGRO } },
  }

  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 3)

  ws.getColumn(1).width = 35.0; ws.getColumn(2).width = 14.0; ws.getColumn(3).width = 14.0
  ws.getColumn(4).width = 14.0; ws.getColumn(5).width = 2.0;  ws.getColumn(6).width = 14.0
  ws.getColumn(7).width = 14.0; ws.getColumn(8).width = 14.0; ws.getColumn(9).width = 1.71

  const setTit = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, 10); c.alignment = aln('center')
  }
  setTit(2, r.empresa); setTit(3, `NIT. ${r.nit}`); setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(6, 2 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8); c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(6, 6 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8); c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(7, 2 + i)
    c.value = MESES[p.mes] ?? ''; c.font = fnt(true, BLANC, 8); c.fill = fill(NAVY); c.alignment = aln('center')
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(7, 6 + i)
    c.value = MESES[p.mes] ?? ''; c.font = fnt(true, BLANC, 8); c.fill = fill(NAVY); c.alignment = aln('center')
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  const labelProvision = (codigo: string, nombreOriginal: string): string => {
    const mapa: Record<string, string> = {
      '261005': 'Cesantías',
      '261010': 'Intereses sobre cesantías',
      '261015': 'Vacaciones',
      '261020': 'Prima de servicios',
      '261025': 'Pensiones de jubilación',
      '261030': 'Indemnizaciones laborales',
      '251005': 'Cesantías',
      '251015': 'Vacaciones',
      '251020': 'Prima de servicios',
      '251025': 'Intereses sobre cesantías',
    }
    return mapa[codigo] ?? mapa[codigo.slice(0, 6)] ?? nombreOriginal
  }

  const writeRow = (
    rowN: number, label: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; navy?: boolean; brd?: Partial<ExcelJS.Borders>; indent?: boolean }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = aln('left')
    for (let i = 0; i < 3; i++) {
      const p = grpAct[i] ?? null; const c = ws.getCell(rowN, 2 + i)
      c.value = p ? (gAct(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, opts.navy ? BLANC : NEGRO, 9)
      c.alignment = aln('right'); c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.navy) c.fill = fill(NAVY); if (opts.brd) c.border = opts.brd
    }
    for (let i = 0; i < 3; i++) {
      const p = grpAnt[i] ?? null; const c = ws.getCell(rowN, 6 + i)
      c.value = p ? (gAnt(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, opts.navy ? BLANC : NEGRO, 9)
      c.alignment = aln('right'); c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.navy) c.fill = fill(NAVY); if (opts.brd) c.border = opts.brd
    }
  }

  const getItemCorr = (p: PeriodoCalculado, key: keyof PasivoCorriente, cod: string): number | null => {
    const arr = p.pasivoCorriente[key] as ItemDetalle[] | undefined
    const val = arr?.filter(x => x.codigo.startsWith(cod)).reduce((s, x) => s + x.valor, 0) ?? 0
    return val || null
  }
  const getItemNC = (p: PeriodoCalculado, key: keyof PasivoNoCorriente, cod: string): number | null => {
    const arr = p.pasivoNoCorriente[key] as ItemDetalle[] | undefined
    const val = arr?.filter(x => x.codigo.startsWith(cod)).reduce((s, x) => s + x.valor, 0) ?? 0
    return val || null
  }

  // Total general de la hoja
  const total28 = (p: PeriodoCalculado) =>
    (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).reduce((s, x) => s + x.total, 0)

  // ← get2510 DEBE ir ANTES de totalOP (temporal dead zone con const)
  const get2510 = (p: PeriodoCalculado): number =>
    (p.pasivoCorriente.beneficiosDetalle ?? [])
      .filter((x: any) => x.codigo.startsWith('2510'))
      .reduce((s: number, x: any) => s + x.valor, 0)

  const totalOP = (p: PeriodoCalculado) =>
    (p.pasivoCorriente.acreedoresVariosTotal ?? 0) +
    (p.pasivoCorriente.beneficiosCorrTotal + p.pasivoNoCorriente.provisionLaboralTotal - get2510(p)) +
    p.pasivoCorriente.aporteNomina +
    total28(p)

  writeRow(9, ' Otros Pasivos ',
    p => totalOP(p), p => totalOP(p),
    { bold: true, navy: true, brd: bDblTop }
  )

  let fila = 11
  const ult = r.periodos[r.periodos.length - 1]

  // ── BLOQUE 1: Acreedores Varios [2380xx] ──────────────────
  writeRow(fila, 'Acreedores Varios',
    p => p.pasivoCorriente.acreedoresVariosTotal || null,
    p => p.pasivoCorriente.acreedoresVariosTotal || null,
    { bold: true, brd: bDblTop }
  ); fila++

  const acreedoresDetalle = ult?.pasivoCorriente.acreedoresVariosDetalle ?? []
  for (const item of acreedoresDetalle) {
    writeRow(fila, item.nombre,
      p => getItemCorr(p, 'acreedoresVariosDetalle' as keyof PasivoCorriente, item.codigo),
      p => getItemCorr(p, 'acreedoresVariosDetalle' as keyof PasivoCorriente, item.codigo),
      { bold: false, brd: bDashedTop, indent: true }
    ); fila++
  }
  if (acreedoresDetalle.length === 0) fila++
  fila++

  // ── BLOQUE 2: Beneficios a Empleados [25xx + 26xx] ────────
  writeRow(fila, 'Beneficios a Empleados',
    p => (p.pasivoCorriente.beneficiosCorrTotal + p.pasivoNoCorriente.provisionLaboralTotal - get2510(p)) || null,
    p => (p.pasivoCorriente.beneficiosCorrTotal + p.pasivoNoCorriente.provisionLaboralTotal - get2510(p)) || null,
    { bold: true, brd: bDblTop }
  ); fila++

  const hasProvision = r.periodos.some(
    p => (p.pasivoNoCorriente.provisionDetalle?.length ?? 0) > 0
  )
  const benefUnion = new Map<string, string>()
  for (const p of r.periodos) {
    for (const item of (p.pasivoCorriente.beneficiosDetalle ?? [])) {
      if (hasProvision && item.codigo.startsWith('2510')) continue
      if (!benefUnion.has(item.codigo)) benefUnion.set(item.codigo, item.nombre)
    }
  }
  for (const [cod, nombre] of [...benefUnion.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    writeRow(fila, nombre,
      p => getItemCorr(p, 'beneficiosDetalle' as keyof PasivoCorriente, cod),
      p => getItemCorr(p, 'beneficiosDetalle' as keyof PasivoCorriente, cod),
      { bold: false, brd: bDashedTop, indent: true }
    ); fila++
  }

  const provUnion = new Map<string, string>()
  for (const p of r.periodos) {
    for (const item of (p.pasivoNoCorriente.provisionDetalle ?? [])) {
      if (!provUnion.has(item.codigo)) provUnion.set(item.codigo, item.nombre)
    }
  }
  for (const [cod, nombreOriginal] of [...provUnion.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    writeRow(fila, labelProvision(cod, nombreOriginal),
      p => getItemNC(p, 'provisionDetalle' as keyof PasivoNoCorriente, cod),
      p => getItemNC(p, 'provisionDetalle' as keyof PasivoNoCorriente, cod),
      { bold: false, brd: bDashedTop, indent: true }
    ); fila++
  }
  fila++

  // ── BLOQUE 3: Retenciones y Aportes de Nómina [2370xx] ────
  writeRow(fila, 'Retenciones y Aportes de Nomina',
    p => p.pasivoCorriente.aporteNomina,
    p => p.pasivoCorriente.aporteNomina,
    { bold: true, brd: bDblTop }
  ); fila++
  writeRow(fila, 'Entidades Promotoras de Salud',
    p => p.pasivoCorriente.aporteEPS,
    p => p.pasivoCorriente.aporteEPS,
    { bold: false, brd: bDashedTop, indent: true }
  ); fila++
  writeRow(fila, 'Administradoras de Riesgos',
    p => p.pasivoCorriente.aporteARL,
    p => p.pasivoCorriente.aporteARL,
    { bold: false, brd: bDashedTop, indent: true }
  ); fila++
  writeRow(fila, 'Aportes Cajas de Compensación',
    p => p.pasivoCorriente.aporteICBF,
    p => p.pasivoCorriente.aporteICBF,
    { bold: false, brd: bDashedTop, indent: true }
  ); fila++
  writeRow(fila, 'Aportes Fondo de pensiones',
    p => p.pasivoCorriente.aportePension,
    p => p.pasivoCorriente.aportePension,
    { bold: false, brd: bDashedTop, indent: true }
  ); fila++
  fila++

  // ── BLOQUE 4: Otros pasivos [28xx] ────────────────────────
  writeRow(fila, 'Otros pasivos',
    p => total28(p) || null,
    p => total28(p) || null,
    { bold: true, brd: bDblTop }
  ); fila++

  const sub28Union = new Map<string, string>()
  for (const p of r.periodos) {
    for (const sc of (p.pasivoNoCorriente.otrosPasivos28Detalle ?? [])) {
      if (!sub28Union.has(sc.codigo)) sub28Union.set(sc.codigo, sc.nombre)
    }
  }

  for (const [cod, nombre] of [...sub28Union.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    writeRow(fila, nombre,
      p => (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).find(x => x.codigo === cod)?.total || null,
      p => (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).find(x => x.codigo === cod)?.total || null,
      { bold: true, brd: bDblTop }
    ); fila++

    const tercUnion = new Map<string, string>()
    for (const p of r.periodos) {
      const sc = (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).find(x => x.codigo === cod)
      for (const t of (sc?.terceros ?? [])) {
        const key = t.nit || t.nombreTercero
        if (!key) continue
        if (!tercUnion.has(key)) {
          const esNumerico = /^\d+$/.test((t.nombreTercero ?? '').trim())
          const display = (!esNumerico && t.nombreTercero)
            ? t.nombreTercero
            : `NIT: ${t.nit || t.nombreTercero}`
          tercUnion.set(key, display)
        }
      }
    }

    for (const [nitKey, nombreDisplay] of [...tercUnion.entries()]) {
      writeRow(fila, nombreDisplay,
        p => {
          const sc = (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).find(x => x.codigo === cod)
          const t = (sc?.terceros ?? []).find(x => (x.nit || x.nombreTercero) === nitKey)
          return t && Math.abs(t.saldoFinal) >= 1 ? -t.saldoFinal : null
        },
        p => {
          const sc = (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).find(x => x.codigo === cod)
          const t = (sc?.terceros ?? []).find(x => (x.nit || x.nombreTercero) === nitKey)
          return t && Math.abs(t.saldoFinal) >= 1 ? -t.saldoFinal : null
        },
        { bold: false, brd: bDashedTop, indent: true }
      ); fila++
    }
  }

  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5; ws.getRow(9).height = 14.25
}
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar función hojaINGRESOS completa
// ══════════════════════════════════════════════════════════════
export function hojaINGRESOS(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('INGRESOS')
  ws.showGridLines = false

  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'
  const GRIS_ITEM = 'FFF2F2F2'
  const NEGRO     = 'FF000000'
  const BLANC     = 'FFFFFFFF'
  const ROJO      = 'FFFF0000'

  const fill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, color = NEGRO, size = 9): Partial<ExcelJS.Font> =>
    ({ name: 'Calibri', bold, color: { argb: color }, size })
  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> =>
    ({ horizontal: h, vertical: 'middle' })

  const bMedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'medium', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'double', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'dashed', color: { argb: NEGRO } },
    bottom: { style: 'thin',   color: { argb: NEGRO } },
    left:   { style: 'thin',   color: { argb: NEGRO } },
    right:  { style: 'thin',   color: { argb: NEGRO } },
  }

  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 2)

  ws.getColumn(1).width = 43.29
  ws.getColumn(2).width = 16.0; ws.getColumn(3).width = 16.0
  ws.getColumn(4).width = 16.0; ws.getColumn(5).width = 16.0
  ws.getColumn(6).width = 2.14
  ws.getColumn(7).width = 16.0; ws.getColumn(8).width = 14.71
  ws.getColumn(9).width = 1.71

  const setTit = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, 10); c.alignment = aln('center')
  }
  setTit(2, r.empresa); setTit(3, `NIT. ${r.nit}`)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  if (grpAct.length > 0) {
    const cAcum = ws.getCell(6, 2)
    cAcum.value = grpAct[0].anio; cAcum.font = fnt(true, BLANC, 8)
    cAcum.fill = fill(NAVY); cAcum.alignment = aln('center'); cAcum.border = bMedTop
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(6, 3 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  for (let i = 0; i < 2; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(6, 7 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  if (grpAct.length > 0) {
    const cAcum = ws.getCell(7, 2)
    cAcum.value = 'ACUMULADO'; cAcum.font = fnt(true, BLANC, 8)
    cAcum.fill = fill(NAVY); cAcum.alignment = aln('center')
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(7, 3 + i)
    c.value = MESES[p.mes] ?? ''; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center')
  }
  for (let i = 0; i < 2; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(7, 7 + i)
    c.value = MESES[p.mes] ?? ''; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center')
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  const varMensualPeriodo = (idx: number, fn: (p: PeriodoCalculado) => number): number => {
    const curr = r.periodos[idx]
    const prev = idx > 0 ? r.periodos[idx - 1] : null
    const currVal = fn(curr)
    const prevVal = prev ? fn(prev) : 0
    return currVal - prevVal
  }

const varMensualTercero = (
  idx: number, subcuenta: string, nit: string, esDevolucion: boolean
): number => {
  const curr = r.periodos[idx]
  const prev = idx > 0 ? r.periodos[idx - 1] : null
  const getTerceroVal = (p: PeriodoCalculado): number => {
    const sc = p.ingresosDetalle?.find(x => x.codigo === subcuenta)
    if (!sc) return 0
    const t = sc.terceros.find(x => x.nit === nit || x.nombreTercero === nit)
    if (!t) return 0
    // FIX: movimientoCredito - movimientoDebito, no saldoFinal
    return esDevolucion
      ? (t.movimientoDebito  - t.movimientoCredito)
      : (t.movimientoCredito - t.movimientoDebito)
  }
  return getTerceroVal(curr) - (prev ? getTerceroVal(prev) : 0)
}

  const acumSubcuenta = (subcuenta: string): number => {
    const ult = r.periodos[r.periodos.length - 1]
    return ult?.ingresosDetalle?.find(x => x.codigo === subcuenta)?.total ?? 0
  }

const acumTercero = (subcuenta: string, nit: string, esDevolucion: boolean): number => {
  const ult = r.periodos[r.periodos.length - 1]
  const sc = ult?.ingresosDetalle?.find(x => x.codigo === subcuenta)
  if (!sc) return 0
  const t = sc.terceros.find(x => x.nit === nit || x.nombreTercero === nit)
  if (!t) return 0
  // FIX: movimientoCredito - movimientoDebito, no saldoFinal
  return esDevolucion
    ? (t.movimientoDebito  - t.movimientoCredito)
    : (t.movimientoCredito - t.movimientoDebito)
}

  const writeRow = (
    rowN: number, label: string,
    acumulado: number | null,
    valsMensAct: (number | null)[],
    valsMensAnt: (number | null)[],
    opts: {
      bold?: boolean
      fillColor?: string
      brd?: Partial<ExcelJS.Borders>
      indent?: boolean
      esDevolucion?: boolean
    }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = fill(opts.fillColor)

    const numColor = opts.esDevolucion ? ROJO : NEGRO

    const cAcum = ws.getCell(rowN, 2)
    cAcum.value = acumulado ?? null
    cAcum.font = fnt(opts.bold ?? false, numColor, 9)
    cAcum.alignment = aln('right'); cAcum.numFmt = '#,##0;(#,##0);"-"'
    if (opts.fillColor) cAcum.fill = fill(opts.fillColor)
    if (opts.brd) cAcum.border = opts.brd

    for (let i = 0; i < 3; i++) {
      const c = ws.getCell(rowN, 3 + i)
      c.value = valsMensAct[i] ?? null
      c.font = fnt(opts.bold ?? false, numColor, 9)
      c.alignment = aln('right'); c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
    for (let i = 0; i < 2; i++) {
      const c = ws.getCell(rowN, 7 + i)
      c.value = valsMensAnt[i] ?? null
      c.font = fnt(opts.bold ?? false, numColor, 9)
      c.alignment = aln('right'); c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
  }

  const ult = r.periodos[r.periodos.length - 1]
  const detalle = ult?.ingresosDetalle ?? []
  const scOperacionales   = detalle.filter(x => x.esOperacional)
  const scNoOperacionales = detalle.filter(x => !x.esOperacional)

  const totalOp      = scOperacionales.reduce((s, x) => s + (x.esDevolucion ? -x.total : x.total), 0)
  const totalNoOp    = scNoOperacionales.reduce((s, x) => s + x.total, 0)
  const totalIngresos = totalOp + totalNoOp

  // ← FIX 1: grpAct[i] en vez de grpAct[grpAct.length - 1 - i]
  const totalOpMensAct = grpAct.map((_, i) => {
    const idx = r.periodos.indexOf(grpAct[i])   // ← FIX
    if (idx < 0) return null
    return varMensualPeriodo(idx, p => {
      const d = p.ingresosDetalle ?? []
      return d.filter(x => x.esOperacional).reduce((s, x) => s + (x.esDevolucion ? -x.total : x.total), 0)
    })
  })

  // ← FIX 2: grpAct[i] en vez de grpAct[grpAct.length - 1 - i]
  const totalNoOpMensAct = grpAct.map((_, i) => {
    const idx = r.periodos.indexOf(grpAct[i])   // ← FIX
    if (idx < 0) return null
    return varMensualPeriodo(idx, p => {
      const d = p.ingresosDetalle ?? []
      return d.filter(x => !x.esOperacional).reduce((s, x) => s + x.total, 0)
    })
  })

  writeRow(10, 'INGRESOS',
    totalIngresos,
    grpAct.map((_, i) => (totalOpMensAct[i] ?? 0) + (totalNoOpMensAct[i] ?? 0)),
    grpAnt.map(() => null),
    { bold: true, fillColor: AZUL_H, brd: bDblTop }
  )

  writeRow(12, 'Operacionales',
    totalOp, totalOpMensAct, grpAnt.map(() => null),
    { bold: true, fillColor: GRIS_ITEM, brd: bDblTop }
  )

  let fila = 14

  for (const sc of scOperacionales) {
    // ← FIX 3: grpAct[i] en vez de grpAct[grpAct.length - 1 - i]
    const scMensAct = grpAct.map((_, i) => {
      const idx = r.periodos.indexOf(grpAct[i])   // ← FIX
      if (idx < 0) return null
      const curr = r.periodos[idx].ingresosDetalle?.find(x => x.codigo === sc.codigo)?.total ?? 0
      const prev = idx > 0 ? (r.periodos[idx-1].ingresosDetalle?.find(x => x.codigo === sc.codigo)?.total ?? 0) : 0
      return curr - prev
    })

    writeRow(fila, sc.nombre,
      sc.esDevolucion ? -sc.total : sc.total,
      sc.esDevolucion ? scMensAct.map(v => v !== null ? -v : null) : scMensAct,
      grpAnt.map(() => null),
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop, esDevolucion: sc.esDevolucion }
    )
    fila++

    const tieneAux = Array.isArray((sc as any).auxiliares) && (sc as any).auxiliares.length > 0

    if (tieneAux) {
      // JERARQUÍA: subcuenta → auxiliar → tercero
      const auxUnion = new Map<string, { codigo: string; nombre: string }>()
      for (const p of r.periodos) {
        const psc = p.ingresosDetalle?.find(x => x.codigo === sc.codigo)
        for (const a of (((psc as any)?.auxiliares ?? []) as any[])) {
          if (!auxUnion.has(a.codigo)) auxUnion.set(a.codigo, { codigo: a.codigo, nombre: a.nombre })
        }
      }

      for (const [auxCod, auxInfo] of auxUnion) {
        const auxAcum = (() => {
          const psc = ult?.ingresosDetalle?.find(x => x.codigo === sc.codigo)
          const a = (((psc as any)?.auxiliares ?? []) as any[]).find(x => x.codigo === auxCod)
          return a?.total ?? 0
        })()

        const auxMensAct = grpAct.map((_, i) => {
          const idx = r.periodos.indexOf(grpAct[i])
          if (idx < 0) return null
          const getAux = (p: any) => {
            const psc = p.ingresosDetalle?.find((x: any) => x.codigo === sc.codigo)
            return ((psc?.auxiliares ?? []) as any[]).find(x => x.codigo === auxCod)?.total ?? 0
          }
          const curr = getAux(r.periodos[idx])
          const prev = idx > 0 ? getAux(r.periodos[idx - 1]) : 0
          return curr - prev
        })

        writeRow(fila, '   ' + auxInfo.nombre,
          auxAcum, auxMensAct, grpAnt.map(() => null),
          { bold: true, brd: bDashedTop }
        )
        fila++

        const tercAuxUnion = new Map<string, any>()
        for (const p of r.periodos) {
          const psc = p.ingresosDetalle?.find((x: any) => x.codigo === sc.codigo)
          const a   = (((psc as any)?.auxiliares ?? []) as any[]).find(x => x.codigo === auxCod)
          for (const t of (a?.terceros ?? [])) {
            const key = (t.nit || t.nombreTercero || '').trim()
            if (key && !tercAuxUnion.has(key)) tercAuxUnion.set(key, t)
          }
        }

        for (const [nitKey, t] of tercAuxUnion) {
          const tAcum = (() => {
            const psc = ult?.ingresosDetalle?.find((x: any) => x.codigo === sc.codigo)
            const a   = (((psc as any)?.auxiliares ?? []) as any[]).find(x => x.codigo === auxCod)
            const tt  = (a?.terceros ?? []).find((x: any) => (x.nit || x.nombreTercero) === nitKey)
            return tt ? (tt.movimientoCredito - tt.movimientoDebito) : 0
          })()

          const tMensAct = grpAct.map((_, i) => {
            const idx = r.periodos.indexOf(grpAct[i])
            if (idx < 0) return null
            const getT = (p: any) => {
              const psc = p.ingresosDetalle?.find((x: any) => x.codigo === sc.codigo)
              const a   = ((psc?.auxiliares ?? []) as any[]).find(x => x.codigo === auxCod)
              const tt  = (a?.terceros ?? []).find((x: any) => (x.nit || x.nombreTercero) === nitKey)
              return tt ? (tt.movimientoCredito - tt.movimientoDebito) : 0
            }
            const curr = getT(r.periodos[idx])
            const prev = idx > 0 ? getT(r.periodos[idx - 1]) : 0
            return curr - prev
          })

          if (Math.abs(tAcum) < 1 && tMensAct.every(v => !v || Math.abs(v) < 1)) continue

          writeRow(fila, '      ' + (t.nombreTercero || t.nit || nitKey),
            tAcum, tMensAct, grpAnt.map(() => null),
            { bold: false, brd: bDashedTop }
          )
          fila++
        }
      }

    } else {
      // PLANO: subcuenta → terceros (comportamiento original)
      const tercUnionMap = new Map<string, typeof sc.terceros[0]>()
      for (const p of r.periodos) {
        const psc = p.ingresosDetalle?.find(x => x.codigo === sc.codigo)
        for (const t of psc?.terceros ?? []) {
          const key = (t.nit || t.nombreTercero || '').trim()
          if (key && !tercUnionMap.has(key)) tercUnionMap.set(key, t)
        }
      }
      for (const [nitKey, t] of tercUnionMap) {
        const tAcum = acumTercero(sc.codigo, nitKey, sc.esDevolucion)
        const tMensAct = grpAct.map((_, i) => {
          const idx = r.periodos.indexOf(grpAct[i])
          if (idx < 0) return null
          return varMensualTercero(idx, sc.codigo, nitKey, sc.esDevolucion)
        })
        if (Math.abs(tAcum) < 1 && tMensAct.every(v => !v || Math.abs(v) < 1)) continue
        writeRow(fila, t.nombreTercero || t.nit || nitKey,
          tAcum, tMensAct, grpAnt.map(() => null),
          { bold: false, brd: bDashedTop, indent: true, esDevolucion: sc.esDevolucion }
        )
        fila++
      }
    }
    fila++
  }

  const rowNoOp = fila + 1
  fila = rowNoOp + 2

  writeRow(rowNoOp, 'No Operacionales',
    totalNoOp, totalNoOpMensAct, grpAnt.map(() => null),
    { bold: true, fillColor: GRIS_ITEM, brd: bDblTop }
  )

  for (const sc of scNoOperacionales) {
    // ← FIX 5: grpAct[i] en vez de grpAct[grpAct.length - 1 - i]
    const scMensAct = grpAct.map((_, i) => {
      const idx = r.periodos.indexOf(grpAct[i])   // ← FIX
      if (idx < 0) return null
      const curr = r.periodos[idx].ingresosDetalle?.find(x => x.codigo === sc.codigo)?.total ?? 0
      const prev = idx > 0 ? (r.periodos[idx-1].ingresosDetalle?.find(x => x.codigo === sc.codigo)?.total ?? 0) : 0
      return curr - prev
    })

    writeRow(fila, sc.nombre,
      sc.total, scMensAct, grpAnt.map(() => null),
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop }
    )
    fila++

    const tercUnionMap = new Map<string, typeof sc.terceros[0]>()
for (const p of r.periodos) {
  const psc = p.ingresosDetalle?.find(x => x.codigo === sc.codigo)
  for (const t of psc?.terceros ?? []) {
    const key = (t.nit || t.nombreTercero || '').trim()
    if (key && !tercUnionMap.has(key)) tercUnionMap.set(key, t)
  }
}
for (const [nitKey, t] of tercUnionMap) {
  const tAcum = acumTercero(sc.codigo, nitKey, sc.esDevolucion)
  const tMensAct = grpAct.map((_, i) => {
    const idx = r.periodos.indexOf(grpAct[i])
    if (idx < 0) return null
    return varMensualTercero(idx, sc.codigo, nitKey, sc.esDevolucion)
  })
  if (Math.abs(tAcum) < 1 && tMensAct.every(v => !v || Math.abs(v) < 1)) continue
  writeRow(fila, t.nombreTercero || t.nit || nitKey,
    tAcum, tMensAct, grpAnt.map(() => null),
    { bold: false, brd: bDashedTop, indent: true, esDevolucion: sc.esDevolucion }
  )
  fila++
}
  }

  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5
  ws.getRow(8).height = 15.75; ws.getRow(10).height = 14.25
}
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar función hojaNCTASPYG COMPLETA
// ══════════════════════════════════════════════════════════════
export function hojaNCTASPYG(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const anioHoja = r.periodos[r.periodos.length - 1]?.anio ?? new Date().getFullYear()
  const ws = wb.addWorksheet('NOTAS PYG')
  ws.showGridLines = false

  const VERDE  = 'FF00B050'
  const ROJO   = 'FF903032'
  const DORADO = 'FFBF8F00'
  const GRIS   = 'FFC0C0C0'
  const NEGRO  = 'FF000000'
  const BLANC  = 'FFFFFFFF'
  const ROJO_T = 'FFFF0000'

  const sfill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, argb = NEGRO, sz = 9, italic = false): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', bold, italic, color: { argb }, size: sz })
  const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
  const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
  const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
  const bThin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: NEGRO } }, bottom: { style: 'thin', color: { argb: NEGRO } },
    left: { style: 'thin', color: { argb: NEGRO } }, right: { style: 'thin', color: { argb: NEGRO } },
  }
  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? anioHoja
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 2)

  ws.getColumn(1).width = 43.0
  ws.getColumn(2).width = 16.0
  ws.getColumn(3).width = 16.0
  ws.getColumn(4).width = 16.0
  ws.getColumn(5).width = 16.0
  ws.getColumn(6).width = 2.14
  ws.getColumn(7).width = 16.0
  ws.getColumn(8).width = 14.71
  ws.getColumn(9).width = 1.71

  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, sz, italic); c.alignment = alnC
  }
  setTit(2, r.empresa, true, 11)
  setTit(3, `NIT. ${r.nit}`, true, 10)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS', true, 10)
  setTit(5, '(Cifra expresadas en pesos Colombianos)', true, 9)

  const cConc = ws.getCell(7, 1)
  cConc.value = 'CONCEPTO'; cConc.font = fnt(true, BLANC, 10)
  cConc.fill = sfill(VERDE); cConc.alignment = alnC

  if (grpAct.length > 0) {
    const cA7 = ws.getCell(7, 2)
    cA7.value = grpAct[0].anio; cA7.font = fnt(true, BLANC, 8)
    cA7.fill = sfill(ROJO); cA7.alignment = alnC; cA7.border = bThin
    const cA8 = ws.getCell(8, 2)
    cA8.value = 'ACUMULADO'; cA8.font = fnt(true, BLANC, 8)
    cA8.fill = sfill(ROJO); cA8.alignment = alnC; cA8.border = bThin
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c7 = ws.getCell(7, 3+i)
    c7.value = p.anio; c7.font = fnt(true, BLANC, 8)
    c7.fill = sfill(ROJO); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, 3+i)
    c8.value = MESES[p.mes]; c8.font = fnt(true, BLANC, 8)
    c8.fill = sfill(ROJO); c8.alignment = alnC; c8.border = bThin
  }
  for (let i = 0; i < 2; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c7 = ws.getCell(7, 7+i)
    c7.value = p.anio; c7.font = fnt(true, BLANC, 8)
    c7.fill = sfill(DORADO); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, 7+i)
    c8.value = MESES[p.mes]; c8.font = fnt(true, BLANC, 8)
    c8.fill = sfill(DORADO); c8.alignment = alnC; c8.border = bThin
  }
  const cCont = ws.getCell(8, 1)
  cCont.value = 'Contable'; cCont.font = fnt(false, NEGRO, 8); cCont.alignment = alnL

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }]
  ws.getRow(2).height = 15; ws.getRow(3).height = 15
  ws.getRow(4).height = 15; ws.getRow(5).height = 12
  ws.getRow(7).height = 18; ws.getRow(8).height = 18

  const writeRow = (
    rowN: number, label: string,
    acum: number | null, mensAct: (number | null)[], mensAnt: (number | null)[],
    opts: { bold?: boolean; fillColor?: string; indent?: string; textColor?: string; italic?: boolean }
  ) => {
    const ind      = opts.indent ?? ''
    const numColor = opts.fillColor ? BLANC : (opts.textColor ?? NEGRO)
    const nf       = '#,##0;(#,##0);"-"'
    const cL = ws.getCell(rowN, 1)
    cL.value = ind + label
    cL.font  = fnt(opts.bold ?? false, opts.textColor ?? NEGRO, 9, opts.italic ?? false)
    cL.alignment = alnL; cL.border = bThin
    if (opts.fillColor) cL.fill = sfill(opts.fillColor)
    const setV = (col: number, val: number | null) => {
      const c = ws.getCell(rowN, col)
      c.value = val; c.font = fnt(opts.bold ?? false, numColor, 9, opts.italic ?? false)
      c.alignment = alnR; c.numFmt = nf; c.border = bThin
      if (opts.fillColor) c.fill = sfill(opts.fillColor)
    }
    setV(2, acum)
    for (let i = 0; i < 3; i++) setV(3+i, mensAct[i] ?? null)
    for (let i = 0; i < 2; i++) setV(7+i, mensAnt[i] ?? null)
  }

  const writeSection = (rowN: number, label: string, acum: number | null, mensAct: (number | null)[], mensAnt: (number | null)[]) => {
    for (let c = 1; c <= 8; c++) { ws.getCell(rowN, c).fill = sfill(VERDE); ws.getCell(rowN, c).border = bThin }
    writeRow(rowN, label, acum, mensAct, mensAnt, { bold: true, fillColor: VERDE })
  }
  const writeSubtotalGris = (rowN: number, label: string, acum: number | null, mensAct: (number | null)[], mensAnt: (number | null)[]) => {
    for (let c = 1; c <= 8; c++) { ws.getCell(rowN, c).fill = sfill(GRIS); ws.getCell(rowN, c).border = bThin }
    writeRow(rowN, label, acum, mensAct, mensAnt, { bold: true, fillColor: GRIS })
  }
  const writeBoldItalic = (rowN: number, label: string, acum: number | null, mensAct: (number | null)[], mensAnt: (number | null)[]) =>
    writeRow(rowN, label, acum, mensAct, mensAnt, { bold: true, italic: true })

  // ══════════════════════════════════════════════════════════
  // HELPERS DE DATOS
  // ══════════════════════════════════════════════════════════

  const ult = r.periodos[r.periodos.length - 1]

  // ── Ingresos ──────────────────────────────────────────────
  const acumIngreso = (codigo: string): number | null => {
    const sc = ult?.ingresosDetalle.find(x => x.codigo === codigo)
    return sc?.total || null
  }
  const mensualIngreso = (grpIdx: number, codigo: string): number | null => {
    const p = grpAct[grpIdx]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
    if (idxR < 0) return null
    const curr = r.periodos[idxR].ingresosDetalle.find(x => x.codigo===codigo)?.total ?? 0
    const prev = idxR > 0 ? (r.periodos[idxR-1].ingresosDetalle.find(x => x.codigo===codigo)?.total ?? 0) : 0
    return (curr - prev) || null
  }
  const antIngreso = (antIdx: number, codigo: string): number | null => {
    const p = grpAnt[antIdx]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
    if (idxR < 0) return null
    const curr = r.periodos[idxR].ingresosDetalle.find(x => x.codigo===codigo)?.total ?? 0
    const prev = idxR > 0 ? (r.periodos[idxR-1].ingresosDetalle.find(x => x.codigo===codigo)?.total ?? 0) : 0
    return (curr - prev) || null
  }

  // ── Costos ────────────────────────────────────────────────
  // ← FIX: usar costosDetalle directamente (no eriMensual.costoTotal)
  // RAZÓN: eriMensual.costoTotal usa varMesPrefijo('62', 'Cuenta') que busca
  // en balance.cuentas. Para TURISMO, '6210' está en balance.cuentasN3 pero
  // NO en balance.cuentas → varMesPrefijo retorna 0 → sección en blanco.
  // costosDetalle SÍ tiene los datos correctos (usa balance.cuentasN3).
  const getCostoTotal = (per: PeriodoCalculado): number =>
    per.costosDetalle?.reduce((s, c) => s + c.total, 0) ?? 0

  const costoTotAcum = getCostoTotal(r.periodos[r.periodos.length - 1]) || null

  const costoTotMens = [0,1,2].map(i => {
    const p = grpAct[i]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
    if (idxR < 0) return null
    const curr = getCostoTotal(r.periodos[idxR])
    const prev = idxR > 0 ? getCostoTotal(r.periodos[idxR-1]) : 0
    return (curr - prev) || null
  })

  const costoTotAnt = [0,1].map(i => {
    const p = grpAnt[i]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
    if (idxR < 0) return null
    const curr = getCostoTotal(r.periodos[idxR])
    const prev = idxR > 0 ? getCostoTotal(r.periodos[idxR-1]) : 0
    return (curr - prev) || null
  })

  const acumCosto = (scCodigo: string, auxCodigo?: string): number | null => {
    const sc = ult?.costosDetalle.find(x => x.codigo === scCodigo)
    if (!auxCodigo) return sc?.total || null
    return sc?.auxiliares.find(a => a.codigo === auxCodigo)?.valor || null
  }
  const mensualCosto = (grpIdx: number, scCodigo: string, auxCodigo?: string): number | null => {
    const p = grpAct[grpIdx]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
    if (idxR < 0) return null
    const getVal = (per: PeriodoCalculado) => {
      const sc = per.costosDetalle?.find(x => x.codigo===scCodigo)
      return auxCodigo ? (sc?.auxiliares.find(a => a.codigo===auxCodigo)?.valor ?? 0) : (sc?.total ?? 0)
    }
    return (getVal(r.periodos[idxR]) - (idxR > 0 ? getVal(r.periodos[idxR-1]) : 0)) || null
  }
  const antCosto = (antIdx: number, scCodigo: string, auxCodigo?: string): number | null => {
    const p = grpAnt[antIdx]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
    if (idxR < 0) return null
    const getVal = (per: PeriodoCalculado) => {
      const sc = per.costosDetalle?.find(x => x.codigo===scCodigo)
      return auxCodigo ? (sc?.auxiliares.find(a => a.codigo===auxCodigo)?.valor ?? 0) : (sc?.total ?? 0)
    }
    return (getVal(r.periodos[idxR]) - (idxR > 0 ? getVal(r.periodos[idxR-1]) : 0)) || null
  }

  // ── Gastos ────────────────────────────────────────────────
  const acumGasto = (scCodigo: string, auxCodigo?: string): number | null => {
    const sc = ult?.gastosDetalle.find(x => x.codigo === scCodigo)
    if (!auxCodigo) return sc?.total || null
    return sc?.auxiliares.find(a => a.codigo === auxCodigo)?.valor || null
  }
  const mensualGasto = (grpIdx: number, scCodigo: string, auxCodigo?: string): number | null => {
    const p = grpAct[grpIdx]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
    if (idxR < 0) return null
    const getVal = (per: PeriodoCalculado) => {
      const sc = per.gastosDetalle?.find(x => x.codigo===scCodigo)
      return auxCodigo ? (sc?.auxiliares.find(a => a.codigo===auxCodigo)?.valor ?? 0) : (sc?.total ?? 0)
    }
    return (getVal(r.periodos[idxR]) - (idxR > 0 ? getVal(r.periodos[idxR-1]) : 0)) || null
  }
  const antGasto = (antIdx: number, scCodigo: string, auxCodigo?: string): number | null => {
    const p = grpAnt[antIdx]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
    if (idxR < 0) return null
    const getVal = (per: PeriodoCalculado) => {
      const sc = per.gastosDetalle?.find(x => x.codigo===scCodigo)
      return auxCodigo ? (sc?.auxiliares.find(a => a.codigo===auxCodigo)?.valor ?? 0) : (sc?.total ?? 0)
    }
    return (getVal(r.periodos[idxR]) - (idxR > 0 ? getVal(r.periodos[idxR-1]) : 0)) || null
  }

  // ── eriMens / eriAnt para INGRESOS y GASTOS totales ──────
  const eriAcum = r.eriAcumulado[r.eriAcumulado.length - 1]
  const eriMens = (grpIdx: number, fn: (e: EriMensual) => number): number | null => {
    const p = grpAct[grpIdx]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
    return idxR >= 0 ? fn(r.periodos[idxR].eriMensual) || null : null
  }
  const eriAnt = (antIdx: number, fn: (e: EriMensual) => number): number | null => {
    const p = grpAnt[antIdx]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
    return idxR >= 0 ? fn(r.periodos[idxR].eriMensual) || null : null
  }

  // ══════════════════════════════════════════════════════════
  // ESCRITURA DE FILAS
  // ══════════════════════════════════════════════════════════
  let f = 10
  const br = () => { f++ }

  // ── INGRESOS ──────────────────────────────────────────────
  writeSection(f, 'INGRESOS', eriAcum?.ingresosTotal ?? null,
    [0,1,2].map(i => eriMens(i, e => e.ingresosTotal)),
    [0,1].map(i => eriAnt(i, e => e.ingresosTotal))); f++; br()

  const scOp = ult?.ingresosDetalle.filter(x => x.esOperacional) ?? []
  writeRow(f, 'Operacionales', eriAcum?.ingresosOperacionales ?? null,
    [0,1,2].map(i => eriMens(i, e => e.ingresosOperacionales)),
    [0,1].map(i => eriAnt(i, e => e.ingresosOperacionales)),
    { bold: true }); f++
  for (const sc of scOp) {
    writeRow(f, sc.nombre, acumIngreso(sc.codigo),
      [0,1,2].map(i => mensualIngreso(i, sc.codigo)),
      [0,1].map(i => antIngreso(i, sc.codigo)),
      { indent: '  ', textColor: sc.esDevolucion ? ROJO_T : NEGRO }); f++
  }
  br()

  const scNoOp = ult?.ingresosDetalle.filter(x => !x.esOperacional) ?? []
  writeRow(f, 'No Operacionales', eriAcum?.ingresosNoOperacionales ?? null,
    [0,1,2].map(i => eriMens(i, e => e.ingresosNoOperacionales)),
    [0,1].map(i => eriAnt(i, e => e.ingresosNoOperacionales)),
    { bold: true }); f++
  for (const sc of scNoOp) {
    writeRow(f, sc.nombre, acumIngreso(sc.codigo),
      [0,1,2].map(i => mensualIngreso(i, sc.codigo)),
      [0,1].map(i => antIngreso(i, sc.codigo)),
      { indent: '  ' }); f++
  }
  br()

  // ── COSTO DE VENTAS ───────────────────────────────────────
  // ← FIX: usar costoTotAcum/costoTotMens (de costosDetalle)
  //   en lugar de eriAcum?.costoTotal / eriMens(i, e => e.costoTotal)
  writeSection(f, 'COSTO DE VENTAS', costoTotAcum, costoTotMens, costoTotAnt); f++; br()

  for (const sc of (ult?.costosDetalle ?? [])) {
    writeRow(f, sc.nombre, acumCosto(sc.codigo),
      [0,1,2].map(i => mensualCosto(i, sc.codigo)),
      [0,1].map(i => antCosto(i, sc.codigo)),
      { bold: true }); f++
    for (const aux of sc.auxiliares) {
      writeRow(f, aux.nombre, acumCosto(sc.codigo, aux.codigo),
        [0,1,2].map(i => mensualCosto(i, sc.codigo, aux.codigo)),
        [0,1].map(i => antCosto(i, sc.codigo, aux.codigo)),
        { indent: '  ' }); f++
    }
    br()
  }

  // ── UTILIDAD OPERACIONAL ──────────────────────────────────
  // ← FIX: también usar costoTotAcum para el cálculo
  const utilAcum = (eriAcum?.ingresosOperacionales ?? 0) - (costoTotAcum ?? 0)
  const utilMens = [0,1,2].map(i => {
    const ing = eriMens(i, e => e.ingresosOperacionales) ?? 0
    const cos = costoTotMens[i] ?? 0
    return (ing - cos) || null
  })
  const utilAnt = [0,1].map(i => {
    const ing = eriAnt(i, e => e.ingresosOperacionales) ?? 0
    const cos = costoTotAnt[i] ?? 0
    return (ing - cos) || null
  })
  writeSubtotalGris(f, 'UTILIDAD OPERACIONAL', utilAcum || null, utilMens, utilAnt); f++; br()

  // ── GASTOS ────────────────────────────────────────────────
  const gastTotAcum = eriAcum ? eriAcum.gastosOperTotal + eriAcum.gastosNoOp : null
  const gastTotMens = [0,1,2].map(i => eriMens(i, e => e.gastosOperTotal + e.gastosNoOp))
  const gastTotAnt  = [0,1].map(i => eriAnt(i, e => e.gastosOperTotal + e.gastosNoOp))
  writeSection(f, 'GASTOS', gastTotAcum, gastTotMens, gastTotAnt); f++; br()

  writeRow(f, 'GASTOS OPERACIONALES', eriAcum?.gastosOperTotal ?? null,
    [0,1,2].map(i => eriMens(i, e => e.gastosOperTotal)),
    [0,1].map(i => eriAnt(i, e => e.gastosOperTotal)),
    { bold: true }); f++; br()

  for (const sc of (ult?.gastosDetalle.filter(x => x.esOperacional) ?? [])) {
    writeRow(f, sc.nombre, acumGasto(sc.codigo),
      [0,1,2].map(i => mensualGasto(i, sc.codigo)),
      [0,1].map(i => antGasto(i, sc.codigo)), { bold: true }); f++
    for (const aux of sc.auxiliares) {
      writeRow(f, aux.nombre, acumGasto(sc.codigo, aux.codigo),
        [0,1,2].map(i => mensualGasto(i, sc.codigo, aux.codigo)),
        [0,1].map(i => antGasto(i, sc.codigo, aux.codigo)), { indent: '  ' }); f++
    }
    br()
  }

  writeRow(f, 'GASTOS NO OPERACIONALES', eriAcum?.gastosNoOp ?? null,
    [0,1,2].map(i => eriMens(i, e => e.gastosNoOp)),
    [0,1].map(i => eriAnt(i, e => e.gastosNoOp)), { bold: true }); f++; br()

  for (const sc of (ult?.gastosDetalle.filter(x => !x.esOperacional) ?? [])) {
    writeRow(f, sc.nombre, acumGasto(sc.codigo),
      [0,1,2].map(i => mensualGasto(i, sc.codigo)),
      [0,1].map(i => antGasto(i, sc.codigo)), { bold: true }); f++
    for (const aux of sc.auxiliares) {
      writeRow(f, aux.nombre, acumGasto(sc.codigo, aux.codigo),
        [0,1,2].map(i => mensualGasto(i, sc.codigo, aux.codigo)),
        [0,1].map(i => antGasto(i, sc.codigo, aux.codigo)), { indent: '  ' }); f++
    }
    br()
  }

  // ── TOTALES Y RESULTADOS ──────────────────────────────────
  writeSubtotalGris(f, 'TOTAL GASTOS', gastTotAcum, gastTotMens, gastTotAnt); f++; br()

  const resOpAcum = (utilAcum ?? 0) - (gastTotAcum ?? 0)
  const resOpMens = [0,1,2].map(i => {
    const u = utilMens[i] ?? 0; const g = gastTotMens[i] ?? 0
    return (u - g) || null
  })
  const resOpAnt = [0,1].map(i => {
    const u = utilAnt[i] ?? 0; const g = gastTotAnt[i] ?? 0
    return (u - g) || null
  })
  writeBoldItalic(f, 'RESULTADO DE OPERACIÓN CONTABLE', resOpAcum || null, resOpMens, resOpAnt); f++; br()

  writeBoldItalic(f, 'RESULTADO ANTES DE IMPUESTO', eriAcum?.resultadoAnteImpuesto ?? null,
    [0,1,2].map(i => eriMens(i, e => e.resultadoAnteImpuesto)),
    [0,1].map(i => eriAnt(i, e => e.resultadoAnteImpuesto))); f++; br()

  writeRow(f, 'Provision Impuesto de Renta', eriAcum?.provisionRenta ?? null,
    [0,1,2].map(i => eriMens(i, e => e.provisionRenta)),
    [0,1].map(i => eriAnt(i, e => e.provisionRenta)), {}); f++; br()

  writeBoldItalic(f, 'RESULTADO INTEGRAL TOTAL DEL PERIODO', eriAcum?.resultadoNeto ?? null,
    [0,1,2].map(i => eriMens(i, e => e.resultadoNeto)),
    [0,1].map(i => eriAnt(i, e => e.resultadoNeto)))
}
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar función hojaCOSTOS COMPLETA
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// REEMPLAZAR función hojaCOSTOS COMPLETA en generarESF.ts
// FIX v2:
//   1. Valores de terceros usan movimientoDebito - movimientoCredito
//   2. varTerceroCosto usa movimiento (no saldoFinal diff)
//   3. Estructura: subcuentas agrupan terceros debajo
//      (Hotel Cabañas → terceros, Restaurante → terceros, etc.)
// ══════════════════════════════════════════════════════════════
export function hojaCOSTOS(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const anioHoja = r.periodos[r.periodos.length - 1]?.anio ?? new Date().getFullYear()
  const ws = wb.addWorksheet(`COSTOS ${anioHoja}`)
  ws.showGridLines = false

  const NAVY      = 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'
  const GRIS_ITEM = 'FFF2F2F2'
  const NEGRO     = 'FF000000'
  const BLANC     = 'FFFFFFFF'

  const fill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, color = NEGRO, size = 9): Partial<ExcelJS.Font> =>
    ({ name: 'Calibri', bold, color: { argb: color }, size })
  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> =>
    ({ horizontal: h, vertical: 'middle' })

  const bMedTop: Partial<ExcelJS.Borders> = {
    top: { style: 'medium', color: { argb: NEGRO } }, bottom: { style: 'thin', color: { argb: NEGRO } },
    left: { style: 'thin', color: { argb: NEGRO } }, right: { style: 'thin', color: { argb: NEGRO } },
  }
  const bDblTop: Partial<ExcelJS.Borders> = {
    top: { style: 'double', color: { argb: NEGRO } }, bottom: { style: 'thin', color: { argb: NEGRO } },
    left: { style: 'thin', color: { argb: NEGRO } }, right: { style: 'thin', color: { argb: NEGRO } },
  }
  const bDashedTop: Partial<ExcelJS.Borders> = {
    top: { style: 'dashed', color: { argb: NEGRO } }, bottom: { style: 'thin', color: { argb: NEGRO } },
    left: { style: 'thin', color: { argb: NEGRO } }, right: { style: 'thin', color: { argb: NEGRO } },
  }

  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  const toNombrePropio = (s: string): string => {
    if (!s) return ''
    return s.toLowerCase().split(' ')
      .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '')
      .join(' ')
  }

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? anioHoja
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 2)

  ws.getColumn(1).width = 43.29
  ws.getColumn(2).width = 16.0
  ws.getColumn(3).width = 16.0
  ws.getColumn(4).width = 16.0
  ws.getColumn(5).width = 16.0
  ws.getColumn(6).width = 2.14
  ws.getColumn(7).width = 16.0
  ws.getColumn(8).width = 14.71
  ws.getColumn(9).width = 1.71

  const setTit = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, 10); c.alignment = aln('center')
  }
  setTit(2, r.empresa); setTit(3, `NIT. ${r.nit}`)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  if (grpAct.length > 0) {
    const c = ws.getCell(6, 2)
    c.value = grpAct[0].anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(6, 3 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  for (let i = 0; i < 2; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(6, 7 + i)
    c.value = p.anio; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop
  }
  if (grpAct.length > 0) {
    const c = ws.getCell(7, 2)
    c.value = 'ACUMULADO'; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center')
  }
  for (let i = 0; i < 3; i++) {
    const p = grpAct[i]; if (!p) continue
    const c = ws.getCell(7, 3 + i)
    c.value = MESES[p.mes] ?? ''; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center')
  }
  for (let i = 0; i < 2; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c = ws.getCell(7, 7 + i)
    c.value = MESES[p.mes] ?? ''; c.font = fnt(true, BLANC, 8)
    c.fill = fill(NAVY); c.alignment = aln('center')
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  // ── Helper: variación mensual de un campo de costosDetalle ─
  const varCosto = (i: number, fn: (p: PeriodoCalculado) => number): number | null => {
    const p = grpAct[i]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes === p.mes && x.anio === p.anio)
    if (idxR < 0) return null
    const curr = fn(r.periodos[idxR])
    const prev = idxR > 0 ? fn(r.periodos[idxR - 1]) : 0
    return curr - prev || null
  }

  // ── FIX: varTerceroCosto usa movimientoDebito - movimientoCredito ──
  // Para balances acumulativos: curr - prev da el movimiento mensual correcto.
  // Para balances mensuales: curr directamente (prev = 0).
  const varTerceroCosto = (i: number, scCodigo: string, nitKey: string): number | null => {
    const p = grpAct[i]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes === p.mes && x.anio === p.anio)
    if (idxR < 0) return null
    const getTval = (per: PeriodoCalculado): number => {
      const sc = per.costosDetalle?.find(x => x.codigo === scCodigo)
      const t  = sc?.terceros.find(x => (x.nit || x.nombreTercero) === nitKey)
      // FIX: movimientoDebito - movimientoCredito, no saldoFinal
      return t ? (t.movimientoDebito - t.movimientoCredito) : 0
    }
    return (getTval(r.periodos[idxR]) - (idxR > 0 ? getTval(r.periodos[idxR - 1]) : 0)) || null
  }

  // ── Helper análogo para terceros dentro de auxiliar ────────
  const varAuxTerceroCosto = (
    i: number, scCodigo: string, auxCodigo: string, nitKey: string
  ): number | null => {
    const p = grpAct[i]; if (!p) return null
    const idxR = r.periodos.findIndex(x => x.mes === p.mes && x.anio === p.anio)
    if (idxR < 0) return null
    const getTval = (per: PeriodoCalculado): number => {
      const psc  = per.costosDetalle?.find(x => x.codigo === scCodigo)
      const paux = psc?.auxiliaresConTerceros?.find(a => a.codigo === auxCodigo)
      const t    = paux?.terceros.find(x => (x.nit || x.nombreTercero) === nitKey)
      // FIX: movimientoDebito - movimientoCredito
      return t ? (t.movimientoDebito - t.movimientoCredito) : 0
    }
    return (getTval(r.periodos[idxR]) - (idxR > 0 ? getTval(r.periodos[idxR - 1]) : 0)) || null
  }

  const writeRow = (
    rowN: number, label: string,
    acumulado: number | null,
    valsMensAct: (number | null)[],
    valsMensAnt: (number | null)[],
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = fill(opts.fillColor)

    const cAcum = ws.getCell(rowN, 2)
    cAcum.value = acumulado ?? null
    cAcum.font = fnt(opts.bold ?? false, NEGRO, 9)
    cAcum.alignment = aln('right'); cAcum.numFmt = '#,##0;(#,##0);"-"'
    if (opts.fillColor) cAcum.fill = fill(opts.fillColor)
    if (opts.brd) cAcum.border = opts.brd

    for (let i = 0; i < 3; i++) {
      const c = ws.getCell(rowN, 3 + i)
      c.value = valsMensAct[i] ?? null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)
      c.alignment = aln('right'); c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
    for (let i = 0; i < 2; i++) {
      const c = ws.getCell(rowN, 7 + i)
      c.value = valsMensAnt[i] ?? null
      c.font = fnt(opts.bold ?? false, NEGRO, 9)
      c.alignment = aln('right'); c.numFmt = '#,##0;(#,##0);"-"'
      if (opts.fillColor) c.fill = fill(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
  }

  const ult     = r.periodos[r.periodos.length - 1]
  const detalle = ult?.costosDetalle ?? []
  const totalAcum = detalle.reduce((s, x) => s + x.total, 0)

  const totalMensAct = [0, 1, 2].map(i =>
    varCosto(i, p => p.costosDetalle?.reduce((s, x) => s + x.total, 0) ?? 0)
  )
  const totalMensAnt = grpAnt.map(p => {
    const idxR = r.periodos.findIndex(x => x.mes === p.mes && x.anio === p.anio)
    if (idxR < 0) return null
    const curr = r.periodos[idxR].costosDetalle?.reduce((s, x) => s + x.total, 0) ?? 0
    const prev = idxR > 0 ? (r.periodos[idxR-1].costosDetalle?.reduce((s, x) => s + x.total, 0) ?? 0) : 0
    return (curr - prev) || null
  })

  writeRow(9, 'COSTOS', totalAcum || null, totalMensAct, totalMensAnt,
    { bold: true, fillColor: AZUL_H, brd: bDblTop })

  let fila = 11

  for (const sc of detalle) {
    const scMensAct = [0, 1, 2].map(i =>
      varCosto(i, p => p.costosDetalle?.find(x => x.codigo === sc.codigo)?.total ?? 0)
    )
    const scMensAnt = grpAnt.map(p => {
      const idxR = r.periodos.findIndex(x => x.mes === p.mes && x.anio === p.anio)
      if (idxR < 0) return null
      const curr = r.periodos[idxR].costosDetalle?.find(x => x.codigo === sc.codigo)?.total ?? 0
      const prev = idxR > 0 ? (r.periodos[idxR-1].costosDetalle?.find(x => x.codigo === sc.codigo)?.total ?? 0) : 0
      return (curr - prev) || null
    })

    writeRow(fila, sc.nombre, sc.total || null, scMensAct, scMensAnt,
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    fila++

    // Unión de auxiliaresConTerceros de TODOS los períodos
// (evita perder sub-nodos que tuvieron movimiento en meses anteriores
//  pero saldo cero en el último período — ej: Restaurante - Terraza)
const auxConTUnion = new Map<string, CostoAuxiliarDetalle>()
for (const p of [...r.periodos].reverse()) {
  const psc = p.costosDetalle?.find(x => x.codigo === sc.codigo)
  for (const aux of psc?.auxiliaresConTerceros ?? []) {
    if (!auxConTUnion.has(aux.codigo)) auxConTUnion.set(aux.codigo, aux)
  }
}
const auxConT = [...auxConTUnion.values()]
.sort((a, b) => a.codigo.localeCompare(b.codigo))
    // ============================================================
// REEMPLAZAR este bloque en hojaCOSTOS (generarESF.ts)
// Busca: if (auxConT && auxConT.length > 0 && auxConT.some(a => a.terceros.length > 0))
// Reemplaza DESDE esa línea HASTA el cierre } que viene antes de fila++
//
// FIX 1 (Bug total vs terceros): unión de terceros de TODOS los períodos
//   Antes: `for (const t of aux.terceros)` → solo del último período
//   Ahora: construye un Map con todos los terceros que aparecieron en
//          cualquier mes, aunque su saldo final sea 0 en el último período.
//
// FIX 2 (Bug nivel intermedio): renderiza distinto según longitud del código
//   aux.codigo.length === 6 → header de subcuenta (Hoteleria, bold, sin indent)
//   aux.codigo.length === 8 → sub-header intermedio (Hoteleria-Hotel, bold, indent 1)
//   terceros               → línea de dato (no bold, indent 2)
//
// NOTA: FIX 2 requiere que parser.ts y motor.ts también estén actualizados
// (cambio de substring 6→8 en agruparTerceros + Paso 5 de calcCOSTOS).
// Si solo aplicas FIX 1 sin esos cambios, también funciona: aux.codigo
// siempre será 6 dígitos y el bloque `is6digit` nunca renderiza terceros
// directos (los deja vacíos), así que no hace daño. Aplica ambos juntos.
// ============================================================

    if (auxConT && auxConT.length > 0 && (
          auxConT.some(a => a.terceros.length > 0) ||
          auxConT.some(a => a.codigo.length === 6)   // cabecera sin terceros propios
        )) {
      for (const aux of auxConT) {
        if (Math.abs(aux.total) < 1 && aux.terceros.length === 0) continue

        // ── Valores de la fila header ─────────────────────────
        const auxMensAct = [0, 1, 2].map(i =>
          varCosto(i, p => {
            const psc = p.costosDetalle?.find(x => x.codigo === sc.codigo)
            return psc?.auxiliaresConTerceros?.find(a => a.codigo === aux.codigo)?.total ?? 0
          })
        )
        const auxMensAnt = grpAnt.map(p => {
          const idxR = r.periodos.findIndex(x => x.mes === p.mes && x.anio === p.anio)
          if (idxR < 0) return null
          const psc = r.periodos[idxR].costosDetalle?.find(x => x.codigo === sc.codigo)
          const curr = psc?.auxiliaresConTerceros?.find(a => a.codigo === aux.codigo)?.total ?? 0
          const pscPrev = idxR > 0 ? r.periodos[idxR-1].costosDetalle?.find(x => x.codigo === sc.codigo) : null
          const prev = pscPrev?.auxiliaresConTerceros?.find(a => a.codigo === aux.codigo)?.total ?? 0
          return (curr - prev) || null
        })

        // ── Determinar nivel de render según longitud del código ──
        // 6 dígitos = subcuenta principal (Hoteleria)  → sin indent
        // 8 dígitos = auxiliar intermedio (Hoteleria-Hotel) → indent 1
        const is6 = aux.codigo.length === 6
        const label = is6 ? aux.nombre : '   ' + aux.nombre

        writeRow(fila, label, aux.total || null, auxMensAct, auxMensAnt,
          { bold: true, brd: bDashedTop })
        fila++

        // ── Si es encabezado de 6 dígitos sin terceros propios, no renderiza
        //    terceros aquí; los hijos de 8 dígitos vienen como entradas
        //    separadas en el mismo array auxConT ────────────────
        if (is6 && aux.terceros.length === 0) continue

        // ── FIX 1: unión de terceros de TODOS los períodos ───────
        // ANTES: `for (const t of aux.terceros)` usaba solo el último período.
        // Un tercero con movimiento en enero/febrero pero saldo final = 0
        // en marzo quedaba excluido aunque SÍ aportó al total mensual.
        // AHORA: recorremos todos los períodos y acumulamos todos los
        // terceros que aparecieron en cualquier mes.
        const terceroUnionMap = new Map<string, TerceroAgrupado>()
        for (const p of r.periodos) {
          const psc  = p.costosDetalle?.find(x => x.codigo === sc.codigo)
          const paux = psc?.auxiliaresConTerceros?.find(a => a.codigo === aux.codigo)
          for (const t of paux?.terceros ?? []) {
            const key = (t.nit || t.nombreTercero || '').trim()
            if (key && !terceroUnionMap.has(key)) terceroUnionMap.set(key, t)
          }
        }

        for (const [nitKey, t] of terceroUnionMap) {
          // Valor acumulado = movimiento del último período para ese tercero
          const ult2    = r.periodos[r.periodos.length - 1]
          const pscUlt  = ult2.costosDetalle?.find(x => x.codigo === sc.codigo)
          const pauxUlt = pscUlt?.auxiliaresConTerceros?.find(a => a.codigo === aux.codigo)
          const tUlt    = pauxUlt?.terceros.find(x => (x.nit || x.nombreTercero) === nitKey)
          const movAcum = tUlt ? (tUlt.movimientoDebito - tUlt.movimientoCredito) : 0

          const tMensAct = [0, 1, 2].map(i => varAuxTerceroCosto(i, sc.codigo, aux.codigo, nitKey))
          const tMensAnt = grpAnt.map(p => {
            const idxR = r.periodos.findIndex(x => x.mes === p.mes && x.anio === p.anio)
            if (idxR < 0) return null
            const psc  = r.periodos[idxR].costosDetalle?.find(x => x.codigo === sc.codigo)
            const paux = psc?.auxiliaresConTerceros?.find(a => a.codigo === aux.codigo)
            const tC   = paux?.terceros.find(x => (x.nit || x.nombreTercero) === nitKey)
            const curr = tC ? (tC.movimientoDebito - tC.movimientoCredito) : 0
            const pscPrev  = idxR > 0 ? r.periodos[idxR-1].costosDetalle?.find(x => x.codigo === sc.codigo) : null
            const pauxPrev = pscPrev?.auxiliaresConTerceros?.find(a => a.codigo === aux.codigo)
            const tP       = pauxPrev?.terceros.find(x => (x.nit || x.nombreTercero) === nitKey)
            const prev     = tP ? (tP.movimientoDebito - tP.movimientoCredito) : 0
            return (curr - prev) || null
          })

          // Mostrar si tiene movimiento en acumulado o en cualquier mes
          const tieneMovimiento =
            Math.abs(movAcum) >= 1 ||
            tMensAct.some(v => v !== null && Math.abs(v) >= 1)
          if (!tieneMovimiento) continue

          writeRow(fila,
            toNombrePropio(t.nombreTercero || t.nit),
            movAcum || null,
            tMensAct, tMensAnt,
            { bold: false, brd: bDashedTop, indent: true }
          )
          fila++
        }
      }
    } else {
      // ── Terceros flat (sin subcuentas intermedias) ──────────
      // FIX 1 aplicado también aquí: unión de todos los períodos
      const terceroUnionMap = new Map<string, TerceroAgrupado>()
      for (const p of r.periodos) {
        const psc = p.costosDetalle?.find(x => x.codigo === sc.codigo)
        for (const t of psc?.terceros ?? []) {
          const key = (t.nit || t.nombreTercero || '').trim()
          if (key && !terceroUnionMap.has(key)) terceroUnionMap.set(key, t)
        }
      }

      for (const [nitKey, t] of terceroUnionMap) {
        const ult2   = r.periodos[r.periodos.length - 1]
        const pscUlt = ult2.costosDetalle?.find(x => x.codigo === sc.codigo)
        const tUlt   = pscUlt?.terceros.find(x => (x.nit || x.nombreTercero) === nitKey)
        const mov    = tUlt ? (tUlt.movimientoDebito - tUlt.movimientoCredito) : 0

        const tMensAct = [0, 1, 2].map(i => varTerceroCosto(i, sc.codigo, nitKey))
        const tMensAnt = grpAnt.map(p => {
          const idxR = r.periodos.findIndex(x => x.mes === p.mes && x.anio === p.anio)
          if (idxR < 0) return null
          const scP  = r.periodos[idxR].costosDetalle?.find(x => x.codigo === sc.codigo)
          const tC   = scP?.terceros.find(x => (x.nit || x.nombreTercero) === nitKey)
          const curr = tC ? (tC.movimientoDebito - tC.movimientoCredito) : 0
          const scPrev = idxR > 0 ? r.periodos[idxR-1].costosDetalle?.find(x => x.codigo === sc.codigo) : null
          const tP     = scPrev?.terceros.find(x => (x.nit || x.nombreTercero) === nitKey)
          const prev   = tP ? (tP.movimientoDebito - tP.movimientoCredito) : 0
          return (curr - prev) || null
        })

        const tieneMovimiento =
          Math.abs(mov) >= 1 ||
          tMensAct.some(v => v !== null && Math.abs(v) >= 1)
        if (!tieneMovimiento) continue

        writeRow(fila,
          toNombrePropio(t.nombreTercero || t.nit),
          mov || null,
          tMensAct, tMensAnt,
          { bold: false, brd: bDashedTop, indent: true }
        )
        fila++
      }
    }

    fila++
  }

  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5
  ws.getRow(8).height = 15.75; ws.getRow(9).height = 14.25
}
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar función hojaNCTASESF COMPLETA
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════

export function hojaNCTASESF(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('NOTAS ESF')
  ws.showGridLines = false

  const VERDE  = 'FF00B050'
  const ROJO   = 'FF903032'
  const DORADO = 'FFBF8F00'
  const NEGRO  = 'FF000000'
  const BLANC  = 'FFFFFFFF'

  const sfill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, argb = NEGRO, sz = 9, italic = false): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', bold, italic, color: { argb }, size: sz })
  const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
  const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
  const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
  const bThin: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: NEGRO } },
    bottom: { style: 'thin', color: { argb: NEGRO } },
    left:   { style: 'thin', color: { argb: NEGRO } },
    right:  { style: 'thin', color: { argb: NEGRO } },
  }
  const MESES: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 5)
  const NA = grpAct.length
  const NB = grpAnt.length

  const COL_SEP  = 2 + NA
  const COL_ANT  = COL_SEP + 1
  const LAST     = COL_ANT + NB

  ws.getColumn(1).width = 36.0
  for (let i = 0; i < NA; i++) ws.getColumn(2 + i).width = 16.0
  ws.getColumn(COL_SEP).width = 1.5
  for (let i = 0; i < NB; i++) ws.getColumn(COL_ANT + i).width = 16.0
  ws.getColumn(LAST).width = 1.71

  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1)
    c.value = txt
    c.font  = fnt(true, NEGRO, sz, italic)
    c.alignment = alnC
  }
  setTit(2, r.empresa,                                  true, 11)
  setTit(3, `NIT. ${r.nit}`,                           true, 10)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS',         true, 10)
  setTit(5, '(Cifra expresadas en pesos Colombianos)', true,  9)

  const cConc   = ws.getCell(7, 1)
  cConc.value   = 'CONCEPTO'
  cConc.font    = fnt(true, BLANC, 10)
  cConc.fill    = sfill(VERDE)
  cConc.alignment = alnC

  for (let i = 0; i < NA; i++) {
    const p  = grpAct[i]
    const c7 = ws.getCell(7, 2 + i)
    c7.value = p.anio; c7.font = fnt(true, BLANC, 8)
    c7.fill  = sfill(ROJO); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, 2 + i)
    c8.value = MESES[p.mes]; c8.font = fnt(true, BLANC, 8)
    c8.fill  = sfill(ROJO); c8.alignment = alnC; c8.border = bThin
  }

  for (let i = 0; i < NB; i++) {
    const p  = grpAnt[i]
    const c7 = ws.getCell(7, COL_ANT + i)
    c7.value = p.anio; c7.font = fnt(true, BLANC, 8)
    c7.fill  = sfill(DORADO); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, COL_ANT + i)
    c8.value = MESES[p.mes]; c8.font = fnt(true, BLANC, 8)
    c8.fill  = sfill(DORADO); c8.alignment = alnC; c8.border = bThin
  }

  const colCont = NB > 0 ? COL_ANT : 2
  const cCont   = ws.getCell(9, colCont)
  cCont.value   = 'contable'
  cCont.font    = fnt(false, NEGRO, 8)
  cCont.alignment = alnC

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 9 }]

  ws.getRow(2).height = 15; ws.getRow(3).height = 15
  ws.getRow(4).height = 15; ws.getRow(5).height = 12
  ws.getRow(7).height = 18; ws.getRow(8).height = 18; ws.getRow(9).height = 13

  const FMT_PESOS = '#,##0;(#,##0);"-"'

  const writeSection = (
    rowN: number, label: string,
    gAct: (p: PeriodoCalculado) => number,
    gAnt: (p: PeriodoCalculado) => number
  ) => {
    for (let c = 1; c <= LAST; c++) ws.getCell(rowN, c).fill = sfill(VERDE)
    const cL = ws.getCell(rowN, 1)
    cL.value = label; cL.font = fnt(true, BLANC, 10); cL.alignment = alnC
    for (let i = 0; i < NA; i++) {
      const p = grpAct[i]; if (!p) continue
      const c = ws.getCell(rowN, 2 + i)
      c.value = gAct(p); c.font = fnt(true, BLANC, 9)
      c.fill = sfill(VERDE); c.alignment = alnR
      c.numFmt = FMT_PESOS; c.border = bThin
    }
    for (let i = 0; i < NB; i++) {
      const p = grpAnt[i]; if (!p) continue
      const c = ws.getCell(rowN, COL_ANT + i)
      c.value = gAnt(p); c.font = fnt(true, BLANC, 9)
      c.fill = sfill(VERDE); c.alignment = alnR
      c.numFmt = FMT_PESOS; c.border = bThin
    }
  }

  const writeSub = (
    rowN: number, label: string, indent: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = indent + label; cL.font = fnt(true, NEGRO, 9)
    cL.alignment = alnL; cL.border = bThin
    for (let i = 0; i < NA; i++) {
      const p = grpAct[i]; if (!p) continue
      const c = ws.getCell(rowN, 2 + i)
      c.value = gAct(p) ?? null; c.font = fnt(true, NEGRO, 9)
      c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin
    }
    for (let i = 0; i < NB; i++) {
      const p = grpAnt[i]; if (!p) continue
      const c = ws.getCell(rowN, COL_ANT + i)
      c.value = gAnt(p) ?? null; c.font = fnt(true, NEGRO, 9)
      c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin
    }
  }

  const writeDet = (
    rowN: number, label: string, indent: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = indent + label; cL.font = fnt(false, NEGRO, 9)
    cL.alignment = alnL; cL.border = bThin
    for (let i = 0; i < NA; i++) {
      const p = grpAct[i]; if (!p) continue
      const c = ws.getCell(rowN, 2 + i)
      c.value = gAct(p) ?? null; c.font = fnt(false, NEGRO, 9)
      c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin
    }
    for (let i = 0; i < NB; i++) {
      const p = grpAnt[i]; if (!p) continue
      const c = ws.getCell(rowN, COL_ANT + i)
      c.value = gAnt(p) ?? null; c.font = fnt(false, NEGRO, 9)
      c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin
    }
  }

  // ── Helpers de cálculo ────────────────────────────────────
  const getResultadoBalance = (p: PeriodoCalculado): number =>
    p.totalActivo - p.totalPasivo -
    (p.patrimonio.capitalSocial ?? 0) -
    (p.patrimonio.superavitCapital ?? 0) -
    (p.patrimonio.reservas ?? 0) -
    (p.patrimonio.revalorizacion ?? 0) -
    (p.patrimonio.resultadoEjercicioAnterior ?? 0) -
    (p.patrimonio.resultadosAnteriores ?? 0)

  const totalObligFin = (p: PeriodoCalculado): number =>
    p.pasivoCorriente.obligFinCorrTotal + p.pasivoNoCorriente.obligFinNCTotal

  const totalCxpCorregido = (p: PeriodoCalculado): number =>
    p.pasivoCorriente.proveedoresTotal +
    p.pasivoCorriente.costosGastosPagar +
    (p.pasivoCorriente.acreedoresVariosTotal ?? 0)

  const totalFiscESF = (p: PeriodoCalculado): number =>
    p.pasivoCorriente.reteTotal + p.pasivoCorriente.icaRetenido +
    p.pasivoCorriente.icaTotal + p.pasivoCorriente.ivaTotal + p.pasivoCorriente.impuestosRenta

  const totalBeneficios = (p: PeriodoCalculado): number => {
    const g2510 = (p.pasivoCorriente.beneficiosDetalle ?? [])
      .filter((x: any) => x.codigo.startsWith('2510'))
      .reduce((s: number, x: any) => s + x.valor, 0)
    return p.pasivoCorriente.beneficiosCorrTotal + p.pasivoNoCorriente.provisionLaboralTotal - g2510
}

  const totalPasivoSheet = (p: PeriodoCalculado): number =>
    totalObligFin(p) +
    totalCxpCorregido(p) +
    totalFiscESF(p) +
    (p.pasivoCorriente.aporteNomina ?? 0) +
    totalBeneficios(p) +
    (p.pasivoCorriente.otrosPasivosCorrTotal ?? 0) +
    p.pasivoNoCorriente.totalPasivoNoCorriente

  const totalPasivoMasPatrimonioSheet = (p: PeriodoCalculado): number =>
    totalPasivoSheet(p) + p.patrimonio.totalPatrimonio

  // Unión anticipo impuestos de todos los períodos
  const anticUnion = new Map<string, string>()
  for (const p of r.periodos) {
    for (const item of (p.activoCorriente.anticImpuestosDetalle ?? [])) {
      if (!anticUnion.has(item.codigo)) anticUnion.set(item.codigo, item.nombre)
    }
  }
  const anticItems = [...anticUnion.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  // ── FIX: Unión retención de todos los períodos ─────────────
  const reteUnion = new Map<string, string>()
  for (const p of r.periodos) {
    for (const item of (p.pasivoCorriente.reteDetalleSubcuentas ?? [])) {
      if (!reteUnion.has(item.codigo)) reteUnion.set(item.codigo, item.nombre)
    }
  }

  const ult = r.periodos[r.periodos.length - 1]
  let f = 10
  const br = (n = 1) => { f += n }

  // ══════════════════════════════════════════════════════════
  // ACTIVO
  // ══════════════════════════════════════════════════════════
  writeSection(f, 'ACTIVO', p => p.totalActivo, p => p.totalActivo); f++; br()

  writeSub(f, 'Efectivo y Equivalentes al Efectivo', '',
    p => p.activoCorriente.efectivoTotal,
    p => p.activoCorriente.efectivoTotal); f++; br()

  writeDet(f, 'Caja', '  ',
    p => p.activoCorriente.cajaTotal || null,
    p => p.activoCorriente.cajaTotal || null); f++

  writeSub(f, 'Bancos', '  ',
    p => p.activoCorriente.bancosTotal || null,
    p => p.activoCorriente.bancosTotal || null); f++

  for (const banco of (ult?.activoCorriente.bancos ?? [])) {
    writeDet(f, banco.nombre, '  ',
      p => p.activoCorriente.bancos.find(b => b.nombre === banco.nombre)?.totalSaldoFinal || null,
      p => p.activoCorriente.bancos.find(b => b.nombre === banco.nombre)?.totalSaldoFinal || null); f++
  }
  br()

  writeSub(f, 'Inversiones', '',
    p => p.activoCorriente.inversionesTotal || null,
    p => p.activoCorriente.inversionesTotal || null); f++

  for (const item of (ult?.activoCorriente.inversionesDetalle ?? [])) {
    writeDet(f, item.nombre, '  ',
      p => p.activoCorriente.inversionesDetalle.find(x => x.codigo === item.codigo)?.valor || null,
      p => p.activoCorriente.inversionesDetalle.find(x => x.codigo === item.codigo)?.valor || null); f++
  }
  br()

  writeSub(f, 'Cuentas Por Cobrar', '',
    p => (p.activoCorriente.clientesTotal + p.activoCorriente.anticiposTotal) || null,
    p => (p.activoCorriente.clientesTotal + p.activoCorriente.anticiposTotal) || null); f++

  writeDet(f, 'Clientes Nacionales y del Exterior', '  ',
    p => p.activoCorriente.clientesTotal || null,
    p => p.activoCorriente.clientesTotal || null); f++

  writeDet(f, 'Anticipos y Avances', '  ',
    p => p.activoCorriente.anticiposTotal || null,
    p => p.activoCorriente.anticiposTotal || null); f++; br()

  writeSub(f, 'Anticipo de Impuestos', '',
    p => p.activoCorriente.anticImpuestosDetalle.reduce((s, x) => s + x.valor, 0) || null,
    p => p.activoCorriente.anticImpuestosDetalle.reduce((s, x) => s + x.valor, 0) || null); f++

  for (const [codigo, nombre] of anticItems) {
    writeDet(f, nombre, '  ',
      p => p.activoCorriente.anticImpuestosDetalle.find(x => x.codigo === codigo)?.valor || null,
      p => p.activoCorriente.anticImpuestosDetalle.find(x => x.codigo === codigo)?.valor || null); f++
  }
  br()

  writeSub(f, 'Inventario', '',
    p => p.activoCorriente.inventarioTotal || null,
    p => p.activoCorriente.inventarioTotal || null); f++

  for (const item of (ult?.activoCorriente.inventarioDetalle ?? [])) {
    writeDet(f, item.nombre, '  ',
      p => p.activoCorriente.inventarioDetalle.find(x => x.codigo === item.codigo)?.valor || null,
      p => p.activoCorriente.inventarioDetalle.find(x => x.codigo === item.codigo)?.valor || null); f++
  }
  br()

  writeSub(f, 'Propiedad Planta Y Equipo', '',
    p => p.activoNoCorriente.ppyeNeto,
    p => p.activoNoCorriente.ppyeNeto); f++; br()

  for (const item of (ult?.activoNoCorriente.detallePPyE ?? [])) {
    writeDet(f, item.nombre, '  ',
      p => p.activoNoCorriente.detallePPyE.find(x => x.codigo === item.codigo)?.valor || null,
      p => p.activoNoCorriente.detallePPyE.find(x => x.codigo === item.codigo)?.valor || null); f++
  }

  writeDet(f, 'Depreciacion Acumulada', '  ',
    p => p.activoNoCorriente.depreciacionAcumulada || null,
    p => p.activoNoCorriente.depreciacionAcumulada || null); f++; br(3)

  // ══════════════════════════════════════════════════════════
  // PASIVO
  // ══════════════════════════════════════════════════════════
  writeSection(f, 'PASIVO',
  p => p.totalPasivo,
  p => p.totalPasivo); f += 2

  writeSub(f, 'Financieros', '',
    p => totalObligFin(p) || null,
    p => totalObligFin(p) || null); f++

  for (const item of (ult?.pasivoNoCorriente.oblFinDetalle ?? [])) {
    writeDet(f, item.nombre, '  ',
      p => p.pasivoNoCorriente.oblFinDetalle.find(x => x.codigo === item.codigo)?.valor || null,
      p => p.pasivoNoCorriente.oblFinDetalle.find(x => x.codigo === item.codigo)?.valor || null); f++
  }
  br()

  writeSub(f, 'Cuentas por pagar', '',
    p => totalCxpCorregido(p) || null,
    p => totalCxpCorregido(p) || null); f++

  writeDet(f, 'Proveedores y Acreedores Comerciales', '  ',
    p => p.pasivoCorriente.proveedoresTotal || null,
    p => p.pasivoCorriente.proveedoresTotal || null); f++

  writeDet(f, 'Costos y Gastos Por Pagar', '  ',
    p => p.pasivoCorriente.costosGastosPagar || null,
    p => p.pasivoCorriente.costosGastosPagar || null); f++

  writeDet(f, 'Acreedores Varios', '  ',
    p => p.pasivoCorriente.acreedoresVariosTotal || null,
    p => p.pasivoCorriente.acreedoresVariosTotal || null); f++; br()

  writeSub(f, 'Fiscales', '',
    p => totalFiscESF(p) || null,
    p => totalFiscESF(p) || null); f++

  // ── FIX: Retencion Fuente con desglose por subcuenta ──────
  writeSub(f, 'Retencion En La Fuente', '  ',
    p => p.pasivoCorriente.reteTotal || null,
    p => p.pasivoCorriente.reteTotal || null); f++

  for (const [cod, nombre] of reteUnion) {
    writeDet(f, nombre, '    ',
      p => p.pasivoCorriente.reteDetalleSubcuentas?.find(x => x.codigo === cod)?.valor || null,
      p => p.pasivoCorriente.reteDetalleSubcuentas?.find(x => x.codigo === cod)?.valor || null); f++
  }

  writeDet(f, 'Impuesto Industria y Comercio', '  ',
    p => p.pasivoCorriente.icaTotal || null,
    p => p.pasivoCorriente.icaTotal || null); f++

  writeDet(f, 'Impuesto a las Ventas', '  ',
    p => p.pasivoCorriente.ivaTotal || null,
    p => p.pasivoCorriente.ivaTotal || null); f++

  writeDet(f, 'Impuesto al ICA Retenido', '  ',
    p => p.pasivoCorriente.icaRetenido || null,
    p => p.pasivoCorriente.icaRetenido || null); f++

  writeDet(f, 'De renta y complementarios', '  ',
    p => p.pasivoCorriente.impuestosRenta || null,
    p => p.pasivoCorriente.impuestosRenta || null); f++; br()

  writeSub(f, 'Retenciones y Aportes de Nomina', '',
    p => p.pasivoCorriente.aporteNomina || null,
    p => p.pasivoCorriente.aporteNomina || null); f++

  writeDet(f, 'Retenciones y Aportes de Nomina', '  ',
    p => p.pasivoCorriente.aporteNomina || null,
    p => p.pasivoCorriente.aporteNomina || null); f++; br()

  writeSub(f, 'Beneficios a empleados', '',
    p => totalBeneficios(p) || null,
    p => totalBeneficios(p) || null); f++

  writeDet(f, 'Pasivos Estimados y Provisiones', '  ',
    p => totalBeneficios(p) || null,
    p => totalBeneficios(p) || null); f++; br()

  writeSub(f, 'Otros pasivos', '',
    p => p.pasivoCorriente.otrosPasivosCorrTotal || null,
    p => p.pasivoCorriente.otrosPasivosCorrTotal || null); f++

  writeDet(f, 'Anticipos de clientes', '  ',
    p => p.pasivoCorriente.otrosPasivosCorrTotal || null,
    p => p.pasivoCorriente.otrosPasivosCorrTotal || null); f++; br(3)

  // ══════════════════════════════════════════════════════════
  // PATRIMONIO LIQUIDO
  // ══════════════════════════════════════════════════════════
  writeSection(f, 'PATRIMONIO LIQUIDO',
  p => p.totalActivo - p.totalPasivo,
  p => p.totalActivo - p.totalPasivo); f++

  writeDet(f, 'Capital Social', '  ',
    p => p.patrimonio.capitalSocial || null,
    p => p.patrimonio.capitalSocial || null); f++

  writeDet(f, 'Reserva Legal', '  ',
    p => p.patrimonio.reservas || null,
    p => p.patrimonio.reservas || null); f++

  writeDet(f, 'Resultado Ejercicios Anteriores', '  ',
    p => (p.patrimonio.resultadoEjercicioAnterior + p.patrimonio.resultadosAnteriores) || null,
    p => (p.patrimonio.resultadoEjercicioAnterior + p.patrimonio.resultadosAnteriores) || null); f++

writeDet(f, 'Resultado del ejercicio', '  ',
    p => getResultadoBalance(p) || null,
    p => getResultadoBalance(p) || null); f++; br()
    
  writeSub(f, 'Total Pasivo + Patrimonio', '',
    p => p.totalActivo,
    p => p.totalActivo)
}
// ─────────────────────────────────────────────────────────────
// HOJA 16 — ESF (Estado de Situación Financiera)
// ─────────────────────────────────────────────────────────────
export function hojaESF(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('ESF')
  ws.showGridLines = false

  const N       = Math.min(r.periodos.length, 9)
  const periOrd = [...r.periodos].reverse().slice(0, N)
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()

  const ROJO_ACT   = 'FF903032'
  const DORADO_ANT = 'FFBF8F00'
  const NEGRO      = 'FF000000'
  const BLANC      = 'FFFFFFFF'

  const LAST = 6 + N

  ws.getColumn(1).width = 1.4
  ws.getColumn(2).width = 33.3
  ws.getColumn(3).width = 1.1
  ws.getColumn(4).width = 6.1
  ws.getColumn(5).width = 1.1
  for (let i = 0; i < N; i++) ws.getColumn(6 + i).width = 16.4
  ws.getColumn(6 + N).width = 1.71

  const sfill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, argb = NEGRO, sz = 9, italic = false): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', bold, italic, color: { argb }, size: sz })
  const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
  const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
  const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
  const bThin: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: NEGRO } },
    bottom: { style: 'thin', color: { argb: NEGRO } },
    left:   { style: 'thin', color: { argb: NEGRO } },
    right:  { style: 'thin', color: { argb: NEGRO } },
  }

  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(true, NEGRO, sz, italic); c.alignment = alnC
  }
  setTit(2, r.empresa,                                         true, 11)
  setTit(3, `NIT. ${r.nit}`,                                  true, 10)
  setTit(4, 'ESTADO DE SITUACIÓN FINANCIERA INDIVIDUALES A:', true, 10)
  setTit(5, '(Cifra expresadas en pesos Colombianos)',         true,  9)

  const cActH     = ws.getCell(8, 2)
  cActH.value     = 'ACTIVO'
  cActH.font      = fnt(true, BLANC, 10)
  cActH.fill      = sfill(C.VERDE_HEADER)
  cActH.alignment = alnC

  const cNotaH    = ws.getCell(8, 4)
  cNotaH.value    = 'NOTA'
  cNotaH.font     = fnt(true, BLANC, 9)
  cNotaH.fill     = sfill(C.VERDE_HEADER)
  cNotaH.alignment = alnC
  cNotaH.border   = bThin

  periOrd.forEach((p, i) => {
    const col   = 6 + i
    const color = p.anio === anioAct ? ROJO_ACT : DORADO_ANT
    const c     = ws.getCell(8, col)
    c.value     = fechaCorte(p.mes, p.anio)
    c.font      = fnt(true, BLANC, 8)
    c.fill      = sfill(color)
    c.alignment = alnC
    c.border    = bThin
  })

  if (N > 0) {
    const cCont     = ws.getCell(9, 6)
    cCont.value     = 'contable'
    cCont.font      = fnt(false, NEGRO, 8)
    cCont.alignment = alnC
  }

  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 9 }]
  ws.getRow(2).height = 15; ws.getRow(3).height = 15
  ws.getRow(4).height = 15; ws.getRow(5).height = 12
  ws.getRow(8).height = 18; ws.getRow(9).height = 13

  const esfRow = (
    rowN: number,
    label: string,
    valores: number[],
    opts: { nota?: number; bold?: boolean; fillArgb?: string; indent?: number }
  ) => {
    const indent    = '  '.repeat(opts.indent ?? 0)
    const isGreenH  = opts.fillArgb === C.VERDE_HEADER
    const textColor = opts.fillArgb ? BLANC : NEGRO
    const fill      = opts.fillArgb ? sfill(opts.fillArgb) : undefined

    if (isGreenH) {
      for (let c = 1; c <= LAST; c++) ws.getCell(rowN, c).fill = sfill(C.VERDE_HEADER)
    }

    const cL = ws.getCell(rowN, 2)
    cL.value = indent + label
    cL.font  = fnt(opts.bold ?? false, textColor, 9)
    cL.alignment = alnL
    if (!isGreenH) { if (fill) cL.fill = fill; cL.border = bThin }

    if (opts.nota !== undefined) {
      const cn = ws.getCell(rowN, 4)
      cn.value = opts.nota
      cn.font  = { name: 'Arial', color: { argb: C.AZUL_LINK }, underline: true, size: 8 }
      cn.alignment = alnC
      cn.border = bThin
      if (fill) cn.fill = fill
    }

    const vals = valores.slice(0, N)
    vals.forEach((v, i) => {
      const cv = ws.getCell(rowN, 6 + i)
      cv.value = v; cv.font = fnt(opts.bold ?? false, textColor, 9)
      cv.alignment = alnR; cv.numFmt = FMT_PESOS; cv.border = bThin
      if (fill) cv.fill = fill
    })
  }

  // ── Helpers de datos ──────────────────────────────────────

  // Resultado derivado del balance (garantiza que ESF cuadre)
  // En vez de usar el resultado del ERI (que puede diferir del balance real),
  // se calcula como: Activo - Pasivo - demás componentes del patrimonio.
  const getResultadoBalance = (p: PeriodoCalculado): number =>
    p.totalActivo - p.totalPasivo -
    (p.patrimonio.capitalSocial ?? 0) -
    (p.patrimonio.superavitCapital ?? 0) -
    (p.patrimonio.reservas ?? 0) -
    (p.patrimonio.revalorizacion ?? 0) -
    (p.patrimonio.resultadoEjercicioAnterior ?? 0) -
    (p.patrimonio.resultadosAnteriores ?? 0)


  const v = (g: (p: PeriodoCalculado) => number) => periOrd.map(g)

  // TANDA 7: clasificación configurable del anticipo de impuestos (1355)
  // true  → Cuentas por Cobrar (corriente) | false → Otros Activos (no corriente)
// ── MOTOR DE REGLAS ──
  // El perfil trae reglas libres; los booleanos viejos se traducen solos.
  const reglas = reglasDesdePerfil(r.perfil)
  const R = (p: PeriodoCalculado) => renglonesESF(p, reglas)
  const rv = (id: RenglonId) => v(p => R(p)[id].valor)
  const et = (id: RenglonId) =>
    periOrd.length ? R(periOrd[0])[id].etiqueta : ETIQUETA_DE[id]

  let f = 10

  // ══════════════════════════════════════════════════════════
  // ACTIVO CORRIENTE
  // ══════════════════════════════════════════════════════════
  esfRow(f, 'Corrientes', [], { bold: true }); f++

  esfRow(f, et('efectivo'),         rv('efectivo'),         { nota: 4, indent: 1 }); f++
  esfRow(f, et('inversiones'),      rv('inversiones'),      { nota: 5, indent: 1 }); f++
  esfRow(f, et('cuentasPorCobrar'), rv('cuentasPorCobrar'), { nota: 6, indent: 1 }); f++
  esfRow(f, et('inventarios'),      rv('inventarios'),      { nota: 7, indent: 1 }); f++

  // Total corriente = suma de los renglones (respeta las reglas, cuadre intacto)
  esfRow(f, 'Total ',
    v(p => {
      const x = R(p)
      return x.efectivo.valor + x.inversiones.valor + x.cuentasPorCobrar.valor +
             x.inventarios.valor + x.otrosActivosCorrientes.valor
    }),
    { bold: true, fillArgb: C.AZUL_TOTAL }); f += 2

  // ══════════════════════════════════════════════════════════
  // ACTIVO NO CORRIENTE
  // ══════════════════════════════════════════════════════════
  esfRow(f, 'No corrientes', [], { bold: true }); f++

  esfRow(f, et('ppye'), rv('ppye'), { nota: 8, indent: 1 }); f++
  esfRow(f, et('otrosActivosNoCorrientes'), rv('otrosActivosNoCorrientes'),
    { nota: 8, indent: 1 }); f++

  esfRow(f, 'Total ',
    v(p => {
      const x = R(p)
      return x.ppye.valor + x.otrosActivosNoCorrientes.valor
    }),
    { bold: true, fillArgb: C.AZUL_TOTAL }); f += 2

  esfRow(f, 'Total Activo',
    v(p => p.totalActivo),
    { bold: true, fillArgb: C.AZUL_TOTAL }); f += 3

  // ══════════════════════════════════════════════════════════
  // PASIVOS
  // ══════════════════════════════════════════════════════════
  esfRow(f, 'PASIVOS', [], { bold: true, fillArgb: C.VERDE_HEADER }); f += 2

  esfRow(f, 'Corrientes', [], { bold: true }); f++
 esfRow(f, et('financierosCorriente'),  rv('financierosCorriente'),  { nota: 9,  indent: 1 }); f++
  esfRow(f, et('proveedores'),           rv('proveedores'),           { nota: 10, indent: 1 }); f++
  esfRow(f, et('costosGastosPagar'),     rv('costosGastosPagar'),     { nota: 11, indent: 1 }); f++
  esfRow(f, et('fiscales'),              rv('fiscales'),              { nota: 10, indent: 1 }); f++
  esfRow(f, et('beneficiosEmpleados'),   rv('beneficiosEmpleados'),   { nota: 12, indent: 1 }); f++
  esfRow(f, et('otrosPasivosCorriente'), rv('otrosPasivosCorriente'), { nota: 12, indent: 1 }); f++

  // Total corriente = suma de los renglones (respeta las reglas)
  esfRow(f, 'Total ',
    v(p => {
      const x = R(p)
      return x.financierosCorriente.valor + x.proveedores.valor +
             x.costosGastosPagar.valor + x.fiscales.valor +
             x.beneficiosEmpleados.valor + x.otrosPasivosCorriente.valor
    }),
    { bold: true, fillArgb: C.AZUL_TOTAL }); f += 2

  esfRow(f, 'No corrientes', [], { bold: true }); f++
  esfRow(f, et('financierosNoCorriente'),  rv('financierosNoCorriente'),  { nota: 9,  indent: 1 }); f++
  esfRow(f, et('beneficiosNoCorriente'),   rv('beneficiosNoCorriente'),   { nota: 12, indent: 1 }); f++
  esfRow(f, et('otrosPasivosNoCorriente'), rv('otrosPasivosNoCorriente'), { nota: 12, indent: 1 }); f++

  esfRow(f, 'Total ',
    v(p => {
      const x = R(p)
      return x.financierosNoCorriente.valor + x.beneficiosNoCorriente.valor +
             x.otrosPasivosNoCorriente.valor
    }),
    { bold: true, fillArgb: C.AZUL_TOTAL }); f += 2

  esfRow(f, 'Total Pasivo',
    v(p => p.totalPasivo),
    { bold: true, fillArgb: C.AZUL_TOTAL }); f += 3

  // ══════════════════════════════════════════════════════════
  // PATRIMONIO
  // ══════════════════════════════════════════════════════════
  esfRow(f, 'PATRIMONIO', [], { bold: true, fillArgb: C.VERDE_HEADER }); f += 2

  esfRow(f, 'Capital Social',
    v(p => p.patrimonio.capitalSocial), { nota: 13, indent: 1 }); f++

  esfRow(f, 'Reserva Legal',
    v(p => p.patrimonio.reservas), { nota: 13, indent: 1 }); f++

  esfRow(f, 'Resultado Ejercicios Anteriores',
    v(p => p.patrimonio.resultadoEjercicioAnterior + p.patrimonio.resultadosAnteriores),
    { nota: 13, indent: 1 }); f++

  // Resultado derivado del balance → garantiza cuadre perfecto
  esfRow(f, 'Resultado Ejercicio',
    v(p => getResultadoBalance(p)), { nota: 13, indent: 1 }); f++

  // Total Patrimonio = Activo - Pasivo (siempre cuadra)
  esfRow(f, 'Total Patrimonio',
    v(p => p.totalActivo - p.totalPasivo),
    { bold: true, fillArgb: C.AZUL_TOTAL }); f += 2

  // Total Pasivo + Patrimonio = Total Activo (cuadre garantizado)
  esfRow(f, 'Total Pasivo + Patrimonio',
    v(p => p.totalActivo),
    { bold: true, fillArgb: C.AZUL_TOTAL }); f += 5

  // ── Firmas ────────────────────────────────────────────────
  ws.getCell(f, 2).value     = r.empresa
  ws.getCell(f + 1, 2).value = 'Representante Legal'
  ws.getCell(f, 6).value     = 'Contador Público'
  ws.getCell(f + 1, 6).value = 'T.P.'
}
// ─────────────────────────────────────────────────────────────
// HOJA 17 — ERI (Estado de Resultados Integrales)
// ─────────────────────────────────────────────────────────────
export function hojaERI(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('ERI')
  ws.showGridLines = false

  const N       = Math.min(r.periodos.length, 6)
  const periOrd = [...r.periodos].reverse().slice(0, N)
  const eriAcum = r.eriAcumulado[r.eriAcumulado.length - 1]
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()

  // ── Colores del real ──────────────────────────────────────
  const ROJO_ACT   = 'FF903032'  // año actual
  const DORADO_ANT = 'FFBF8F00'  // años anteriores
  const NAVY_VAR   = 'FF1F3864'  // VARIACION header
  const NEGRO      = 'FF000000'
  const BLANC      = 'FFFFFFFF'

  // ── Layout de columnas ────────────────────────────────────
  // A(1) spacer | B(2) descripciones | C(3) spacer | D(4) spacer
  // E(5) NOTA   | F(6) spacer
  // G(7) ACUMULADO | H(8)..H(8+N-1) meses individuales
  // luego spacer | ABSOLUTA | %
  const COL_ACUM = 7
  const COL_MES1 = 8
  const COL_ABS  = COL_MES1 + N + 1
  const COL_PCT  = COL_MES1 + N + 2
  const LAST     = COL_PCT

  // ── Anchos ────────────────────────────────────────────────
  ws.getColumn(1).width = 1.4
  ws.getColumn(2).width = 54
  ws.getColumn(3).width = 2
  ws.getColumn(4).width = 2
  ws.getColumn(5).width = 8
  ws.getColumn(6).width = 1.4
  ws.getColumn(7).width = 18      // ACUMULADO
  for (let i = 0; i < N; i++) ws.getColumn(COL_MES1 + i).width = 18
  ws.getColumn(COL_MES1 + N).width = 1.5   // spacer
  ws.getColumn(COL_ABS).width      = 16.0
  ws.getColumn(COL_PCT).width      = 7.0

  // ── Helpers locales ───────────────────────────────────────
  const sfill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

  const fnt = (bold = false, argb = NEGRO, sz = 9, italic = false): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', bold, italic, color: { argb }, size: sz })

  const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
  const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
  const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }

  const bThin: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: NEGRO } },
    bottom: { style: 'thin', color: { argb: NEGRO } },
    left:   { style: 'thin', color: { argb: NEGRO } },
    right:  { style: 'thin', color: { argb: NEGRO } },
  }

  const MESES_NOM: Record<number, string> = {
    1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',
    7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE',
  }

  // ── F2-6: títulos cursiva bold, centrados, merge ──────────
  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1)
    c.value = txt
    c.font  = fnt(true, NEGRO, sz, italic)
    c.alignment = alnC
  }
  setTit(2, r.empresa,                                    true, 11)
  setTit(3, `NIT. ${r.nit}`,                             true, 10)
  setTit(4, 'ESTADO DE RESULTADOS INTEGRALES',           true, 10)
  setTit(5, 'PARA LOS PERIODOS TERMINADOS',              true, 10)
  setTit(6, '(Cifra expresadas en pesos Colombianos)',   true,  9)

  // ── F8: fechas inicio + "VARIACION {MES}" a la derecha ───
  const mesNom = MESES_NOM[periOrd[0]?.mes ?? 1] ?? ''

  // ACUMULADO — fecha inicio
  const cA8 = ws.getCell(8, COL_ACUM)
  cA8.value = `01.01.${anioAct}`
  cA8.font  = fnt(true, BLANC, 8)
  cA8.fill  = sfill(ROJO_ACT)
  cA8.alignment = alnC
  cA8.border = bThin

  // Meses — fechas inicio (ROJO año actual, DORADO anteriores)
  periOrd.forEach((p, i) => {
    const col   = COL_MES1 + i
    const color = p.anio === anioAct ? ROJO_ACT : DORADO_ANT
    const c     = ws.getCell(8, col)
    c.value     = `01.${String(p.mes).padStart(2, '0')}.${p.anio}`
    c.font      = fnt(true, BLANC, 8)
    c.fill      = sfill(color)
    c.alignment = alnC
    c.border    = bThin
  })

  // "VARIACION {MES}" header (NAVY, merge sobre ABSOLUTA + %)
  ws.mergeCells(8, COL_ABS, 8, COL_PCT)
  const cVar8   = ws.getCell(8, COL_ABS)
  cVar8.value   = `VARIACION ${mesNom}`
  cVar8.font    = fnt(true, BLANC, 8)
  cVar8.fill    = sfill(NAVY_VAR)
  cVar8.alignment = alnC

  // ── F9: INGRESOS · NOTA · fechas fin · ABSOLUTA · % ──────
  // INGRESOS (verde)
  const cIngH   = ws.getCell(9, 2)
  cIngH.value   = 'INGRESOS'
  cIngH.font    = fnt(true, BLANC, 10)
  cIngH.fill    = sfill(C.VERDE_HEADER)
  cIngH.alignment = alnC

  // NOTA (verde)
  const cNotaH  = ws.getCell(9, 5)
  cNotaH.value  = 'NOTA'
  cNotaH.font   = fnt(true, BLANC, 9)
  cNotaH.fill   = sfill(C.VERDE_HEADER)
  cNotaH.alignment = alnC
  cNotaH.border = bThin

  // ACUMULADO — fecha fin
  const ultP  = periOrd[0]
  const cA9   = ws.getCell(9, COL_ACUM)
  cA9.value   = ultP ? fechaCorte(ultP.mes, ultP.anio) : '—'
  cA9.font    = fnt(true, BLANC, 8)
  cA9.fill    = sfill(ROJO_ACT)
  cA9.alignment = alnC
  cA9.border  = bThin

  // Meses — fechas fin
  periOrd.forEach((p, i) => {
    const col   = COL_MES1 + i
    const color = p.anio === anioAct ? ROJO_ACT : DORADO_ANT
    const c     = ws.getCell(9, col)
    c.value     = fechaCorte(p.mes, p.anio)
    c.font      = fnt(true, BLANC, 8)
    c.fill      = sfill(color)
    c.alignment = alnC
    c.border    = bThin
  })

  // ABSOLUTA (NAVY)
  const cAbsH   = ws.getCell(9, COL_ABS)
  cAbsH.value   = 'ABSOLUTA'
  cAbsH.font    = fnt(true, BLANC, 8)
  cAbsH.fill    = sfill(NAVY_VAR)
  cAbsH.alignment = alnC
  cAbsH.border  = bThin

  // % (NAVY)
  const cPctH   = ws.getCell(9, COL_PCT)
  cPctH.value   = '%'
  cPctH.font    = fnt(true, BLANC, 8)
  cPctH.fill    = sfill(NAVY_VAR)
  cPctH.alignment = alnC
  cPctH.border  = bThin

  // ── F10: "contable" bajo primera columna año anterior ─────
  const firstAntIdx = periOrd.findIndex(p => p.anio !== anioAct)
  if (firstAntIdx >= 0) {
    const cCont   = ws.getCell(10, COL_MES1 + firstAntIdx)
    cCont.value   = 'contable'
    cCont.font    = fnt(false, NEGRO, 8)
    cCont.alignment = alnC
  }

  ws.views = [{ state: 'frozen', xSplit: 6, ySplit: 10 }]

  // ── Alturas de cabecera ───────────────────────────────────
  ws.getRow(2).height = 15; ws.getRow(3).height = 15
  ws.getRow(4).height = 15; ws.getRow(5).height = 15; ws.getRow(6).height = 12
  ws.getRow(8).height = 18; ws.getRow(9).height = 18; ws.getRow(10).height = 13

  // ── Helper de fila ERI con bordes + variación ─────────────
  const eriRow = (
    rowN: number,
    label: string,
    acum: number,
    meses: number[],
    opts: { nota?: number; bold?: boolean; fillArgb?: string }
  ) => {
    const isGreenH  = opts.fillArgb === C.VERDE_HEADER
    const textColor = opts.fillArgb ? BLANC : NEGRO
    const fill      = opts.fillArgb ? sfill(opts.fillArgb) : undefined

    // Header verde extendido a todas las columnas
    if (isGreenH) {
      for (let c = 1; c <= LAST; c++) ws.getCell(rowN, c).fill = sfill(C.VERDE_HEADER)
    }

    // Descripción (col B)
    const cL  = ws.getCell(rowN, 2)
    cL.value  = label
    cL.font   = fnt(opts.bold ?? false, textColor, 9)
    cL.alignment = alnL
    if (!isGreenH) { if (fill) cL.fill = fill; cL.border = bThin }

    // NOTA (col E)
    if (opts.nota !== undefined) {
      const cn  = ws.getCell(rowN, 5)
      cn.value  = opts.nota
      cn.font   = { name: 'Arial', color: { argb: C.AZUL_LINK }, underline: true, size: 8 }
      cn.alignment = alnC
      cn.border = bThin
      if (fill) cn.fill = fill
    }

    // ACUMULADO (col G)
    const ca  = ws.getCell(rowN, COL_ACUM)
    ca.value  = acum
    ca.font   = fnt(opts.bold ?? false, textColor, 9)
    ca.alignment = alnR
    ca.numFmt = FMT_PESOS
    ca.border = bThin
    if (fill) ca.fill = fill

    // Meses individuales
    const ms = meses.slice(0, N)
    ms.forEach((mv, i) => {
      const cv  = ws.getCell(rowN, COL_MES1 + i)
      cv.value  = mv
      cv.font   = fnt(opts.bold ?? false, textColor, 9)
      cv.alignment = alnR
      cv.numFmt = FMT_PESOS
      cv.border = bThin
      if (fill) cv.fill = fill
    })

    // VARIACION (ABSOLUTA + %)
    if (!isGreenH && ms.length >= 1) {
      const m0   = ms[0] ?? 0
      const m1   = ms.length >= 2 ? (ms[1] ?? 0) : 0
      const absV = ms.length >= 2 ? m0 - m1 : null
      const pctV = (ms.length >= 2 && m1 !== 0) ? (m0 - m1) / Math.abs(m1) : null

      const cAbs    = ws.getCell(rowN, COL_ABS)
      cAbs.value    = absV
      cAbs.font     = fnt(opts.bold ?? false, textColor, 9)
      cAbs.alignment = alnR
      cAbs.numFmt   = FMT_PESOS
      cAbs.border   = bThin
      if (fill) cAbs.fill = fill

      const cPct    = ws.getCell(rowN, COL_PCT)
      cPct.value    = pctV
      cPct.font     = fnt(opts.bold ?? false, textColor, 9)
      cPct.alignment = alnR
      cPct.numFmt   = '0%'
      cPct.border   = bThin
      if (fill) cPct.fill = fill
    }
  }

  // ── DATOS — idénticos al original ─────────────────────────
  let f = 11

const ingOpMeses   = periOrd.map(p => p.eriMensual.ingresosOperacionales)
const ingNoOpMeses = periOrd.map(p => p.eriMensual.ingresosNoOperacionales)  // ← NEW
const ingTotalMeses = ingOpMeses.map((v, i) => v + ingNoOpMeses[i])           // ← NEW
const costoMeses   = periOrd.map(p => p.eriMensual.costoTotal)
const utilMeses    = ingOpMeses.map((v, i) => v - costoMeses[i])
const gOpMeses     = periOrd.map(p => p.eriMensual.gastosOperTotal)
const depMeses     = periOrd.map(p => p.eriMensual.depreciacion)
const ebitMeses    = utilMeses.map((v, i) => v - gOpMeses[i] + depMeses[i])
const ganOpMeses   = utilMeses.map((v, i) => v - gOpMeses[i])
const gNoOpMeses   = periOrd.map(p => p.eriMensual.gastosNoOp)
const resOpMeses   = ganOpMeses.map((v, i) => v + ingNoOpMeses[i] - gNoOpMeses[i])  // ← + ingNoOp
const provMeses    = resOpMeses.map(v => v > 0 ? v * 0.35 : 0)
const resNetMeses  = resOpMeses.map((v, i) => v - provMeses[i])

  eriRow(f, 'Actividades ordinarias', eriAcum?.ingresosOperacionales ?? 0, ingOpMeses, { nota: 13 }); f += 2
  eriRow(f, 'TOTAL INGRESOS POR ACTIVIDADES ORDINARIAS.', eriAcum?.ingresosTotal ?? 0, ingTotalMeses, { bold: true, fillArgb: C.AZUL_TOTAL }); f += 3
  eriRow(f, '(menos) Costo de ventas de bienes y prestación de servicios.', eriAcum?.costoTotal ?? 0, costoMeses, { nota: 14 }); f += 2
  eriRow(f, 'GANANCIA BRUTA DEL PERIODO.', eriAcum?.utilidadBruta ?? 0, utilMeses, { bold: true, fillArgb: C.AZUL_TOTAL }); f += 3
  eriRow(f, '(menos) Gastos efectivos de administración.', eriAcum?.gastosOperTotal ?? 0, gOpMeses, { nota: 15 }); f += 2
  eriRow(f, 'TOTAL GASTOS EFECTIVOS DE ADMINISTRACIÓN.', eriAcum?.gastosOperTotal ?? 0, gOpMeses, { bold: true, fillArgb: C.AZUL_TOTAL }); f += 2
  eriRow(f, 'EBITDA.', eriAcum?.ebitda ?? 0, ebitMeses, { bold: true, fillArgb: C.AZUL_TOTAL }); f += 3
  eriRow(f, '(menos) Depreciaciones.', eriAcum?.depreciacion ?? 0, depMeses, { nota: 15 }); f += 2
  eriRow(f, 'GANANCIA OPERACIONAL.', (eriAcum?.utilidadBruta ?? 0) - (eriAcum?.gastosOperTotal ?? 0), ganOpMeses, { bold: true, fillArgb: C.AZUL_TOTAL }); f += 3
  eriRow(f, '(menos) Gastos Financieros.', eriAcum?.gastosNoOp ?? 0, gNoOpMeses, { nota: 16 }); f += 2
  eriRow(f, 'RESULTADO OPERACIÓN CONTABLE', eriAcum?.resultadoAnteImpuesto ?? 0, resOpMeses, { bold: true, fillArgb: C.AZUL_TOTAL }); f += 3
  eriRow(f, 'RESULTADO ANTES DE IMPUESTO', eriAcum?.resultadoAnteImpuesto ?? 0, resOpMeses, { bold: true, fillArgb: C.AZUL_TOTAL }); f += 2
  eriRow(f, '(menos) Impuesto de Renta (35%)', eriAcum?.provisionRenta ?? 0, provMeses, {}); f += 2
  eriRow(f, 'RESULTADO INTEGRAL TOTAL DEL PERIODO', eriAcum?.resultadoNeto ?? 0, resNetMeses, { bold: true, fillArgb: C.AZUL_TOTAL }); f += 4
  // ── Firmas ────────────────────────────────────────────────
  ws.getCell(f, 2).value     = r.empresa
  ws.getCell(f + 1, 2).value = 'Representante Legal'
  ws.getCell(f, 7).value     = 'Contador Público'
  ws.getCell(f + 1, 7).value = 'T.P.'
}
// ══════════════════════════════════════════════════════════════
// GENERADOR — reemplazar función hojaRENTA completa
// ══════════════════════════════════════════════════════════════
export function hojaRENTA(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('RENTA')
  ws.showGridLines = false

  const NARANJA    = 'FFE26B0A'
  const VERDE_OSC  = 'FF375623'
  const VERDE_MED  = 'FF548235'
  const AMARILLO   = 'FFFFF2CC'
  const ORO        = 'FFFFC000'
  const NEGRO      = 'FF000000'
  const BLANC      = 'FFFFFFFF'
  const GRIS_CLARO = 'FFF2F2F2'

  const fill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, color = NEGRO, size = 10): Partial<ExcelJS.Font> =>
    ({ name: 'Calibri', bold, color: { argb: color }, size })
  const aln = (h: 'left'|'center'|'right', wrap = false): Partial<ExcelJS.Alignment> =>
    ({ horizontal: h, vertical: 'middle', wrapText: wrap })
  const alnRot = (): Partial<ExcelJS.Alignment> =>
    ({ horizontal: 'center', vertical: 'middle', textRotation: 90 })

  const bThin: Partial<ExcelJS.Borders> = {
    top: { style:'thin', color:{argb:NEGRO} }, bottom: { style:'thin', color:{argb:NEGRO} },
    left: { style:'thin', color:{argb:NEGRO} }, right: { style:'thin', color:{argb:NEGRO} },
  }
  const bMed: Partial<ExcelJS.Borders> = {
    top: { style:'medium', color:{argb:NEGRO} }, bottom: { style:'medium', color:{argb:NEGRO} },
    left: { style:'medium', color:{argb:NEGRO} }, right: { style:'medium', color:{argb:NEGRO} },
  }

  const nf = '#,##0;(#,##0);"-"'

  // ── Períodos por año ──────────────────────────────────────
  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const porAnio = new Map<number, PeriodoCalculado>()
  for (const p of r.periodos) {
    const prev = porAnio.get(p.anio)
    if (!prev || p.mes > prev.mes) porAnio.set(p.anio, p)
  }
  const anios = [...porAnio.keys()].sort((a,b) => b - a)
  const ultP = porAnio.get(anioAct)!
  const eriAcum = r.eriAcumulado[r.eriAcumulado.length - 1]

  // ── Anchos ───────────────────────────────────────────────
  ws.getColumn(1).width = 4.5
  ws.getColumn(2).width = 4.5
  ws.getColumn(3).width = 38
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 14
  ws.getColumn(6).width = 1.5
  for (let i = 0; i < 5; i++) ws.getColumn(7+i).width = 14
  ws.getColumn(12).width = 1.71

  // ── F2-5: títulos centrados (cols 1-11) ──────────────────
  const setTit = (rowN: number, txt: string, size = 10, bold = true) => {
    ws.mergeCells(rowN, 1, rowN, 11)
    const c = ws.getCell(rowN, 1)
    c.value = txt; c.font = fnt(bold, NEGRO, size); c.alignment = aln('center')
  }
  setTit(2, r.empresa, 11, true)
  setTit(3, `NIT. ${r.nit}`, 10, false)
  setTit(4, 'COMPARATIVO RENTA', 11, true)
  setTit(5, '(Cifra expresadas en pesos Colombianos)', 9, false)

  // ── F6: AÑO GRAVABLE | año actual | años anteriores ───────
  // NOTA: NO hacer mergeCells en filas 6-7 cols 1-2 antes del bloque de headers
  ws.mergeCells(6, 1, 6, 3)
  const h6 = ws.getCell(6, 1)
  h6.value = 'AÑO GRAVABLE'; h6.font = fnt(true, BLANC, 10)
  h6.fill = fill(NARANJA); h6.alignment = aln('center'); h6.border = bThin

  ws.mergeCells(6, 4, 6, 5)
  const h6y = ws.getCell(6, 4)
  h6y.value = anioAct; h6y.font = fnt(true, BLANC, 10)
  h6y.fill = fill(NARANJA); h6y.alignment = aln('center'); h6y.border = bThin

  const prevAnios = anios.filter(a => a !== anioAct)
  for (let i = 0; i < Math.min(prevAnios.length, 5); i++) {
    const c = ws.getCell(6, 7 + i)
    c.value = prevAnios[i]; c.font = fnt(true, BLANC, 10)
    c.fill = fill(NARANJA); c.alignment = aln('center'); c.border = bThin
  }

  // ── F7: NOMBRE O CONCEPTO | FISCAL | CONTABLE | PRESENTADA ─
  ws.mergeCells(7, 1, 7, 3)
  const h7 = ws.getCell(7, 1)
  h7.value = 'NOMBRE O CONCEPTO'; h7.font = fnt(true, BLANC, 9)
  h7.fill = fill(NARANJA); h7.alignment = aln('center'); h7.border = bThin

  const h7f = ws.getCell(7, 4)
  h7f.value = 'FISCAL'; h7f.font = fnt(true, BLANC, 9)
  h7f.fill = fill(NARANJA); h7f.alignment = aln('center'); h7f.border = bThin

  const h7c = ws.getCell(7, 5)
  h7c.value = 'CONTABLE'; h7c.font = fnt(true, BLANC, 9)
  h7c.fill = fill(NARANJA); h7c.alignment = aln('center'); h7c.border = bThin

  for (let i = 0; i < Math.min(prevAnios.length, 5); i++) {
    const c = ws.getCell(7, 7 + i)
    c.value = 'PRESENTADA'; c.font = fnt(true, BLANC, 9)
    c.fill = fill(NARANJA); c.alignment = aln('center'); c.border = bThin
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  // ── Helpers ───────────────────────────────────────────────
  let f = 8

  const valAnio = (anio: number, fn: (p: PeriodoCalculado) => number): number => {
    const p = porAnio.get(anio); return p ? fn(p) : 0
  }
  const eriAnio = (anio: number, fn: (e: EriAcumulado) => number): number => {
    const eriForAnio = r.eriAcumulado.filter((_, i) => r.periodos[i]?.anio === anio)
    const last = eriForAnio[eriForAnio.length - 1]
    return last ? fn(last) : 0
  }

  const writeDataRow = (
    label: string,
    valContable: number,
    prevVals: number[],
    opts: { bold?: boolean; bg?: string }
  ) => {
    const cL = ws.getCell(f, 3)
    cL.value = label; cL.font = fnt(opts.bold ?? false, NEGRO, 9)
    if (opts.bg) cL.fill = fill(opts.bg)
    cL.alignment = aln('left'); cL.border = bThin

    const cF = ws.getCell(f, 4)
    cF.value = valContable || null; cF.font = fnt(opts.bold ?? false, NEGRO, 9)
    if (opts.bg) cF.fill = fill(opts.bg)
    cF.alignment = aln('right'); cF.numFmt = nf; cF.border = bThin

    const cC = ws.getCell(f, 5)
    cC.value = valContable || null; cC.font = fnt(opts.bold ?? false, NEGRO, 9)
    if (opts.bg) cC.fill = fill(opts.bg)
    cC.alignment = aln('right'); cC.numFmt = nf; cC.border = bThin

    ws.getCell(f, 6).value = null

    for (let i = 0; i < 5; i++) {
      const c = ws.getCell(f, 7 + i)
      c.value = prevVals[i] || null; c.font = fnt(opts.bold ?? false, NEGRO, 9)
      if (opts.bg) c.fill = fill(opts.bg)
      c.alignment = aln('right'); c.numFmt = nf; c.border = bThin
    }
  }

  const writeTotal = (label: string, valContable: number, prevVals: number[], bgColor: string) => {
    ws.mergeCells(f, 1, f, 3)
    const cL = ws.getCell(f, 1)
    cL.value = label; cL.font = fnt(true, BLANC, 9)
    cL.fill = fill(bgColor); cL.alignment = aln('center'); cL.border = bMed

    const cF = ws.getCell(f, 4)
    cF.value = valContable || null; cF.font = fnt(true, BLANC, 9); cF.fill = fill(bgColor)
    cF.alignment = aln('right'); cF.numFmt = nf; cF.border = bMed

    const cC = ws.getCell(f, 5)
    cC.value = valContable || null; cC.font = fnt(true, BLANC, 9); cC.fill = fill(bgColor)
    cC.alignment = aln('right'); cC.numFmt = nf; cC.border = bMed

    for (let i = 0; i < 5; i++) {
      const c = ws.getCell(f, 7 + i)
      c.value = prevVals[i] || null; c.font = fnt(true, BLANC, 9); c.fill = fill(bgColor)
      c.alignment = aln('right'); c.numFmt = nf; c.border = bMed
    }
  }

  const setGroupLabel = (rowStart: number, rowEnd: number, label: string) => {
    try {
      if (rowEnd > rowStart) ws.mergeCells(rowStart, 1, rowEnd, 2)
      else ws.mergeCells(rowStart, 1, rowStart, 2)
    } catch (_) { /* ignorar si ya está mergeado */ }
    const c = ws.getCell(rowStart, 1)
    c.value = label; c.font = fnt(true, NEGRO, 8)
    c.alignment = alnRot(); c.border = bThin
    c.fill = fill(GRIS_CLARO)
  }

  const writeSubTotal = (label: string, val: number, prevVals: number[]) => {
    const cL = ws.getCell(f, 3)
    cL.value = label; cL.font = fnt(true, NEGRO, 9)
    cL.fill = fill(GRIS_CLARO); cL.alignment = aln('left'); cL.border = bThin

    const cF = ws.getCell(f, 4)
    cF.value = val || null; cF.font = fnt(true, NEGRO, 9)
    cF.fill = fill(GRIS_CLARO); cF.alignment = aln('right'); cF.numFmt = nf; cF.border = bThin

    const cC = ws.getCell(f, 5)
    cC.value = val || null; cC.font = fnt(true, NEGRO, 9)
    cC.fill = fill(GRIS_CLARO); cC.alignment = aln('right'); cC.numFmt = nf; cC.border = bThin

    for (let i = 0; i < 5; i++) {
      const c = ws.getCell(f, 7 + i)
      c.value = prevVals[i] || null; c.font = fnt(true, NEGRO, 9); c.fill = fill(GRIS_CLARO)
      c.alignment = aln('right'); c.numFmt = nf; c.border = bThin
    }
  }

  const emptyAB = (row: number) => {
    try { ws.mergeCells(row, 1, row, 2) } catch (_) { /* ignorar */ }
    ws.getCell(row, 1).border = bThin
  }

  const pv = (fn: (p: PeriodoCalculado) => number) =>
    prevAnios.slice(0, 5).map(a => valAnio(a, fn))
  const pve = (fn: (e: EriAcumulado) => number) =>
    prevAnios.slice(0, 5).map(a => eriAnio(a, fn))

  // ════════════════════════════════════════════════════════════
  // ACTIVOS
  // ════════════════════════════════════════════════════════════

  // CAJA Y BANCO
  const cajaStart = f
  emptyAB(f)
  writeDataRow('Caja', valAnio(anioAct, p => p.activoCorriente.cajaTotal),
    pv(p => p.activoCorriente.cajaTotal), {})
  f++
  for (const banco of (ultP?.activoCorriente.bancos ?? [])) {
    emptyAB(f)
    writeDataRow(banco.nombre, banco.totalSaldoFinal,
      prevAnios.slice(0,5).map(a => valAnio(a, p => p.activoCorriente.bancos.find(b=>b.nombre===banco.nombre)?.totalSaldoFinal ?? 0)),
      {})
    f++
  }
  writeSubTotal('Sub- Total', valAnio(anioAct, p => p.activoCorriente.efectivoTotal),
    pv(p => p.activoCorriente.efectivoTotal))
  setGroupLabel(cajaStart, f, 'CAJA Y BANCO')
  f++; f++

  // INVERSIONES
  const invStart = f
  for (const inv of (ultP?.activoCorriente.inversionesDetalle ?? [])) {
    emptyAB(f)
    writeDataRow(inv.nombre, inv.valor,
      prevAnios.slice(0,5).map(a => valAnio(a, p => p.activoCorriente.inversionesDetalle.find(x=>x.codigo===inv.codigo)?.valor ?? 0)),
      {})
    f++
  }
  writeSubTotal('Sub- Total', valAnio(anioAct, p => p.activoCorriente.inversionesTotal),
    pv(p => p.activoCorriente.inversionesTotal))
  if (invStart < f) setGroupLabel(invStart, f, 'INVERSIONES')
  f++; f++

  // CxC
  const cxcStart = f
 emptyAB(f)
writeDataRow('CxC', valAnio(anioAct, p => p.activoCorriente.clientesTotal + p.activoCorriente.anticiposTotal),
    pv(p => p.activoCorriente.clientesTotal + p.activoCorriente.anticiposTotal), {})
f++
writeSubTotal('Sub- Total', valAnio(anioAct, p => p.activoCorriente.clientesTotal + p.activoCorriente.anticiposTotal),
    pv(p => p.activoCorriente.clientesTotal + p.activoCorriente.anticiposTotal))
  setGroupLabel(cxcStart, f, 'CxC')
  f++; f++

  // INVENTARIO
  const invtStart = f
  for (const item of (ultP?.activoCorriente.inventarioDetalle ?? [])) {
    emptyAB(f)
    writeDataRow(item.nombre, item.valor,
      prevAnios.slice(0,5).map(a => valAnio(a, p => p.activoCorriente.inventarioDetalle.find(x=>x.codigo===item.codigo)?.valor ?? 0)),
      {})
    f++
  }
  if ((ultP?.activoCorriente.inventarioDetalle.length ?? 0) === 0) {
    emptyAB(f)
    writeDataRow('Inventario', valAnio(anioAct, p => p.activoCorriente.inventarioTotal),
      pv(p => p.activoCorriente.inventarioTotal), {})
    f++
  }
  writeSubTotal('Sub- Total', valAnio(anioAct, p => p.activoCorriente.inventarioTotal),
    pv(p => p.activoCorriente.inventarioTotal))
  if (invtStart < f) setGroupLabel(invtStart, f, 'INVENTARIO')
  f++; f++

  // ACTIVOS FIJOS
  const afStart = f
  for (const item of (ultP?.activoNoCorriente.detallePPyE ?? [])) {
    emptyAB(f)
    writeDataRow(item.nombre, item.valor,
      prevAnios.slice(0,5).map(a => valAnio(a, p => p.activoNoCorriente.detallePPyE.find(x=>x.codigo===item.codigo)?.valor ?? 0)),
      {})
    f++
  }
  emptyAB(f)
  writeDataRow('Depreciacion acumulada',
    valAnio(anioAct, p => p.activoNoCorriente.depreciacionAcumulada),
    pv(p => p.activoNoCorriente.depreciacionAcumulada), {})
  f++
  writeSubTotal('Sub- Total', valAnio(anioAct, p => p.activoNoCorriente.ppyeNeto),
    pv(p => p.activoNoCorriente.ppyeNeto))
  setGroupLabel(afStart, f, 'ACTIVOS FIJOS')
  f++; f++

  // OTROS ACTIVOS
  const otrosStart = f
  const items135 = [
    { label:'Retención en la fuente',     fn:(p:PeriodoCalculado)=>p.activoCorriente.anticReteFuente },
    { label:'Industria y Comercio',        fn:(p:PeriodoCalculado)=>p.activoCorriente.anticICA },
    { label:'Anticipo impuesto de renta',  fn:(p:PeriodoCalculado)=>p.activoCorriente.anticRenta },
    { label:'Autorrenta',                  fn:(p:PeriodoCalculado)=>p.activoCorriente.anticOtros },
  ]
  for (const it of items135) {
    emptyAB(f)
    writeDataRow(it.label, valAnio(anioAct, it.fn), pv(it.fn), {})
    f++
  }
  writeSubTotal('Sub- Total', valAnio(anioAct, p => p.activoCorriente.anticipoImpuestosTotal),
    pv(p => p.activoCorriente.anticipoImpuestosTotal))
  setGroupLabel(otrosStart, f, 'OTROS ACTIVOS')
  f++; f++

  writeTotal('TOTAL ACTIVOS', valAnio(anioAct, p => p.totalActivo),
    pv(p => p.totalActivo), NARANJA)
  f++; f++

  // ════════════════════════════════════════════════════════════
  // PASIVOS
  // ════════════════════════════════════════════════════════════
  const pasStart = f
  const pasItems = [
    { label:'Proveedores',                     fn:(p:PeriodoCalculado)=>p.pasivoCorriente.proveedoresTotal },
    { label:'Costos y gastos por pagar',       fn:(p:PeriodoCalculado)=>p.pasivoCorriente.costosGastosPagar },
    { label:'Obligaciones financieras',        fn:(p:PeriodoCalculado)=>p.pasivoCorriente.obligFinCorrTotal + p.pasivoNoCorriente.obligFinNCTotal },
    { label:'Retenciones y aportes de nómina', fn:(p:PeriodoCalculado)=>p.pasivoCorriente.aporteNomina },
    { label:'Impuesto industria y Comercio',   fn:(p:PeriodoCalculado)=>p.pasivoCorriente.icaTotal },
    { label:'Ica y retención de ica',          fn:(p:PeriodoCalculado)=>p.pasivoCorriente.icaRetenido },
    { label:'Impuesto de renta y complement.', fn:(p:PeriodoCalculado)=>p.pasivoCorriente.impuestosRenta },
    { label:'Retención en la fuente',          fn:(p:PeriodoCalculado)=>p.pasivoCorriente.reteTotal },
    { label:'Acreedores varios',               fn:(p:PeriodoCalculado)=>p.pasivoCorriente.acreedoresVariosTotal },
    { label:'Pasivos por beneficios a empl.',  fn:(p:PeriodoCalculado)=>{
    const g2510 = (p.pasivoCorriente.beneficiosDetalle ?? []).filter((x:any)=>x.codigo.startsWith('2510')).reduce((s:number,x:any)=>s+x.valor,0)
    return p.pasivoCorriente.beneficiosCorrTotal + p.pasivoNoCorriente.provisionLaboralTotal - g2510
  }},
    { label:'Otros pasivos',                   fn:(p:PeriodoCalculado)=>p.pasivoCorriente.otrosPasivosCorrTotal + p.pasivoNoCorriente.otrosPasivosNCTotal },
  ]
  for (const it of pasItems) {
    emptyAB(f)
    writeDataRow(it.label, valAnio(anioAct, it.fn), pv(it.fn), {})
    f++
  }
  writeSubTotal('Sub- Total Pasivos', valAnio(anioAct, p => p.totalPasivo),
    pv(p => p.totalPasivo))
  setGroupLabel(pasStart, f, 'PASIVOS')
  f++; f++

  writeTotal('TOTAL PATRIMONIO LIQUIDO', valAnio(anioAct, p => p.patrimonio.totalPatrimonio),
    pv(p => p.patrimonio.totalPatrimonio), VERDE_OSC)
  f++; f++

  // ════════════════════════════════════════════════════════════
  // INGRESOS
  // ════════════════════════════════════════════════════════════
  const ingStart = f
  for (const it of [
    { label:'Ingresos brutos por actividad', fn:(e:EriAcumulado)=>e.ingresosOperacionales },
    { label:'Ingresos financieros',           fn:(e:EriAcumulado)=>e.ingresosNoOperacionales },
  ]) {
    emptyAB(f)
    writeDataRow(it.label, eriAcum ? it.fn(eriAcum) : 0, pve(it.fn), {})
    f++
  }
  writeTotal('TOTAL INGRESOS', eriAcum ? eriAcum.ingresosTotal : 0,
    pve(e => e.ingresosTotal), VERDE_MED)
  setGroupLabel(ingStart, f-1, 'INGRESOS')
  f++; f++

  // ════════════════════════════════════════════════════════════
  // COSTOS Y DEDUCCIONES
  // ════════════════════════════════════════════════════════════
  const cosStart = f
  for (const it of [
    { label:'Costos',                fn:(e:EriAcumulado)=>e.costoTotal },
    { label:'Gastos Administración',  fn:(e:EriAcumulado)=>e.gastosOperTotal },
    { label:'Gastos Financieros',     fn:(e:EriAcumulado)=>e.gastosNoOp },
  ]) {
    emptyAB(f)
    writeDataRow(it.label, eriAcum ? it.fn(eriAcum) : 0, pve(it.fn), {})
    f++
  }
  emptyAB(f)
  writeDataRow('Ajuste de Inventario', 0, prevAnios.slice(0,5).map(()=>0), {})
  f++
  emptyAB(f)
  writeDataRow('Otros Gastos', 0, prevAnios.slice(0,5).map(()=>0), {})
  f++

  const totalGastos = eriAcum ? (eriAcum.costoTotal + eriAcum.gastosOperTotal + eriAcum.gastosNoOp) : 0
  writeTotal('TOTAL GASTOS', totalGastos,
    pve(e => e.costoTotal + e.gastosOperTotal + e.gastosNoOp), VERDE_MED)
  setGroupLabel(cosStart, f-1, 'COSTOS Y DEDUCCIONES')
  f++; f++

  writeTotal('RENTA LIQUIDA', eriAcum ? eriAcum.resultadoAnteImpuesto : 0,
    pve(e => e.resultadoAnteImpuesto), VERDE_OSC)
  f++; f++

  // ════════════════════════════════════════════════════════════
  // LIQUIDACION PRIVADA
  // ════════════════════════════════════════════════════════════
  const liqItems: Array<{
    label: string
    fn?: (e: EriAcumulado) => number
    fnP2?: (p: PeriodoCalculado) => number
  }> = [
    { label:'Total impuesto a cargo',      fn:(e)=>e.provisionRenta },
    { label:'Descuentos tributarios' },
    { label:'Anticipo renta año anterior', fnP2:(p)=>p.activoCorriente.anticRenta },
    { label:'Retención y Autorrenta',      fnP2:(p)=>p.activoCorriente.anticReteFuente + p.pasivoCorriente.autoretenciones },
    { label:'Anticipo renta año siguiente' },
    { label:'Saldo a favor' },
  ]

  for (const it of liqItems) {
    try { ws.mergeCells(f, 1, f, 2) } catch (_) { /* ignorar */ }
    ws.getCell(f, 1).fill = fill(AMARILLO); ws.getCell(f, 1).border = bThin

    const cL = ws.getCell(f, 3)
    cL.value = it.label; cL.font = fnt(false, NEGRO, 9)
    cL.fill = fill(AMARILLO); cL.alignment = aln('left'); cL.border = bThin

    let valCont = 0
    if (it.fn) valCont = eriAcum ? it.fn(eriAcum) : 0
    else if (it.fnP2) valCont = valAnio(anioAct, it.fnP2)

    const cF = ws.getCell(f, 4)
    cF.value = valCont || null; cF.font = fnt(false, NEGRO, 9)
    cF.fill = fill(AMARILLO); cF.alignment = aln('right'); cF.numFmt = nf; cF.border = bThin

    const cC = ws.getCell(f, 5)
    cC.value = valCont || null; cC.font = fnt(false, NEGRO, 9)
    cC.fill = fill(AMARILLO); cC.alignment = aln('right'); cC.numFmt = nf; cC.border = bThin

    for (let i = 0; i < 5; i++) {
      const c = ws.getCell(f, 7+i)
      let vPrev = 0
      if (it.fn) vPrev = eriAnio(prevAnios[i] ?? 0, it.fn)
      else if (it.fnP2) vPrev = prevAnios[i] ? valAnio(prevAnios[i], it.fnP2) : 0
      c.value = vPrev || null; c.font = fnt(false, NEGRO, 9)
      c.fill = fill(AMARILLO); c.alignment = aln('right'); c.numFmt = nf; c.border = bThin
    }
    f++
  }
  f++

  // TOTAL A PAGAR
  const totalPagar = eriAcum
    ? eriAcum.provisionRenta
      - valAnio(anioAct, p => p.activoCorriente.anticRenta)
      - valAnio(anioAct, p => p.activoCorriente.anticReteFuente + p.pasivoCorriente.autoretenciones)
    : 0
  writeTotal('TOTAL A PAGAR', totalPagar,
    prevAnios.slice(0,5).map(a => {
      const p = porAnio.get(a); if (!p) return 0
      const e = r.eriAcumulado.find((_,i) => r.periodos[i]?.anio===a && r.periodos[i]?.mes===p.mes)
      return e ? e.provisionRenta - p.activoCorriente.anticRenta - p.activoCorriente.anticReteFuente : 0
    }), ORO)
  f++; f++

  // FECHAS
  const writeFecha = (label: string) => {
    try { ws.mergeCells(f, 1, f, 3) } catch (_) { /* ignorar */ }
    const cL = ws.getCell(f, 1)
    cL.value = label; cL.font = fnt(true, NEGRO, 9); cL.border = bThin
    for (let i = 4; i <= 11; i++) ws.getCell(f, i).border = bThin
    f++
  }
  writeFecha('FECHA DE PRESENTACION DE DECLARACION')
  writeFecha('FECHA FIRMEZA - BENEFICIO AUDITORIA')
  writeFecha('FECHA FIRMEZA')
  f++

  // BENEFICIO DE AUDITORIA
  try { ws.mergeCells(f, 4, f, 5) } catch (_) { /* ignorar */ }
  const cBen = ws.getCell(f, 4)
  cBen.value = 'Beneficio de Auditoria'
  cBen.font = fnt(true, NEGRO, 9)
  cBen.fill = fill('FFFFFF00')
  cBen.alignment = aln('left')
  cBen.border = bThin

  // Alturas
  ws.getRow(2).height = 15; ws.getRow(3).height = 14
  ws.getRow(4).height = 15; ws.getRow(5).height = 12
  ws.getRow(6).height = 15; ws.getRow(7).height = 15
}



// ══════════════════════════════════════════════════════════════
// HOJA INDICADORES — basada en el real ESF_MARZO_2026
// ══════════════════════════════════════════════════════════════
//
// SECCIONES:
//   1. INDICE DE LIQUIDEZ          — Activo Cte / Pasivo Cte
//   2. INDICE DE ENDEUDAMIENTO     — Pasivo Total / Activo Total
//   3. RENTABILIDAD DE PATRIMONIO  — Utilidad Op / Patrimonio
//   4. RENTABILIDAD DEL ACTIVO     — Utilidad Op / Activo Total
//   5. CAPITAL DE TRABAJO          — Activo Cte - Pasivo Cte
//   6. CAPITAL DE PATRIMONIO       — Activo Total - Pasivo Total
//   7. ROTACION DE INVENTARIOS     — Costo Ventas / Inv Promedio
//   8. ROTACION DE INVENTARIOS (DIAS) — 365 / Rotacion
//   9. MARGEN DE SOLVENCIA         — Activo Total / Pasivo Total
//  10. EBITDA                      — (util+int+imp+dep) / Ventas
//
// LAYOUT DE COLUMNAS (por período):
//   col_val  : valor fracción (numerador/denominador, ancho 16)
//   col_eq   : "=" sign (ancho 3)
//   col_res  : resultado (ancho 10)
//   col_sep  : separador (ancho 1.5)
//
// COLORES PERÍODO:
//   ROJO   FF903032 → año actual (igual a otros sheets)
//   DORADO FFC08000 → año(s) anterior(es) — FISCAL y CONTABLE
//   NAVY   FF1F3864 → headers de sección
// ══════════════════════════════════════════════════════════════

export function hojaINDICADORES(wb: ExcelJS.Workbook, r: ResultadoMotor) {
  const ws = wb.addWorksheet('INDICADORES')
  ws.showGridLines = false

  // ── Colores ────────────────────────────────────────────────
  const NAVY   = 'FF1F3864'
  const ROJO   = 'FF903032'   // año actual
  const NEGRO  = 'FF000000'
  const BLANC  = 'FFFFFFFF'

  // Colores por tier de año anterior (FISCAL, CONTABLE, y más viejos)
  const ANT_COLORS = [
    'FFC08000',  // 0: FISCAL    → dorado
    'FFBF8F00',  // 1: CONTABLE  → dorado oscuro
    'FF2F75B6',  // 2: DIC-N-2   → azul
    'FF70AD47',  // 3: DIC-N-3   → verde
    'FFC55A11',  // 4: DIC-N-4   → naranja
  ]

  // ── Helpers ───────────────────────────────────────────────
  const sfill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt = (bold = false, argb = NEGRO, sz = 9, ul = false): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', bold, color: { argb }, size: sz, underline: ul ? 'single' as const : undefined })
  const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
  const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
  const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
  const bThin: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: NEGRO } },
    bottom: { style: 'thin', color: { argb: NEGRO } },
    left:   { style: 'thin', color: { argb: NEGRO } },
    right:  { style: 'thin', color: { argb: NEGRO } },
  }

  const MESES_CORTO: Record<number, string> = {
    1:'ENE',2:'FEB',3:'MAR',4:'ABR',5:'MAY',6:'JUN',
    7:'JUL',8:'AGO',9:'SEP',10:'OCT',11:'NOV',12:'DIC',
  }

  // ── Períodos ──────────────────────────────────────────────
  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct  = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt  = periOrd.filter(p => p.anio !== anioAct).slice(0, 5)  // hasta 5 históricos
  const allGrps = [...grpAct, ...grpAnt]
  const N       = allGrps.length

  // ── Layout de columnas ────────────────────────────────────
  const COL_DESC  = 2
  const COL_FIRST = 4
  const STRIDE    = 4
  const colVal = (i: number) => COL_FIRST + i * STRIDE
  const colEq  = (i: number) => COL_FIRST + i * STRIDE + 1
  const colRes = (i: number) => COL_FIRST + i * STRIDE + 2
  const lastCol = colRes(N - 1)

  // ── Anchos ────────────────────────────────────────────────
  ws.getColumn(1).width = 1.5
  ws.getColumn(2).width = 35
  ws.getColumn(3).width = 1.5
  for (let i = 0; i < N; i++) {
    ws.getColumn(colVal(i)).width     = 16
    ws.getColumn(colEq(i)).width      = 3
    ws.getColumn(colRes(i)).width     = 10
    ws.getColumn(colRes(i) + 1).width = 1.5
  }

  // ── F2: banner INDICADORES ────────────────────────────────
  try { ws.mergeCells(2, 1, 2, lastCol) } catch {}
  const cTit    = ws.getCell(2, 1)
  cTit.value    = 'INDICADORES'
  cTit.font     = { name: 'Arial', bold: true, color: { argb: BLANC }, size: 14 }
  cTit.fill     = sfill(NAVY)
  cTit.alignment = alnC
  ws.getRow(2).height = 22

  // ── F3: empresa + NIT ─────────────────────────────────────
  try { ws.mergeCells(3, COL_DESC, 3, lastCol) } catch {}
  const c3      = ws.getCell(3, COL_DESC)
  c3.value      = `${r.empresa}   NIT. ${r.nit}`
  c3.font       = fnt(true, NEGRO, 10)
  c3.alignment  = alnC
  ws.getRow(3).height = 14

  // ── F4: labels de período con color por tier ──────────────
  ws.getRow(4).height = 16
  for (let i = 0; i < N; i++) {
    const p      = allGrps[i]
    const isAnt  = p.anio !== anioAct
    const antIdx = i - grpAct.length
    const color  = isAnt
      ? (ANT_COLORS[antIdx] ?? ANT_COLORS[ANT_COLORS.length - 1])
      : ROJO

    try { ws.mergeCells(4, colVal(i), 4, colRes(i)) } catch {}
    const c4      = ws.getCell(4, colVal(i))
    // Año actual → "MAR-2026" | FISCAL/CONTABLE | DIC-año para más viejos
    c4.value      = !isAnt
      ? `${MESES_CORTO[p.mes]}-${p.anio}`
      : antIdx < 2
        ? ['FISCAL', 'CONTABLE'][antIdx]
        : `${MESES_CORTO[p.mes]}-${p.anio}`
    c4.font       = fnt(true, BLANC, 9)
    c4.fill       = sfill(color)
    c4.alignment  = alnC
  }

  // ── F5: sub-label fecha para FISCAL y CONTABLE ────────────
  ws.getRow(5).height = 13
  for (let i = grpAct.length; i < N; i++) {
    const antIdx = i - grpAct.length
    if (antIdx >= 2) continue   // solo para FISCAL y CONTABLE
    const p      = allGrps[i]
    const color  = ANT_COLORS[antIdx]
    try { ws.mergeCells(5, colVal(i), 5, colRes(i)) } catch {}
    const c5      = ws.getCell(5, colVal(i))
    c5.value      = `${MESES_CORTO[p.mes]}-${p.anio}`
    c5.font       = fnt(true, BLANC, 8)
    c5.fill       = sfill(color)
    c5.alignment  = alnC
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 5 }]
  

  // ── Helpers de datos ──────────────────────────────────────
  const getEri = (p: PeriodoCalculado): EriAcumulado | null => {
    const idx = r.periodos.findIndex(x => x.mes === p.mes && x.anio === p.anio)
    return idx >= 0 && idx < r.eriAcumulado.length ? r.eriAcumulado[idx] : null
  }
  const gananciaOp = (eri: EriAcumulado | null): number =>
    eri ? (eri.ingresosOperacionales ?? 0) - (eri.costoTotal ?? 0) - (eri.gastosOperTotal ?? 0) : 0
  const invPromedio = (p: PeriodoCalculado): number => {
    const idx = r.periodos.findIndex(x => x.mes === p.mes && x.anio === p.anio)
    if (idx <= 0) return p.activoCorriente.inventarioTotal
    return (p.activoCorriente.inventarioTotal + r.periodos[idx - 1].activoCorriente.inventarioTotal) / 2
  }

  let f = 6

  // ── writeSection: header navy ─────────────────────────────
  const writeSection = (label: string) => {
    try { ws.mergeCells(f, COL_DESC, f, lastCol) } catch {}
    const c     = ws.getCell(f, COL_DESC)
    c.value     = ` ${label}`
    c.font      = fnt(true, BLANC, 9, true)   // bold + underline
    c.fill      = sfill(NAVY)
    c.alignment = alnL
    ws.getRow(f).height = 16
    f += 2
  }

  // ── writeFraction: fracción num/den con resultado ─────────
  const writeFraction = (
    labelNum: string,
    labelDen: string,
    getNum: (p: PeriodoCalculado, eri: EriAcumulado | null) => number,
    getDen: (p: PeriodoCalculado, eri: EriAcumulado | null) => number,
    calcRes: (n: number, d: number) => number,
    nfRes = '#,##0.00'
  ) => {
    const rowN = f
    const rowD = f + 1

    const cLN     = ws.getCell(rowN, COL_DESC)
    cLN.value     = labelNum; cLN.font = fnt(false, NEGRO, 9); cLN.alignment = alnL
    const cLD     = ws.getCell(rowD, COL_DESC)
    cLD.value     = labelDen; cLD.font = fnt(false, NEGRO, 9); cLD.alignment = alnL

    for (let i = 0; i < N; i++) {
      const p   = allGrps[i]
      const eri = getEri(p)
      const nv  = getNum(p, eri)
      const dv  = getDen(p, eri)
      const rv  = dv !== 0 ? calcRes(nv, dv) : 0

      // Numerador (con borde inferior = línea de fracción)
      const cN  = ws.getCell(rowN, colVal(i))
      cN.value  = nv || null; cN.font = fnt(false, NEGRO, 9)
      cN.alignment = alnR; cN.numFmt = '#,##0;(#,##0)'
      cN.border = { bottom: { style: 'thin', color: { argb: NEGRO } } }

      // Resultado
      const cR  = ws.getCell(rowN, colRes(i))
      cR.value  = rv || null; cR.font = fnt(true, NEGRO, 9)
      cR.alignment = alnR; cR.numFmt = nfRes

      // Denominador
      const cD  = ws.getCell(rowD, colVal(i))
      cD.value  = dv || null; cD.font = fnt(false, NEGRO, 9)
      cD.alignment = alnR; cD.numFmt = '#,##0;(#,##0)'

      // Signo "="
      const cEq = ws.getCell(rowD, colEq(i))
      cEq.value = '='; cEq.font = fnt(false, NEGRO, 9); cEq.alignment = alnC
    }
    f += 4
  }

  // ── DATOS — idénticos al original ─────────────────────────

  writeSection('INDICE DE LIQUIDEZ')
  writeFraction('Activo Corriente', 'Pasivo Corriente',
    p => p.activoCorriente.totalActivoCorriente,
    p => p.pasivoCorriente.totalPasivoCorriente,
    (n, d) => n / d)

  writeSection('INDICE DE ENDEUDAMIENTO')
  writeFraction('Pasivo Total', 'Activo Total',
    p => p.totalPasivo, p => p.totalActivo, (n, d) => n / d)

  writeSection('RENTABILIDAD DE PATRIMONIO')
  writeFraction('Utilidad Operacional', 'Patrimonio',
    (p, eri) => gananciaOp(eri),
    p => p.patrimonio.totalPatrimonio, (n, d) => n / d)

  writeSection('RENTABILIDAD DEL ACTIVO')
  writeFraction('Utilidad Operacional', 'Activo Total',
    (p, eri) => gananciaOp(eri), p => p.totalActivo, (n, d) => n / d)

  writeSection('CAPITAL DE TRABAJO')
  writeFraction('Activo Corriente - Pasivo corriente', '',
    p => p.activoCorriente.totalActivoCorriente,
    p => p.pasivoCorriente.totalPasivoCorriente,
    (n, d) => n - d, '#,##0;(#,##0);"-"')

  writeSection('CAPITAL DE PATRIMONIO')
  writeFraction('Activo Total - pasivo total', '',
    p => p.totalActivo, p => p.totalPasivo, (n, d) => n - d, '#,##0;(#,##0);"-"')

  writeSection('ROTACION DE INVENTARIOS')
  const rotVals = allGrps.map(p => {
    const eri = getEri(p)
    const inv = invPromedio(p)
    return inv !== 0 ? (eri?.costoTotal ?? 0) / inv : 0
  })
  writeFraction('Costo de Ventas', 'Inventario Promedio',
    (p, eri) => eri?.costoTotal ?? 0, p => invPromedio(p), (n, d) => n / d)

  writeSection('ROTACION DE INVENTARIOS (DIAS)')
  {
    const rowN = f; const rowD = f + 1
    ws.getCell(rowN, COL_DESC).value = 'Dias del periodo'
    ws.getCell(rowN, COL_DESC).font  = fnt(false, NEGRO, 9)
    ws.getCell(rowD, COL_DESC).value = 'Rotacion de Inventario'
    ws.getCell(rowD, COL_DESC).font  = fnt(false, NEGRO, 9)
    for (let i = 0; i < N; i++) {
      const rot  = rotVals[i]
      const dias = rot !== 0 ? 365 / rot : 0
      const cN = ws.getCell(rowN, colVal(i))
      cN.value = 365; cN.font = fnt(false, NEGRO, 9); cN.alignment = alnR
      cN.numFmt = '#,##0'; cN.border = { bottom: { style: 'thin', color: { argb: NEGRO } } }
      const cR = ws.getCell(rowN, colRes(i))
      cR.value = dias || null; cR.font = fnt(true, NEGRO, 9)
      cR.alignment = alnR; cR.numFmt = '#,##0.00'
      const cD = ws.getCell(rowD, colVal(i))
      cD.value = rot || null; cD.font = fnt(false, NEGRO, 9)
      cD.alignment = alnR; cD.numFmt = '#,##0.00'
      ws.getCell(rowD, colEq(i)).value = '='
      ws.getCell(rowD, colEq(i)).font  = fnt(false, NEGRO, 9)
      ws.getCell(rowD, colEq(i)).alignment = alnC
    }
    f += 4
  }

  writeSection('MARGEN DE SOLVENCIA')
  writeFraction('Activo Total', 'Pasivo Total',
    p => p.totalActivo, p => p.totalPasivo, (n, d) => n / d)

  writeSection('EBITDA')
  const ebitdaData = allGrps.map(p => {
    const eri = getEri(p)
    const utilidad  = eri?.resultadoNeto  ?? 0
    const intereses = eri?.gastosNoOp     ?? 0
    const impuestos = eri?.provisionRenta ?? 0
    const dep       = eri?.depreciacion   ?? 0
    const ebitda    = utilidad + intereses + impuestos + dep
    const ventas    = eri?.ingresosTotal  ?? 0
    return { utilidad, intereses, impuestos, dep, ebitda, ventas }
  })
  {
    const rowENum = f; const rowEDen = f + 1
    ws.getCell(rowENum, COL_DESC).value = 'Utilidad + intereses + impuestos+ depreciacion'
    ws.getCell(rowENum, COL_DESC).font  = fnt(false, NEGRO, 9)
    ws.getCell(rowEDen, COL_DESC).value = 'Total ventas'
    ws.getCell(rowEDen, COL_DESC).font  = fnt(false, NEGRO, 9)
    for (let i = 0; i < N; i++) {
      const ev = ebitdaData[i]
      const ratio = ev.ventas !== 0 ? ev.ebitda / ev.ventas : 0
      const cN = ws.getCell(rowENum, colVal(i))
      cN.value = ev.ebitda || null; cN.font = fnt(false, NEGRO, 9)
      cN.alignment = alnR; cN.numFmt = '#,##0;(#,##0)'
      cN.border = { bottom: { style: 'thin', color: { argb: NEGRO } } }
      const cR = ws.getCell(rowENum, colRes(i))
      cR.value = ratio || null; cR.font = fnt(true, NEGRO, 9)
      cR.alignment = alnR; cR.numFmt = '#,##0.00'
      const cD = ws.getCell(rowEDen, colVal(i))
      cD.value = ev.ventas || null; cD.font = fnt(false, NEGRO, 9)
      cD.alignment = alnR; cD.numFmt = '#,##0;(#,##0)'
      ws.getCell(rowEDen, colEq(i)).value = '='
      ws.getCell(rowEDen, colEq(i)).font  = fnt(false, NEGRO, 9)
      ws.getCell(rowEDen, colEq(i)).alignment = alnC
    }
    f += 3
  }
  const breakdown: Array<{ label: string; key: keyof typeof ebitdaData[0]; bold?: boolean }> = [
    { label: 'utilidad',                                         key: 'utilidad' },
    { label: 'intereses',                                        key: 'intereses' },
    { label: 'impuestos',                                        key: 'impuestos' },
    { label: 'depreciacion',                                     key: 'dep' },
    { label: 'Utilidad + intereses + impuestos+ depreciacion',   key: 'ebitda', bold: true },
  ]
  for (const item of breakdown) {
    ws.getCell(f, COL_DESC).value = item.label
    ws.getCell(f, COL_DESC).font  = fnt(item.bold ?? false, NEGRO, 9)
    for (let i = 0; i < N; i++) {
      const c = ws.getCell(f, colVal(i))
      c.value = ebitdaData[i][item.key] || null
      c.font  = fnt(item.bold ?? false, NEGRO, 9)
      c.alignment = alnR; c.numFmt = '#,##0;(#,##0)'; c.border = bThin
    }
    f++
  }

  ws.getRow(2).height = 22; ws.getRow(3).height = 14
  ws.getRow(4).height = 16; ws.getRow(5).height = 13
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────
export function generarTanda1(resultado: ResultadoMotor): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Motor Contable CALA'
  wb.created  = new Date()
  wb.modified = new Date()

  console.log('[generarTanda1] Generando hojas...')

  hojaESF(wb, resultado)
  hojaERI(wb, resultado)
  hojaNCTASESF(wb, resultado)
  hojaNCTASPYG(wb, resultado)
  hojaINDICADORES(wb, resultado) 
  hojaRENTA(wb, resultado)
  hojaCAJA(wb, resultado)
  hojaBANCOS(wb, resultado)
  hojaINVERSIONES(wb, resultado)
  hojaCXC(wb, resultado)
  hojaINVENTARIO(wb, resultado)
  hojaOTRASCXC(wb, resultado)
  hojaPYP(wb, resultado)
  hojaOBLIFIN(wb, resultado)
  hojaCXP(wb, resultado)
  hojaFISCALES(wb, resultado)
  hojaOTROSPASIVOS(wb, resultado)
  hojaINGRESOS(wb, resultado)
  hojaCOSTOS(wb, resultado)

  console.log('[generarTanda1] ✓ 19 hojas generadas')
  return wb
}

export const generarESF = generarTanda1