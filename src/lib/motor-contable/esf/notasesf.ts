// src/lib/motor-contable/esf/notasesf.ts
// ─────────────────────────────────────────────────────────────
// HOJA: NOTAS ESF (notas consolidadas del balance)  (reproducción completa)
// Consolida todas las notas: ACTIVO (Efectivo, Inversiones, CxC, Anticipo
// Impuestos, Inventario, PPyE), PASIVO (Financieros, CxP, Fiscales, Nómina,
// Beneficios, Otros) y PATRIMONIO. Nivel B: cada subtotal de nota = SUMA de
// sus filas de detalle (con salvaguarda: solo si la suma coincide).
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid as sfill, font as fnt0, alnC, alnL, alnR, bordeThin as bThin } from './_shared'

export function hojaNCTASESF(wb: ExcelJS.Workbook, r: ResultadoMotor, _reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('NOTAS ESF')
  ws.showGridLines = false
  const VERDE = C.VERDE_HEADER, DORADO = 'FFBF8F00', NAVY = C.AZUL_TOTAL, NEGRO = C.NEGRO, BLANC = C.BLANCO
  const fnt = (b = false, col = NEGRO, sz = 9) => fnt0(b, col, sz, false, 'Arial')
  const MESES: Record<number, string> = {1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE'}

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt = periOrd.filter(p => p.anio !== anioAct).slice(0, 5)
  const NA = grpAct.length, NB = grpAnt.length
  const COL_SEP = 2 + NA, COL_ANT = COL_SEP + 1, LAST = COL_ANT + NB

  ws.getColumn(1).width = 36.0
  for (let i = 0; i < NA; i++) ws.getColumn(2 + i).width = 16.0
  ws.getColumn(COL_SEP).width = 1.5
  for (let i = 0; i < NB; i++) ws.getColumn(COL_ANT + i).width = 16.0
  ws.getColumn(LAST).width = 1.71

  const setTit = (rowN: number, txt: string, sz = 10) => { ws.mergeCells(rowN, 1, rowN, LAST); const c = ws.getCell(rowN, 1); c.value = txt; c.font = fnt(true, NEGRO, sz); c.alignment = alnC }
  setTit(2, r.empresa, 11); setTit(3, `NIT. ${r.nit}`, 10); setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS', 10); setTit(5, '(Cifra expresadas en pesos Colombianos)', 9)

  const cConc = ws.getCell(7, 1); cConc.value = 'CONCEPTO'; cConc.font = fnt(true, BLANC, 9); cConc.fill = sfill(NAVY); cConc.alignment = alnC; cConc.border = bThin
  for (let i = 0; i < NA; i++) { const p = grpAct[i]; if (!p) continue
    const c7 = ws.getCell(7, 2+i); c7.value = p.anio; c7.font = fnt(true, BLANC, 8); c7.fill = sfill(NAVY); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, 2+i); c8.value = MESES[p.mes]; c8.font = fnt(true, BLANC, 8); c8.fill = sfill(NAVY); c8.alignment = alnC; c8.border = bThin }
  for (let i = 0; i < NB; i++) { const p = grpAnt[i]; if (!p) continue
    const c7 = ws.getCell(7, COL_ANT+i); c7.value = p.anio; c7.font = fnt(true, BLANC, 8); c7.fill = sfill(DORADO); c7.alignment = alnC; c7.border = bThin
    const c8 = ws.getCell(8, COL_ANT+i); c8.value = MESES[p.mes]; c8.font = fnt(true, BLANC, 8); c8.fill = sfill(DORADO); c8.alignment = alnC; c8.border = bThin }
  const colCont = NB > 0 ? COL_ANT : 2
  const cCont = ws.getCell(9, colCont); cCont.value = 'contable'; cCont.font = fnt(false, NEGRO, 8); cCont.alignment = alnC
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 9 }]
  ws.getRow(2).height=15; ws.getRow(3).height=15; ws.getRow(4).height=15; ws.getRow(5).height=12; ws.getRow(7).height=18; ws.getRow(8).height=18; ws.getRow(9).height=13

  // helpers de totales consolidados
  const totalObligFin = (p: PeriodoCalculado) => p.pasivoCorriente.obligFinCorrTotal + p.pasivoNoCorriente.obligFinNCTotal
  const totalCxpCorregido = (p: PeriodoCalculado) => p.pasivoCorriente.proveedoresTotal + p.pasivoCorriente.costosGastosPagar + (p.pasivoCorriente.acreedoresVariosTotal ?? 0)
  const totalFiscESF = (p: PeriodoCalculado) => p.pasivoCorriente.reteTotal + p.pasivoCorriente.icaRetenido + p.pasivoCorriente.icaTotal + p.pasivoCorriente.ivaTotal + p.pasivoCorriente.impuestosRenta
  const totalBeneficios = (p: PeriodoCalculado) => { const g2510 = (p.pasivoCorriente.beneficiosDetalle ?? []).filter((x:any)=>x.codigo.startsWith('2510')).reduce((s:number,x:any)=>s+x.valor,0); return p.pasivoCorriente.beneficiosCorrTotal + p.pasivoNoCorriente.provisionLaboralTotal - g2510 }
  const getResultadoBalance = (p: PeriodoCalculado) => p.totalActivo - p.totalPasivo - (p.patrimonio.capitalSocial ?? 0) - (p.patrimonio.reservas ?? 0) - (p.patrimonio.resultadoEjercicioAnterior ?? 0) - (p.patrimonio.resultadosAnteriores ?? 0)

  const anticUnion = new Map<string, string>()
  for (const p of r.periodos) for (const item of (p.activoCorriente.anticImpuestosDetalle ?? [])) if (!anticUnion.has(item.codigo)) anticUnion.set(item.codigo, item.nombre)
  const anticItems = [...anticUnion.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
  const reteUnion = new Map<string, string>()
  for (const p of r.periodos) for (const item of (p.pasivoCorriente.reteDetalleSubcuentas ?? [])) if (!reteUnion.has(item.codigo)) reteUnion.set(item.codigo, item.nombre)
  const ult = r.periodos[r.periodos.length - 1]

  // seguimiento para formular subtotales
  const secciones: { subRow: number; detRows: number[] }[] = []
  let cur: { subRow: number; detRows: number[] } | null = null
  const cierra = () => { if (cur) secciones.push(cur); cur = null }

  const writeSection = (rowN: number, label: string, gAct: (p:PeriodoCalculado)=>number, gAnt: (p:PeriodoCalculado)=>number) => {
    cierra()
    for (let c = 1; c <= LAST; c++) ws.getCell(rowN, c).fill = sfill(VERDE)
    const cL = ws.getCell(rowN, 1); cL.value = label; cL.font = fnt(true, BLANC, 10); cL.alignment = alnC
    for (let i = 0; i < NA; i++) { const p = grpAct[i]; if (!p) continue; const c = ws.getCell(rowN, 2+i); c.value = gAct(p); c.font = fnt(true, BLANC, 9); c.fill = sfill(VERDE); c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin }
    for (let i = 0; i < NB; i++) { const p = grpAnt[i]; if (!p) continue; const c = ws.getCell(rowN, COL_ANT+i); c.value = gAnt(p); c.font = fnt(true, BLANC, 9); c.fill = sfill(VERDE); c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin }
  }
  const writeSub = (rowN: number, label: string, indent: string, gAct: (p:PeriodoCalculado)=>number|null, gAnt: (p:PeriodoCalculado)=>number|null) => {
    cierra(); cur = { subRow: rowN, detRows: [] }
    const cL = ws.getCell(rowN, 1); cL.value = indent + label; cL.font = fnt(true, NEGRO, 9); cL.alignment = alnL; cL.border = bThin
    for (let i = 0; i < NA; i++) { const p = grpAct[i]; if (!p) continue; const c = ws.getCell(rowN, 2+i); c.value = gAct(p) ?? null; c.font = fnt(true, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin }
    for (let i = 0; i < NB; i++) { const p = grpAnt[i]; if (!p) continue; const c = ws.getCell(rowN, COL_ANT+i); c.value = gAnt(p) ?? null; c.font = fnt(true, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin }
  }
  const writeDet = (rowN: number, label: string, indent: string, gAct: (p:PeriodoCalculado)=>number|null, gAnt: (p:PeriodoCalculado)=>number|null) => {
    if (cur) cur.detRows.push(rowN)
    const cL = ws.getCell(rowN, 1); cL.value = indent + label; cL.font = fnt(false, NEGRO, 9); cL.alignment = alnL; cL.border = bThin
    for (let i = 0; i < NA; i++) { const p = grpAct[i]; if (!p) continue; const c = ws.getCell(rowN, 2+i); c.value = gAct(p) ?? null; c.font = fnt(false, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin }
    for (let i = 0; i < NB; i++) { const p = grpAnt[i]; if (!p) continue; const c = ws.getCell(rowN, COL_ANT+i); c.value = gAnt(p) ?? null; c.font = fnt(false, NEGRO, 9); c.alignment = alnR; c.numFmt = FMT_PESOS; c.border = bThin }
  }

  let f = 10
  const br = (n = 1) => { f += n }

  writeSection(f, 'ACTIVO', p => p.totalActivo, p => p.totalActivo); f++; br()
  writeSub(f, 'Efectivo y Equivalentes al Efectivo', '', p => p.activoCorriente.efectivoTotal, p => p.activoCorriente.efectivoTotal); f++; br()
  writeDet(f, 'Caja', '  ', p => p.activoCorriente.cajaTotal || null, p => p.activoCorriente.cajaTotal || null); f++
  writeSub(f, 'Bancos', '  ', p => p.activoCorriente.bancosTotal || null, p => p.activoCorriente.bancosTotal || null); f++
  for (const banco of (ult?.activoCorriente.bancos ?? [])) { writeDet(f, banco.nombre, '  ', p => p.activoCorriente.bancos.find(b=>b.nombre===banco.nombre)?.totalSaldoFinal || null, p => p.activoCorriente.bancos.find(b=>b.nombre===banco.nombre)?.totalSaldoFinal || null); f++ }
  br()
  writeSub(f, 'Inversiones', '', p => p.activoCorriente.inversionesTotal || null, p => p.activoCorriente.inversionesTotal || null); f++
  for (const item of (ult?.activoCorriente.inversionesDetalle ?? [])) { writeDet(f, item.nombre, '  ', p => p.activoCorriente.inversionesDetalle.find(x=>x.codigo===item.codigo)?.valor || null, p => p.activoCorriente.inversionesDetalle.find(x=>x.codigo===item.codigo)?.valor || null); f++ }
  br()
  writeSub(f, 'Cuentas Por Cobrar', '', p => (p.activoCorriente.clientesTotal + p.activoCorriente.anticiposTotal) || null, p => (p.activoCorriente.clientesTotal + p.activoCorriente.anticiposTotal) || null); f++
  writeDet(f, 'Clientes Nacionales y del Exterior', '  ', p => p.activoCorriente.clientesTotal || null, p => p.activoCorriente.clientesTotal || null); f++
  writeDet(f, 'Anticipos y Avances', '  ', p => p.activoCorriente.anticiposTotal || null, p => p.activoCorriente.anticiposTotal || null); f++; br()
  writeSub(f, 'Anticipo de Impuestos', '', p => p.activoCorriente.anticImpuestosDetalle.reduce((s,x)=>s+x.valor,0) || null, p => p.activoCorriente.anticImpuestosDetalle.reduce((s,x)=>s+x.valor,0) || null); f++
  for (const [codigo, nombre] of anticItems) { writeDet(f, nombre, '  ', p => p.activoCorriente.anticImpuestosDetalle.find(x=>x.codigo===codigo)?.valor || null, p => p.activoCorriente.anticImpuestosDetalle.find(x=>x.codigo===codigo)?.valor || null); f++ }
  br()
  writeSub(f, 'Inventario', '', p => p.activoCorriente.inventarioTotal || null, p => p.activoCorriente.inventarioTotal || null); f++
  for (const item of (ult?.activoCorriente.inventarioDetalle ?? [])) { writeDet(f, item.nombre, '  ', p => p.activoCorriente.inventarioDetalle.find(x=>x.codigo===item.codigo)?.valor || null, p => p.activoCorriente.inventarioDetalle.find(x=>x.codigo===item.codigo)?.valor || null); f++ }
  br()
  writeSub(f, 'Propiedad Planta Y Equipo', '', p => p.activoNoCorriente.ppyeNeto, p => p.activoNoCorriente.ppyeNeto); f++; br()
  for (const item of (ult?.activoNoCorriente.detallePPyE ?? [])) { writeDet(f, item.nombre, '  ', p => p.activoNoCorriente.detallePPyE.find(x=>x.codigo===item.codigo)?.valor || null, p => p.activoNoCorriente.detallePPyE.find(x=>x.codigo===item.codigo)?.valor || null); f++ }
  writeDet(f, 'Depreciacion Acumulada', '  ', p => p.activoNoCorriente.depreciacionAcumulada || null, p => p.activoNoCorriente.depreciacionAcumulada || null); f++; br(3)

  writeSection(f, 'PASIVO', p => p.totalPasivo, p => p.totalPasivo); f++; br()
  writeSub(f, 'Financieros', '', p => totalObligFin(p) || null, p => totalObligFin(p) || null); f++
  for (const item of (ult?.pasivoNoCorriente.oblFinDetalle ?? [])) { writeDet(f, item.nombre, '  ', p => p.pasivoNoCorriente.oblFinDetalle.find(x=>x.codigo===item.codigo)?.valor || null, p => p.pasivoNoCorriente.oblFinDetalle.find(x=>x.codigo===item.codigo)?.valor || null); f++ }
  br()
  writeSub(f, 'Cuentas por pagar', '', p => totalCxpCorregido(p) || null, p => totalCxpCorregido(p) || null); f++
  writeDet(f, 'Proveedores y Acreedores Comerciales', '  ', p => p.pasivoCorriente.proveedoresTotal || null, p => p.pasivoCorriente.proveedoresTotal || null); f++
  writeDet(f, 'Costos y Gastos Por Pagar', '  ', p => p.pasivoCorriente.costosGastosPagar || null, p => p.pasivoCorriente.costosGastosPagar || null); f++
  writeDet(f, 'Acreedores Varios', '  ', p => p.pasivoCorriente.acreedoresVariosTotal || null, p => p.pasivoCorriente.acreedoresVariosTotal || null); f++; br()
  writeSub(f, 'Fiscales', '', p => totalFiscESF(p) || null, p => totalFiscESF(p) || null); f++
  writeSub(f, 'Retencion En La Fuente', '  ', p => p.pasivoCorriente.reteTotal || null, p => p.pasivoCorriente.reteTotal || null); f++
  for (const [cod, nombre] of reteUnion) { writeDet(f, nombre, '    ', p => p.pasivoCorriente.reteDetalleSubcuentas?.find(x=>x.codigo===cod)?.valor || null, p => p.pasivoCorriente.reteDetalleSubcuentas?.find(x=>x.codigo===cod)?.valor || null); f++ }
  writeDet(f, 'Impuesto Industria y Comercio', '  ', p => p.pasivoCorriente.icaTotal || null, p => p.pasivoCorriente.icaTotal || null); f++
  writeDet(f, 'Impuesto a las Ventas', '  ', p => p.pasivoCorriente.ivaTotal || null, p => p.pasivoCorriente.ivaTotal || null); f++
  writeDet(f, 'Impuesto al ICA Retenido', '  ', p => p.pasivoCorriente.icaRetenido || null, p => p.pasivoCorriente.icaRetenido || null); f++
  writeDet(f, 'De renta y complementarios', '  ', p => p.pasivoCorriente.impuestosRenta || null, p => p.pasivoCorriente.impuestosRenta || null); f++; br()
  writeSub(f, 'Retenciones y Aportes de Nomina', '', p => p.pasivoCorriente.aporteNomina || null, p => p.pasivoCorriente.aporteNomina || null); f++
  writeDet(f, 'Retenciones y Aportes de Nomina', '  ', p => p.pasivoCorriente.aporteNomina || null, p => p.pasivoCorriente.aporteNomina || null); f++; br()
  writeSub(f, 'Beneficios a empleados', '', p => totalBeneficios(p) || null, p => totalBeneficios(p) || null); f++
  writeDet(f, 'Pasivos Estimados y Provisiones', '  ', p => totalBeneficios(p) || null, p => totalBeneficios(p) || null); f++; br()
  writeSub(f, 'Otros pasivos', '', p => p.pasivoCorriente.otrosPasivosCorrTotal || null, p => p.pasivoCorriente.otrosPasivosCorrTotal || null); f++
  writeDet(f, 'Anticipos de clientes', '  ', p => p.pasivoCorriente.otrosPasivosCorrTotal || null, p => p.pasivoCorriente.otrosPasivosCorrTotal || null); f++; br(3)

  writeSection(f, 'PATRIMONIO LIQUIDO', p => p.totalActivo - p.totalPasivo, p => p.totalActivo - p.totalPasivo); f++
  writeDet(f, 'Capital Social', '  ', p => p.patrimonio.capitalSocial || null, p => p.patrimonio.capitalSocial || null); f++
  writeDet(f, 'Reserva Legal', '  ', p => p.patrimonio.reservas || null, p => p.patrimonio.reservas || null); f++
  writeDet(f, 'Resultado Ejercicios Anteriores', '  ', p => (p.patrimonio.resultadoEjercicioAnterior + p.patrimonio.resultadosAnteriores) || null, p => (p.patrimonio.resultadoEjercicioAnterior + p.patrimonio.resultadosAnteriores) || null); f++
  writeDet(f, 'Resultado del ejercicio', '  ', p => getResultadoBalance(p) || null, p => getResultadoBalance(p) || null); f++; br()
  writeSub(f, 'Total Pasivo + Patrimonio', '', p => p.totalActivo, p => p.totalActivo)
  cierra()

  // ── Nivel B: formular subtotales = SUMA(detalle) con salvaguarda ──
  const esNum = (v:any):v is number => typeof v==='number' && !Number.isNaN(v)
  const valorCols: number[] = []
  for (let i=0;i<NA;i++) valorCols.push(2+i)
  for (let i=0;i<NB;i++) valorCols.push(COL_ANT+i)
  for (const sec of secciones) {
    if (sec.detRows.length === 0) continue
    for (const c of valorCols) {
      const cell = ws.getCell(sec.subRow, c); if (!esNum(cell.value)) continue
      const filas = sec.detRows.filter(d => esNum(ws.getCell(d, c).value))
      if (filas.length === 0) continue
      const suma = filas.reduce((s,d)=>s+(ws.getCell(d,c).value as number),0)
      const objetivo = cell.value as number
      if (Math.abs(suma - objetivo) > 1) continue
      const letra = ws.getColumn(c).letter
      cell.value = { formula: filas.map(d=>`${letra}${d}`).join('+'), result: objetivo }; cell.numFmt = FMT_PESOS
    }
  }
}