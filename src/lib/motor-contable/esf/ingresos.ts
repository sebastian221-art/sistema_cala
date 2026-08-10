// src/lib/motor-contable/esf/ingresos.ts
// ─────────────────────────────────────────────────────────────
// NOTA: INGRESOS  (migrada a Nivel B) — nota P&L.
// Calibri; col 2 = Acumulado, cols 3-5 = meses año actual, 7-8 = anterior.
// Detalle idéntico al original (operacional/no-operacional, devoluciones, 3
// niveles). Nivel B: Total (10) = Operacionales(12) + No Operacionales;
// cada sección = SUMA de sus subcuentas.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid as fill, font } from './_shared'
import { aplicarReglasNota, soloReglasNota, type ReglaNota } from '../reglasNota'

export function hojaINGRESOS(wb: ExcelJS.Workbook, r: ResultadoMotor, _reg?: RegistroCeldas) {
  // ── Reglas de nota con CANDADO DE CUADRE (editables por la contadora vía IA) ──
  const reglasNota: ReglaNota[] = soloReglasNota((r as any).perfil?.reglas ?? [])
  const ultRN = r.periodos[r.periodos.length - 1]
  const detalleBaseRN = ((ultRN as any)?.ingresosDetalle ?? []).map((x: any) => ({ codigo: String(x.codigo), nombre: x.nombre, valor: x.valor }))
  const fuentePrefijoRN = (pref: string) => detalleBaseRN.filter((x: any) => String(x.codigo).startsWith(pref))
  const rnNota = aplicarReglasNota('INGRESOS', detalleBaseRN, (ultRN as any)?.eriMensual.ingresosTotal ?? 0, reglasNota, fuentePrefijoRN)
  const nombreEfectivo = (cod: string, nombreBase: string): string => {
    const l = rnNota.detalle.find(x => cod.startsWith(x.codigo) || x.codigo.startsWith(cod)); return l ? l.nombre : nombreBase
  }
  if (rnNota.rechazadas.length > 0 && Array.isArray((r as any).advertencias)) {
    for (const rz of rnNota.rechazadas) (r as any).advertencias.push('⚠ ' + rz.motivo)
  }

  const ws = wb.addWorksheet('INGRESOS')
  ws.showGridLines = false
  const NAVY = C.AZUL_TOTAL, AZUL_H = 'FFD9E1F2', GRIS_ITEM = C.GRIS_SUBTOTAL, NEGRO = C.NEGRO, BLANC = C.BLANCO, ROJO = 'FFFF0000'
  const fnt = (bold = false, color: string = NEGRO, size = 9) => font(bold, color, size, false, 'Calibri')
  const aln = (h: 'left' | 'center' | 'right'): Partial<ExcelJS.Alignment> => ({ horizontal: h, vertical: 'middle' })
  const bMedTop: Partial<ExcelJS.Borders> = { top:{style:'medium',color:{argb:NEGRO}},bottom:{style:'thin',color:{argb:NEGRO}},left:{style:'thin',color:{argb:NEGRO}},right:{style:'thin',color:{argb:NEGRO}} }
  const bDblTop: Partial<ExcelJS.Borders> = { top:{style:'double',color:{argb:NEGRO}},bottom:{style:'thin',color:{argb:NEGRO}},left:{style:'thin',color:{argb:NEGRO}},right:{style:'thin',color:{argb:NEGRO}} }
  const bDashedTop: Partial<ExcelJS.Borders> = { top:{style:'dashed',color:{argb:NEGRO}},bottom:{style:'thin',color:{argb:NEGRO}},left:{style:'thin',color:{argb:NEGRO}},right:{style:'thin',color:{argb:NEGRO}} }
  const MESES: Record<number, string> = {1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE'}

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const grpAct = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt = periOrd.filter(p => p.anio !== anioAct).slice(0, 2)

  ws.getColumn(1).width = 43.29
  ws.getColumn(2).width = 16; ws.getColumn(3).width = 16; ws.getColumn(4).width = 16; ws.getColumn(5).width = 16
  ws.getColumn(6).width = 2.14; ws.getColumn(7).width = 16; ws.getColumn(8).width = 14.71; ws.getColumn(9).width = 1.71

  const setTit = (rowN: number, txt: string) => { ws.mergeCells(rowN,1,rowN,8); const c = ws.getCell(rowN,1); c.value = txt; c.font = fnt(true,NEGRO,10); c.alignment = aln('center') }
  setTit(2, r.empresa); setTit(3, `NIT. ${r.nit}`); setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  if (grpAct.length > 0) { const c = ws.getCell(6,2); c.value = grpAct[0].anio; c.font = fnt(true,BLANC,8); c.fill = fill(NAVY); c.alignment = aln('center'); c.border = bMedTop }
  for (let i=0;i<3;i++){ const p=grpAct[i]; if(!p)continue; const c=ws.getCell(6,3+i); c.value=p.anio; c.font=fnt(true,BLANC,8); c.fill=fill(NAVY); c.alignment=aln('center'); c.border=bMedTop }
  for (let i=0;i<2;i++){ const p=grpAnt[i]; if(!p)continue; const c=ws.getCell(6,7+i); c.value=p.anio; c.font=fnt(true,BLANC,8); c.fill=fill(NAVY); c.alignment=aln('center'); c.border=bMedTop }
  if (grpAct.length > 0) { const c = ws.getCell(7,2); c.value = 'ACUMULADO'; c.font = fnt(true,BLANC,8); c.fill = fill(NAVY); c.alignment = aln('center') }
  for (let i=0;i<3;i++){ const p=grpAct[i]; if(!p)continue; const c=ws.getCell(7,3+i); c.value=MESES[p.mes]??''; c.font=fnt(true,BLANC,8); c.fill=fill(NAVY); c.alignment=aln('center') }
  for (let i=0;i<2;i++){ const p=grpAnt[i]; if(!p)continue; const c=ws.getCell(7,7+i); c.value=MESES[p.mes]??''; c.font=fnt(true,BLANC,8); c.fill=fill(NAVY); c.alignment=aln('center') }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  const varMens = (idx: number, fn: (p: PeriodoCalculado) => number): number => {
    const curr = r.periodos[idx]; const prev = idx > 0 ? r.periodos[idx-1] : null
    return fn(curr) - (prev ? fn(prev) : 0)
  }
  const acumTercero = (subcuenta: string, nit: string, esDev: boolean): number => {
    const ult = r.periodos[r.periodos.length-1]
    const sc = ult?.ingresosDetalle?.find(x => x.codigo === subcuenta); if (!sc) return 0
    const t = sc.terceros.find(x => x.nit === nit || x.nombreTercero === nit); if (!t) return 0
    return esDev ? (t.movimientoDebito - t.movimientoCredito) : (t.movimientoCredito - t.movimientoDebito)
  }
  const varMensTercero = (idx: number, subcuenta: string, nit: string, esDev: boolean): number =>
    varMens(idx, p => {
      const sc = p.ingresosDetalle?.find(x => x.codigo === subcuenta); if (!sc) return 0
      const t = sc.terceros.find(x => x.nit === nit || x.nombreTercero === nit); if (!t) return 0
      return esDev ? (t.movimientoDebito - t.movimientoCredito) : (t.movimientoCredito - t.movimientoDebito)
    })

  const writeRow = (rowN: number, label: string, acumulado: number | null, valsAct: (number|null)[], valsAnt: (number|null)[],
    opts: { bold?: boolean; fillColor?: string; brd?: Partial<ExcelJS.Borders>; indent?: boolean; esDevolucion?: boolean }) => {
    const cL = ws.getCell(rowN,1); cL.value = (opts.indent?'   ':'') + label; cL.font = fnt(opts.bold??false,NEGRO,9); cL.alignment = aln('left')
    if (opts.fillColor) cL.fill = fill(opts.fillColor)
    const nc = opts.esDevolucion ? ROJO : NEGRO
    const put = (c: ExcelJS.Cell, v: number|null) => { c.value = v ?? null; c.font = fnt(opts.bold??false,nc,9); c.alignment = aln('right'); c.numFmt = FMT_PESOS; if(opts.fillColor)c.fill=fill(opts.fillColor); if(opts.brd)c.border=opts.brd }
    put(ws.getCell(rowN,2), acumulado)
    for (let i=0;i<3;i++) put(ws.getCell(rowN,3+i), valsAct[i] ?? null)
    for (let i=0;i<2;i++) put(ws.getCell(rowN,7+i), valsAnt[i] ?? null)
  }

  // Total/subtotal como FÓRMULA en las columnas con datos (2 acum, 3-5 meses).
  const writeTotal = (rowN: number, label: string, interior: (letra: string) => string, resAcum: number, resAct: (number|null)[], opts: { fillColor?: string; brd?: Partial<ExcelJS.Borders> }) => {
    const cL = ws.getCell(rowN,1); cL.value = label; cL.font = fnt(true,NEGRO,9); cL.alignment = aln('left'); if(opts.fillColor)cL.fill=fill(opts.fillColor)
    const cols = [2,3,4,5]; const res = [resAcum, ...(resAct as (number|null)[])]
    cols.forEach((cnum, k) => {
      const c = ws.getCell(rowN, cnum); const letra = ws.getColumn(cnum).letter; const intr = interior(letra)
      c.value = intr ? { formula: `SUM(${intr})`, result: res[k] ?? 0 } : (res[k] ?? null)
      c.font = fnt(true,NEGRO,9); c.alignment = aln('right'); c.numFmt = FMT_PESOS; if(opts.fillColor)c.fill=fill(opts.fillColor); if(opts.brd)c.border=opts.brd
    })
    for (let i=0;i<2;i++){ const c=ws.getCell(rowN,7+i); c.value=null; if(opts.fillColor)c.fill=fill(opts.fillColor); if(opts.brd)c.border=opts.brd }
  }

  const detalle = r.periodos[r.periodos.length-1]?.ingresosDetalle ?? []
  const scOperacionales = detalle.filter(x => x.esOperacional)
  const scNoOperacionales = detalle.filter(x => !x.esOperacional)
  const totalOp = scOperacionales.reduce((s,x)=>s+(x.esDevolucion?-x.total:x.total),0)
  const totalNoOp = scNoOperacionales.reduce((s,x)=>s+x.total,0)
  const totalIngresos = totalOp + totalNoOp
  const idxDe = (i:number) => r.periodos.indexOf(grpAct[i])
  const totalOpMensAct = grpAct.map((_,i)=>{ const idx=idxDe(i); return idx<0?null:varMens(idx,p=>(p.ingresosDetalle??[]).filter(x=>x.esOperacional).reduce((s,x)=>s+(x.esDevolucion?-x.total:x.total),0)) })
  const totalNoOpMensAct = grpAct.map((_,i)=>{ const idx=idxDe(i); return idx<0?null:varMens(idx,p=>(p.ingresosDetalle??[]).filter(x=>!x.esOperacional).reduce((s,x)=>s+x.total,0)) })

  const opSubRows: number[] = []
  const noOpSubRows: number[] = []

  // ── OPERACIONALES: subcuentas ──
  let fila = 14
  for (const sc of scOperacionales) {
    const scMensAct = grpAct.map((_,i)=>{ const idx=idxDe(i); if(idx<0)return null
      const curr=r.periodos[idx].ingresosDetalle?.find(x=>x.codigo===sc.codigo)?.total??0
      const prev=idx>0?(r.periodos[idx-1].ingresosDetalle?.find(x=>x.codigo===sc.codigo)?.total??0):0; return curr-prev })
    writeRow(fila, sc.nombre, sc.esDevolucion?-sc.total:sc.total, sc.esDevolucion?scMensAct.map(v=>v!==null?-v:null):scMensAct, grpAnt.map(()=>null),
      { bold:true, fillColor:GRIS_ITEM, brd:bDblTop, esDevolucion:sc.esDevolucion })
    opSubRows.push(fila); fila++
    const tieneAux = Array.isArray((sc as any).auxiliares) && (sc as any).auxiliares.length > 0
    if (tieneAux) {
      const auxUnion = new Map<string,{codigo:string;nombre:string}>()
      for (const p of r.periodos){ const psc=p.ingresosDetalle?.find(x=>x.codigo===sc.codigo); for(const a of (((psc as any)?.auxiliares??[]) as any[])) if(!auxUnion.has(a.codigo)) auxUnion.set(a.codigo,{codigo:a.codigo,nombre:a.nombre}) }
      for (const [auxCod, auxInfo] of auxUnion) {
        const auxAcum = (()=>{ const psc=r.periodos[r.periodos.length-1]?.ingresosDetalle?.find(x=>x.codigo===sc.codigo); return (((psc as any)?.auxiliares??[]) as any[]).find(x=>x.codigo===auxCod)?.total??0 })()
        const auxMensAct = grpAct.map((_,i)=>{ const idx=idxDe(i); if(idx<0)return null
          const getAux=(p:any)=>((p.ingresosDetalle?.find((x:any)=>x.codigo===sc.codigo)?.auxiliares??[]) as any[]).find(x=>x.codigo===auxCod)?.total??0
          return getAux(r.periodos[idx]) - (idx>0?getAux(r.periodos[idx-1]):0) })
        writeRow(fila, '   '+auxInfo.nombre, auxAcum, auxMensAct, grpAnt.map(()=>null), { bold:true, brd:bDashedTop }); fila++
        const tercAuxUnion = new Map<string,any>()
        for (const p of r.periodos){ const a=((p.ingresosDetalle?.find((x:any)=>x.codigo===sc.codigo)?.auxiliares??[]) as any[]).find(x=>x.codigo===auxCod); for(const t of (a?.terceros??[])){ const key=(t.nit||t.nombreTercero||'').trim(); if(key&&!tercAuxUnion.has(key))tercAuxUnion.set(key,t) } }
        for (const [nitKey,t] of tercAuxUnion) {
          const getTT=(p:any)=>{ const a=((p.ingresosDetalle?.find((x:any)=>x.codigo===sc.codigo)?.auxiliares??[]) as any[]).find(x=>x.codigo===auxCod); const tt=(a?.terceros??[]).find((x:any)=>(x.nit||x.nombreTercero)===nitKey); return tt?(tt.movimientoCredito-tt.movimientoDebito):0 }
          const tAcum = getTT(r.periodos[r.periodos.length-1])
          const tMensAct = grpAct.map((_,i)=>{ const idx=idxDe(i); if(idx<0)return null; return getTT(r.periodos[idx]) - (idx>0?getTT(r.periodos[idx-1]):0) })
          if (Math.abs(tAcum)<1 && tMensAct.every(v=>!v||Math.abs(v)<1)) continue
          writeRow(fila, '      '+(t.nombreTercero||t.nit||nitKey), tAcum, tMensAct, grpAnt.map(()=>null), { bold:false, brd:bDashedTop }); fila++
        }
      }
    } else {
      const tercUnion = new Map<string,any>()
      for (const p of r.periodos){ const psc=p.ingresosDetalle?.find(x=>x.codigo===sc.codigo); for(const t of psc?.terceros??[]){ const key=(t.nit||t.nombreTercero||'').trim(); if(key&&!tercUnion.has(key))tercUnion.set(key,t) } }
      for (const [nitKey,t] of tercUnion) {
        const tAcum = acumTercero(sc.codigo,nitKey,sc.esDevolucion)
        const tMensAct = grpAct.map((_,i)=>{ const idx=idxDe(i); return idx<0?null:varMensTercero(idx,sc.codigo,nitKey,sc.esDevolucion) })
        if (Math.abs(tAcum)<1 && tMensAct.every(v=>!v||Math.abs(v)<1)) continue
        writeRow(fila, t.nombreTercero||t.nit||nitKey, tAcum, tMensAct, grpAnt.map(()=>null), { bold:false, brd:bDashedTop, indent:true, esDevolucion:sc.esDevolucion }); fila++
      }
    }
    fila++
  }

  const rowNoOp = fila + 1
  fila = rowNoOp + 2

  for (const sc of scNoOperacionales) {
    const scMensAct = grpAct.map((_,i)=>{ const idx=idxDe(i); if(idx<0)return null
      const curr=r.periodos[idx].ingresosDetalle?.find(x=>x.codigo===sc.codigo)?.total??0
      const prev=idx>0?(r.periodos[idx-1].ingresosDetalle?.find(x=>x.codigo===sc.codigo)?.total??0):0; return curr-prev })
    writeRow(fila, sc.nombre, sc.total, scMensAct, grpAnt.map(()=>null), { bold:true, fillColor:GRIS_ITEM, brd:bDblTop })
    noOpSubRows.push(fila); fila++
    const tercUnion = new Map<string,any>()
    for (const p of r.periodos){ const psc=p.ingresosDetalle?.find(x=>x.codigo===sc.codigo); for(const t of psc?.terceros??[]){ const key=(t.nit||t.nombreTercero||'').trim(); if(key&&!tercUnion.has(key))tercUnion.set(key,t) } }
    for (const [nitKey,t] of tercUnion) {
      const tAcum = acumTercero(sc.codigo,nitKey,sc.esDevolucion)
      const tMensAct = grpAct.map((_,i)=>{ const idx=idxDe(i); return idx<0?null:varMensTercero(idx,sc.codigo,nitKey,sc.esDevolucion) })
      if (Math.abs(tAcum)<1 && tMensAct.every(v=>!v||Math.abs(v)<1)) continue
      writeRow(fila, t.nombreTercero||t.nit||nitKey, tAcum, tMensAct, grpAnt.map(()=>null), { bold:false, brd:bDashedTop, indent:true }); fila++
    }
  }

  // ── FÓRMULAS de los 3 totales ──
  writeTotal(12, 'Operacionales', (l)=>opSubRows.map(fr=>`${l}${fr}`).join(','), totalOp, totalOpMensAct, { fillColor:GRIS_ITEM, brd:bDblTop })
  writeTotal(rowNoOp, 'No Operacionales', (l)=>noOpSubRows.map(fr=>`${l}${fr}`).join(','), totalNoOp, totalNoOpMensAct, { fillColor:GRIS_ITEM, brd:bDblTop })
  writeTotal(10, 'INGRESOS', (l)=>`${l}12,${l}${rowNoOp}`, totalIngresos, grpAct.map((_,i)=>(totalOpMensAct[i]??0)+(totalNoOpMensAct[i]??0)), { fillColor:AZUL_H, brd:bDblTop })

  ws.getRow(2).height = 15; ws.getRow(3).height = 15; ws.getRow(4).height = 12.75
  ws.getRow(6).height = 14.45; ws.getRow(7).height = 13.5; ws.getRow(8).height = 15.75; ws.getRow(10).height = 14.25
}