// src/lib/perfiles/calcularSimilitud.ts
// ════════════════════════════════════════════════════════════════════════
// SCHEMA CENTRAL del sistema de perfiles + lógica de similitud.
// El PerfilCliente es la "configuración como datos" que el motor aplica.
// ════════════════════════════════════════════════════════════════════════

import type { EstructuraCliente } from '@/lib/motor-contable/extraerEstructura'

// ─────────────────────────────────────────────────────────────────────────
// SCHEMA DEL PERFIL
// ─────────────────────────────────────────────────────────────────────────
export interface PerfilCliente {
  ingresos: {
    mostrarAuxiliares: boolean          // ¿discriminar sub-categorías?
    subcuentasConAuxiliar: string[]     // qué subcuentas 6d discriminar, ej ["418001"]
    nivelDigitosAuxiliar: number        // normalmente 8
  }
  costos: {
    prefijos: string[]                  // ej ["61","62","71"]
    agruparPorSubcuenta: boolean
  }
  gastos: {
    prefijos: string[]                  // ej ["51","52","53"]
  }
  terceros: {
    excluirDebitoSinCredito: boolean
    nitExtranjerosPatron: string        // ej "44444" (vacío si no aplica)
  }
  columnas: {
    mostrarAcumulado: boolean
    mesesAnioActual: number             // normalmente 3
    mostrarAniosAnteriores: boolean
  }
  clasificacion: {
    // 1355 Anticipo de impuestos: true = Cuentas por Cobrar (corriente),
    // false = Otros Activos (no corriente) [comportamiento por defecto]
    anticipoImpuestosEnCorriente: boolean
    // 2370 Aportes de nómina: true = se suma a Fiscales,
    // false = va en su renglón aparte [comportamiento por defecto]
    aportesNominaEnFiscales: boolean
    // Cuentas por pagar: true = el renglón agrupa proveedores + deudas socios
    // (2355) + costos y gastos; false = solo muestra proveedores [por defecto]
    cxpAgrupaSociosYGastos: boolean
  }
  notasEspeciales: string               // instrucciones del contador en texto
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
  notasEspeciales: '',
}

// ─────────────────────────────────────────────────────────────────────────
// CASOS TIPO (biblioteca reutilizable)
// ─────────────────────────────────────────────────────────────────────────
export interface CasoTipo {
  id: string
  nombre: string
  prefijos: string[]                    // prefijos PUC del caso
  perfil_json: PerfilCliente
  usos: number
}

export interface ResultadoSimilitud {
  caso: CasoTipo
  score: number                         // 0..1
  razon: string                         // explicación legible
}

// ─────────────────────────────────────────────────────────────────────────
// SIMILITUD
// ─────────────────────────────────────────────────────────────────────────
// Jaccard de prefijos (70%) + coincidencia de patrón de auxiliares (30%)

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

  // Patrón de auxiliares: ¿ambos discriminan ingresos o ninguno?
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
    .filter(r => r.score >= 0.6)   // solo sugerir si hay coincidencia razonable
}