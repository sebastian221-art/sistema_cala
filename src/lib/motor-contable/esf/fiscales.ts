// src/lib/motor-contable/esf/fiscales.ts
// ─────────────────────────────────────────────────────────────
// NOTA: FISCALES  (migrada a Nivel B)
// Calibri; columnas fijas 2-4 / 6-8; total fila 9; 5 secciones desde fila 11:
//   Retención Fuente · ICA · ICA Retenido · Impuesto a las Ventas · De renta.
// Nivel B: cada sección = SUMA(su detalle); total (9) = SUMA(secciones).
// Publica el total.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
// tipos que usa la nota
type ItemDetalle = { codigo: string; nombre: string; valor: number }
import { C, FMT_PESOS, solid, font } from './_shared'
import { aplicarReglasNota, soloReglasNota, type ReglaNota } from '../reglasNota'

export function hojaFISCALES(wb: ExcelJS.Workbook, r: ResultadoMotor, reg?: RegistroCeldas) {
  // ── Reglas de nota con CANDADO DE CUADRE (editables por la contadora vía IA) ──
  const reglasNota: ReglaNota[] = soloReglasNota((r as any).perfil?.reglas ?? [])
  const ultRN = r.periodos[r.periodos.length - 1]
  const detalleBaseRN = ((ultRN as any)?.pasivoCorriente.reteDetalleSubcuentas ?? []).map((x: any) => ({ codigo: String(x.codigo), nombre: x.nombre, valor: x.valor }))
  const fuentePrefijoRN = (pref: string) => detalleBaseRN.filter((x: any) => String(x.codigo).startsWith(pref))
  const rnNota = aplicarReglasNota('FISCALES', detalleBaseRN, (ultRN as any)?.pasivoCorriente.fiscalesTotal ?? 0, reglasNota, fuentePrefijoRN)
  const nombreEfectivo = (cod: string, nombreBase: string): string => {
    const l = rnNota.detalle.find(x => cod.startsWith(x.codigo) || x.codigo.startsWith(cod)); return l ? l.nombre : nombreBase
  }
  if (rnNota.rechazadas.length > 0 && Array.isArray((r as any).advertencias)) {
    for (const rz of rnNota.rechazadas) (r as any).advertencias.push('⚠ ' + rz.motivo)
  }

  const ws = wb.addWorksheet('FISCALES')
  ws.showGridLines = false

  const NAVY = C.AZUL_TOTAL, AZUL_H = 'FFD9E1F2', GRIS_ITEM = C.GRIS_SUBTOTAL, NEGRO = C.NEGRO, BLANC = C.BLANCO, AMARILLO = 'FFFFFF00'
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
  const grpAct = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt = periOrd.filter(p => p.anio !== anioAct).slice(0, 3)

  ws.getColumn(1).width = 30.71
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
      const c = ws.getCell(fila, 2+i); c.value = valor(p); c.font = fnt(true, BLANC, 8); c.fill = solid(NAVY); c.alignment = aln('center'); c.border = bMedTop }
    for (let i = 0; i < 3; i++) { const p = grpAnt[i]; if (!p) continue
      const c = ws.getCell(fila, 6+i); c.value = valor(p); c.font = fnt(true, BLANC, 8); c.fill = solid(NAVY); c.alignment = aln('center'); c.border = bMedTop }
  }
  cab(6, p => p.anio); cab(7, p => MESES[p.mes] ?? '')
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  const labelRete = (codigo: string, nombreOriginal: string): string => {
    const mapa: Record<string, string> = {
      '236505':'Salarios y pagos laborales','236515':'Honorarios 10%','236525':'Servicios 6%',
      '236530':'Arrendamientos 3.5%','236535':'Honorarios al exterior 10%','236540':'Compras 2.5%',
      '236545':'Contratos de construcción 2%','236550':'Dividendos 20%','236560':'Rendimientos financieros 7%',
      '236565':'Loterías y rifas 20%','236570':'Pagos al exterior','236575':'Autorretenciones','236580':'Otras retenciones',
    }
    return mapa[codigo] ?? nombreOriginal
  }

  const writeRow = (rowN: number, label: string,
    gAct: (p: PeriodoCalculado) => number | null, gAnt: (p: PeriodoCalculado) => number | null,
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean; yellowFill?: boolean }) => {
    const cL = ws.getCell(rowN, 1); cL.value = (opts.indent ? '   ' : '') + label
    cL.font = fnt(opts.bold ?? false, NEGRO, 9); cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = solid(opts.fillColor)
    const put = (grp: PeriodoCalculado[], base: number, g: (p: PeriodoCalculado) => number | null) => {
      for (let i = 0; i < 3; i++) { const p = grp[i] ?? null; const c = ws.getCell(rowN, base + i)
        const v = p ? (g(p) ?? null) : null; c.value = v
        c.font = fnt(opts.bold ?? false, NEGRO, 9); c.alignment = aln('right'); c.numFmt = FMT_PESOS
        if (opts.fillColor) c.fill = solid(opts.fillColor)
        if (opts.yellowFill && p && (v ?? 0) < 0) c.fill = solid(AMARILLO)
        if (opts.brd) c.border = opts.brd }
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

  const getDetalle = (p: PeriodoCalculado | null, key: keyof PeriodoCalculado['pasivoCorriente'], cod: string): number | null => {
    const arr = (p?.pasivoCorriente as any)?.[key] as ItemDetalle[] | undefined
    return arr?.find(x => x.codigo === cod)?.valor ?? null
  }

  let fila = 11
  const filasSeccion: number[] = []

  const writeSection = (titulo: string, subtotalFn: (p: PeriodoCalculado) => number,
    detalleKey: string, opts: { ivaMode?: boolean; labelFn?: (c: string, n: string) => string } = {}) => {
    const itemsUnion = new Map<string, string>()
    for (const p of r.periodos)
      for (const item of (((p.pasivoCorriente as any)[detalleKey] as ItemDetalle[]) ?? []))
        if (!itemsUnion.has(item.codigo)) itemsUnion.set(item.codigo, item.nombre)
    const detalle = [...itemsUnion.entries()].sort((a, b) => a[0].localeCompare(b[0]))

    const filaSub = fila; fila++
    const ini = fila
    for (const [codigo, nombreOriginal] of detalle) {
      const label = opts.labelFn ? opts.labelFn(codigo, nombreOriginal) : nombreOriginal
      writeRow(fila, label,
        p => getDetalle(p, detalleKey as any, codigo), p => getDetalle(p, detalleKey as any, codigo),
        { bold: false, brd: bDashedTop, indent: true, yellowFill: opts.ivaMode }); fila++
    }
    const fin = fila - 1
    if (fin >= ini) writeFormula(filaSub, titulo, (letra) => `${letra}${ini}:${letra}${fin}`, subtotalFn, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    else writeRow(filaSub, titulo, subtotalFn, subtotalFn, { bold: true, fillColor: GRIS_ITEM, brd: bDblTop })
    filasSeccion.push(filaSub)
    fila++
  }

  writeSection('Retencion Fuente', p => p.pasivoCorriente.reteTotal, 'reteDetalleSubcuentas', { labelFn: labelRete })
  writeSection('Impuesto Industria y Comercio', p => p.pasivoCorriente.icaTotal, 'icaDetalleSubcuentas')
  writeSection('Impuesto al ICA Retenido', p => p.pasivoCorriente.icaRetenido, 'icaRetenidoDetalleSubcuentas')
  writeSection('Impuesto a las Ventas', p => {
    const d = (p.pasivoCorriente as any).ivaDetalleSubcuentas as ItemDetalle[] | undefined
    return d?.reduce((s, x) => s + x.valor, 0) ?? p.pasivoCorriente.ivaTotal
  }, 'ivaDetalleSubcuentas', { ivaMode: true })
  writeSection('De renta y complementarios', p => p.pasivoCorriente.impuestosRenta, 'rentaDetalleSubcuentas')

  // ── Total FISCALES (fila 9) = SUMA de las secciones ──
  writeFormula(9, ' Fiscales ',
    (letra) => filasSeccion.map(fr => `${letra}${fr}`).join(','),
    p => p.pasivoCorriente.reteTotal + p.pasivoCorriente.icaRetenido + p.pasivoCorriente.icaTotal +
         p.pasivoCorriente.ivaTotal + p.pasivoCorriente.impuestosRenta,
    { bold: true, fillColor: AZUL_H, brd: bDblTop },
    (p, letra) => reg?.publicar(`fiscales:${p.anio}-${p.mes}`, 'FISCALES', `${letra}9`))

  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5; ws.getRow(8).height = 15.75; ws.getRow(9).height = 14.25
}