// src/lib/motor-contable/esf/index.ts
// ─────────────────────────────────────────────────────────────
// NUEVO GENERADOR (Nivel B). El original generarESF.ts queda INTACTO.
// ESTADO: [OK] ESF + Activo/Pasivo + INGRESOS   (15 de 19)
//         >>> El ESF ya está FORMULADO: sus totales son fórmulas vivas y cuadra <<<
//         [  ] INGRESOS · COSTOS · ERI · RENTA · NOTAS ESF/PYG · INDICADORES (P&L)
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import type { ResultadoMotor } from '../motor'
import { RegistroCeldas } from './_registro'

// ── Hojas MIGRADAS ──
import { hojaESF } from './esf'
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
import { hojaERI } from './eri'

// ── Hojas aún ORIGINALES (P&L, no afectan el ESF) ──
import {
  hojaNCTASESF, hojaNCTASPYG, hojaINDICADORES, hojaRENTA,
} from '../generarESF'

export function generarTanda1(resultado: ResultadoMotor): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Motor Contable CALA'
  wb.created  = new Date()
  wb.modified = new Date()

  const reg = new RegistroCeldas()

  console.log('[generarTanda1 v2] Generando hojas...')

  hojaESF(wb, resultado, reg)               // <- MIGRADA (formulada)
  hojaERI(wb, resultado, reg)               // <- MIGRADA
  hojaNCTASESF(wb, resultado)
  hojaNCTASPYG(wb, resultado)
  hojaINDICADORES(wb, resultado)
  hojaRENTA(wb, resultado)
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
  hojaINGRESOS(wb, resultado, reg)          // <- MIGRADA
  hojaCOSTOS(wb, resultado, reg)            // <- MIGRADA

  console.log('[generarTanda1 v2] ✓ 19 hojas generadas')
  return wb
}