// src/lib/perfiles/calcularSimilitud.ts
// ════════════════════════════════════════════════════════════════════════
// SCHEMA CENTRAL del sistema de perfiles + lógica de similitud.
// El PerfilCliente es la "configuración como datos" que el motor aplica.
//
// TANDA 8 — MOTOR DE REGLAS:
//   El perfil ahora lleva un array `reglas` que la IA escribe libremente.
//   Los booleanos viejos (clasificacion.*) siguen funcionando: se traducen
//   automáticamente a reglas. Así nada se rompe.
// ════════════════════════════════════════════════════════════════════════

import type { EstructuraCliente } from '@/lib/motor-contable/extraerEstructura'
import type { Regla } from '@/lib/motor-contable/reglas'

// ─────────────────────────────────────────────────────────────────────────
// SCHEMA DEL PERFIL
// ─────────────────────────────────────────────────────────────────────────
export interface PerfilCliente {
  ingresos: {
    mostrarAuxiliares: boolean
    subcuentasConAuxiliar: string[]
    nivelDigitosAuxiliar: number
  }
  costos: {
    prefijos: string[]
    agruparPorSubcuenta: boolean
  }
  gastos: {
    prefijos: string[]
  }
  terceros: {
    excluirDebitoSinCredito: boolean
    nitExtranjerosPatron: string
  }
  columnas: {
    mostrarAcumulado: boolean
    mesesAnioActual: number
    mostrarAniosAnteriores: boolean
  }
  // ── LEGADO: booleanos de la TANDA 7 (se traducen a reglas) ──
  clasificacion: {
    anticipoImpuestosEnCorriente: boolean
    aportesNominaEnFiscales: boolean
    cxpAgrupaSociosYGastos: boolean
  }
  // ── TANDA 8: reglas libres que la IA escribe ──
  reglas: Regla[]
  notasEspeciales: string
}

// Perfil por defecto (seguro, comportamiento estándar)
export const PERFIL_DEFECTO: PerfilCliente = {
  ingresos: {
    mostrarAuxiliares: false,
    subcuentasConAuxiliar: [],
    nivelDigitosAuxiliar: 8,
  },
  costos: {
    prefijos: ['61', '62', '71'],
    agruparPorSubcuenta: true,
  },
  gastos: {
    prefijos: ['51', '52', '53'],
  },
  terceros: {
    excluirDebitoSinCredito: false,
    nitExtranjerosPatron: '',
  },
  columnas: {
    mostrarAcumulado: true,
    mesesAnioActual: 3,
    mostrarAniosAnteriores: true,
  },
  clasificacion: {
    anticipoImpuestosEnCorriente: false,
    aportesNominaEnFiscales: false,
    cxpAgrupaSociosYGastos: false,
  },
  reglas: [],
  notasEspeciales: '',
}

// ─────────────────────────────────────────────────────────────────────────
// TRADUCTOR: perfil → reglas
// Convierte los booleanos viejos (TANDA 7) en reglas, y les suma las
// reglas libres que la IA haya escrito. Así conviven ambos sistemas.
// ─────────────────────────────────────────────────────────────────────────
export function reglasDesdePerfil(perfil?: PerfilCliente): Regla[] {
  if (!perfil) return []

  const reglas: Regla[] = []
  const c = perfil.clasificacion

  // Regla 1 (legado): el 1355 se muestra en Cuentas por Cobrar
  if (c?.anticipoImpuestosEnCorriente) {
    reglas.push({ tipo: 'mover', cuenta: '1355', a: 'cuentasPorCobrar' })
  }

  // Regla 2 (legado): los aportes de nómina (2370) se suman a Fiscales
  if (c?.aportesNominaEnFiscales) {
    reglas.push({ tipo: 'mover', cuenta: '2370', a: 'fiscales' })
  }

  // Regla 3 (legado): CxP agrupa proveedores + socios + costos y gastos
  if (c?.cxpAgrupaSociosYGastos) {
    reglas.push({
      tipo: 'agrupar',
      cuentas: ['2205', '2355', '2335'],
      a: 'proveedores',
    })
  }

  // Reglas libres escritas por la IA (van después, pueden refinar)
  if (Array.isArray(perfil.reglas)) {
    reglas.push(...perfil.reglas)
  }

  return reglas
}

// ─────────────────────────────────────────────────────────────────────────
// CASOS TIPO (biblioteca reutilizable)
// ─────────────────────────────────────────────────────────────────────────
export interface CasoTipo {
  id: string
  nombre: string
  prefijos: string[]
  perfil_json: PerfilCliente
  usos: number
}

export interface ResultadoSimilitud {
  caso: CasoTipo
  score: number
  razon: string
}

// ─────────────────────────────────────────────────────────────────────────
// SIMILITUD
// Jaccard de prefijos (70%) + coincidencia de patrón de auxiliares (30%)
// ─────────────────────────────────────────────────────────────────────────
function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size === 0 && setB.size === 0) return 1
  let inter = 0
  for (const x of setA) if (setB.has(x)) inter++
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : inter / union
}

export function calcularSimilitud(
  estructura: EstructuraCliente,
  caso: CasoTipo
): number {
  const simPrefijos = jaccard(estructura.prefijosPresentes, caso.prefijos)

  const estDiscrimina = estructura.resumen.ingresosTienenAuxiliares
  const casoDiscrimina = caso.perfil_json.ingresos.mostrarAuxiliares
  const simPatron = estDiscrimina === casoDiscrimina ? 1 : 0

  return simPrefijos * 0.7 + simPatron * 0.3
}

export function calcularSimilitudDetallada(
  estructura: EstructuraCliente,
  caso: CasoTipo
): ResultadoSimilitud {
  const score = calcularSimilitud(estructura, caso)
  const pct = Math.round(score * 100)

  let razon: string
  if (score >= 0.85)      razon = `Muy parecido (${pct}%) — misma estructura de cuentas`
  else if (score >= 0.65) razon = `Parecido (${pct}%) — estructura similar`
  else                    razon = `Algo de coincidencia (${pct}%)`

  return { caso, score, razon }
}

export function ordenarPorSimilitud(
  estructura: EstructuraCliente,
  casos: CasoTipo[]
): ResultadoSimilitud[] {
  return casos
    .map(c => calcularSimilitudDetallada(estructura, c))
    .sort((a, b) => b.score - a.score)
    .filter(r => r.score >= 0.6)
}