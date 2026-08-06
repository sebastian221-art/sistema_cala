// src/lib/motor-contable/esf/pype.ts
// ─────────────────────────────────────────────────────────────
// NOTA: PYP (Propiedad Planta y Equipo)  (migrada a Nivel B)
// OJO: Calibri; columnas FIJAS (2-4 / 6-8); 6 slots (todosOrd); total fila 9.
// La DEPRECIACIÓN se guarda NEGATIVA (cuenta 1592), así que:
//   ppyeNeto = SUMA(subcuentas de costo) + depreciacionAcumulada(negativa)
// Por eso el total (fila 9) = SUMA de todos los subtotales, incluida la
// depreciación negativa (la resta sola). Verificado contra el motor (calcPYP).
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid, font } from './_shared'

export function hojaPYP(wb: ExcelJS.Workbook, r: ResultadoMotor, reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('PYP')
  ws.showGridLines = false

  const NAVY = C.AZUL_TOTAL, AZUL_H = 'FFD9E1F2', GRIS_ITEM = C.GRIS_SUBTOTAL, NEGRO = C.NEGRO, BLANC = C.BLANCO
  const fnt = (bold = false, color: string = NEGRO, size = 9) => font(bold, color, size, false, 'Calibri')
  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> => ({ horizontal: h, vertical: 'middle' })

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
  const grpAnt = periOrd.filter(p => p.anio !== anioAct).slice(0, 3)
  const todosOrd = [...grpAct, ...grpAnt]
  const COLMAP = [2, 3, 4, 6, 7, 8]

  ws.getColumn(1).width = 42.0
  ws.getColumn(2).width = 16.0; ws.getColumn(3).width = 16.0; ws.getColumn(4).width = 16.0
  ws.getColumn(5).width = 2.0
  ws.getColumn(6).width = 16.0; ws.getColumn(7).width = 16.0; ws.getColumn(8).width = 16.0
  ws.getColumn(9).width = 1.71

  const setTitulo = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1); c.value = txt; c.font = fnt(true, NEGRO, 10); c.alignment = aln('center')
  }
  setTitulo(2, r.empresa); setTitulo(3, `NIT. ${r.nit}`); setTitulo(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  const cab = () => {
    for (let i = 0; i < 3; i++) { const p = grpAct[i]; if (!p) continue
      const c6 = ws.getCell(6, 2+i); c6.value = p.anio; c6.font = fnt(true, BLANC, 8); c6.fill = solid(NAVY); c6.alignment = aln('center')
      const c7 = ws.getCell(7, 2+i); c7.value = MESES[p.mes]; c7.font = fnt(true, BLANC, 8); c7.fill = solid(NAVY); c7.alignment = aln('center') }
    for (let i = 0; i < 3; i++) { const p = grpAnt[i]; if (!p) continue
      const c6 = ws.getCell(6, 6+i); c6.value = p.anio; c6.font = fnt(true, BLANC, 8); c6.fill = solid(NAVY); c6.alignment = aln('center')
      const c7 = ws.getCell(7, 6+i); c7.value = MESES[p.mes]; c7.font = fnt(true, BLANC, 8); c7.fill = solid(NAVY); c7.alignment = aln('center') }
  }
  cab()
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  const snap = (i: number, fn: (p: PeriodoCalculado) => number): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio); if (!per) return null
    return fn(per) || null
  }
  const snapAux = (i: number, scCodigo: string, auxNombre: string): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio); if (!per) return null
    const sc = per.activoNoCorriente.detallePPyEConAux?.find(x => x.codigo === scCodigo)
    return sc?.auxiliares.find(a => a.nombre.trim() === auxNombre.trim())?.valor || null
  }
  const snapAuxDep = (i: number, auxNombre: string): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio); if (!per) return null
    return per.activoNoCorriente.detalleDepreciacion?.find(d => d.nombre.trim() === auxNombre.trim())?.valor || null
  }

  const writeRow = (rowN: number, label: string, vals: (number | null)[],
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: string }) => {
    const cL = ws.getCell(rowN, 1); cL.value = (opts.indent ?? '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); if (opts.fillColor) cL.fill = solid(opts.fillColor)
    for (let i = 0; i < 6; i++) {
      const c = ws.getCell(rowN, COLMAP[i]); c.value = vals[i] ?? null
      c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = aln('right'); c.numFmt = FMT_PESOS
      if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd
    }
  }

  // Subtotal/total como FÓRMULA. refPorCol(letra) => interior del SUM (rango o lista).
  const writeFormula = (rowN: number, label: string,
    refPorCol: (letra: string) => string, resVals: (number | null)[],
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: string },
    publicar?: (letra: string) => void) => {
    const cL = ws.getCell(rowN, 1); cL.value = (opts.indent ?? '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); if (opts.fillColor) cL.fill = solid(opts.fillColor)
    for (let i = 0; i < 6; i++) {
      const cnum = COLMAP[i]; const c = ws.getCell(rowN, cnum)
      const slotOcupado = !!todosOrd[i]
      if (slotOcupado) {
        const letra = ws.getColumn(cnum).letter
        const interior = refPorCol(letra)
        c.value = interior ? { formula: `SUM(${interior})`, result: resVals[i] ?? 0 } : (resVals[i] ?? null)
        if (publicar && interior) publicar(letra)
      } else c.value = null
      c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = aln('right'); c.numFmt = FMT_PESOS
      if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd
    }
  }

  const ult = r.periodos[r.periodos.length - 1]
  const subcuentasPPyE = ult?.activoNoCorriente.detallePPyEConAux ?? []
  const filasSubtotalCosto: number[] = []
  let f = 11

  for (const sc of subcuentasPPyE) {
    const filaSub = f
    f++
    const auxUnion = new Set<string>()
    for (const p of r.periodos)
      p.activoNoCorriente.detallePPyEConAux?.find(x => x.codigo === sc.codigo)?.auxiliares.forEach(a => auxUnion.add(a.nombre.trim()))
    const auxList = [...auxUnion]

    const scVals = [0,1,2,3,4,5].map(i => snap(i, p => p.activoNoCorriente.detallePPyEConAux?.find(x => x.codigo === sc.codigo)?.total ?? 0))
    if (auxList.length > 0) {
      const ini = f
      for (const auxNombre of auxList) {
        const auxVals = [0,1,2,3,4,5].map(i => snapAux(i, sc.codigo, auxNombre))
        writeRow(f, auxNombre, auxVals, { brd: bDashedTop, indent: '   ' }); f++
      }
      const fin = f - 1
      writeFormula(filaSub, sc.nombre, (letra) => `${letra}${ini}:${letra}${fin}`, scVals,
        { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    } else {
      writeRow(filaSub, sc.nombre, scVals, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    }
    filasSubtotalCosto.push(filaSub)
    f++ // separador
  }
  f++

  // ── Depreciación Acumulada (negativa) = SUMA de su detalle ──
  const filaDep = f
  f++
  const depUnion = new Set<string>()
  for (const p of r.periodos)
    p.activoNoCorriente.detalleDepreciacion?.forEach(d => depUnion.add(d.nombre.trim()))
  const depList = [...depUnion]
  const depVals = [0,1,2,3,4,5].map(i => snap(i, p => p.activoNoCorriente.depreciacionAcumulada))
  if (depList.length > 0) {
    const ini = f
    for (const auxNombre of depList) {
      const depAuxVals = [0,1,2,3,4,5].map(i => snapAuxDep(i, auxNombre))
      writeRow(f, auxNombre, depAuxVals, { brd: bDashedTop, indent: '   ' }); f++
    }
    const fin = f - 1
    writeFormula(filaDep, 'Depreciacion Acumulada', (letra) => `${letra}${ini}:${letra}${fin}`, depVals,
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
  } else {
    writeRow(filaDep, 'Depreciacion Acumulada', depVals, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
  }

  // ── Total PPyE Neto (fila 9) = SUMA(subcuentas de costo + depreciación negativa) ──
  const celdasTotal = [...filasSubtotalCosto, filaDep]
  const totalVals = [0,1,2,3,4,5].map(i => snap(i, p => p.activoNoCorriente.ppyeNeto))
  writeFormula(9, 'Propiedad Planta Y Equipo',
    (letra) => celdasTotal.map(fr => `${letra}${fr}`).join(','),
    totalVals, { bold: true, fillColor: AZUL_H, brd: bDblTop },
    (letra) => { /* publica por slot: usamos el período del slot */ })

  // Publicar la celda del total por período (para el ESF)
  for (let i = 0; i < 6; i++) {
    const p = todosOrd[i]; if (!p) continue
    const letra = ws.getColumn(COLMAP[i]).letter
    reg?.publicar(`ppye:${p.anio}-${p.mes}`, 'PYP', `${letra}9`)
  }

  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5; ws.getRow(9).height = 14.25
}