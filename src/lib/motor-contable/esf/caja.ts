// src/lib/motor-contable/esf/caja.ts
// ─────────────────────────────────────────────────────────────
// NOTA: CAJA  (migrada a Nivel B)
//
// Idéntica en estructura y estilo al hojaCAJA original. Único cambio de fondo:
//   • La fila 10 ("CAJA", el total) ya NO es un número fijo: es una FÓRMULA
//     =SUMA(detalle) con el resultado cacheado (para que se vea y valide igual).
//   • Publica en el registro la celda del total por período, para que la hoja
//     ESF (Nivel B) la referencie por fórmula.
// El detalle (Caja General, Caja Menor…) son los valores base del motor.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid, font as fnt, alnC, alnL, alnR, bordeThin as bThin } from './_shared'

export function hojaCAJA(wb: ExcelJS.Workbook, r: ResultadoMotor, reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('CAJA')
  ws.showGridLines = false

  const NAVY      = C.AZUL_TOTAL     // 'FF2F75B6'
  const AZUL_H    = 'FFD9E1F2'       // exclusivo de las notas (no está en C)
  const GRIS_ITEM = C.GRIS_SUBTOTAL  // 'FFF2F2F2'
  const NEGRO     = C.NEGRO
  const BLANC     = C.BLANCO

  const bDblTop: Partial<ExcelJS.Borders> = {
    top:    { style: 'double', color: { argb: NEGRO } },
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
    c7.fill = solid(NAVY); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, 2+i)
    c8.value = MESES[p.mes] ?? ''; c8.font = fnt(true, BLANC, 8)
    c8.fill = solid(NAVY); c8.alignment = alnC; c8.border = bThin
  }
  for (let i = 0; i < NB; i++) {
    const p = grpAnt[i]; if (!p) continue
    const c7 = ws.getCell(7, COL_ANT+i)
    c7.value = p.anio; c7.font = fnt(true, BLANC, 8)
    c7.fill = solid(NAVY); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, COL_ANT+i)
    c8.value = MESES[p.mes] ?? ''; c8.font = fnt(true, BLANC, 8)
    c8.fill = solid(NAVY); c8.alignment = alnC; c8.border = bThin
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }]
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 13
  ws.getRow(7).height = 15; ws.getRow(8).height = 14

  // writeRow para DETALLE (valores base del motor) — igual al original.
  const writeRow = (
    rowN: number, label: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders> }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = label; cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = alnL
    if (opts.fillColor) cL.fill = solid(opts.fillColor)
    if (opts.brd) cL.border = opts.brd
    for (let i = 0; i < NA; i++) {
      const p = grpAct[i] ?? null; const c = ws.getCell(rowN, 2+i)
      c.value = p ? (gAct(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS
      if (opts.fillColor) c.fill = solid(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
    for (let i = 0; i < NB; i++) {
      const p = grpAnt[i] ?? null; const c = ws.getCell(rowN, COL_ANT+i)
      c.value = p ? (gAnt(p) ?? null) : null
      c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS
      if (opts.fillColor) c.fill = solid(opts.fillColor)
      if (opts.brd) c.border = opts.brd
    }
  }

  // ── unión de cajaDetalle de TODOS los períodos (igual al original) ──
  const cajaUnion = new Map<string, string>()  // codigo → nombre
  for (const p of r.periodos) {
    for (const item of (p.activoCorriente.cajaDetalle ?? [])) {
      if (!cajaUnion.has(item.codigo)) cajaUnion.set(item.codigo, item.nombre)
    }
  }

  // ── DETALLE primero (para saber en qué fila termina) ──
  const filaIniDetalle = 12
  let fila = filaIniDetalle

  if (cajaUnion.size > 0) {
    for (const [codigo, nombre] of cajaUnion) {
      writeRow(fila, nombre,
        p => p.activoCorriente.cajaDetalle?.find(x => x.codigo === codigo)?.valor ?? null,
        p => p.activoCorriente.cajaDetalle?.find(x => x.codigo === codigo)?.valor ?? null,
        { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
      fila++
    }
  } else {
    writeRow(fila, 'Caja',
      p => p.activoCorriente.cajaTotal,
      p => p.activoCorriente.cajaTotal,
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    fila++
  }
  const filaFinDetalle = fila - 1

  // ── TOTAL "CAJA" (fila 10) como FÓRMULA =SUMA(detalle), resultado cacheado ──
  const cL = ws.getCell(10, 1)
  cL.value = 'CAJA'; cL.font = fnt(true, NEGRO, 9); cL.alignment = alnL
  cL.fill = solid(AZUL_H); cL.border = bDblTop

  const escribirTotal = (colBase: number, grp: PeriodoCalculado[]) => {
    for (let i = 0; i < grp.length; i++) {
      const p = grp[i]; const col = colBase + i
      const letra = ws.getColumn(col).letter
      const c = ws.getCell(10, col)
      // Fórmula viva que suma el detalle, con el resultado cacheado (= cajaTotal)
      c.value = {
        formula: `SUM(${letra}${filaIniDetalle}:${letra}${filaFinDetalle})`,
        result: p.activoCorriente.cajaTotal ?? 0,
      }
      c.font = fnt(true, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS
      c.fill = solid(AZUL_H); c.border = bDblTop
      // Publicar la celda del total de CAJA para este período (lo usará el ESF)
      reg?.publicar(`caja:${p.anio}-${p.mes}`, 'CAJA', `${letra}10`)
    }
  }
  escribirTotal(2, grpAct)
  escribirTotal(COL_ANT, grpAnt)

  ws.getRow(9).height = 15; ws.getRow(10).height = 14; ws.getRow(11).height = 14
}