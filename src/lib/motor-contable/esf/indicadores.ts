// src/lib/motor-contable/esf/indicadores.ts
// ─────────────────────────────────────────────────────────────
// HOJA: INDICADORES (razones financieras)  (reproducción completa — Nivel B)
// 10 razones, una por sección, con layout numerador / "=" / resultado por
// período. Nivel B REAL: cada RESULTADO es una fórmula viva de división o
// resta de sus celdas numerador/denominador (=D6/D7, =D6-D7, 365/rot, etc.).
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor, PeriodoCalculado } from '../motor'
import type { RegistroCeldas } from './_registro'

type EriAcumulado = ResultadoMotor['eriAcumulado'][number]

export function hojaINDICADORES(wb: ExcelJS.Workbook, r: ResultadoMotor, _reg?: RegistroCeldas) {
  const ws = wb.addWorksheet('INDICADORES')
  ws.showGridLines = false
  const NAVY='FF1F3864', ROJO='FF903032', NEGRO='FF000000', BLANC='FFFFFFFF'
  const ANT_COLORS=['FFC08000','FFBF8F00','FF2F75B6','FF70AD47','FFC55A11']
  const sfill=(argb:string):ExcelJS.Fill=>({type:'pattern',pattern:'solid',fgColor:{argb}})
  const fnt=(bold=false,argb=NEGRO,sz=9,ul=false):Partial<ExcelJS.Font>=>({name:'Calibri',bold,color:{argb},size:sz,underline:ul})
  const alnC:Partial<ExcelJS.Alignment>={horizontal:'center',vertical:'middle'}
  const alnL:Partial<ExcelJS.Alignment>={horizontal:'left',vertical:'middle'}
  const alnR:Partial<ExcelJS.Alignment>={horizontal:'right',vertical:'middle'}
  const MESES_CORTO:Record<number,string>={1:'ENE',2:'FEB',3:'MAR',4:'ABR',5:'MAY',6:'JUN',7:'JUL',8:'AGO',9:'SEP',10:'OCT',11:'NOV',12:'DIC'}

  const periOrd=[...r.periodos].reverse()
  const anioAct=periOrd[0]?.anio??new Date().getFullYear()
  const grpAct=periOrd.filter(p=>p.anio===anioAct).slice(0,3)
  const grpAnt=periOrd.filter(p=>p.anio!==anioAct).slice(0,5)
  const allGrps=[...grpAct,...grpAnt]
  const N=allGrps.length

  const COL_DESC=2, COL_FIRST=4, STRIDE=4
  const colVal=(i:number)=>COL_FIRST+i*STRIDE
  const colEq=(i:number)=>COL_FIRST+i*STRIDE+1
  const colRes=(i:number)=>COL_FIRST+i*STRIDE+2
  const lastCol=colRes(N-1)

  ws.getColumn(1).width=1.5; ws.getColumn(2).width=35; ws.getColumn(3).width=1.5
  for(let i=0;i<N;i++){ ws.getColumn(colVal(i)).width=16; ws.getColumn(colEq(i)).width=3; ws.getColumn(colRes(i)).width=10; ws.getColumn(colRes(i)+1).width=1.5 }

  ws.mergeCells(2,1,2,Math.max(lastCol,4)); const cTit=ws.getCell(2,1); cTit.value=`${r.empresa} — INDICADORES FINANCIEROS`; cTit.font=fnt(true,NEGRO,11); cTit.alignment=alnC
  ws.mergeCells(3,1,3,Math.max(lastCol,4)); const cSub=ws.getCell(3,1); cSub.value=`NIT. ${r.nit}`; cSub.font=fnt(true,NEGRO,9); cSub.alignment=alnC

  // period headers (rows 4/5)
  for(let i=0;i<N;i++){ const p=allGrps[i]; const isAnt=p.anio!==anioAct; const antIdx=i-grpAct.length
    const color=isAnt?ANT_COLORS[Math.min(antIdx,ANT_COLORS.length-1)]:ROJO
    const c4=ws.getCell(4,colVal(i)); c4.value=`${MESES_CORTO[p.mes]}-${p.anio}`; c4.font=fnt(true,BLANC,9); c4.fill=sfill(color); c4.alignment=alnC
    const c5=ws.getCell(5,colRes(i)); c5.value='RESULTADO'; c5.font=fnt(true,BLANC,8); c5.fill=sfill(color); c5.alignment=alnC }
  ws.views=[{state:'frozen',xSplit:0,ySplit:5}]

  const getEri=(p:PeriodoCalculado):EriAcumulado|null=>{ const idx=r.periodos.findIndex(x=>x.mes===p.mes&&x.anio===p.anio); return idx>=0&&idx<r.eriAcumulado.length?r.eriAcumulado[idx]:null }
  const gananciaOp=(eri:EriAcumulado|null):number=>eri?(eri.ingresosOperacionales??0)-(eri.costoTotal??0)-(eri.gastosOperTotal??0):0
  const invPromedio=(p:PeriodoCalculado):number=>{ const idx=r.periodos.findIndex(x=>x.mes===p.mes&&x.anio===p.anio); if(idx<=0)return p.activoCorriente.inventarioTotal; return (p.activoCorriente.inventarioTotal+r.periodos[idx-1].activoCorriente.inventarioTotal)/2 }

  let f=7
  const writeSection=(label:string)=>{ const c=ws.getCell(f,COL_DESC); c.value=label; c.font=fnt(true,BLANC,9); c.fill=sfill(NAVY); c.alignment=alnL; f++ }

  // writeFraction con RESULTADO formulado (num/den o num-den)
  const writeFraction=(labelNum:string,labelDen:string,
    getNum:(p:PeriodoCalculado,e:EriAcumulado|null)=>number,
    getDen:(p:PeriodoCalculado,e:EriAcumulado|null)=>number,
    op:'/'|'-', nfRes='#,##0.00')=>{
    const rowN=f, rowD=f+1
    ws.getCell(rowN,COL_DESC).value=labelNum; ws.getCell(rowN,COL_DESC).font=fnt(false,NEGRO,9); ws.getCell(rowN,COL_DESC).alignment=alnL
    ws.getCell(rowD,COL_DESC).value=labelDen; ws.getCell(rowD,COL_DESC).font=fnt(false,NEGRO,9); ws.getCell(rowD,COL_DESC).alignment=alnL
    for(let i=0;i<N;i++){ const p=allGrps[i]; const eri=getEri(p); const nv=getNum(p,eri); const dv=getDen(p,eri)
      const rv=op==='/'?(dv!==0?nv/dv:0):(nv-dv)
      const cN=ws.getCell(rowN,colVal(i)); cN.value=nv||null; cN.font=fnt(false,NEGRO,9); cN.alignment=alnR; cN.numFmt='#,##0;(#,##0)'; cN.border={bottom:{style:'thin',color:{argb:NEGRO}}}
      const cD=ws.getCell(rowD,colVal(i)); cD.value=dv||null; cD.font=fnt(false,NEGRO,9); cD.alignment=alnR; cD.numFmt='#,##0;(#,##0)'
      ws.getCell(rowD,colEq(i)).value='='; ws.getCell(rowD,colEq(i)).font=fnt(false,NEGRO,9); ws.getCell(rowD,colEq(i)).alignment=alnC
      const cR=ws.getCell(rowN,colRes(i)); cR.font=fnt(true,NEGRO,9); cR.alignment=alnR; cR.numFmt=nfRes
      const numRef=cN.address, denRef=cD.address
      // Nivel B: resultado = fórmula num op den
      if(nv&&dv) cR.value={formula:`${numRef}${op}${denRef}`,result:rv}
      else cR.value=rv||null
    }
    f+=4
  }

  writeSection('INDICE DE LIQUIDEZ')
  writeFraction('Activo Corriente','Pasivo Corriente',p=>p.activoCorriente.totalActivoCorriente,p=>p.pasivoCorriente.totalPasivoCorriente,'/')
  writeSection('INDICE DE ENDEUDAMIENTO')
  writeFraction('Pasivo Total','Activo Total',p=>p.totalPasivo,p=>p.totalActivo,'/')
  writeSection('RENTABILIDAD DE PATRIMONIO')
  writeFraction('Utilidad Operacional','Patrimonio',(p,e)=>gananciaOp(e),p=>p.patrimonio.totalPatrimonio,'/')
  writeSection('RENTABILIDAD DEL ACTIVO')
  writeFraction('Utilidad Operacional','Activo Total',(p,e)=>gananciaOp(e),p=>p.totalActivo,'/')
  writeSection('CAPITAL DE TRABAJO')
  writeFraction('Activo Corriente - Pasivo corriente','',p=>p.activoCorriente.totalActivoCorriente,p=>p.pasivoCorriente.totalPasivoCorriente,'-','#,##0;(#,##0);"-"')
  writeSection('CAPITAL DE PATRIMONIO')
  writeFraction('Activo Total - pasivo total','',p=>p.totalActivo,p=>p.totalPasivo,'-','#,##0;(#,##0);"-"')
  writeSection('ROTACION DE INVENTARIOS')
  writeFraction('Costo de Ventas','Inventario Promedio',(p,e)=>e?.costoTotal??0,p=>invPromedio(p),'/')

  // ROTACION DE INVENTARIOS (DIAS): 365 / rotacion
  writeSection('ROTACION DE INVENTARIOS (DIAS)')
  {
    const rowN=f, rowD=f+1
    ws.getCell(rowN,COL_DESC).value='Dias del periodo'; ws.getCell(rowN,COL_DESC).font=fnt(false,NEGRO,9)
    ws.getCell(rowD,COL_DESC).value='Rotacion de Inventario'; ws.getCell(rowD,COL_DESC).font=fnt(false,NEGRO,9)
    for(let i=0;i<N;i++){ const p=allGrps[i]; const eri=getEri(p); const inv=invPromedio(p); const rot=inv!==0?(eri?.costoTotal??0)/inv:0; const dias=rot!==0?365/rot:0
      const cN=ws.getCell(rowN,colVal(i)); cN.value=365; cN.font=fnt(false,NEGRO,9); cN.alignment=alnR; cN.numFmt='#,##0'; cN.border={bottom:{style:'thin',color:{argb:NEGRO}}}
      const cD=ws.getCell(rowD,colVal(i)); cD.value=rot||null; cD.font=fnt(false,NEGRO,9); cD.alignment=alnR; cD.numFmt='#,##0.00'
      ws.getCell(rowD,colEq(i)).value='='; ws.getCell(rowD,colEq(i)).alignment=alnC
      const cR=ws.getCell(rowN,colRes(i)); cR.font=fnt(true,NEGRO,9); cR.alignment=alnR; cR.numFmt='#,##0.00'
      if(rot) cR.value={formula:`${cN.address}/${cD.address}`,result:dias}; else cR.value=dias||null }
    f+=4
  }

  writeSection('MARGEN DE SOLVENCIA')
  writeFraction('Activo Total','Pasivo Total',p=>p.totalActivo,p=>p.totalPasivo,'/')

  // EBITDA: (utilidad+intereses+impuestos+dep) / ventas
  writeSection('EBITDA')
  {
    const rowN=f, rowD=f+1
    ws.getCell(rowN,COL_DESC).value='Utilidad + intereses + impuestos+ depreciacion'; ws.getCell(rowN,COL_DESC).font=fnt(false,NEGRO,9)
    ws.getCell(rowD,COL_DESC).value='Total ventas'; ws.getCell(rowD,COL_DESC).font=fnt(false,NEGRO,9)
    for(let i=0;i<N;i++){ const p=allGrps[i]; const eri=getEri(p)
      const utilidad=gananciaOp(eri); const intereses=eri?.gastosNoOp??0; const impuestos=eri?.provisionRenta??0; const dep=eri?.depreciacion??0
      const ebitda=utilidad+intereses+impuestos+dep; const ventas=eri?.ingresosTotal??0; const ratio=ventas!==0?ebitda/ventas:0
      const cN=ws.getCell(rowN,colVal(i)); cN.value=ebitda||null; cN.font=fnt(false,NEGRO,9); cN.alignment=alnR; cN.numFmt='#,##0;(#,##0)'; cN.border={bottom:{style:'thin',color:{argb:NEGRO}}}
      const cD=ws.getCell(rowD,colVal(i)); cD.value=ventas||null; cD.font=fnt(false,NEGRO,9); cD.alignment=alnR; cD.numFmt='#,##0;(#,##0)'
      ws.getCell(rowD,colEq(i)).value='='; ws.getCell(rowD,colEq(i)).alignment=alnC
      const cR=ws.getCell(rowN,colRes(i)); cR.font=fnt(true,NEGRO,9); cR.alignment=alnR; cR.numFmt='0.00%'
      if(ebitda&&ventas) cR.value={formula:`${cN.address}/${cD.address}`,result:ratio}; else cR.value=ratio||null }
    f+=3
  }

  ws.getRow(2).height=15; ws.getRow(3).height=14; ws.getRow(4).height=15; ws.getRow(5).height=13
}