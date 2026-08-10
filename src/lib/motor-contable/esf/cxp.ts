// src/lib/motor-contable/esf/cxp.ts
// ─────────────────────────────────────────────────────────────
// NOTA: CXP (Cuentas Por Pagar)  (migrada a Nivel B)
// Calibri; slots fijos (2-4 / 6-8); total fila 9; subcuentas desde fila 11.
// Cada subcuenta -> sus terceros (valor = -saldoFinal). Nivel B:
//   subcuenta = SUMA(terceros mostrados); total = SUMA(subcuentas).
// Publica el total.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid, font } from './_shared'
import { aplicarReglasNota, soloReglasNota, type ReglaNota } from '../reglasNota'

export function hojaCXP(wb: ExcelJS.Workbook, r: ResultadoMotor, reg?: RegistroCeldas) {
  // ── Reglas de nota con CANDADO DE CUADRE (editables por la contadora vía IA) ──
  const reglasNota: ReglaNota[] = soloReglasNota((r as any).perfil?.reglas ?? [])
  const ultRN = r.periodos[r.periodos.length - 1]
  const detalleBaseRN = ((ultRN as any)?.pasivoCorriente.cxpDetalle ?? []).map((x: any) => ({ codigo: String(x.codigo ?? x.numero ?? ''), nombre: x.nombre ?? x.numero ?? '', valor: x.valor ?? x.total ?? x.totalSaldoFinal ?? 0 }))
  const fuentePrefijoRN = (pref: string) => detalleBaseRN.filter((x: any) => String(x.codigo).startsWith(pref))
  const rnNota = aplicarReglasNota('CXP', detalleBaseRN, (ultRN as any)?.pasivoCorriente.cxpTotal ?? 0, reglasNota, fuentePrefijoRN)
  const nombreEfectivo = (cod: string, nombreBase: string): string => {
    const l = rnNota.detalle.find(x => cod.startsWith(x.codigo) || x.codigo.startsWith(cod)); return l ? l.nombre : nombreBase
  }
  void nombreEfectivo;
  if (rnNota.rechazadas.length > 0 && Array.isArray((r as any).advertencias)) {
    for (const rz of rnNota.rechazadas) (r as any).advertencias.push('⚠ ' + rz.motivo)
  }

  const ws = wb.addWorksheet('CXP')
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

  ws.getColumn(1).width = 46.0
  ws.getColumn(2).width = 14.71; ws.getColumn(3).width = 14.71; ws.getColumn(4).width = 14.71
  ws.getColumn(5).width = 1.71
  ws.getColumn(6).width = 14.71; ws.getColumn(7).width = 14.71; ws.getColumn(8).width = 14.71
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
  const snapSub = (i: number, codigo: string): number | null =>
    snap(i, p => p.pasivoCorriente.cxpDetalle.find(x => x.codigo === codigo)?.total ?? 0)
  const snapTercero = (i: number, codigo: string, nitKey: string): number | null =>
    snap(i, p => {
      const sc = p.pasivoCorriente.cxpDetalle.find(x => x.codigo === codigo); if (!sc) return 0
      const t = sc.terceros.find(x => (x.nit || x.nombreTercero || '').trim() === nitKey)
      return t ? -t.saldoFinal : 0
    })
  const toNombrePropio = (s: string): string => (s ?? '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

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

  const writeFormula = (rowN: number, label: string, refPorCol: (letra: string) => string,
    resVals: (number | null)[], opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders> },
    publicar?: (letra: string, slot: number) => void) => {
    const cL = ws.getCell(rowN, 1); cL.value = label; cL.font = fnt(opts.bold ?? false, NEGRO, 9)
    if (opts.fillColor) cL.fill = solid(opts.fillColor)
    for (let i = 0; i < 6; i++) {
      const cnum = COLMAP[i]; const c = ws.getCell(rowN, cnum)
      if (todosOrd[i]) { const letra = ws.getColumn(cnum).letter; const interior = refPorCol(letra)
        c.value = interior ? { formula: `SUM(${interior})`, result: resVals[i] ?? 0 } : (resVals[i] ?? null)
        if (publicar && interior) publicar(letra, i) } else c.value = null
      c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = aln('right'); c.numFmt = FMT_PESOS
      if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd
    }
  }

  // ── Subcuentas + terceros (detalle primero, para conocer rangos) ──
  const subUnion = new Map<string, string>()
  for (const p of r.periodos)
    for (const sc of p.pasivoCorriente.cxpDetalle)
      if (!subUnion.has(sc.codigo)) subUnion.set(sc.codigo, sc.nombre)

  const filasSubtotal: number[] = []
  let f = 11

  for (const [codigo, nombre] of subUnion) {
    const filaSub = f
    f++
    // terceros con saldo
    const terceroUnion = new Map<string, string>()
    for (const p of r.periodos) {
      const sc = p.pasivoCorriente.cxpDetalle.find(x => x.codigo === codigo); if (!sc) continue
      for (const t of sc.terceros) {
        const key = (t.nit || t.nombreTercero || '').trim()
        if (key && !terceroUnion.has(key)) terceroUnion.set(key, t.nombreTercero || t.nit || key)
      }
    }
    const iniT = f
    for (const [nitKey, nombreTercero] of terceroUnion) {
      const tVals = [0,1,2,3,4,5].map(i => snapTercero(i, codigo, nitKey))
      if (!tVals.some(v => v !== null && v !== 0)) continue
      writeRow(f, toNombrePropio(nombreTercero), tVals, { brd: bDashedTop, indent: '   ' }); f++
    }
    const finT = f - 1
    const subVals = [0,1,2,3,4,5].map(i => snapSub(i, codigo))
    if (finT >= iniT) {
      writeFormula(filaSub, nombre, (letra) => `${letra}${iniT}:${letra}${finT}`, subVals,
        { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    } else {
      writeRow(filaSub, nombre, subVals, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    }
    filasSubtotal.push(filaSub)
    f++ // separador
  }

  // ── Total CXP (fila 9) = SUMA de las subcuentas ──
  const totalVals = [0,1,2,3,4,5].map(i => snap(i, p => p.pasivoCorriente.cxpDetalle.reduce((s, x) => s + x.total, 0)))
  writeFormula(9, 'Cuentas Por Pagar',
    (letra) => filasSubtotal.map(fr => `${letra}${fr}`).join(','),
    totalVals, { bold: true, fillColor: AZUL_H, brd: bDblTop },
    (letra, slot) => { const p = todosOrd[slot]; if (p) reg?.publicar(`cxp:${p.anio}-${p.mes}`, 'CXP', `${letra}9`) })

  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5; ws.getRow(9).height = 14.25
}