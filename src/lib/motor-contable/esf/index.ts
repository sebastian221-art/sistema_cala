// src/lib/motor-contable/esf/index.ts
// ─────────────────────────────────────────────────────────────
// NUEVO GENERADOR (Nivel B) — MIGRACIÓN COMPLETA (19 de 19).
// Todas las hojas se sirven desde esta carpeta. El original generarESF.ts
// queda INTACTO como respaldo.
//
//   FORMULADAS (15): ESF, ERI, CAJA, BANCOS, INVERSIONES, INVENTARIO,
//     OTRAS CXC, PYP, OBLI.FIN, CXP, CXC, FISCALES, OTROS PASIVOS,
//     INGRESOS, COSTOS.
//   DELEGADAS (4, salida idéntica): RENTA, NOTAS ESF, NOTAS PYG, INDICADORES
//     (subtotales de agregados del motor; formularlas daría números malos).
//
// Para ACTIVAR: en la ruta que hoy importa generarTanda1 desde
// '@/lib/motor-contable/generarESF', cambiar a '@/lib/motor-contable/esf'.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor } from '../motor'
import { RegistroCeldas } from './_registro'

// ── Formuladas ──
import { hojaESF } from './esf'
import { hojaERI } from './eri'
import { hojaCAJA } from './caja'
import { hojaBANCOS } from './bancos'
import { hojaINVERSIONES } from './inversiones'
import { hojaINVENTARIO } from './inventario'
import { hojaOTRASCXC } from './otrascxc'
import { hojaPYP } from './pype'
import { hojaOBLIFIN } from './oblifin'
import { hojaCXP } from './cxp'
import { hojaCXC } from './cxc'
import { hojaFISCALES } from './fiscales'
import { hojaOTROSPASIVOS } from './otrospasivos'
import { hojaINGRESOS } from './ingresos'
import { hojaCOSTOS } from './costos'

// ── Delegadas (salida idéntica al original) ──
import { hojaRENTA } from './renta'
import { hojaNCTASESF } from './notasesf'
import { hojaNCTASPYG } from './notaspyg'
import { hojaINDICADORES } from './indicadores'

export function generarTanda1(resultado: ResultadoMotor): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Motor Contable CALA'
  wb.created  = new Date()
  wb.modified = new Date()

  const reg = new RegistroCeldas()

  console.log('[generarTanda1 v2] Generando 19 hojas...')

  hojaESF(wb, resultado, reg)
  hojaERI(wb, resultado, reg)
  hojaNCTASESF(wb, resultado, reg)
  hojaNCTASPYG(wb, resultado, reg)
  hojaINDICADORES(wb, resultado, reg)
  hojaRENTA(wb, resultado, reg)
  hojaCAJA(wb, resultado, reg)
  hojaBANCOS(wb, resultado, reg)
  hojaINVERSIONES(wb, resultado, reg)
  hojaCXC(wb, resultado, reg)
  hojaINVENTARIO(wb, resultado, reg)
  hojaOTRASCXC(wb, resultado, reg)
  hojaPYP(wb, resultado, reg)
  hojaOBLIFIN(wb, resultado, reg)
  hojaCXP(wb, resultado, reg)
  hojaFISCALES(wb, resultado, reg)
  hojaOTROSPASIVOS(wb, resultado, reg)
  hojaINGRESOS(wb, resultado, reg)
  hojaCOSTOS(wb, resultado, reg)

  console.log('[generarTanda1 v2] ✓ 19 hojas generadas')
  return wb
}