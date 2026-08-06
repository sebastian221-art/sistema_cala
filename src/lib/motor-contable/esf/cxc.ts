// src/lib/motor-contable/esf/cxc.ts
// ─────────────────────────────────────────────────────────────
// NOTA: CXC (Cuentas Por Cobrar)  (migrada a Nivel B)
// Arial; columnas DINÁMICAS (colMap). Estructura de 3 niveles:
//   TOTAL (fila 10) = Clientes + Anticipos + Otros Deudores
//     Clientes Nac. y Exterior = SUMA(clientes terceros)
//     Anticipos y Avances      = SUMA(subcuentas de anticipos)
//       cada subcuenta          = SUMA(sus terceros)
// Publica el total en el registro.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid, font as fnt, alnC, alnL, alnR, bordeThin as bThin } from './_shared'

export function hojaCXC(wb: ExcelJS.Workbook, r: ResultadoMotor, reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('CXC')
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
  const esNumerico = (s?: string) => !s || /^\d+$/.test((s ?? '').trim())
  const toNombrePropio = (s: string) => (s ?? '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt = periOrd.filter(p => p.anio !== anioAct).slice(0, 3)
  const NA = grpAct.length, NB = grpAnt.length
  const N_TOT = NA + NB
  const COL_SEP = 2 + NA, COL_ANT = COL_SEP + 1, LAST = COL_ANT + NB
  const todosOrd = [...grpAct, ...grpAnt]
  const colMap: number[] = [
    ...Array.from({ length: NA }, (_, i) => 2 + i),
    ...Array.from({ length: NB }, (_, i) => COL_ANT + i),
  ]

  ws.getColumn(1).width = 40.0
  for (let i = 0; i < NA; i++) ws.getColumn(2 + i).width = 16.0
  ws.getColumn(COL_SEP).width = 1.5
  for (let i = 0; i < NB; i++) ws.getColumn(COL_ANT + i).width = 16.0
  ws.getColumn(LAST).width = 1.71

  const setTit = (rowN: number, txt: string, sz = 10, italic = true) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1); c.value = txt; c.font = fnt(true, NEGRO, sz, italic); c.alignment = alnC
  }
  setTit(2, r.empresa, 11); setTit(3, `NIT. ${r.nit}`, 10); setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS', 10, false)

  for (let i = 0; i < NA; i++) { const p = grpAct[i]; if (!p) continue
    ws.getCell(6, 2+i).value = p.anio; ws.getCell(6, 2+i).font = fnt(true, BLANC, 8)
    ws.getCell(6, 2+i).fill = solid(NAVY); ws.getCell(6, 2+i).alignment = alnC; ws.getCell(6, 2+i).border = bThin
    ws.getCell(7, 2+i).value = MESES[p.mes]; ws.getCell(7, 2+i).font = fnt(true, BLANC, 8)
    ws.getCell(7, 2+i).fill = solid(NAVY); ws.getCell(7, 2+i).alignment = alnC; ws.getCell(7, 2+i).border = bThin }
  for (let i = 0; i < NB; i++) { const p = grpAnt[i]; if (!p) continue
    ws.getCell(6, COL_ANT+i).value = p.anio; ws.getCell(6, COL_ANT+i).font = fnt(true, BLANC, 8)
    ws.getCell(6, COL_ANT+i).fill = solid(NAVY); ws.getCell(6, COL_ANT+i).alignment = alnC; ws.getCell(6, COL_ANT+i).border = bThin
    ws.getCell(7, COL_ANT+i).value = MESES[p.mes]; ws.getCell(7, COL_ANT+i).font = fnt(true, BLANC, 8)
    ws.getCell(7, COL_ANT+i).fill = solid(NAVY); ws.getCell(7, COL_ANT+i).alignment = alnC; ws.getCell(7, COL_ANT+i).border = bThin }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  const snap = (i: number, fn: (p: PeriodoCalculado) => number): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio); if (!per) return null
    return fn(per) || null
  }
  const snapTercero = (i: number, nitKey: string, tipo: 'clientes' | 'anticipos'): number | null => {
    const pd = todosOrd[i]; if (!pd) return null
    const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio); if (!per) return null
    const arr = tipo === 'clientes' ? per.activoCorriente.tercerosCxc : per.activoCorriente.tercerosAnticipos
    const t = (arr ?? []).find((x: any) => String(x.nit || x.nombreTercero) === nitKey)
    return t ? (t.saldoFinal || null) : null
  }
  const buildUnion = (tipo: 'clientes' | 'anticipos'): [string, string][] => {
    const m = new Map<string, string>()
    for (const p of r.periodos) {
      const arr = tipo === 'clientes' ? p.activoCorriente.tercerosCxc : p.activoCorriente.tercerosAnticipos
      for (const t of (arr ?? [])) {
        const key = String(t.nit || t.nombreTercero); if (!key || m.has(key)) continue
        const nombre = !esNumerico(t.nombreTercero) ? t.nombreTercero : !esNumerico(t.nit) ? String(t.nit) : (t.nombreTercero ?? '')
        m.set(key, nombre)
      }
    }
    return [...m.entries()]
  }

  const idx = [...Array(N_TOT).keys()]

  const writeRow = (rowN: number, label: string, vals: (number | null)[],
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: string }) => {
    const cL = ws.getCell(rowN, 1); cL.value = (opts.indent ?? '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = alnL
    if (opts.fillColor) cL.fill = solid(opts.fillColor); if (opts.brd) cL.border = opts.brd
    for (let i = 0; i < N_TOT; i++) {
      const c = ws.getCell(rowN, colMap[i]); c.value = vals[i] ?? null
      c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS
      if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd
    }
  }
  const writeFormula = (rowN: number, label: string, refPorCol: (letra: string) => string,
    resVals: (number | null)[], opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders> },
    publicar?: (letra: string, slot: number) => void) => {
    const cL = ws.getCell(rowN, 1); cL.value = label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = alnL
    if (opts.fillColor) cL.fill = solid(opts.fillColor); if (opts.brd) cL.border = opts.brd
    for (let i = 0; i < N_TOT; i++) {
      const cnum = colMap[i]; const c = ws.getCell(rowN, cnum)
      if (todosOrd[i]) { const letra = ws.getColumn(cnum).letter; const interior = refPorCol(letra)
        c.value = interior ? { formula: `SUM(${interior})`, result: resVals[i] ?? 0 } : (resVals[i] ?? null)
        if (publicar && interior) publicar(letra, i) } else c.value = null
      c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS
      if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd
    }
  }

  let f = 12 // el total va en la 10; escribimos secciones primero y el total al final

  // ── Clientes Nacionales y del Exterior ──
  const clientesSubRow = f; f++
  const iniC = f
  for (const [key, nombre] of buildUnion('clientes')) {
    writeRow(f, toNombrePropio(nombre), idx.map(i => snapTercero(i, key, 'clientes')),
      { brd: bDashedTop, indent: '   ' }); f++
  }
  const finC = f - 1
  writeFormula(clientesSubRow, 'Clientes Nacionales y del Exterior',
    (letra) => finC >= iniC ? `${letra}${iniC}:${letra}${finC}` : '',
    idx.map(i => snap(i, p => p.activoCorriente.clientesTotal)),
    { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
  f++ // separador

  // ── Anticipos y Avances ──
  const anticiposSubRow = f; f++
  const filasSubAnt: number[] = []
  const ult = r.periodos[r.periodos.length - 1]
  const anticiposSubcs = ult?.activoCorriente.anticiposDetalle ?? []

  if (anticiposSubcs.length > 0) {
    for (const sc of anticiposSubcs) {
      const filaSub = f; f++
      const tercerosMapa = new Map<string, string>()
      for (const p of r.periodos) {
        const found = p.activoCorriente.anticiposDetalle?.find(x => x.codigo === sc.codigo)
        for (const t of found?.terceros ?? []) {
          if (Math.abs(t.saldoFinal) < 1) continue
          const key = String(t.nit || t.nombreTercero); if (!key || tercerosMapa.has(key)) continue
          const nombre = !esNumerico(t.nombreTercero) ? t.nombreTercero : !esNumerico(t.nit) ? String(t.nit) : (t.nombreTercero ?? '')
          tercerosMapa.set(key, nombre)
        }
      }
      const iniT = f
      for (const [nitKey, nombre] of [...tercerosMapa.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
        writeRow(f, toNombrePropio(nombre), idx.map(i => {
          const pd = todosOrd[i]; if (!pd) return null
          const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio); if (!per) return null
          const found = per.activoCorriente.anticiposDetalle?.find(x => x.codigo === sc.codigo)
          const t = (found?.terceros ?? []).find(x => String(x.nit || x.nombreTercero) === nitKey)
          return t ? (t.saldoFinal || null) : null
        }), { brd: bDashedTop, indent: '   ' }); f++
      }
      const finT = f - 1
      const scVals = idx.map(i => {
        const pd = todosOrd[i]; if (!pd) return null
        const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio)
        return per?.activoCorriente.anticiposDetalle?.find(x => x.codigo === sc.codigo)?.total || null
      })
      if (finT >= iniT) writeFormula(filaSub, sc.nombre, (letra) => `${letra}${iniT}:${letra}${finT}`, scVals, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
      else writeRow(filaSub, sc.nombre, scVals, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
      filasSubAnt.push(filaSub)
      f++ // separador
    }
    writeFormula(anticiposSubRow, 'Anticipos y Avances',
      (letra) => filasSubAnt.map(fr => `${letra}${fr}`).join(','),
      idx.map(i => snap(i, p => p.activoCorriente.anticiposTotal)),
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
  } else {
    const iniA = f
    for (const [key, nombre] of buildUnion('anticipos')) {
      writeRow(f, toNombrePropio(nombre), idx.map(i => snapTercero(i, key, 'anticipos')),
        { brd: bDashedTop, indent: '   ' }); f++
    }
    const finA = f - 1
    writeFormula(anticiposSubRow, 'Anticipos y Avances',
      (letra) => finA >= iniA ? `${letra}${iniA}:${letra}${finA}` : '',
      idx.map(i => snap(i, p => p.activoCorriente.anticiposTotal)),
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    f++
  }

  // ── Otros Deudores (1360/1370/1380 - antes escondidos en el total) ──
  const otrosDeud = ult?.activoCorriente.otrosDeudoresDetalle ?? []
  let otrosDeudRow = 0
  if (otrosDeud.length > 0) {
    otrosDeudRow = f; f++
    const iniOD = f
    for (const sc of otrosDeud) {
      writeRow(f, toNombrePropio(sc.nombre), idx.map(i => {
        const pd = todosOrd[i]; if (!pd) return null
        const per = r.periodos.find(x => x.mes === pd.mes && x.anio === pd.anio); if (!per) return null
        return per.activoCorriente.otrosDeudoresDetalle?.find(x => x.codigo === sc.codigo)?.total || null
      }), { brd: bDashedTop, indent: '   ' }); f++
    }
    const finOD = f - 1
    writeFormula(otrosDeudRow, 'Otros Deudores',
      (letra) => finOD >= iniOD ? `${letra}${iniOD}:${letra}${finOD}` : '',
      idx.map(i => snap(i, p => p.activoCorriente.otrosDeudoresTotal)),
      { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    f++
  }

  // ── TOTAL "Cuentas Por Cobrar" (fila 10) = Clientes + Anticipos + Otros Deudores ──
  writeFormula(10, 'Cuentas Por Cobrar',
    (letra) => otrosDeudRow > 0
      ? `${letra}${clientesSubRow},${letra}${anticiposSubRow},${letra}${otrosDeudRow}`
      : `${letra}${clientesSubRow},${letra}${anticiposSubRow}`,
    idx.map(i => snap(i, p => p.activoCorriente.clientesTotal + p.activoCorriente.anticiposTotal
      + (otrosDeud.length > 0 ? p.activoCorriente.otrosDeudoresTotal : 0))),
    { bold: true, fillColor: AZUL_H, brd: bDblTop },
    (letra, slot) => { const p = todosOrd[slot]; if (p) reg?.publicar(`cxc:${p.anio}-${p.mes}`, 'CXC', `${letra}10`) })
}