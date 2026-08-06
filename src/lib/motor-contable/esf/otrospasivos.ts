// src/lib/motor-contable/esf/otrospasivos.ts
// ─────────────────────────────────────────────────────────────
// NOTA: OTROS PASIVOS  (migrada a Nivel B) — la más compleja del libro.
// Calibri; columnas fijas 2-4 / 6-8; total fila 9; 4 bloques desde fila 11:
//   1) Acreedores Varios          = SUMA(detalle)
//   2) Beneficios a Empleados     = SUMA(detalle SIN 2510 + provisiones)
//        (el original RESTA la 2510: beneficiosCorrTotal+provisionLaboralTotal-get2510,
//         así que la fórmula suma solo las filas que NO son 2510 → da idéntico)
//   3) Retenciones y Aportes Nómina = SUMA(EPS + ARP + Cajas + Pensiones)
//   4) Otros pasivos (28xx)       = SUMA(subcuentas); cada subcuenta = SUMA(terceros)
//   Total (9) = SUMA(los 4 subtotales).
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
type ItemDetalle = { codigo: string; nombre: string; valor: number }
import { C, FMT_PESOS, solid, font } from './_shared'

export function hojaOTROSPASIVOS(wb: ExcelJS.Workbook, r: ResultadoMotor, reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('OTROS PASIVOS')
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

  ws.getColumn(1).width = 35.0
  ws.getColumn(2).width = 14.0; ws.getColumn(3).width = 14.0; ws.getColumn(4).width = 14.0
  ws.getColumn(5).width = 2.0
  ws.getColumn(6).width = 14.0; ws.getColumn(7).width = 14.0; ws.getColumn(8).width = 14.0
  ws.getColumn(9).width = 1.71

  const setTit = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1); c.value = txt; c.font = fnt(true, NEGRO, 10); c.alignment = aln('center')
  }
  setTit(2, r.empresa); setTit(3, `NIT. ${r.nit}`); setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  const cab = (fila: number, valor: (p: PeriodoCalculado) => any) => {
    for (let i = 0; i < 3; i++) { const p = grpAct[i]; if (!p) continue
      const c = ws.getCell(fila, 2+i); c.value = valor(p); c.font = fnt(true, BLANC, 8); c.fill = solid(NAVY); c.alignment = aln('center') }
    for (let i = 0; i < 3; i++) { const p = grpAnt[i]; if (!p) continue
      const c = ws.getCell(fila, 6+i); c.value = valor(p); c.font = fnt(true, BLANC, 8); c.fill = solid(NAVY); c.alignment = aln('center') }
  }
  cab(6, p => p.anio); cab(7, p => MESES[p.mes] ?? '')
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  const writeRow = (rowN: number, label: string,
    gAct: (p: PeriodoCalculado) => number | null, gAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean }) => {
    const cL = ws.getCell(rowN, 1); cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = solid(opts.fillColor); if (opts.brd) cL.border = opts.brd
    const put = (grp: PeriodoCalculado[], base: number, g: (p: PeriodoCalculado) => number | null) => {
      for (let i = 0; i < 3; i++) { const p = grp[i] ?? null; const c = ws.getCell(rowN, base + i)
        c.value = p ? (g(p) ?? null) : null
        c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = aln('right'); c.numFmt = FMT_PESOS
        if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd }
    }
    put(grpAct, 2, gAct); put(grpAnt, 6, gAnt)
  }

  const writeFormula = (rowN: number, label: string, refPorCol: (letra: string) => string,
    res: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders> },
    publicar?: (p: PeriodoCalculado, letra: string) => void) => {
    const cL = ws.getCell(rowN, 1); cL.value = label; cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = solid(opts.fillColor); if (opts.brd) cL.border = opts.brd
    const put = (grp: PeriodoCalculado[], base: number) => {
      for (let i = 0; i < 3; i++) { const p = grp[i] ?? null; const cnum = base + i; const c = ws.getCell(rowN, cnum)
        if (p) { const letra = ws.getColumn(cnum).letter; const interior = refPorCol(letra)
          c.value = interior ? { formula: `SUM(${interior})`, result: res(p) ?? 0 } : (res(p) ?? null)
          if (publicar && interior) publicar(p, letra) } else c.value = null
        c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = aln('right'); c.numFmt = FMT_PESOS
        if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd }
    }
    put(grpAct, 2); put(grpAnt, 6)
  }

  const getCorr = (p: PeriodoCalculado, key: string, cod: string): number | null =>
    ((p.pasivoCorriente as any)[key] as ItemDetalle[] | undefined)?.find(x => x.codigo === cod)?.valor ?? null
  const getNC = (p: PeriodoCalculado, key: string, cod: string): number | null => {
    const arr = (p.pasivoNoCorriente as any)[key] as ItemDetalle[] | undefined
    const v = arr?.filter(x => x.codigo.startsWith(cod)).reduce((s, x) => s + x.valor, 0) ?? 0
    return v || null
  }
  const get2510 = (p: PeriodoCalculado): number =>
    (p.pasivoCorriente.beneficiosDetalle ?? []).filter((x: any) => x.codigo.startsWith('2510')).reduce((s: number, x: any) => s + x.valor, 0)

  const ult = r.periodos[r.periodos.length - 1]
  const bloqueSubRows: number[] = []
  let fila = 11

  // ── BLOQUE 1: Acreedores Varios ──
  {
    const filaSub = fila; fila++
    const det = ult?.pasivoCorriente.acreedoresVariosDetalle ?? []
    const ini = fila
    for (const item of det) {
      writeRow(fila, item.nombre, p => getCorr(p, 'acreedoresVariosDetalle', item.codigo), p => getCorr(p, 'acreedoresVariosDetalle', item.codigo), { brd: bDashedTop, indent: true }); fila++
    }
    const fin = fila - 1
    if (fin >= ini) writeFormula(filaSub, 'Acreedores Varios', (l) => `${l}${ini}:${l}${fin}`, p => p.pasivoCorriente.acreedoresVariosTotal || null, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    else { writeRow(filaSub, 'Acreedores Varios', p => p.pasivoCorriente.acreedoresVariosTotal || null, p => p.pasivoCorriente.acreedoresVariosTotal || null, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop }); fila++ }
    bloqueSubRows.push(filaSub)
  }

  // ── BLOQUE 2: Beneficios a Empleados (clase 25, INCLUYE 2510) ──
  {
    const filaSub = fila; fila++
    const filasSuma: number[] = []
    const benefUnion = new Map<string, string>()
    for (const p of r.periodos) for (const it of (p.pasivoCorriente.beneficiosDetalle ?? [])) if (!benefUnion.has(it.codigo)) benefUnion.set(it.codigo, it.nombre)
    for (const [cod, nombre] of [...benefUnion.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      writeRow(fila, nombre, p => getCorr(p, 'beneficiosDetalle', cod), p => getCorr(p, 'beneficiosDetalle', cod), { brd: bDashedTop, indent: true })
      filasSuma.push(fila); fila++ // 2510 AHORA se incluye
    }
    const resBenef = (p: PeriodoCalculado) => p.pasivoCorriente.beneficiosCorrTotal || null
    if (filasSuma.length > 0) writeFormula(filaSub, 'Beneficios a Empleados', (l) => filasSuma.map(fr => `${l}${fr}`).join(','), resBenef, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    else writeRow(filaSub, 'Beneficios a Empleados', resBenef, resBenef, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    bloqueSubRows.push(filaSub)
    fila++ // separador
  }

  // ── BLOQUE 2b: Pasivos Estimados y Provisiones (clase 26 - X TERCERO) ──
  {
    const provUnion = new Map<string, string>()
    for (const p of r.periodos) for (const it of (p.pasivoNoCorriente.provisionDetalle ?? [])) if (!provUnion.has(it.codigo)) provUnion.set(it.codigo, it.nombre)
    if (provUnion.size > 0) {
      const filaSub = fila; fila++
      const filasProv: number[] = []
      for (const [cod, nombre] of [...provUnion.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        writeRow(fila, nombre, p => getNC(p, 'provisionDetalle', cod), p => getNC(p, 'provisionDetalle', cod), { brd: bDashedTop, indent: true })
        filasProv.push(fila); fila++
      }
      const resProv = (p: PeriodoCalculado) => p.pasivoNoCorriente.provisionLaboralTotal || null
      if (filasProv.length > 0) writeFormula(filaSub, 'Pasivos Estimados y Provisiones', (l) => filasProv.map(fr => `${l}${fr}`).join(','), resProv, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
      else writeRow(filaSub, 'Pasivos Estimados y Provisiones', resProv, resProv, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
      bloqueSubRows.push(filaSub)
      fila++ // separador
    }
  }

  // ── BLOQUE 3: Retenciones y Aportes de Nómina (EPS+ARP+Cajas+Pensiones) ──
  {
    const filaSub = fila; fila++
    const ini = fila
    writeRow(fila, 'Entidades Promotoras de Salud', p => p.pasivoCorriente.aporteEPS, p => p.pasivoCorriente.aporteEPS, { brd: bDashedTop, indent: true }); fila++
    writeRow(fila, 'Administradoras de Riesgos', p => p.pasivoCorriente.aporteARL, p => p.pasivoCorriente.aporteARL, { brd: bDashedTop, indent: true }); fila++
    writeRow(fila, 'Aportes Cajas de Compensación', p => p.pasivoCorriente.aporteICBF, p => p.pasivoCorriente.aporteICBF, { brd: bDashedTop, indent: true }); fila++
    writeRow(fila, 'Aportes Fondo de pensiones', p => p.pasivoCorriente.aportePension, p => p.pasivoCorriente.aportePension, { brd: bDashedTop, indent: true }); fila++
    const fin = fila - 1
    writeFormula(filaSub, 'Retenciones y Aportes de Nomina', (l) => `${l}${ini}:${l}${fin}`, p => p.pasivoCorriente.aporteNomina || null, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    bloqueSubRows.push(filaSub)
    fila++ // separador
  }

  // ── BLOQUE 4: Otros pasivos (28xx) → subcuentas → terceros ──
  {
    const filaSub = fila; fila++
    const sub28Union = new Map<string, string>()
    for (const p of r.periodos) for (const sc of (p.pasivoNoCorriente.otrosPasivos28Detalle ?? [])) if (!sub28Union.has(sc.codigo)) sub28Union.set(sc.codigo, sc.nombre)
    const filasSub28: number[] = []
    for (const [cod, nombre] of [...sub28Union.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const filaSc = fila; fila++
      const tercUnion = new Map<string, string>()
      for (const p of r.periodos) {
        const sc = (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).find(x => x.codigo === cod)
        for (const t of (sc?.terceros ?? [])) { const key = String(t.nit || t.nombreTercero); if (key && !tercUnion.has(key)) tercUnion.set(key, t.nombreTercero || String(t.nit)) }
      }
      const iniT = fila
      for (const [nitKey, nombreDisplay] of tercUnion) {
        writeRow(fila, nombreDisplay, p => {
          const sc = (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).find(x => x.codigo === cod)
          return (sc?.terceros ?? []).find(x => String(x.nit || x.nombreTercero) === nitKey)?.saldoFinal ?? null
        }, p => {
          const sc = (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).find(x => x.codigo === cod)
          return (sc?.terceros ?? []).find(x => String(x.nit || x.nombreTercero) === nitKey)?.saldoFinal ?? null
        }, { brd: bDashedTop, indent: true }); fila++
      }
      const finT = fila - 1
      const resSc = (p: PeriodoCalculado) => (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).find(x => x.codigo === cod)?.total || null
      if (finT >= iniT) writeFormula(filaSc, nombre, (l) => `${l}${iniT}:${l}${finT}`, resSc, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
      else writeRow(filaSc, nombre, resSc, resSc, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
      filasSub28.push(filaSc)
    }
    const total28 = (p: PeriodoCalculado) => (p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).reduce((s, x) => s + x.total, 0) || null
    if (filasSub28.length > 0) writeFormula(filaSub, 'Otros pasivos', (l) => filasSub28.map(fr => `${l}${fr}`).join(','), total28, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    else writeRow(filaSub, 'Otros pasivos', total28, total28, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    bloqueSubRows.push(filaSub)
  }

  // ── TOTAL "Otros Pasivos" (fila 9) = SUMA de los 4 subtotales de bloque ──
  const totalOP = (p: PeriodoCalculado) =>
    (p.pasivoCorriente.acreedoresVariosTotal ?? 0) +
    p.pasivoCorriente.beneficiosCorrTotal +
    p.pasivoNoCorriente.provisionLaboralTotal +
    p.pasivoCorriente.aporteNomina +
    ((p.pasivoNoCorriente.otrosPasivos28Detalle ?? []).reduce((s, x) => s + x.total, 0))
  writeFormula(9, ' Otros Pasivos ',
    (l) => bloqueSubRows.map(fr => `${l}${fr}`).join(','),
    p => totalOP(p) || null,
    { bold: true, fillColor: AZUL_H, brd: bDblTop },
    (p, letra) => reg?.publicar(`otrospasivos:${p.anio}-${p.mes}`, 'OTROS PASIVOS', `${letra}9`))

  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5; ws.getRow(9).height = 14.25
}