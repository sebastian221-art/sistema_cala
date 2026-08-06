// src/lib/motor-contable/esf/notaspyg.ts
// ─────────────────────────────────────────────────────────────
// HOJA: NOTAS PYG (notas consolidadas de resultados)  (reproducción completa)
// Layout P&L: col 2 Acumulado, 3-5 meses actual, 7-8 meses anterior.
// Secciones INGRESOS (Operacionales/No Op), COSTO DE VENTAS (subcuentas→aux),
// UTILIDAD OPERACIONAL, GASTOS (Oper/No Op), TOTAL GASTOS, RESULTADO.
// Nivel B: subcuentas con auxiliares = SUMA(auxiliares), y secciones = SUMA
// de sus subcuentas (con salvaguarda: solo si la suma coincide).
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, solid as sfill, font as fnt0, bordeThin as bThin } from './_shared'

type EriMensual = PeriodoCalculado['eriMensual']

export function hojaNCTASPYG(wb: ExcelJS.Workbook, r: ResultadoMotor, _reg?: RegistroCeldas) {
  const anioHoja = r.periodos[r.periodos.length - 1]?.anio ?? new Date().getFullYear()
  const ws = wb.addWorksheet('NOTAS PYG')
  ws.showGridLines = false
  const VERDE = C.VERDE_HEADER, GRIS = C.GRIS_SUBTOTAL, NAVY = C.AZUL_TOTAL, NEGRO = C.NEGRO, BLANC = C.BLANCO, ROJO_T = 'FFFF0000'
  const fnt = (b=false,col=NEGRO,sz=9,it=false) => fnt0(b,col,sz,it,'Calibri')
  const alnL:Partial<ExcelJS.Alignment>={horizontal:'left',vertical:'middle'}
  const alnR:Partial<ExcelJS.Alignment>={horizontal:'right',vertical:'middle'}
  const alnC:Partial<ExcelJS.Alignment>={horizontal:'center',vertical:'middle'}
  const MESES:Record<number,string>={1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE'}
  const nf='#,##0;(#,##0);"-"'

  const periOrd=[...r.periodos].reverse()
  const anioAct=periOrd[0]?.anio??anioHoja
  const grpAct=periOrd.filter(p=>p.anio===anioAct).slice(0,3)
  const grpAnt=periOrd.filter(p=>p.anio!==anioAct).slice(0,2)

  ws.getColumn(1).width=43; ws.getColumn(2).width=16; ws.getColumn(3).width=16; ws.getColumn(4).width=16; ws.getColumn(5).width=16
  ws.getColumn(6).width=2.14; ws.getColumn(7).width=16; ws.getColumn(8).width=14.71; ws.getColumn(9).width=1.71

  const setTit=(rowN:number,txt:string,sz=10)=>{ ws.mergeCells(rowN,1,rowN,8); const c=ws.getCell(rowN,1); c.value=txt; c.font=fnt(true,NEGRO,sz); c.alignment=alnC }
  setTit(2,r.empresa,11); setTit(3,`NIT. ${r.nit}`,10); setTit(4,'NOTAS A LOS ESTADOS FINANCIEROS',10); setTit(5,'(Cifra expresadas en pesos Colombianos)',9)

  const cConc=ws.getCell(7,1); cConc.value='CONCEPTO'; cConc.font=fnt(true,BLANC,9); cConc.fill=sfill(NAVY); cConc.alignment=alnC; cConc.border=bThin
  if(grpAct.length>0){ const cA7=ws.getCell(7,2); cA7.value=grpAct[0].anio; cA7.font=fnt(true,BLANC,8); cA7.fill=sfill(NAVY); cA7.alignment=alnC; cA7.border=bThin; const cA8=ws.getCell(8,2); cA8.value='ACUMULADO'; cA8.font=fnt(true,BLANC,8); cA8.fill=sfill(NAVY); cA8.alignment=alnC; cA8.border=bThin }
  for(let i=0;i<3;i++){ const p=grpAct[i]; if(!p)continue; const c7=ws.getCell(7,3+i); c7.value=p.anio; c7.font=fnt(true,BLANC,8); c7.fill=sfill(NAVY); c7.alignment=alnC; c7.border=bThin; const c8=ws.getCell(8,3+i); c8.value=MESES[p.mes]; c8.font=fnt(true,BLANC,8); c8.fill=sfill(NAVY); c8.alignment=alnC; c8.border=bThin }
  for(let i=0;i<2;i++){ const p=grpAnt[i]; if(!p)continue; const c7=ws.getCell(7,7+i); c7.value=p.anio; c7.font=fnt(true,BLANC,8); c7.fill=sfill(NAVY); c7.alignment=alnC; c7.border=bThin; const c8=ws.getCell(8,7+i); c8.value=MESES[p.mes]; c8.font=fnt(true,BLANC,8); c8.fill=sfill(NAVY); c8.alignment=alnC; c8.border=bThin }
  ws.views=[{state:'frozen',xSplit:0,ySplit:8}]
  ws.getRow(2).height=15; ws.getRow(3).height=15; ws.getRow(4).height=15; ws.getRow(5).height=12; ws.getRow(7).height=18; ws.getRow(8).height=18

  const writeRow=(rowN:number,label:string,acum:number|null,mensAct:(number|null)[],mensAnt:(number|null)[],opts:{bold?:boolean;fillColor?:string;indent?:string;textColor?:string;italic?:boolean})=>{
    const ind=opts.indent??''; const numColor=opts.fillColor?BLANC:(opts.textColor??NEGRO)
    const cL=ws.getCell(rowN,1); cL.value=ind+label; cL.font=fnt(opts.bold??false,opts.textColor??NEGRO,9,opts.italic??false); cL.alignment=alnL; cL.border=bThin; if(opts.fillColor)cL.fill=sfill(opts.fillColor)
    const setV=(col:number,val:number|null)=>{ const c=ws.getCell(rowN,col); c.value=val; c.font=fnt(opts.bold??false,numColor,9,opts.italic??false); c.alignment=alnR; c.numFmt=nf; c.border=bThin; if(opts.fillColor)c.fill=sfill(opts.fillColor) }
    setV(2,acum); for(let i=0;i<3;i++) setV(3+i,mensAct[i]??null); for(let i=0;i<2;i++) setV(7+i,mensAnt[i]??null)
  }
  const writeSection=(rowN:number,label:string,acum:number|null,mensAct:(number|null)[],mensAnt:(number|null)[])=>{ for(let c=1;c<=8;c++){ ws.getCell(rowN,c).fill=sfill(VERDE); ws.getCell(rowN,c).border=bThin } writeRow(rowN,label,acum,mensAct,mensAnt,{bold:true,fillColor:VERDE}) }
  const writeSubtotalGris=(rowN:number,label:string,acum:number|null,mensAct:(number|null)[],mensAnt:(number|null)[])=>{ for(let c=1;c<=8;c++){ ws.getCell(rowN,c).fill=sfill(GRIS); ws.getCell(rowN,c).border=bThin } writeRow(rowN,label,acum,mensAct,mensAnt,{bold:true,fillColor:GRIS}) }
  const writeBoldItalic=(rowN:number,label:string,acum:number|null,mensAct:(number|null)[],mensAnt:(number|null)[])=>writeRow(rowN,label,acum,mensAct,mensAnt,{bold:true,italic:true})

  const ult=r.periodos[r.periodos.length-1]
  const idxDe=(p:PeriodoCalculado)=>r.periodos.findIndex(x=>x.mes===p.mes&&x.anio===p.anio)
  const acumIngreso=(codigo:string):number|null=>{ const sc=ult?.ingresosDetalle.find(x=>x.codigo===codigo); return sc?.total||null }
  const mensualIngreso=(g:number,codigo:string):number|null=>{ const p=grpAct[g]; if(!p)return null; const i=idxDe(p); if(i<0)return null; const cu=r.periodos[i].ingresosDetalle.find(x=>x.codigo===codigo)?.total??0; const pr=i>0?(r.periodos[i-1].ingresosDetalle.find(x=>x.codigo===codigo)?.total??0):0; return (cu-pr)||null }
  const antIngreso=(a:number,codigo:string):number|null=>{ const p=grpAnt[a]; if(!p)return null; const i=idxDe(p); if(i<0)return null; const cu=r.periodos[i].ingresosDetalle.find(x=>x.codigo===codigo)?.total??0; const pr=i>0?(r.periodos[i-1].ingresosDetalle.find(x=>x.codigo===codigo)?.total??0):0; return (cu-pr)||null }
  const getCostoTotal=(per:PeriodoCalculado)=>per.costosDetalle?.reduce((s,c)=>s+c.total,0)??0
  const costoTotAcum=getCostoTotal(ult)||null
  const varTot=(g:number,fn:(p:PeriodoCalculado)=>number,grp:PeriodoCalculado[]):number|null=>{ const p=grp[g]; if(!p)return null; const i=idxDe(p); if(i<0)return null; return (fn(r.periodos[i])-(i>0?fn(r.periodos[i-1]):0))||null }
  const costoTotMens=[0,1,2].map(i=>varTot(i,getCostoTotal,grpAct))
  const costoTotAnt=[0,1].map(i=>varTot(i,getCostoTotal,grpAnt))
  const acumCosto=(sc:string,aux?:string):number|null=>{ const s=ult?.costosDetalle.find(x=>x.codigo===sc); if(!aux)return s?.total||null; return s?.auxiliares.find(a=>a.codigo===aux)?.valor||null }
  const getCostoVal=(per:PeriodoCalculado,sc:string,aux?:string)=>{ const s=per.costosDetalle?.find(x=>x.codigo===sc); return aux?(s?.auxiliares.find(a=>a.codigo===aux)?.valor??0):(s?.total??0) }
  const mensualCosto=(g:number,sc:string,aux?:string):number|null=>varTot(g,p=>getCostoVal(p,sc,aux),grpAct)
  const antCosto=(a:number,sc:string,aux?:string):number|null=>varTot(a,p=>getCostoVal(p,sc,aux),grpAnt)
  const acumGasto=(sc:string,aux?:string):number|null=>{ const s=ult?.gastosDetalle.find(x=>x.codigo===sc); if(!aux)return s?.total||null; return s?.auxiliares.find(a=>a.codigo===aux)?.valor||null }
  const getGastoVal=(per:PeriodoCalculado,sc:string,aux?:string)=>{ const s=per.gastosDetalle?.find(x=>x.codigo===sc); return aux?(s?.auxiliares.find(a=>a.codigo===aux)?.valor??0):(s?.total??0) }
  const mensualGasto=(g:number,sc:string,aux?:string):number|null=>varTot(g,p=>getGastoVal(p,sc,aux),grpAct)
  const antGasto=(a:number,sc:string,aux?:string):number|null=>varTot(a,p=>getGastoVal(p,sc,aux),grpAnt)
  const eriMens=(g:number,fn:(e:EriMensual)=>number):number|null=>{ const p=grpAct[g]; if(!p)return null; const i=idxDe(p); return i>=0?fn(r.periodos[i].eriMensual)||null:null }
  const eriAnt=(a:number,fn:(e:EriMensual)=>number):number|null=>{ const p=grpAnt[a]; if(!p)return null; const i=idxDe(p); return i>=0?fn(r.periodos[i].eriMensual)||null:null }

  const eriAcum=r.eriAcumulado[r.eriAcumulado.length-1]
  const grupos:{sub:number;det:number[]}[]=[]

  let f=10; const br=()=>{ f++ }

  writeSection(f,'INGRESOS',eriAcum?.ingresosTotal??null,[0,1,2].map(i=>eriMens(i,e=>e.ingresosTotal)),[0,1].map(i=>eriAnt(i,e=>e.ingresosTotal))); f++; br()
  const scOp=ult?.ingresosDetalle.filter(x=>x.esOperacional)??[]
  let opRow=f; let opDet:number[]=[]
  writeRow(f,'Operacionales',eriAcum?.ingresosOperacionales??null,[0,1,2].map(i=>eriMens(i,e=>e.ingresosOperacionales)),[0,1].map(i=>eriAnt(i,e=>e.ingresosOperacionales)),{bold:true}); f++
  for(const sc of scOp){ writeRow(f,sc.nombre,acumIngreso(sc.codigo),[0,1,2].map(i=>mensualIngreso(i,sc.codigo)),[0,1].map(i=>antIngreso(i,sc.codigo)),{indent:'  ',textColor:sc.esDevolucion?ROJO_T:NEGRO}); opDet.push(f); f++ }
  grupos.push({sub:opRow,det:opDet}); br()
  const scNoOp=ult?.ingresosDetalle.filter(x=>!x.esOperacional)??[]
  let noOpRow=f; let noOpDet:number[]=[]
  writeRow(f,'No Operacionales',eriAcum?.ingresosNoOperacionales??null,[0,1,2].map(i=>eriMens(i,e=>e.ingresosNoOperacionales)),[0,1].map(i=>eriAnt(i,e=>e.ingresosNoOperacionales)),{bold:true}); f++
  for(const sc of scNoOp){ writeRow(f,sc.nombre,acumIngreso(sc.codigo),[0,1,2].map(i=>mensualIngreso(i,sc.codigo)),[0,1].map(i=>antIngreso(i,sc.codigo)),{indent:'  '}); noOpDet.push(f); f++ }
  grupos.push({sub:noOpRow,det:noOpDet}); br()

  writeSection(f,'COSTO DE VENTAS',costoTotAcum,costoTotMens,costoTotAnt); f++; br()
  for(const sc of (ult?.costosDetalle??[])){ let scRow=f; let scDet:number[]=[]
    writeRow(f,sc.nombre,acumCosto(sc.codigo),[0,1,2].map(i=>mensualCosto(i,sc.codigo)),[0,1].map(i=>antCosto(i,sc.codigo)),{bold:true}); f++
    for(const aux of sc.auxiliares){ writeRow(f,aux.nombre,acumCosto(sc.codigo,aux.codigo),[0,1,2].map(i=>mensualCosto(i,sc.codigo,aux.codigo)),[0,1].map(i=>antCosto(i,sc.codigo,aux.codigo)),{indent:'  '}); scDet.push(f); f++ }
    grupos.push({sub:scRow,det:scDet}); br() }

  const utilAcum=(eriAcum?.ingresosOperacionales??0)-(costoTotAcum??0)
  const utilMens=[0,1,2].map(i=>((eriMens(i,e=>e.ingresosOperacionales)??0)-(costoTotMens[i]??0))||null)
  const utilAnt=[0,1].map(i=>((eriAnt(i,e=>e.ingresosOperacionales)??0)-(costoTotAnt[i]??0))||null)
  writeSubtotalGris(f,'UTILIDAD OPERACIONAL',utilAcum||null,utilMens,utilAnt); f++; br()

  const gastTot=(per:PeriodoCalculado)=>per.eriMensual.gastosOperTotal+per.eriMensual.gastosNoOp
  const gastTotAcum=eriAcum?(eriAcum.gastosOperTotal+eriAcum.gastosNoOp):null
  const gastTotMens=[0,1,2].map(i=>varTot(i,gastTot,grpAct))
  const gastTotAnt=[0,1].map(i=>varTot(i,gastTot,grpAnt))
  writeSection(f,'GASTOS',gastTotAcum,gastTotMens,gastTotAnt); f++; br()
  let gOpRow=f; let gOpDet:number[]=[]
  writeRow(f,'GASTOS OPERACIONALES',eriAcum?.gastosOperTotal??null,[0,1,2].map(i=>eriMens(i,e=>e.gastosOperTotal)),[0,1].map(i=>eriAnt(i,e=>e.gastosOperTotal)),{bold:true}); f++; br()
  for(const sc of (ult?.gastosDetalle.filter(x=>x.esOperacional)??[])){ let scRow=f; let scDet:number[]=[]
    writeRow(f,sc.nombre,acumGasto(sc.codigo),[0,1,2].map(i=>mensualGasto(i,sc.codigo)),[0,1].map(i=>antGasto(i,sc.codigo)),{bold:true}); gOpDet.push(f); f++
    for(const aux of sc.auxiliares){ writeRow(f,aux.nombre,acumGasto(sc.codigo,aux.codigo),[0,1,2].map(i=>mensualGasto(i,sc.codigo,aux.codigo)),[0,1].map(i=>antGasto(i,sc.codigo,aux.codigo)),{indent:'  '}); scDet.push(f); f++ }
    grupos.push({sub:scRow,det:scDet}); br() }
  grupos.push({sub:gOpRow,det:gOpDet})
  let gNoOpRow=f; let gNoOpDet:number[]=[]
  writeRow(f,'GASTOS NO OPERACIONALES',eriAcum?.gastosNoOp??null,[0,1,2].map(i=>eriMens(i,e=>e.gastosNoOp)),[0,1].map(i=>eriAnt(i,e=>e.gastosNoOp)),{bold:true}); f++; br()
  for(const sc of (ult?.gastosDetalle.filter(x=>!x.esOperacional)??[])){ let scRow=f; let scDet:number[]=[]
    writeRow(f,sc.nombre,acumGasto(sc.codigo),[0,1,2].map(i=>mensualGasto(i,sc.codigo)),[0,1].map(i=>antGasto(i,sc.codigo)),{bold:true}); gNoOpDet.push(f); f++
    for(const aux of sc.auxiliares){ writeRow(f,aux.nombre,acumGasto(sc.codigo,aux.codigo),[0,1,2].map(i=>mensualGasto(i,sc.codigo,aux.codigo)),[0,1].map(i=>antGasto(i,sc.codigo,aux.codigo)),{indent:'  '}); scDet.push(f); f++ }
    grupos.push({sub:scRow,det:scDet}); br() }
  grupos.push({sub:gNoOpRow,det:gNoOpDet})
  writeSubtotalGris(f,'TOTAL GASTOS',gastTotAcum,gastTotMens,gastTotAnt); f++; br()

  const resOpAcum=(utilAcum??0)-(gastTotAcum??0)
  const resOpMens=[0,1,2].map(i=>((utilMens[i]??0)-(gastTotMens[i]??0))||null)
  const resOpAnt=[0,1].map(i=>((utilAnt[i]??0)-(gastTotAnt[i]??0))||null)
  writeBoldItalic(f,'RESULTADO DE OPERACIÓN CONTABLE',resOpAcum||null,resOpMens,resOpAnt); f++; br()
  writeBoldItalic(f,'RESULTADO ANTES DE IMPUESTO',eriAcum?.resultadoAnteImpuesto??null,[0,1,2].map(i=>eriMens(i,e=>e.resultadoAnteImpuesto)),[0,1].map(i=>eriAnt(i,e=>e.resultadoAnteImpuesto))); f++; br()
  writeRow(f,'Provision Impuesto de Renta',eriAcum?.provisionRenta??null,[0,1,2].map(i=>eriMens(i,e=>e.provisionRenta)),[0,1].map(i=>eriAnt(i,e=>e.provisionRenta)),{}); f++; br()
  writeBoldItalic(f,'RESULTADO INTEGRAL TOTAL DEL PERIODO',eriAcum?.resultadoNeto??null,[0,1,2].map(i=>eriMens(i,e=>e.resultadoNeto)),[0,1].map(i=>eriAnt(i,e=>e.resultadoNeto)))

  // ── Nivel B: formular subtotales = SUMA(detalle) con salvaguarda ──
  const esNum=(v:any):v is number=>typeof v==='number'&&!Number.isNaN(v)
  for(const g of grupos){ if(g.det.length===0)continue
    for(const c of [2,3,4,5,7,8]){ const cell=ws.getCell(g.sub,c); if(!esNum(cell.value))continue
      const filas=g.det.filter(d=>esNum(ws.getCell(d,c).value)); if(filas.length===0)continue
      const suma=filas.reduce((s,d)=>s+(ws.getCell(d,c).value as number),0); const objetivo=cell.value as number
      if(Math.abs(suma-objetivo)>1)continue
      const letra=ws.getColumn(c).letter; cell.value={formula:filas.map(d=>`${letra}${d}`).join('+'),result:objetivo}; cell.numFmt=nf } }
}