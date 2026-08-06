// src/lib/motor-contable/esf/inventario.ts
// ─────────────────────────────────────────────────────────────
// NOTA: INVENTARIO  (migrada a Nivel B)
// OJO: encabezado en filas 6 (año) y 7 (mes); total en fila 9; detalle desde 11.
// Estructura: subcuenta → auxiliares. Nivel B: subcuenta = SUMA(auxiliares) si
// los hay; total = SUMA(subcuentas). Publica el total en el registro.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid, font as fnt, alnC, alnL, alnR, bordeThin as bThin } from './_shared'

export function hojaINVENTARIO(wb: ExcelJS.Workbook, r: ResultadoMotor, reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('INVENTARIO')
  ws.showGridLines = false

  const NAVY = C.AZUL_TOTAL, AZUL_H = 'FFD9E1F2', GRIS_ITEM = C.GRIS_SUBTOTAL, NEGRO = C.NEGRO, BLANC = C.BLANCO

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
  const grpAct = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt = periOrd.filter(p => p.anio !== anioAct).slice(0, 5)
  const NA = grpAct.length, NB = grpAnt.length
  const COL_SEP = 2 + NA, COL_ANT = COL_SEP + 1, LAST = COL_ANT + NB

  ws.getColumn(1).width = 30.0
  for (let i = 0; i < NA; i++) ws.getColumn(2 + i).width = 14.5
  ws.getColumn(COL_SEP).width = 1.0
  for (let i = 0; i < NB; i++) ws.getColumn(COL_ANT + i).width = 14.5
  ws.getColumn(LAST).width = 1.71

  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1); c.value = txt; c.font = fnt(true, NEGRO, sz, italic); c.alignment = alnC
  }
  setTit(2, r.empresa, true, 11); setTit(3, `NIT. ${r.nit}`, true, 10)
  setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS', false, 10)

  // Encabezado: año en fila 6, mes en fila 7 (distinto a las otras notas)
  const cabecera = (grp: PeriodoCalculado[], colBase: number) => {
    for (let i = 0; i < grp.length; i++) {
      const p = grp[i]; if (!p) continue
      const c6 = ws.getCell(6, colBase + i)
      c6.value = p.anio; c6.font = fnt(true, BLANC, 8); c6.fill = solid(NAVY); c6.alignment = alnC; c6.border = bThin
      const c7 = ws.getCell(7, colBase + i)
      c7.value = MESES[p.mes]; c7.font = fnt(true, BLANC, 8); c7.fill = solid(NAVY); c7.alignment = alnC; c7.border = bThin
    }
  }
  cabecera(grpAct, 2); cabecera(grpAnt, COL_ANT)

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 13
  ws.getRow(6).height = 15; ws.getRow(7).height = 14; ws.getRow(8).height = 15; ws.getRow(9).height = 14

  const writeRow = (
    rowN: number, label: string,
    gAct: (p: PeriodoCalculado) => number | null, gAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = alnL
    if (opts.fillColor) cL.fill = solid(opts.fillColor); if (opts.brd) cL.border = opts.brd
    const col = (grp: PeriodoCalculado[], base: number, g: (p: PeriodoCalculado) => number | null) => {
      for (let i = 0; i < grp.length; i++) {
        const p = grp[i] ?? null; const c = ws.getCell(rowN, base + i)
        c.value = p ? (g(p) ?? null) : null
        c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS
        if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd
      }
    }
    col(grpAct, 2, gAct); col(grpAnt, COL_ANT, gAnt)
  }

  const writeFormula = (
    rowN: number, label: string,
    refPorCol: (letra: string) => string,
    resAct: (p: PeriodoCalculado) => number | null, resAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean },
    publicar?: (p: PeriodoCalculado, letra: string) => void,
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = alnL
    if (opts.fillColor) cL.fill = solid(opts.fillColor); if (opts.brd) cL.border = opts.brd
    const col = (grp: PeriodoCalculado[], base: number, res: (p: PeriodoCalculado) => number | null) => {
      for (let i = 0; i < grp.length; i++) {
        const p = grp[i] ?? null; const cnum = base + i; const c = ws.getCell(rowN, cnum)
        if (p) {
          const letra = ws.getColumn(cnum).letter
          const interior = refPorCol(letra)
          c.value = interior ? { formula: `SUM(${interior})`, result: res(p) ?? 0 } : (res(p) ?? null)
          if (publicar && interior) publicar(p, letra)
        } else c.value = null
        c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS
        if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd
      }
    }
    col(grpAct, 2, resAct); col(grpAnt, COL_ANT, resAnt)
  }

  // ── Detalle: subcuentas + auxiliares (del último período, igual al original) ──
  const ult = r.periodos[r.periodos.length - 1]
  const subcuentas = ult?.activoCorriente.inventarioDetalle ?? []
  const auxiliares = ult?.activoCorriente.inventarioAuxiliares ?? []

  const valorSc = (cod: string) => (p: PeriodoCalculado) =>
    p.activoCorriente.inventarioDetalle?.find(x => x.codigo === cod)?.valor ?? null
  const valorAux = (cod: string) => (p: PeriodoCalculado) =>
    p.activoCorriente.inventarioAuxiliares?.find(x => x.codigo === cod)?.valor ?? null

  const filasSubtotal: number[] = []
  let fila = 11

  for (const sc of subcuentas) {
    const auxDeSc = auxiliares.filter(a => a.codigo.startsWith(sc.codigo))
    const filaSub = fila
    fila++
    if (auxDeSc.length > 0) {
      const ini = fila
      for (const aux of auxDeSc) {
        writeRow(fila, aux.nombre, valorAux(aux.codigo), valorAux(aux.codigo),
          { bold: false, brd: bDashedTop, indent: true })
        fila++
      }
      const fin = fila - 1
      writeFormula(filaSub, sc.nombre,
        (letra) => `${letra}${ini}:${letra}${fin}`,
        valorSc(sc.codigo), valorSc(sc.codigo),
        { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    } else {
      writeRow(filaSub, sc.nombre, valorSc(sc.codigo), valorSc(sc.codigo),
        { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    }
    filasSubtotal.push(filaSub)
    fila++
  }

  // ── Total INVENTARIO (fila 9) = SUMA de las subcuentas ──
  writeFormula(9, 'INVENTARIO',
    (letra) => filasSubtotal.map(fs => `${letra}${fs}`).join(','),
    p => p.activoCorriente.inventarioTotal || null,
    p => p.activoCorriente.inventarioTotal || null,
    { bold: true, fillColor: AZUL_H, brd: bDblTop },
    (p, letra) => reg?.publicar(`inventario:${p.anio}-${p.mes}`, 'INVENTARIO', `${letra}9`))
}