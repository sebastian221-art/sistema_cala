// src/lib/motor-contable/esf/otrascxc.ts
// ─────────────────────────────────────────────────────────────
// NOTA: OTRAS CXC  (migrada a Nivel B)
// OJO: fuente Calibri; columnas FIJAS (actual 2-4, sep 5, anterior 6-8);
// encabezado año fila 6 / mes fila 7; total fila 9; subtotal fila 11; detalle 12+.
// Nivel B: subtotal (11) = SUMA(detalle); total (9) = SUMA(subtotal). Publica total.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid, font, alnC } from './_shared'
import { aplicarReglasNota, soloReglasNota, type ReglaNota } from '../reglasNota'

export function hojaOTRASCXC(wb: ExcelJS.Workbook, r: ResultadoMotor, reg?: RegistroCeldas) {
  // ── Reglas de nota con CANDADO DE CUADRE (editables por la contadora vía IA) ──
  const reglasNota: ReglaNota[] = soloReglasNota((r as any).perfil?.reglas ?? [])
  const ultRN = r.periodos[r.periodos.length - 1]
  const detalleBaseRN = ((ultRN as any)?.activoCorriente.anticImpuestosDetalle ?? []).map((x: any) => ({ codigo: String(x.codigo), nombre: x.nombre, valor: x.valor }))
  const fuentePrefijoRN = (pref: string) => detalleBaseRN.filter((x: any) => String(x.codigo).startsWith(pref))
  const rnNota = aplicarReglasNota('OTRAS CXC', detalleBaseRN, (ultRN as any)?.activoCorriente.anticipoImpuestosTotal ?? 0, reglasNota, fuentePrefijoRN)
  const nombreEfectivo = (cod: string, nombreBase: string): string => {
    const l = rnNota.detalle.find(x => cod.startsWith(x.codigo) || x.codigo.startsWith(cod)); return l ? l.nombre : nombreBase
  }
  if (rnNota.rechazadas.length > 0 && Array.isArray((r as any).advertencias)) {
    for (const rz of rnNota.rechazadas) (r as any).advertencias.push('⚠ ' + rz.motivo)
  }

  const ws = wb.addWorksheet('OTRAS CXC')
  ws.showGridLines = false

  const NAVY = C.AZUL_TOTAL, AZUL_H = 'FFD9E1F2', GRIS_ITEM = C.GRIS_SUBTOTAL, NEGRO = C.NEGRO, BLANC = C.BLANCO

  // fuente Calibri (esta nota usa Calibri, no Arial)
  const fnt = (bold = false, color: string = NEGRO, size = 9) => font(bold, color, size, false, 'Calibri')
  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> => ({ horizontal: h, vertical: 'middle' })

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

  ws.getColumn(1).width = 34
  ws.getColumn(2).width = 14.71; ws.getColumn(3).width = 14.71; ws.getColumn(4).width = 14.71
  ws.getColumn(5).width = 1.71
  ws.getColumn(6).width = 14.71; ws.getColumn(7).width = 14.71; ws.getColumn(8).width = 14.71
  ws.getColumn(9).width = 1.71

  const setTitulo = (rowN: number, txt: string) => {
    ws.mergeCells(rowN, 1, rowN, 8)
    const c = ws.getCell(rowN, 1); c.value = txt; c.font = fnt(true, NEGRO, 10); c.alignment = aln('center')
  }
  setTitulo(2, r.empresa); setTitulo(3, `NIT. ${r.nit}`); setTitulo(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  const cab = (fila: number, valor: (p: PeriodoCalculado) => any) => {
    for (let i = 0; i < 3; i++) { const p = grpAct[i]; if (!p) continue
      const c = ws.getCell(fila, 2 + i); c.value = valor(p); c.font = fnt(true, BLANC, 8)
      c.fill = solid(NAVY); c.alignment = aln('center'); c.border = bMedTop }
    for (let i = 0; i < 3; i++) { const p = grpAnt[i]; if (!p) continue
      const c = ws.getCell(fila, 6 + i); c.value = valor(p); c.font = fnt(true, BLANC, 8)
      c.fill = solid(NAVY); c.alignment = aln('center'); c.border = bMedTop }
  }
  cab(6, p => p.anio); cab(7, p => MESES[p.mes] ?? '')

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  const writeRow = (
    rowN: number, label: string,
    g: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean }
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = solid(opts.fillColor); if (opts.brd) cL.border = opts.brd
    const put = (grp: PeriodoCalculado[], base: number) => {
      for (let i = 0; i < 3; i++) {
        const p = grp[i] ?? null; const c = ws.getCell(rowN, base + i)
        c.value = p ? (g(p) ?? null) : null
        c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = aln('right'); c.numFmt = FMT_PESOS
        if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd
      }
    }
    put(grpAct, 2); put(grpAnt, 6)
  }

  const writeFormula = (
    rowN: number, label: string,
    refPorCol: (letra: string) => string,
    res: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders> },
    publicar?: (p: PeriodoCalculado, letra: string) => void,
  ) => {
    const cL = ws.getCell(rowN, 1)
    cL.value = label; cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = solid(opts.fillColor); if (opts.brd) cL.border = opts.brd
    const put = (grp: PeriodoCalculado[], base: number) => {
      for (let i = 0; i < 3; i++) {
        const p = grp[i] ?? null; const cnum = base + i; const c = ws.getCell(rowN, cnum)
        if (p) {
          const letra = ws.getColumn(cnum).letter
          const interior = refPorCol(letra)
          c.value = interior ? { formula: `SUM(${interior})`, result: res(p) ?? 0 } : (res(p) ?? null)
          if (publicar && interior) publicar(p, letra)
        } else c.value = null
        c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = aln('right'); c.numFmt = FMT_PESOS
        if (opts.fillColor) c.fill = solid(opts.fillColor); if (opts.brd) c.border = opts.brd
      }
    }
    put(grpAct, 2); put(grpAnt, 6)
  }

  // ── Detalle (12+) ──
  const detalleUnion = new Map<string, string>()
  for (const p of r.periodos)
    for (const item of (p.activoCorriente.anticImpuestosDetalle ?? []))
      if (!detalleUnion.has(item.codigo)) detalleUnion.set(item.codigo, item.nombre)
  const detalleItems = [...detalleUnion.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  let fila = 12
  const iniDet = fila
  if (detalleItems.length > 0) {
    for (const [codigo, nombre] of detalleItems) {
      writeRow(fila, nombreEfectivo(codigo, nombre),
        p => p.activoCorriente.anticImpuestosDetalle?.find(x => x.codigo === codigo)?.valor ?? null,
        { bold: false, brd: bDashedTop, indent: true })
      fila++
    }
  } else {
    const items = [
      { label: 'Retención en la Fuente', get: (p: PeriodoCalculado) => p.activoCorriente.anticReteFuente },
      { label: 'Anticipo Impuesto Renta', get: (p: PeriodoCalculado) => p.activoCorriente.anticRenta },
      { label: 'Impuesto Industria y Comercio Retenido', get: (p: PeriodoCalculado) => p.activoCorriente.anticICA },
    ]
    for (const item of items) { writeRow(fila, item.label, item.get, { bold: false, brd: bDashedTop, indent: true }); fila++ }
  }
  const finDet = fila - 1

  // ── F11: "Anticipo de Impuestos" (subtotal) = SUMA(detalle) ──
  writeFormula(11, 'Anticipo de Impuestos',
    (letra) => finDet >= iniDet ? `${letra}${iniDet}:${letra}${finDet}` : '',
    p => p.activoCorriente.anticipoImpuestosTotal,
    { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })

  // ── F9: "Otras Cuentas Por Cobrar" (total) = SUMA(subtotal fila 11) ──
  writeFormula(9, 'Otras Cuentas Por Cobrar',
    (letra) => `${letra}11`,
    p => p.activoCorriente.anticipoImpuestosTotal,
    { bold: true, fillColor: AZUL_H, brd: bDblTop },
    (p, letra) => reg?.publicar(`otrascxc:${p.anio}-${p.mes}`, 'OTRAS CXC', `${letra}9`))

  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5; ws.getRow(8).height = 15.75
  ws.getRow(9).height = 14.25; ws.getRow(10).height = 14.25; ws.getRow(11).height = 14.25
}