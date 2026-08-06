// src/lib/motor-contable/esf/bancos.ts
// ─────────────────────────────────────────────────────────────
// NOTA: BANCOS  (migrada a Nivel B)
// Estructura: Banco (subtotal) → sus cuentas (valores). Total = suma de bancos.
// Nivel B: cada subtotal de banco = SUMA(sus cuentas); total = SUMA(subtotales).
// Publica el total en el registro para el ESF.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid, font as fnt, alnC, alnL, alnR, bordeThin as bThin } from './_shared'

export function hojaBANCOS(wb: ExcelJS.Workbook, r: ResultadoMotor, reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('BANCOS')
  ws.showGridLines = false

  const NAVY      = C.AZUL_TOTAL
  const AZUL_H    = 'FFD9E1F2'
  const GRIS_ITEM = C.GRIS_SUBTOTAL
  const NEGRO     = C.NEGRO
  const BLANC     = C.BLANCO

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

  ws.getColumn(1).width = 28.0
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

  const cabecera = (grp: PeriodoCalculado[], colBase: number) => {
    for (let i = 0; i < grp.length; i++) {
      const p = grp[i]; if (!p) continue
      const c7 = ws.getCell(7, colBase + i)
      c7.value = p.anio; c7.font = fnt(true, BLANC, 8); c7.fill = solid(NAVY); c7.alignment = alnC; c7.border = bThin
      const c8 = ws.getCell(8, colBase + i)
      c8.value = MESES[p.mes]; c8.font = fnt(true, BLANC, 8); c8.fill = solid(NAVY); c8.alignment = alnC; c8.border = bThin
    }
  }
  cabecera(grpAct, 2); cabecera(grpAnt, COL_ANT)

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }]
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 13
  ws.getRow(7).height = 15; ws.getRow(8).height = 14; ws.getRow(9).height = 15; ws.getRow(10).height = 14

  const writeRow = (
    rowN: number, label: string,
    gAct: (p: PeriodoCalculado) => number | null,
    gAnt: (p: PeriodoCalculado) => number | null,
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

  // Escribe una fila de FÓRMULA (subtotal/total) sumando un rango o lista de celdas.
  const writeFormula = (
    rowN: number, label: string,
    refPorCol: (letra: string) => string,          // devuelve el interior del SUM, ej "B12:B14" o "B12,B18"
    resAct: (p: PeriodoCalculado) => number | null,
    resAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean },
    publicarClave?: (p: PeriodoCalculado, letra: string) => void,
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
          if (publicarClave && interior) publicarClave(p, letra)
        } else c.value = null
        c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS
        if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd
      }
    }
    col(grpAct, 2, resAct); col(grpAnt, COL_ANT, resAnt)
  }

  const getBancoTotal = (p: PeriodoCalculado | null, nombre: string) =>
    p?.activoCorriente.bancos.find(b => b.nombre === nombre)?.totalSaldoFinal ?? null
  const getCuentaVal = (p: PeriodoCalculado | null, banco: string, cuenta: string) =>
    p?.activoCorriente.bancos.find(b => b.nombre === banco)?.cuentas.find(c => c.numero === cuenta)?.saldoFinal ?? null

  // ── Bloques por banco (detalle primero, para conocer rangos) ──
  const bancosUlt = r.periodos[r.periodos.length - 1]?.activoCorriente.bancos ?? []
  const filasSubtotal: number[] = []
  let fila = 12

  for (const banco of bancosUlt) {
    const filaSub = fila
    fila++ // reservamos la fila del subtotal; sus cuentas van debajo
    const iniCtas = fila
    for (const cuenta of banco.cuentas) {
      writeRow(fila, cuenta.numero,
        p => getCuentaVal(p, banco.nombre, cuenta.numero),
        p => getCuentaVal(p, banco.nombre, cuenta.numero),
        { bold: false, brd: bDashedTop, indent: true })
      fila++
    }
    const finCtas = fila - 1
    // Subtotal del banco = SUMA de sus cuentas (o su valor si no tiene cuentas)
    writeFormula(filaSub, banco.nombre,
      (letra) => finCtas >= iniCtas ? `${letra}${iniCtas}:${letra}${finCtas}` : '',
      p => getBancoTotal(p, banco.nombre),
      p => getBancoTotal(p, banco.nombre),
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    filasSubtotal.push(filaSub)
    fila++ // separador
  }

  // ── Total BANCOS (fila 10) = SUMA de los subtotales de banco ──
  writeFormula(10, 'Bancos',
    (letra) => filasSubtotal.map(fs => `${letra}${fs}`).join(','),
    p => p.activoCorriente.bancosTotal,
    p => p.activoCorriente.bancosTotal,
    { bold: true, fillColor: AZUL_H, brd: bDblTop },
    (p, letra) => reg?.publicar(`bancos:${p.anio}-${p.mes}`, 'BANCOS', `${letra}10`))
}