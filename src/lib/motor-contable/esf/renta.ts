// src/lib/motor-contable/esf/renta.ts
// ─────────────────────────────────────────────────────────────
// HOJA: RENTA (Comparativo de Renta)  (reproducción completa — Nivel B)
// Comparativo por año gravable: FISCAL/CONTABLE (año actual) + años previos.
// Nivel B: cada Sub-Total de sección = SUMA de sus filas de datos (con
// salvaguarda: solo se formula si la suma coincide con el valor original).
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'

type EriAcumulado = ResultadoMotor['eriAcumulado'][number]

export function hojaRENTA(wb: ExcelJS.Workbook, r: ResultadoMotor, _reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('RENTA')
  ws.showGridLines = false

  const NARANJA='FFE26B0A', VERDE_OSC='FF375623', VERDE_MED='FF548235', AMARILLO='FFFFF2CC',
        ORO='FFFFC000', NEGRO='FF000000', BLANC='FFFFFFFF', GRIS_CLARO='FFF2F2F2'
  const fnt=(bold=false,color=NEGRO,size=10):Partial<ExcelJS.Font>=>({name:'Calibri',bold,color:{argb:color},size})
  const aln=(h:'left'|'center'|'right'):Partial<ExcelJS.Alignment>=>({horizontal:h,vertical:'middle'})
  const alnRot=():Partial<ExcelJS.Alignment>=>({horizontal:'center',vertical:'middle',textRotation:90})
  const fill=(argb:string):ExcelJS.Fill=>({type:'pattern',pattern:'solid',fgColor:{argb}})
  const bThin:Partial<ExcelJS.Borders>={top:{style:'thin',color:{argb:NEGRO}},bottom:{style:'thin',color:{argb:NEGRO}},left:{style:'thin',color:{argb:NEGRO}},right:{style:'thin',color:{argb:NEGRO}}}
  const bMed:Partial<ExcelJS.Borders>={top:{style:'medium',color:{argb:NEGRO}},bottom:{style:'medium',color:{argb:NEGRO}},left:{style:'medium',color:{argb:NEGRO}},right:{style:'medium',color:{argb:NEGRO}}}
  const nf='#,##0;(#,##0);"-"'

  const anioAct=(()=>{ const po=[...r.periodos].reverse(); return po[0]?.anio??new Date().getFullYear() })()
  const porAnio=new Map<number,PeriodoCalculado>()
  for(const p of r.periodos){ const prev=porAnio.get(p.anio); if(!prev||p.mes>prev.mes) porAnio.set(p.anio,p) }
  const anios=[...porAnio.keys()].sort((a,b)=>b-a)
  const ultP=porAnio.get(anioAct)!
  const eriAcum=r.eriAcumulado[r.eriAcumulado.length-1]
  const prevAnios=anios.filter(a=>a!==anioAct)

  ws.getColumn(1).width=4.5; ws.getColumn(2).width=4.5; ws.getColumn(3).width=38
  ws.getColumn(4).width=14; ws.getColumn(5).width=14; ws.getColumn(6).width=1.5
  for(let i=0;i<5;i++) ws.getColumn(7+i).width=14
  ws.getColumn(12).width=1.71

  const setTit=(rowN:number,txt:string,size=10,bold=true)=>{ ws.mergeCells(rowN,1,rowN,11); const c=ws.getCell(rowN,1); c.value=txt; c.font=fnt(bold,NEGRO,size); c.alignment=aln('center') }
  setTit(2,r.empresa,11,true); setTit(3,`NIT. ${r.nit}`,10,false); setTit(4,'COMPARATIVO RENTA',11,true); setTit(5,'(Cifra expresadas en pesos Colombianos)',9,false)

  ws.mergeCells(6,1,6,3); const h6=ws.getCell(6,1); h6.value='AÑO GRAVABLE'; h6.font=fnt(true,BLANC,10); h6.fill=fill(NARANJA); h6.alignment=aln('center'); h6.border=bThin
  const h6y=ws.getCell(6,4); h6y.value=anioAct; h6y.font=fnt(true,BLANC,10); h6y.fill=fill(NARANJA); h6y.alignment=aln('center'); h6y.border=bThin
  for(let i=0;i<Math.min(prevAnios.length,5);i++){ const c=ws.getCell(6,7+i); c.value=prevAnios[i]; c.font=fnt(true,BLANC,10); c.fill=fill(NARANJA); c.alignment=aln('center'); c.border=bThin }
  ws.mergeCells(7,1,7,3); const h7=ws.getCell(7,1); h7.value='NOMBRE O CONCEPTO'; h7.font=fnt(true,BLANC,9); h7.fill=fill(NARANJA); h7.alignment=aln('center'); h7.border=bThin
  const h7f=ws.getCell(7,4); h7f.value='FISCAL'; h7f.font=fnt(true,BLANC,9); h7f.fill=fill(NARANJA); h7f.alignment=aln('center'); h7f.border=bThin
  const h7c=ws.getCell(7,5); h7c.value='CONTABLE'; h7c.font=fnt(true,BLANC,9); h7c.fill=fill(NARANJA); h7c.alignment=aln('center'); h7c.border=bThin
  for(let i=0;i<Math.min(prevAnios.length,5);i++){ const c=ws.getCell(7,7+i); c.value='PRESENTADA'; c.font=fnt(true,BLANC,9); c.fill=fill(NARANJA); c.alignment=aln('center'); c.border=bThin }
  ws.views=[{state:'frozen',xSplit:0,ySplit:7}]

  let f=8
  const valAnio=(anio:number,fn:(p:PeriodoCalculado)=>number):number=>{ const p=porAnio.get(anio); return p?fn(p):0 }
  const eriAnio=(anio:number,fn:(e:EriAcumulado)=>number):number=>{ const arr=r.eriAcumulado.filter((_,i)=>r.periodos[i]?.anio===anio); const last=arr[arr.length-1]; return last?fn(last):0 }
  const pv=(fn:(p:PeriodoCalculado)=>number)=>prevAnios.slice(0,5).map(a=>valAnio(a,fn))
  const pve=(fn:(e:EriAcumulado)=>number)=>prevAnios.slice(0,5).map(a=>eriAnio(a,fn))

  const writeDataRow=(label:string,valContable:number,prevVals:number[],opts:{bold?:boolean;bg?:string})=>{
    const cL=ws.getCell(f,3); cL.value=label; cL.font=fnt(opts.bold??false,NEGRO,9); if(opts.bg)cL.fill=fill(opts.bg); cL.alignment=aln('left'); cL.border=bThin
    const cF=ws.getCell(f,4); cF.value=valContable||null; cF.font=fnt(opts.bold??false,NEGRO,9); if(opts.bg)cF.fill=fill(opts.bg); cF.alignment=aln('right'); cF.numFmt=nf; cF.border=bThin
    const cC=ws.getCell(f,5); cC.value=valContable||null; cC.font=fnt(opts.bold??false,NEGRO,9); if(opts.bg)cC.fill=fill(opts.bg); cC.alignment=aln('right'); cC.numFmt=nf; cC.border=bThin
    ws.getCell(f,6).value=null
    for(let i=0;i<5;i++){ const c=ws.getCell(f,7+i); c.value=prevVals[i]||null; c.font=fnt(opts.bold??false,NEGRO,9); if(opts.bg)c.fill=fill(opts.bg); c.alignment=aln('right'); c.numFmt=nf; c.border=bThin }
  }
  const writeSubTotal=(label:string,val:number,prevVals:number[])=>{
    const cL=ws.getCell(f,3); cL.value=label; cL.font=fnt(true,NEGRO,9); cL.fill=fill(GRIS_CLARO); cL.alignment=aln('left'); cL.border=bThin
    const cF=ws.getCell(f,4); cF.value=val||null; cF.font=fnt(true,NEGRO,9); cF.fill=fill(GRIS_CLARO); cF.alignment=aln('right'); cF.numFmt=nf; cF.border=bThin
    const cC=ws.getCell(f,5); cC.value=val||null; cC.font=fnt(true,NEGRO,9); cC.fill=fill(GRIS_CLARO); cC.alignment=aln('right'); cC.numFmt=nf; cC.border=bThin
    for(let i=0;i<5;i++){ const c=ws.getCell(f,7+i); c.value=prevVals[i]||null; c.font=fnt(true,NEGRO,9); c.fill=fill(GRIS_CLARO); c.alignment=aln('right'); c.numFmt=nf; c.border=bThin }
  }
  const writeTotal=(label:string,valContable:number,prevVals:number[],bgColor:string)=>{
    ws.mergeCells(f,1,f,3); const cL=ws.getCell(f,1); cL.value=label; cL.font=fnt(true,BLANC,9); cL.fill=fill(bgColor); cL.alignment=aln('center'); cL.border=bMed
    const cF=ws.getCell(f,4); cF.value=valContable||null; cF.font=fnt(true,BLANC,9); cF.fill=fill(bgColor); cF.alignment=aln('right'); cF.numFmt=nf; cF.border=bMed
    const cC=ws.getCell(f,5); cC.value=valContable||null; cC.font=fnt(true,BLANC,9); cC.fill=fill(bgColor); cC.alignment=aln('right'); cC.numFmt=nf; cC.border=bMed
    for(let i=0;i<5;i++){ const c=ws.getCell(f,7+i); c.value=prevVals[i]||null; c.font=fnt(true,BLANC,9); c.fill=fill(bgColor); c.alignment=aln('right'); c.numFmt=nf; c.border=bMed }
  }
  const setGroupLabel=(rowStart:number,rowEnd:number,label:string)=>{
    try{ if(rowEnd>rowStart) ws.mergeCells(rowStart,1,rowEnd,2); else ws.mergeCells(rowStart,1,rowStart,2) }catch(_){}
    const c=ws.getCell(rowStart,1); c.value=label; c.font=fnt(true,NEGRO,8); c.alignment=alnRot(); c.border=bThin; c.fill=fill(GRIS_CLARO)
  }
  const emptyAB=(row:number)=>{ try{ ws.mergeCells(row,1,row,2) }catch(_){} ws.getCell(row,1).border=bThin }

  const secciones: { subRow: number; dataRows: number[] }[] = []

  let cajaStart=f; let dr:number[]=[]
  emptyAB(f); writeDataRow('Caja',valAnio(anioAct,p=>p.activoCorriente.cajaTotal),pv(p=>p.activoCorriente.cajaTotal),{}); dr.push(f); f++
  for(const banco of (ultP?.activoCorriente.bancos??[])){ emptyAB(f); writeDataRow(banco.nombre,banco.totalSaldoFinal,prevAnios.slice(0,5).map(a=>valAnio(a,p=>p.activoCorriente.bancos.find(b=>b.nombre===banco.nombre)?.totalSaldoFinal??0)),{}); dr.push(f); f++ }
  writeSubTotal('Sub- Total',valAnio(anioAct,p=>p.activoCorriente.efectivoTotal),pv(p=>p.activoCorriente.efectivoTotal)); secciones.push({subRow:f,dataRows:[...dr]}); setGroupLabel(cajaStart,f,'CAJA Y BANCO'); f++; f++

  let invStart=f; dr=[]
  for(const inv of (ultP?.activoCorriente.inversionesDetalle??[])){ emptyAB(f); writeDataRow(inv.nombre,inv.valor,prevAnios.slice(0,5).map(a=>valAnio(a,p=>p.activoCorriente.inversionesDetalle.find(x=>x.codigo===inv.codigo)?.valor??0)),{}); dr.push(f); f++ }
  writeSubTotal('Sub- Total',valAnio(anioAct,p=>p.activoCorriente.inversionesTotal),pv(p=>p.activoCorriente.inversionesTotal)); secciones.push({subRow:f,dataRows:[...dr]}); if(invStart<f)setGroupLabel(invStart,f,'INVERSIONES'); f++; f++

  let cxcStart=f; dr=[]
  emptyAB(f); writeDataRow('CxC',valAnio(anioAct,p=>p.activoCorriente.clientesTotal+p.activoCorriente.anticiposTotal),pv(p=>p.activoCorriente.clientesTotal+p.activoCorriente.anticiposTotal),{}); dr.push(f); f++
  writeSubTotal('Sub- Total',valAnio(anioAct,p=>p.activoCorriente.clientesTotal+p.activoCorriente.anticiposTotal),pv(p=>p.activoCorriente.clientesTotal+p.activoCorriente.anticiposTotal)); secciones.push({subRow:f,dataRows:[...dr]}); setGroupLabel(cxcStart,f,'CxC'); f++; f++

  let invtStart=f; dr=[]
  for(const item of (ultP?.activoCorriente.inventarioDetalle??[])){ emptyAB(f); writeDataRow(item.nombre,item.valor,prevAnios.slice(0,5).map(a=>valAnio(a,p=>p.activoCorriente.inventarioDetalle.find(x=>x.codigo===item.codigo)?.valor??0)),{}); dr.push(f); f++ }
  if((ultP?.activoCorriente.inventarioDetalle.length??0)===0){ emptyAB(f); writeDataRow('Inventario',valAnio(anioAct,p=>p.activoCorriente.inventarioTotal),pv(p=>p.activoCorriente.inventarioTotal),{}); dr.push(f); f++ }
  writeSubTotal('Sub- Total',valAnio(anioAct,p=>p.activoCorriente.inventarioTotal),pv(p=>p.activoCorriente.inventarioTotal)); secciones.push({subRow:f,dataRows:[...dr]}); if(invtStart<f)setGroupLabel(invtStart,f,'INVENTARIO'); f++; f++

  let afStart=f; dr=[]
  for(const item of (ultP?.activoNoCorriente.detallePPyE??[])){ emptyAB(f); writeDataRow(item.nombre,item.valor,prevAnios.slice(0,5).map(a=>valAnio(a,p=>p.activoNoCorriente.detallePPyE.find(x=>x.codigo===item.codigo)?.valor??0)),{}); dr.push(f); f++ }
  emptyAB(f); writeDataRow('Depreciacion acumulada',valAnio(anioAct,p=>p.activoNoCorriente.depreciacionAcumulada),pv(p=>p.activoNoCorriente.depreciacionAcumulada),{}); dr.push(f); f++
  writeSubTotal('Sub- Total',valAnio(anioAct,p=>p.activoNoCorriente.ppyeNeto),pv(p=>p.activoNoCorriente.ppyeNeto)); secciones.push({subRow:f,dataRows:[...dr]}); setGroupLabel(afStart,f,'ACTIVOS FIJOS'); f++; f++

  let otrosStart=f; dr=[]
  const items135=[
    {label:'Retención en la fuente',fn:(p:PeriodoCalculado)=>p.activoCorriente.anticReteFuente},
    {label:'Industria y Comercio',fn:(p:PeriodoCalculado)=>p.activoCorriente.anticICA},
    {label:'Anticipo impuesto de renta',fn:(p:PeriodoCalculado)=>p.activoCorriente.anticRenta},
    {label:'Autorrenta',fn:(p:PeriodoCalculado)=>p.activoCorriente.anticOtros},
  ]
  for(const it of items135){ emptyAB(f); writeDataRow(it.label,valAnio(anioAct,it.fn),pv(it.fn),{}); dr.push(f); f++ }
  writeSubTotal('Sub- Total',valAnio(anioAct,p=>p.activoCorriente.anticipoImpuestosTotal),pv(p=>p.activoCorriente.anticipoImpuestosTotal)); secciones.push({subRow:f,dataRows:[...dr]}); setGroupLabel(otrosStart,f,'OTROS ACTIVOS'); f++; f++

  writeTotal('TOTAL ACTIVOS',valAnio(anioAct,p=>p.totalActivo),pv(p=>p.totalActivo),NARANJA); f++; f++

  let pasStart=f; dr=[]
  const pasItems=[
    {label:'Proveedores',fn:(p:PeriodoCalculado)=>p.pasivoCorriente.proveedoresTotal},
    {label:'Costos y gastos por pagar',fn:(p:PeriodoCalculado)=>p.pasivoCorriente.costosGastosPagar},
    {label:'Obligaciones financieras',fn:(p:PeriodoCalculado)=>p.pasivoCorriente.obligFinCorrTotal+p.pasivoNoCorriente.obligFinNCTotal},
    {label:'Retenciones y aportes de nómina',fn:(p:PeriodoCalculado)=>p.pasivoCorriente.aporteNomina},
    {label:'Impuesto industria y Comercio',fn:(p:PeriodoCalculado)=>p.pasivoCorriente.icaTotal},
    {label:'Ica y retención de ica',fn:(p:PeriodoCalculado)=>p.pasivoCorriente.icaRetenido},
    {label:'Impuesto de renta y complement.',fn:(p:PeriodoCalculado)=>p.pasivoCorriente.impuestosRenta},
    {label:'Retención en la fuente',fn:(p:PeriodoCalculado)=>p.pasivoCorriente.reteTotal},
    {label:'Acreedores varios',fn:(p:PeriodoCalculado)=>p.pasivoCorriente.acreedoresVariosTotal},
    {label:'Pasivos por beneficios a empl.',fn:(p:PeriodoCalculado)=>{ const g2510=(p.pasivoCorriente.beneficiosDetalle??[]).filter((x:any)=>x.codigo.startsWith('2510')).reduce((s:number,x:any)=>s+x.valor,0); return p.pasivoCorriente.beneficiosCorrTotal+p.pasivoNoCorriente.provisionLaboralTotal-g2510 }},
    {label:'Otros pasivos',fn:(p:PeriodoCalculado)=>p.pasivoCorriente.otrosPasivosCorrTotal+p.pasivoNoCorriente.otrosPasivosNCTotal},
  ]
  for(const it of pasItems){ emptyAB(f); writeDataRow(it.label,valAnio(anioAct,it.fn),pv(it.fn),{}); dr.push(f); f++ }
  writeSubTotal('Sub- Total Pasivos',valAnio(anioAct,p=>p.totalPasivo),pv(p=>p.totalPasivo)); secciones.push({subRow:f,dataRows:[...dr]}); setGroupLabel(pasStart,f,'PASIVOS'); f++; f++

  writeTotal('TOTAL PATRIMONIO LIQUIDO',valAnio(anioAct,p=>p.patrimonio.totalPatrimonio),pv(p=>p.patrimonio.totalPatrimonio),VERDE_OSC); f++; f++

  let ingStart=f; dr=[]
  for(const it of [{label:'Ingresos brutos por actividad',fn:(e:EriAcumulado)=>e.ingresosOperacionales},{label:'Ingresos financieros',fn:(e:EriAcumulado)=>e.ingresosNoOperacionales}]){ emptyAB(f); writeDataRow(it.label,eriAcum?it.fn(eriAcum):0,pve(it.fn),{}); dr.push(f); f++ }
  const ingSubRow=f; writeTotal('TOTAL INGRESOS',eriAcum?eriAcum.ingresosTotal:0,pve(e=>e.ingresosTotal),VERDE_MED); secciones.push({subRow:ingSubRow,dataRows:[...dr]}); setGroupLabel(ingStart,f-1,'INGRESOS'); f++; f++

  let cosStart=f; dr=[]
  for(const it of [{label:'Costos',fn:(e:EriAcumulado)=>e.costoTotal},{label:'Gastos Administración',fn:(e:EriAcumulado)=>e.gastosOperTotal},{label:'Gastos Financieros',fn:(e:EriAcumulado)=>e.gastosNoOp}]){ emptyAB(f); writeDataRow(it.label,eriAcum?it.fn(eriAcum):0,pve(it.fn),{}); dr.push(f); f++ }
  emptyAB(f); writeDataRow('Ajuste de Inventario',0,prevAnios.slice(0,5).map(()=>0),{}); dr.push(f); f++
  emptyAB(f); writeDataRow('Otros Gastos',0,prevAnios.slice(0,5).map(()=>0),{}); dr.push(f); f++
  const totalGastos=eriAcum?(eriAcum.costoTotal+eriAcum.gastosOperTotal+eriAcum.gastosNoOp):0
  const gastSubRow=f; writeTotal('TOTAL GASTOS',totalGastos,pve(e=>e.costoTotal+e.gastosOperTotal+e.gastosNoOp),VERDE_MED); secciones.push({subRow:gastSubRow,dataRows:[...dr]}); setGroupLabel(cosStart,f-1,'COSTOS Y DEDUCCIONES'); f++; f++

  writeTotal('RENTA LIQUIDA',eriAcum?eriAcum.resultadoAnteImpuesto:0,pve(e=>e.resultadoAnteImpuesto),VERDE_OSC); f++; f++

  const liqItems:Array<{label:string;fn?:(e:EriAcumulado)=>number;fnP2?:(p:PeriodoCalculado)=>number}>=[
    {label:'Total impuesto a cargo',fn:(e)=>e.provisionRenta},
    {label:'Descuentos tributarios'},
    {label:'Anticipo renta año anterior',fnP2:(p)=>p.activoCorriente.anticRenta},
    {label:'Retención y Autorrenta',fnP2:(p)=>p.activoCorriente.anticReteFuente+p.pasivoCorriente.autoretenciones},
    {label:'Anticipo renta año siguiente'},
    {label:'Saldo a favor'},
  ]
  for(const it of liqItems){
    try{ ws.mergeCells(f,1,f,2) }catch(_){}
    ws.getCell(f,1).fill=fill(AMARILLO); ws.getCell(f,1).border=bThin
    const cL=ws.getCell(f,3); cL.value=it.label; cL.font=fnt(false,NEGRO,9); cL.fill=fill(AMARILLO); cL.alignment=aln('left'); cL.border=bThin
    let valCont=0; if(it.fn) valCont=eriAcum?it.fn(eriAcum):0; else if(it.fnP2) valCont=valAnio(anioAct,it.fnP2)
    const cF=ws.getCell(f,4); cF.value=valCont||null; cF.font=fnt(false,NEGRO,9); cF.fill=fill(AMARILLO); cF.alignment=aln('right'); cF.numFmt=nf; cF.border=bThin
    const cC=ws.getCell(f,5); cC.value=valCont||null; cC.font=fnt(false,NEGRO,9); cC.fill=fill(AMARILLO); cC.alignment=aln('right'); cC.numFmt=nf; cC.border=bThin
    for(let i=0;i<5;i++){ const c=ws.getCell(f,7+i); let vPrev=0; if(it.fn) vPrev=eriAnio(prevAnios[i]??0,it.fn); else if(it.fnP2) vPrev=prevAnios[i]?valAnio(prevAnios[i],it.fnP2):0; c.value=vPrev||null; c.font=fnt(false,NEGRO,9); c.fill=fill(AMARILLO); c.alignment=aln('right'); c.numFmt=nf; c.border=bThin }
    f++
  }
  f++

  const totalPagar=eriAcum? eriAcum.provisionRenta - valAnio(anioAct,p=>p.activoCorriente.anticRenta) - valAnio(anioAct,p=>p.activoCorriente.anticReteFuente+p.pasivoCorriente.autoretenciones) : 0
  writeTotal('TOTAL A PAGAR',totalPagar,prevAnios.slice(0,5).map(a=>{ const p=porAnio.get(a); if(!p)return 0; const e=r.eriAcumulado.find((_,i)=>r.periodos[i]?.anio===a&&r.periodos[i]?.mes===p.mes); return e?e.provisionRenta-p.activoCorriente.anticRenta-p.activoCorriente.anticReteFuente:0 }),ORO); f++; f++

  const writeFecha=(label:string)=>{ try{ ws.mergeCells(f,1,f,3) }catch(_){} const cL=ws.getCell(f,1); cL.value=label; cL.font=fnt(true,NEGRO,9); cL.border=bThin; for(let i=4;i<=11;i++) ws.getCell(f,i).border=bThin; f++ }
  writeFecha('FECHA DE PRESENTACION DE DECLARACION'); writeFecha('FECHA FIRMEZA - BENEFICIO AUDITORIA'); writeFecha('FECHA FIRMEZA'); f++

  try{ ws.mergeCells(f,4,f,5) }catch(_){}
  const cBen=ws.getCell(f,4); cBen.value='Beneficio de Auditoria'; cBen.font=fnt(true,NEGRO,9); cBen.fill=fill('FFFFFF00'); cBen.alignment=aln('left'); cBen.border=bThin

  ws.getRow(2).height=15; ws.getRow(3).height=14; ws.getRow(4).height=15; ws.getRow(5).height=12; ws.getRow(6).height=15; ws.getRow(7).height=15

  // ── Nivel B: formular subtotales de sección = SUMA(filas de datos) ──
  const esNum=(v:any):v is number=>typeof v==='number'&&!Number.isNaN(v)
  for(const sec of secciones){
    for(const c of [4,5,7,8,9,10,11]){
      const cell=ws.getCell(sec.subRow,c); if(!esNum(cell.value)) continue
      const filas=sec.dataRows.filter(d=>esNum(ws.getCell(d,c).value))
      if(filas.length===0) continue
      const suma=filas.reduce((s,d)=>s+(ws.getCell(d,c).value as number),0)
      const objetivo=cell.value as number
      if(Math.abs(suma-objetivo)>1) continue
      const letra=ws.getColumn(c).letter
      cell.value={formula:filas.map(d=>`${letra}${d}`).join('+'),result:objetivo}; cell.numFmt=nf
    }
  }
}