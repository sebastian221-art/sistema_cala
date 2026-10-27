// src/lib/esf-molde/balanceAJson.ts
// ════════════════════════════════════════════════════════════════════════
// Puente entre el parser existente (parser.ts, que entiende Siigo / World
// Office / SIESA / SYD) y el motor de molde en Python (molde.py).
//
// El parser ya normaliza signos (modo NEGATIVO) y niveles. Aquí solo se
// aplana a un JSON simple que Python lee sin tener que conocer formatos.
// ════════════════════════════════════════════════════════════════════════

import { parsearBalance, type BalanceParseado } from '@/lib/motor-contable/parser'

export interface CuentaJson {
  codigo: string
  nombre: string
  nivel: string
  saldoFinal: number
  movDebito: number
  movCredito: number
  nit?: string
  tercero?: string
}

export interface BalanceJson {
  empresa: string
  nit: string
  periodo: string
  mes: number
  anio: number
  formato: string
  cuentas: CuentaJson[]
}

export function balanceAJson(b: BalanceParseado): BalanceJson {
  return {
    empresa: b.metadata.empresa,
    nit: b.metadata.nit,
    periodo: b.metadata.periodo,
    mes: b.metadata.mes,
    anio: b.metadata.anio,
    formato: b.metadata.formato,
    cuentas: b.cuentas
      .filter(c => !c.esBasura)
      .map(c => ({
        codigo: c.codigo,
        nombre: c.nombre,
        nivel: c.nivel,
        saldoFinal: c.saldoFinal,
        movDebito: c.movimientoDebito,
        movCredito: c.movimientoCredito,
        nit: c.nit,
        tercero: c.nombreTercero,
      })),
  }
}

export function parsearBalanceAJson(buffer: Buffer, nombreArchivo?: string): BalanceJson {
  return balanceAJson(parsearBalance(buffer, nombreArchivo))
}
