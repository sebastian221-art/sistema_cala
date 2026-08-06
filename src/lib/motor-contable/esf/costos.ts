// src/lib/motor-contable/esf/costos.ts
// ─────────────────────────────────────────────────────────────
// NOTA: COSTOS  (migrada a Nivel B) — nota P&L.
// Calibri; col 2 Acumulado, 3-5 meses actual, 7-8 meses anterior.
// Detalle idéntico (subcuenta → jerarquía auxiliares 6/8 díg → terceros, o
// terceros planos). Nivel B: Total (9) = SUMA de las subcuentas.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid as fill, font } from './_shared'

export function hojaCOSTOS(wb: ExcelJS.Workbook, r: ResultadoMotor, _reg?: RegistroCeldas) {
  const anioHoja = r.periodos[r.periodos.length - 1]?.anio ?? new Date().getFullYear()
  const ws = wb.addWorksheet(`COSTOS ${anioHoja}`)
  ws.showGridLines = false
  const NAVY = C.AZUL_TOTAL, AZUL_H = 'FFD9E1F2', GRIS_ITEM = C.GRIS_SUBTOTAL, NEGRO = C.NEGRO, BLANC = C.BLANCO
  const fnt = (bold = false, color: string = NEGRO, size = 9) => font(bold, color, size, false, 'Calibri')
  const aln = (h: 'left'|'center'|'right'): Partial<ExcelJS.Alignment> => ({ horizontal: h, vertical: 'middle' })
  const bMedTop: Partial<ExcelJS.Borders> = { top:{style:'medium',color:{argb:NEGRO}},bottom:{style:'thin',color:{argb:NEGRO}},left:{style:'thin',color:{argb:NEGRO}},right:{style:'thin',color:{argb:NEGRO}} }
  const bDblTop: Partial<ExcelJS.Borders> = { top:{style:'double',color:{argb:NEGRO}},bottom:{style:'thin',color:{argb:NEGRO}},left:{style:'thin',color:{argb:NEGRO}},right:{style:'thin',color:{argb:NEGRO}} }
  const bDashedTop: Partial<ExcelJS.Borders> = { top:{style:'dashed',color:{argb:NEGRO}},bottom:{style:'thin',color:{argb:NEGRO}},left:{style:'thin',color:{argb:NEGRO}},right:{style:'thin',color:{argb:NEGRO}} }
  const MESES: Record<number,string> = {1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE'}
  const toNombrePropio = (s: string) => (s ?? '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  const periOrd = [...r.periodos].reverse()
  const anioAct = periOrd[0]?.anio ?? anioHoja
  const grpAct = periOrd.filter(p => p.anio === anioAct).slice(0, 3)
  const grpAnt = periOrd.filter(p => p.anio !== anioAct).slice(0, 2)

  ws.getColumn(1).width = 43.29
  ws.getColumn(2).width = 16; ws.getColumn(3).width = 16; ws.getColumn(4).width = 16; ws.getColumn(5).width = 16
  ws.getColumn(6).width = 2.14; ws.getColumn(7).width = 16; ws.getColumn(8).width = 14.71; ws.getColumn(9).width = 1.71

  const setTit = (rowN:number,txt:string)=>{ ws.mergeCells(rowN,1,rowN,8); const c=ws.getCell(rowN,1); c.value=txt; c.font=fnt(true,NEGRO,10); c.alignment=aln('center') }
  setTit(2, r.empresa); setTit(3, `NIT. ${r.nit}`); setTit(4, 'NOTAS A LOS ESTADOS FINANCIEROS')

  if(grpAct.length>0){ const c=ws.getCell(6,2); c.value=grpAct[0].anio; c.font=fnt(true,BLANC,8); c.fill=fill(NAVY); c.alignment=aln('center'); c.border=bMedTop }
  for(let i=0;i<3;i++){ const p=grpAct[i]; if(!p)continue; const c=ws.getCell(6,3+i); c.value=p.anio; c.font=fnt(true,BLANC,8); c.fill=fill(NAVY); c.alignment=aln('center'); c.border=bMedTop }
  for(let i=0;i<2;i++){ const p=grpAnt[i]; if(!p)continue; const c=ws.getCell(6,7+i); c.value=p.anio; c.font=fnt(true,BLANC,8); c.fill=fill(NAVY); c.alignment=aln('center'); c.border=bMedTop }
  if(grpAct.length>0){ const c=ws.getCell(7,2); c.value='ACUMULADO'; c.font=fnt(true,BLANC,8); c.fill=fill(NAVY); c.alignment=aln('center') }
  for(let i=0;i<3;i++){ const p=grpAct[i]; if(!p)continue; const c=ws.getCell(7,3+i); c.value=MESES[p.mes]??''; c.font=fnt(true,BLANC,8); c.fill=fill(NAVY); c.alignment=aln('center') }
  for(let i=0;i<2;i++){ const p=grpAnt[i]; if(!p)continue; const c=ws.getCell(7,7+i); c.value=MESES[p.mes]??''; c.font=fnt(true,BLANC,8); c.fill=fill(NAVY); c.alignment=aln('center') }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7 }]

  const idxDeP = (p: PeriodoCalculado) => r.periodos.findIndex(x => x.mes===p.mes && x.anio===p.anio)
  const varCosto = (i:number, fn:(p:PeriodoCalculado)=>number): number|null => {
    const p = grpAct[i]; if(!p) return null; const idxR = idxDeP(p); if(idxR<0) return null
    return (fn(r.periodos[idxR]) - (idxR>0?fn(r.periodos[idxR-1]):0)) || null
  }
  const varAnt = (p: PeriodoCalculado, fn:(p:PeriodoCalculado)=>number): number|null => {
    const idxR = idxDeP(p); if(idxR<0) return null
    return (fn(r.periodos[idxR]) - (idxR>0?fn(r.periodos[idxR-1]):0)) || null
  }
  const movT = (t:any) => t ? (t.movimientoDebito - t.movimientoCredito) : 0

  const writeRow = (rowN:number, label:string, acum:number|null, valsAct:(number|null)[], valsAnt:(number|null)[],
    opts:{ bold?:boolean; fillColor?:string; brd?:Partial<ExcelJS.Borders>; indent?:boolean }) => {
    const cL=ws.getCell(rowN,1); cL.value=(opts.indent?'   ':'')+label; cL.font=fnt(opts.bold??false,NEGRO,9); cL.alignment=aln('left'); if(opts.fillColor)cL.fill=fill(opts.fillColor)
    const put=(c:ExcelJS.Cell,v:number|null)=>{ c.value=v??null; c.font=fnt(opts.bold??false,NEGRO,9); c.alignment=aln('right'); c.numFmt=FMT_PESOS; if(opts.fillColor)c.fill=fill(opts.fillColor); if(opts.brd)c.border=opts.brd }
    put(ws.getCell(rowN,2),acum)
    for(let i=0;i<3;i++) put(ws.getCell(rowN,3+i), valsAct[i]??null)
    for(let i=0;i<2;i++) put(ws.getCell(rowN,7+i), valsAnt[i]??null)
  }
  const writeTotal = (rowN:number, label:string, interior:(l:string)=>string, res:(number|null)[], opts:{fillColor?:string;brd?:Partial<ExcelJS.Borders>}) => {
    const cL=ws.getCell(rowN,1); cL.value=label; cL.font=fnt(true,NEGRO,9); cL.alignment=aln('left'); if(opts.fillColor)cL.fill=fill(opts.fillColor)
    const cols=[2,3,4,5,7,8]
    cols.forEach((cnum,k)=>{ const c=ws.getCell(rowN,cnum); const l=ws.getColumn(cnum).letter; const intr=interior(l)
      c.value = intr ? { formula:`SUM(${intr})`, result: res[k]??0 } : (res[k]??null)
      c.font=fnt(true,NEGRO,9); c.alignment=aln('right'); c.numFmt=FMT_PESOS; if(opts.fillColor)c.fill=fill(opts.fillColor); if(opts.brd)c.border=opts.brd })
  }

  const detalle = r.periodos[r.periodos.length-1]?.costosDetalle ?? []
  const totalAcum = detalle.reduce((s,x)=>s+x.total,0)
  const sumTot = (p:PeriodoCalculado) => p.costosDetalle?.reduce((s,x)=>s+x.total,0) ?? 0
  const totalMensAct = [0,1,2].map(i => varCosto(i, sumTot))
  const totalMensAnt = grpAnt.map(p => varAnt(p, sumTot))

  const subRows: number[] = []
  let fila = 11

  for (const sc of detalle) {
    const scMensAct = [0,1,2].map(i => varCosto(i, p => p.costosDetalle?.find(x=>x.codigo===sc.codigo)?.total ?? 0))
    const scMensAnt = grpAnt.map(p => varAnt(p, q => q.costosDetalle?.find(x=>x.codigo===sc.codigo)?.total ?? 0))
    writeRow(fila, sc.nombre, sc.total || null, scMensAct, scMensAnt, { bold:true, fillColor:GRIS_ITEM, brd:bDblTop })
    subRows.push(fila); fila++

    const auxConTUnion = new Map<string, any>()
    for (const p of [...r.periodos].reverse()) { const psc=p.costosDetalle?.find(x=>x.codigo===sc.codigo); for(const aux of psc?.auxiliaresConTerceros??[]) if(!auxConTUnion.has(aux.codigo)) auxConTUnion.set(aux.codigo,aux) }
    const auxConT = [...auxConTUnion.values()]

    if (auxConT.length>0 && (auxConT.some(a=>a.terceros.length>0) || auxConT.some(a=>a.codigo.length===6))) {
      for (const aux of auxConT) {
        if (Math.abs(aux.total)<1 && aux.terceros.length===0) continue
        const getAuxTot=(p:any)=>p.costosDetalle?.find((x:any)=>x.codigo===sc.codigo)?.auxiliaresConTerceros?.find((a:any)=>a.codigo===aux.codigo)?.total??0
        const auxMensAct=[0,1,2].map(i=>varCosto(i,getAuxTot))
        const auxMensAnt=grpAnt.map(p=>varAnt(p,getAuxTot))
        const is6=aux.codigo.length===6
        writeRow(fila, is6?aux.nombre:'   '+aux.nombre, aux.total||null, auxMensAct, auxMensAnt, { bold:true, brd:bDashedTop }); fila++
        if (is6 && aux.terceros.length===0) continue
        const terUnion=new Map<string,any>()
        for(const p of r.periodos){ const paux=p.costosDetalle?.find((x:any)=>x.codigo===sc.codigo)?.auxiliaresConTerceros?.find((a:any)=>a.codigo===aux.codigo); for(const t of paux?.terceros??[]){ const key=(t.nit||t.nombreTercero||'').trim(); if(key&&!terUnion.has(key))terUnion.set(key,t) } }
        for (const [nitKey,t] of terUnion) {
          const getTT=(p:any)=>{ const paux=p.costosDetalle?.find((x:any)=>x.codigo===sc.codigo)?.auxiliaresConTerceros?.find((a:any)=>a.codigo===aux.codigo); return movT((paux?.terceros??[]).find((x:any)=>(x.nit||x.nombreTercero)===nitKey)) }
          const mov=getTT(r.periodos[r.periodos.length-1])
          const tMensAct=[0,1,2].map(i=>varCosto(i,getTT))
          const tMensAnt=grpAnt.map(p=>varAnt(p,getTT))
          if (Math.abs(mov)<1 && tMensAct.every(v=>v===null||Math.abs(v)<1)) continue
          writeRow(fila, toNombrePropio(t.nombreTercero||t.nit), mov||null, tMensAct, tMensAnt, { bold:false, brd:bDashedTop, indent:true }); fila++
        }
      }
    } else {
      const terUnion=new Map<string,any>()
      for(const p of r.periodos){ const psc=p.costosDetalle?.find(x=>x.codigo===sc.codigo); for(const t of psc?.terceros??[]){ const key=(t.nit||t.nombreTercero||'').trim(); if(key&&!terUnion.has(key))terUnion.set(key,t) } }
      for (const [nitKey,t] of terUnion) {
        const getT=(p:any)=>movT(p.costosDetalle?.find((x:any)=>x.codigo===sc.codigo)?.terceros.find((x:any)=>(x.nit||x.nombreTercero)===nitKey))
        const mov=getT(r.periodos[r.periodos.length-1])
        const tMensAct=[0,1,2].map(i=>varCosto(i,getT))
        const tMensAnt=grpAnt.map(p=>varAnt(p,getT))
        if (Math.abs(mov)<1 && tMensAct.every(v=>v===null||Math.abs(v)<1)) continue
        writeRow(fila, toNombrePropio(t.nombreTercero||t.nit), mov||null, tMensAct, tMensAnt, { bold:false, brd:bDashedTop, indent:true }); fila++
      }
    }
    fila++
  }

  // ── Total COSTOS (fila 9) = SUMA de las subcuentas ──
  writeTotal(9, 'COSTOS', (l)=>subRows.map(fr=>`${l}${fr}`).join(','),
    [totalAcum, ...(totalMensAct as (number|null)[]), ...(totalMensAnt as (number|null)[])],
    { fillColor:AZUL_H, brd:bDblTop })

  ws.getRow(2).height=15; ws.getRow(3).height=15; ws.getRow(4).height=12.75
  ws.getRow(6).height=14.45; ws.getRow(7).height=13.5; ws.getRow(9).height=14.25
}