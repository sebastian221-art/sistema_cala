// src/lib/motor-contable/esf/esf.ts
// ─────────────────────────────────────────────────────────────
// HOJA: ESF (Estado de Situación Financiera)  (migrada a Nivel B)
//
// Los renglones base usan el MOTOR DE REGLAS (renglonesESF), que puede
// redistribuir montos entre líneas. Por eso NO se encadenan a las notas
// (una regla rompería esa relación). En cambio:
//   • Cada renglón base = su valor (ya procesado por las reglas).
//   • TODOS los totales/subtotales = FÓRMULAS que suman los renglones.
//   • Total Patrimonio = Total Activo − Total Pasivo (cuadre garantizado).
//   • Total Pasivo + Patrimonio = Total Pasivo + Total Patrimonio.
// Resultado: el ESF recalcula solo al cambiar cualquier cifra, respeta las
// reglas y queda idéntico al original.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { renglonesESF, ETIQUETA_DE, type RenglonId } from '../reglas'
import { reglasDesdePerfil } from '@/lib/perfiles/calcularSimilitud'
import { C, FMT_PESOS, solid as sfill, font as fnt, alnC, alnL, alnR, bordeThin as bThin } from './_shared'

export function hojaESF(wb: ExcelJS.Workbook, r: ResultadoMotor, _reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('ESF')
  ws.showGridLines = false

  const N = Math.min(r.periodos.length, 9)
  const periOrd = [...r.periodos].reverse().slice(0, N)
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()

  const ROJO_ACT = 'FF903032', DORADO_ANT = 'FFBF8F00', NEGRO = C.NEGRO, BLANC = C.BLANCO
  const LAST = 6 + N

  ws.getColumn(1).width = 1.4
  ws.getColumn(2).width = 33.3
  ws.getColumn(3).width = 1.1
  ws.getColumn(4).width = 6.1
  ws.getColumn(5).width = 1.1
  for (let i = 0; i < N; i++) ws.getColumn(6 + i).width = 16.4
  ws.getColumn(6 + N).width = 1.71

  const setTit = (rowN: number, txt: string, italic = true, sz = 10) => {
    ws.mergeCells(rowN, 1, rowN, LAST)
    const c = ws.getCell(rowN, 1); c.value = txt; c.font = fnt(true, NEGRO, sz, italic); c.alignment = alnC
  }
  setTit(2, r.empresa, true, 11)
  setTit(3, `NIT. ${r.nit}`, true, 10)
  setTit(4, 'ESTADO DE SITUACIÓN FINANCIERA INDIVIDUALES A:', true, 10)
  setTit(5, '(Cifra expresadas en pesos Colombianos)', true, 9)

  const cActH = ws.getCell(8, 2); cActH.value = 'ACTIVO'; cActH.font = fnt(true, BLANC, 10); cActH.fill = sfill(C.VERDE_HEADER); cActH.alignment = alnC
  const cNotaH = ws.getCell(8, 4); cNotaH.value = 'NOTA'; cNotaH.font = fnt(true, BLANC, 9); cNotaH.fill = sfill(C.VERDE_HEADER); cNotaH.alignment = alnC; cNotaH.border = bThin
  periOrd.forEach((p, i) => {
    const c = ws.getCell(8, 6 + i)
    c.value = fechaCorte(p.mes, p.anio); c.font = fnt(true, BLANC, 8)
    c.fill = sfill(p.anio === anioAct ? ROJO_ACT : DORADO_ANT); c.alignment = alnC; c.border = bThin
  })
  if (N > 0) { const cCont = ws.getCell(9, 6); cCont.value = 'contable'; cCont.font = fnt(false, NEGRO, 8); cCont.alignment = alnC }

  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 9 }]
  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 15; ws.getRow(5).height = 12
  ws.getRow(8).height = 18; ws.getRow(9).height = 13

  // Renglón de valores (base — ya procesado por las reglas)
  const esfRow = (rowN: number, label: string, valores: number[], opts: { nota?: number; bold?: boolean; fillArgb?: string; indent?: number }) => {
    const indent = '  '.repeat(opts.indent ?? 0)
    const isGreenH = opts.fillArgb === C.VERDE_HEADER
    const textColor = opts.fillArgb ? BLANC : NEGRO
    const fill = opts.fillArgb ? sfill(opts.fillArgb) : undefined
    if (isGreenH) for (let c = 1; c <= LAST; c++) ws.getCell(rowN, c).fill = sfill(C.VERDE_HEADER)
    const cL = ws.getCell(rowN, 2); cL.value = indent + label; cL.font = fnt(opts.bold ?? false, textColor, 9); cL.alignment = alnL
    if (!isGreenH) { if (fill) cL.fill = fill; cL.border = bThin }
    if (opts.nota !== undefined) {
      const cn = ws.getCell(rowN, 4); cn.value = opts.nota
      cn.font = { name: 'Arial', color: { argb: C.AZUL_LINK }, underline: true, size: 8 }; cn.alignment = alnC; cn.border = bThin
      if (fill) cn.fill = fill
    }
    valores.slice(0, N).forEach((v, i) => {
      const cv = ws.getCell(rowN, 6 + i); cv.value = v; cv.font = fnt(opts.bold ?? false, textColor, 9)
      cv.alignment = alnR; cv.numFmt = FMT_PESOS; cv.border = bThin; if (fill) cv.fill = fill
    })
  }

  // Renglón de TOTAL (fórmula). `interior(letra)` arma el interior del SUM.
  // `resVals` son los resultados cacheados por período (para verse idéntico).
  const esfTotal = (rowN: number, label: string, interior: (letra: string) => string, resVals: number[], opts: { fillArgb?: string } = {}) => {
    const fill = opts.fillArgb ? sfill(opts.fillArgb) : undefined
    const textColor = opts.fillArgb ? BLANC : NEGRO
    const cL = ws.getCell(rowN, 2); cL.value = label; cL.font = fnt(true, textColor, 9); cL.alignment = alnL
    if (fill) cL.fill = fill; cL.border = bThin
    for (let i = 0; i < N; i++) {
      const cnum = 6 + i; const c = ws.getCell(rowN, cnum)
      const letra = ws.getColumn(cnum).letter; const intr = interior(letra)
      c.value = intr ? { formula: intr, result: resVals[i] ?? 0 } : (resVals[i] ?? null)
      c.font = fnt(true, textColor, 9); c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin; if (fill) c.fill = fill
    }
  }

  const getResultadoBalance = (p: PeriodoCalculado): number =>
    p.totalActivo - p.totalPasivo - (p.patrimonio.capitalSocial ?? 0) - (p.patrimonio.superavitCapital ?? 0) -
    (p.patrimonio.reservas ?? 0) - (p.patrimonio.revalorizacion ?? 0) -
    (p.patrimonio.resultadoEjercicioAnterior ?? 0) - (p.patrimonio.resultadosAnteriores ?? 0)

  const v = (g: (p: PeriodoCalculado) => number) => periOrd.map(g)
  const reglas = reglasDesdePerfil(r.perfil)
  const R = (p: PeriodoCalculado) => renglonesESF(p, reglas)
  const rv = (id: RenglonId) => v(p => R(p)[id].valor)
  const et = (id: RenglonId) => periOrd.length ? R(periOrd[0])[id].etiqueta : ETIQUETA_DE[id]
  // suma de varios renglones por período (para el result cacheado de los totales)
  const sumaVals = (...arrs: number[][]) => periOrd.map((_, i) => arrs.reduce((s, a) => s + (a[i] ?? 0), 0))
  const lista = (letra: string, filas: number[]) => filas.map(fr => `${letra}${fr}`).join('+')

  let f = 10

  // ══ ACTIVO CORRIENTE ══
  esfRow(f, 'Corrientes', [], { bold: true }); f++
  const rEfec = f; esfRow(f, et('efectivo'), rv('efectivo'), { nota: 4, indent: 1 }); f++
  const rInv = f; esfRow(f, et('inversiones'), rv('inversiones'), { nota: 5, indent: 1 }); f++
  const rCxc = f; esfRow(f, et('cuentasPorCobrar'), rv('cuentasPorCobrar'), { nota: 6, indent: 1 }); f++
  const rItv = f; esfRow(f, et('inventarios'), rv('inventarios'), { nota: 7, indent: 1 }); f++
  const filActCorr = [rEfec, rInv, rCxc, rItv]
  const rTotActCorr = f
  esfTotal(f, 'Total ', (l) => lista(l, filActCorr),
    sumaVals(rv('efectivo'), rv('inversiones'), rv('cuentasPorCobrar'), rv('inventarios'), rv('otrosActivosCorrientes')),
    { fillArgb: C.AZUL_TOTAL }); f += 2

  // ══ ACTIVO NO CORRIENTE ══
  esfRow(f, 'No corrientes', [], { bold: true }); f++
  const rPpye = f; esfRow(f, et('ppye'), rv('ppye'), { nota: 8, indent: 1 }); f++
  const rOtrosANC = f; esfRow(f, et('otrosActivosNoCorrientes'), rv('otrosActivosNoCorrientes'), { nota: 8, indent: 1 }); f++
  const rTotActNC = f
  esfTotal(f, 'Total ', (l) => lista(l, [rPpye, rOtrosANC]), sumaVals(rv('ppye'), rv('otrosActivosNoCorrientes')), { fillArgb: C.AZUL_TOTAL }); f += 2

  const rTotActivo = f
  esfTotal(f, 'Total Activo', (l) => `${l}${rTotActCorr}+${l}${rTotActNC}`,
    sumaVals(rv('efectivo'), rv('inversiones'), rv('cuentasPorCobrar'), rv('inventarios'), rv('otrosActivosCorrientes'), rv('ppye'), rv('otrosActivosNoCorrientes')),
    { fillArgb: C.AZUL_TOTAL }); f += 3

  // ══ PASIVOS ══
  esfRow(f, 'PASIVOS', [], { bold: true, fillArgb: C.VERDE_HEADER }); f += 2
  esfRow(f, 'Corrientes', [], { bold: true }); f++
  const rFinC = f; esfRow(f, et('financierosCorriente'), rv('financierosCorriente'), { nota: 9, indent: 1 }); f++
  const rProv = f; esfRow(f, et('proveedores'), rv('proveedores'), { nota: 10, indent: 1 }); f++
  const rCGP = f; esfRow(f, et('costosGastosPagar'), rv('costosGastosPagar'), { nota: 11, indent: 1 }); f++
  const rFisc = f; esfRow(f, et('fiscales'), rv('fiscales'), { nota: 10, indent: 1 }); f++
  const rBenE = f; esfRow(f, et('beneficiosEmpleados'), rv('beneficiosEmpleados'), { nota: 12, indent: 1 }); f++
  const rOtrPC = f; esfRow(f, et('otrosPasivosCorriente'), rv('otrosPasivosCorriente'), { nota: 12, indent: 1 }); f++
  const filPasCorr = [rFinC, rProv, rCGP, rFisc, rBenE, rOtrPC]
  const rTotPasCorr = f
  esfTotal(f, 'Total ', (l) => lista(l, filPasCorr),
    sumaVals(rv('financierosCorriente'), rv('proveedores'), rv('costosGastosPagar'), rv('fiscales'), rv('beneficiosEmpleados'), rv('otrosPasivosCorriente')),
    { fillArgb: C.AZUL_TOTAL }); f += 2

  esfRow(f, 'No corrientes', [], { bold: true }); f++
  const rFinNC = f; esfRow(f, et('financierosNoCorriente'), rv('financierosNoCorriente'), { nota: 9, indent: 1 }); f++
  const rBenNC = f; esfRow(f, et('beneficiosNoCorriente'), rv('beneficiosNoCorriente'), { nota: 12, indent: 1 }); f++
  const rOtrNC = f; esfRow(f, et('otrosPasivosNoCorriente'), rv('otrosPasivosNoCorriente'), { nota: 12, indent: 1 }); f++
  const rTotPasNC = f
  esfTotal(f, 'Total ', (l) => lista(l, [rFinNC, rBenNC, rOtrNC]),
    sumaVals(rv('financierosNoCorriente'), rv('beneficiosNoCorriente'), rv('otrosPasivosNoCorriente')), { fillArgb: C.AZUL_TOTAL }); f += 2

  const rTotPasivo = f
  esfTotal(f, 'Total Pasivo', (l) => `${l}${rTotPasCorr}+${l}${rTotPasNC}`,
    sumaVals(rv('financierosCorriente'), rv('proveedores'), rv('costosGastosPagar'), rv('fiscales'), rv('beneficiosEmpleados'), rv('otrosPasivosCorriente'),
      rv('financierosNoCorriente'), rv('beneficiosNoCorriente'), rv('otrosPasivosNoCorriente')),
    { fillArgb: C.AZUL_TOTAL }); f += 3

  // ══ PATRIMONIO ══
  esfRow(f, 'PATRIMONIO', [], { bold: true, fillArgb: C.VERDE_HEADER }); f += 2
  const rCap = f; esfRow(f, 'Capital Social', v(p => p.patrimonio.capitalSocial), { nota: 13, indent: 1 }); f++
  const rRes = f; esfRow(f, 'Reserva Legal', v(p => p.patrimonio.reservas), { nota: 13, indent: 1 }); f++
  const rREA = f; esfRow(f, 'Resultado Ejercicios Anteriores', v(p => (p.patrimonio.resultadoEjercicioAnterior ?? 0) + (p.patrimonio.resultadosAnteriores ?? 0)), { nota: 13, indent: 1 }); f++
  const rREj = f; esfRow(f, 'Resultado Ejercicio', v(p => getResultadoBalance(p)), { nota: 13, indent: 1 }); f++
  const rTotPatr = f
  // Total Patrimonio = Total Activo − Total Pasivo (cuadre garantizado)
  esfTotal(f, 'Total Patrimonio', (l) => `${l}${rTotActivo}-${l}${rTotPasivo}`,
    v(p => p.totalActivo - p.totalPasivo), { fillArgb: C.AZUL_TOTAL }); f += 2

  // Total Pasivo + Patrimonio = Total Pasivo + Total Patrimonio  (= Total Activo)
  esfTotal(f, 'Total Pasivo + Patrimonio', (l) => `${l}${rTotPasivo}+${l}${rTotPatr}`,
    v(p => p.totalActivo), { fillArgb: C.AZUL_TOTAL }); f += 5
}

function fechaCorte(mes: number, anio: number): string {
  const dias = [31,28,31,30,31,30,31,31,30,31,30,31]
  const d = mes === 2 && (anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)) ? 29 : dias[mes - 1]
  return `${String(d).padStart(2,'0')}.${String(mes).padStart(2,'0')}.${anio}`
}