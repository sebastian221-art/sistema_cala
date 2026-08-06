// src/lib/motor-contable/esf/eri.ts
// ─────────────────────────────────────────────────────────────
// HOJA: ERI (Estado de Resultados Integral)  (migrada a Nivel B)
// Arial; ACUMULADO col 7, meses col 8+, VARIACION (ABSOLUTA + %) a la derecha.
// Es un estado en cascada. Nivel B: se formulan los totales que son diferencias
// limpias de filas mostradas:
//   GANANCIA BRUTA = Ingresos − Costo
//   EBITDA = Ganancia Bruta − Gastos Admin + Depreciaciones
//   GANANCIA OPERACIONAL = Ganancia Bruta − Gastos Admin
//   RESULTADO INTEGRAL = Resultado antes de impuesto − Impuesto
// El resto queda como valor (algunos usan componentes no mostrados).
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor } from '../motor'
import type { RegistroCeldas } from './_registro'
import { C, FMT_PESOS, solid as sfill, font as fntBase } from './_shared'

export function hojaERI(wb: ExcelJS.Workbook, r: ResultadoMotor, _reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('ERI')
  ws.showGridLines = false
  const N = Math.min(r.periodos.length, 6)
  const periOrd = [...r.periodos].reverse().slice(0, N)
  const eriAcum = r.eriAcumulado[r.eriAcumulado.length - 1]
  const anioAct = periOrd[0]?.anio ?? new Date().getFullYear()
  const ROJO_ACT='FF903032', DORADO_ANT='FFBF8F00', NAVY_VAR='FF1F3864', NEGRO=C.NEGRO, BLANC=C.BLANCO
  const fnt = (b=false,a:string=NEGRO,s=9,it=false) => fntBase(b,a,s,it,'Arial')
  const alnC:Partial<ExcelJS.Alignment>={horizontal:'center',vertical:'middle'}
  const alnL:Partial<ExcelJS.Alignment>={horizontal:'left',vertical:'middle'}
  const alnR:Partial<ExcelJS.Alignment>={horizontal:'right',vertical:'middle'}
  const bThin:Partial<ExcelJS.Borders>={top:{style:'thin',color:{argb:NEGRO}},bottom:{style:'thin',color:{argb:NEGRO}},left:{style:'thin',color:{argb:NEGRO}},right:{style:'thin',color:{argb:NEGRO}}}
  const MESES_NOM:Record<number,string>={1:'ENERO',2:'FEBRERO',3:'MARZO',4:'ABRIL',5:'MAYO',6:'JUNIO',7:'JULIO',8:'AGOSTO',9:'SEPTIEMBRE',10:'OCTUBRE',11:'NOVIEMBRE',12:'DICIEMBRE'}
  const fechaCorte=(mes:number,anio:number)=>{ const d=[31,28,31,30,31,30,31,31,30,31,30,31]; const dd=mes===2&&(anio%4===0&&(anio%100!==0||anio%400===0))?29:d[mes-1]; return `${String(dd).padStart(2,'0')}.${String(mes).padStart(2,'0')}.${anio}` }

  const COL_ACUM=7, COL_MES1=8, COL_ABS=COL_MES1+N+1, COL_PCT=COL_MES1+N+2, LAST=COL_PCT

  ws.getColumn(1).width=1.4; ws.getColumn(2).width=54; ws.getColumn(3).width=2; ws.getColumn(4).width=2; ws.getColumn(5).width=8; ws.getColumn(6).width=1.4
  ws.getColumn(7).width=18; for(let i=0;i<N;i++) ws.getColumn(COL_MES1+i).width=18; ws.getColumn(COL_MES1+N).width=1.5; ws.getColumn(COL_ABS).width=16; ws.getColumn(COL_PCT).width=7

  const setTit=(rowN:number,txt:string,it=true,sz=10)=>{ ws.mergeCells(rowN,1,rowN,LAST); const c=ws.getCell(rowN,1); c.value=txt; c.font=fnt(true,NEGRO,sz,it); c.alignment=alnC }
  setTit(2,r.empresa,true,11); setTit(3,`NIT. ${r.nit}`,true,10); setTit(4,'ESTADO DE RESULTADO INTEGRAL A:',true,10); setTit(5,'(Cifra expresadas en pesos Colombianos)',true,9)
  const mesNom = MESES_NOM[periOrd[0]?.mes ?? 1] ?? ''

  const cA8=ws.getCell(8,COL_ACUM); cA8.value=`01.01.${anioAct}`; cA8.font=fnt(true,BLANC,8); cA8.fill=sfill(ROJO_ACT); cA8.alignment=alnC; cA8.border=bThin
  periOrd.forEach((p,i)=>{ const col=COL_MES1+i; const c=ws.getCell(8,col); c.value=`01.${String(p.mes).padStart(2,'0')}.${p.anio}`; c.font=fnt(true,BLANC,8); c.fill=sfill(p.anio===anioAct?ROJO_ACT:DORADO_ANT); c.alignment=alnC; c.border=bThin })
  ws.mergeCells(8,COL_ABS,8,COL_PCT); const cVar8=ws.getCell(8,COL_ABS); cVar8.value=`VARIACION ${mesNom}`; cVar8.font=fnt(true,BLANC,8); cVar8.fill=sfill(NAVY_VAR); cVar8.alignment=alnC; cVar8.border=bThin
  const cIngH=ws.getCell(9,2); cIngH.value='INGRESOS'; cIngH.font=fnt(true,BLANC,10); cIngH.fill=sfill(C.VERDE_HEADER); cIngH.alignment=alnC
  const cNotaH=ws.getCell(9,5); cNotaH.value='NOTA'; cNotaH.font=fnt(true,BLANC,9); cNotaH.fill=sfill(C.VERDE_HEADER); cNotaH.alignment=alnC; cNotaH.border=bThin
  const ultP=periOrd[0]; const cA9=ws.getCell(9,COL_ACUM); cA9.value=ultP?fechaCorte(ultP.mes,ultP.anio):'—'; cA9.font=fnt(true,BLANC,8); cA9.fill=sfill(ROJO_ACT); cA9.alignment=alnC; cA9.border=bThin
  periOrd.forEach((p,i)=>{ const col=COL_MES1+i; const c=ws.getCell(9,col); c.value=fechaCorte(p.mes,p.anio); c.font=fnt(true,BLANC,8); c.fill=sfill(p.anio===anioAct?ROJO_ACT:DORADO_ANT); c.alignment=alnC; c.border=bThin })
  const cAbsH=ws.getCell(9,COL_ABS); cAbsH.value='ABSOLUTA'; cAbsH.font=fnt(true,BLANC,8); cAbsH.fill=sfill(NAVY_VAR); cAbsH.alignment=alnC; cAbsH.border=bThin
  const cPctH=ws.getCell(9,COL_PCT); cPctH.value='%'; cPctH.font=fnt(true,BLANC,8); cPctH.fill=sfill(NAVY_VAR); cPctH.alignment=alnC; cPctH.border=bThin
  const firstAntIdx=periOrd.findIndex(p=>p.anio!==anioAct)
  if(firstAntIdx>=0){ const c=ws.getCell(10,COL_MES1+firstAntIdx); c.value='contable'; c.font=fnt(false,NEGRO,8); c.alignment=alnC }
  ws.views=[{state:'frozen',xSplit:6,ySplit:10}]

  const eriRow=(rowN:number,label:string,acum:number,meses:number[],opts:{nota?:number;bold?:boolean;fillArgb?:string})=>{
    const isGreenH=opts.fillArgb===C.VERDE_HEADER; const textColor=opts.fillArgb?BLANC:NEGRO; const fill=opts.fillArgb?sfill(opts.fillArgb):undefined
    if(isGreenH) for(let c=1;c<=LAST;c++) ws.getCell(rowN,c).fill=sfill(C.VERDE_HEADER)
    const cL=ws.getCell(rowN,2); cL.value=label; cL.font=fnt(opts.bold??false,textColor,9); cL.alignment=alnL; if(!isGreenH){ if(fill)cL.fill=fill; cL.border=bThin }
    if(opts.nota!==undefined){ const cn=ws.getCell(rowN,5); cn.value=opts.nota; cn.font={name:'Arial',color:{argb:C.AZUL_LINK},underline:true,size:8}; cn.alignment=alnC; cn.border=bThin; if(fill)cn.fill=fill }
    const ca=ws.getCell(rowN,COL_ACUM); ca.value=acum; ca.font=fnt(opts.bold??false,textColor,9); ca.alignment=alnR; ca.numFmt=FMT_PESOS; ca.border=bThin; if(fill)ca.fill=fill
    const ms=meses.slice(0,N)
    ms.forEach((mv,i)=>{ const cv=ws.getCell(rowN,COL_MES1+i); cv.value=mv; cv.font=fnt(opts.bold??false,textColor,9); cv.alignment=alnR; cv.numFmt=FMT_PESOS; cv.border=bThin; if(fill)cv.fill=fill })
    if(!isGreenH && ms.length>=1){
      const m0=ms[0]??0, m1=ms.length>=2?(ms[1]??0):0
      const absV=ms.length>=2?m0-m1:null; const pctV=(ms.length>=2&&m1!==0)?(m0-m1)/Math.abs(m1):null
      const cAbs=ws.getCell(rowN,COL_ABS); cAbs.value=absV; cAbs.font=fnt(opts.bold??false,textColor,9); cAbs.alignment=alnR; cAbs.numFmt=FMT_PESOS; cAbs.border=bThin; if(fill)cAbs.fill=fill
      const cPct=ws.getCell(rowN,COL_PCT); cPct.value=pctV; cPct.font=fnt(opts.bold??false,textColor,9); cPct.alignment=alnR; cPct.numFmt='0%'; cPct.border=bThin; if(fill)cPct.fill=fill
    }
  }

  // Convierte una fila-total a FÓRMULA en ACUMULADO + meses (deja variación como está).
  const formular=(rowN:number,interior:(l:string)=>string)=>{
    const cols=[COL_ACUM,...Array.from({length:N},(_,i)=>COL_MES1+i)]
    for(const cnum of cols){ const c=ws.getCell(rowN,cnum); const cached=typeof c.value==='number'?c.value:0; const l=ws.getColumn(cnum).letter; c.value={formula:interior(l),result:cached} }
  }

  const ingOp=periOrd.map(p=>p.eriMensual.ingresosOperacionales)
  const ingNoOp=periOrd.map(p=>p.eriMensual.ingresosNoOperacionales)
  const ingTotal=ingOp.map((v,i)=>v+ingNoOp[i])
  const costo=periOrd.map(p=>p.eriMensual.costoTotal)
  const util=ingOp.map((v,i)=>v-costo[i])
  const gOp=periOrd.map(p=>p.eriMensual.gastosOperTotal)
  const dep=periOrd.map(p=>p.eriMensual.depreciacion)
  const ebit=util.map((v,i)=>v-gOp[i]+dep[i])
  const ganOp=util.map((v,i)=>v-gOp[i])
  const gNoOp=periOrd.map(p=>p.eriMensual.gastosNoOp)
  const resOp=ganOp.map((v,i)=>v+ingNoOp[i]-gNoOp[i])
  const prov=resOp.map(v=>v>0?v*0.35:0)
  const resNet=resOp.map((v,i)=>v-prov[i])
  const A=(k:keyof NonNullable<typeof eriAcum>)=> (eriAcum?.[k] as number) ?? 0

  let f=11
  const rActOrd=f; eriRow(f,'Actividades ordinarias',A('ingresosOperacionales'),ingOp,{nota:13}); f+=2
  eriRow(f,'TOTAL INGRESOS POR ACTIVIDADES ORDINARIAS.',A('ingresosTotal'),ingTotal,{bold:true,fillArgb:C.AZUL_TOTAL}); f+=3
  const rCosto=f; eriRow(f,'(menos) Costo de ventas de bienes y prestación de servicios.',A('costoTotal'),costo,{nota:14}); f+=2
  const rGanBruta=f; eriRow(f,'GANANCIA BRUTA DEL PERIODO.',A('utilidadBruta'),util,{bold:true,fillArgb:C.AZUL_TOTAL}); f+=3
  const rGastosAdmin=f; eriRow(f,'(menos) Gastos efectivos de administración.',A('gastosOperTotal'),gOp,{nota:15}); f+=2
  eriRow(f,'TOTAL GASTOS EFECTIVOS DE ADMINISTRACIÓN.',A('gastosOperTotal'),gOp,{bold:true,fillArgb:C.AZUL_TOTAL}); f+=2
  const rEbitda=f; eriRow(f,'EBITDA.',A('ebitda'),ebit,{bold:true,fillArgb:C.AZUL_TOTAL}); f+=3
  const rDep=f; eriRow(f,'(menos) Depreciaciones.',A('depreciacion'),dep,{nota:15}); f+=2
  const rGanOp=f; eriRow(f,'GANANCIA OPERACIONAL.',(A('utilidadBruta'))-(A('gastosOperTotal')),ganOp,{bold:true,fillArgb:C.AZUL_TOTAL}); f+=3
  eriRow(f,'(menos) Gastos Financieros.',A('gastosNoOp'),gNoOp,{nota:16}); f+=2
  eriRow(f,'RESULTADO OPERACIÓN CONTABLE',A('resultadoAnteImpuesto'),resOp,{bold:true,fillArgb:C.AZUL_TOTAL}); f+=3
  const rResAntes=f; eriRow(f,'RESULTADO ANTES DE IMPUESTO',A('resultadoAnteImpuesto'),resOp,{bold:true,fillArgb:C.AZUL_TOTAL}); f+=2
  const rImpuesto=f; eriRow(f,'(menos) Impuesto de Renta (35%)',A('provisionRenta'),prov,{}); f+=2
  const rResIntegral=f; eriRow(f,'RESULTADO INTEGRAL TOTAL DEL PERIODO',A('resultadoNeto'),resNet,{bold:true,fillArgb:C.AZUL_TOTAL}); f+=4

  // ── Formular los totales de cascada limpios ──
  formular(rGanBruta,(l)=>`${l}${rActOrd}-${l}${rCosto}`)
  formular(rEbitda,(l)=>`${l}${rGanBruta}-${l}${rGastosAdmin}+${l}${rDep}`)
  formular(rGanOp,(l)=>`${l}${rGanBruta}-${l}${rGastosAdmin}`)
  formular(rResIntegral,(l)=>`${l}${rResAntes}-${l}${rImpuesto}`)
}