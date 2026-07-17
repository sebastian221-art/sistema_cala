// src/lib/motor-contable/reglas.ts
// ════════════════════════════════════════════════════════════════════════
// MOTOR DE REGLAS DEL ESF
// ════════════════════════════════════════════════════════════════════════
//
// Permite que la IA reconfigure CÓMO se presenta el ESF sin tocar código.
//
// PRINCIPIO INVIOLABLE: las reglas solo REDISTRIBUYEN montos entre renglones.
// Nunca cambian los totales (Total Activo, Total Pasivo). Por eso el cuadre
// (Activo = Pasivo + Patrimonio) queda garantizado pase lo que pase.
//
// TIPOS DE REGLA:
//   mover     → una cuenta cambia de renglón
//               { tipo:"mover", cuenta:"1355", a:"cuentasPorCobrar" }
//   agrupar   → varias cuentas se juntan en un renglón
//               { tipo:"agrupar", cuentas:["2205","2355"], a:"proveedores" }
//   separar   → una cuenta sale a su propio renglón visible
//               { tipo:"separar", cuenta:"2805", a:"otrosPasivosCorriente",
//                 como:"Anticipos de clientes" }
//   renombrar → cambiar la etiqueta de un renglón
//               { tipo:"renombrar", renglon:"otrosPasivos", como:"..." }
// ════════════════════════════════════════════════════════════════════════

import type { PeriodoCalculado } from './motor'

// ─────────────────────────────────────────────────────────────
// RENGLONES DEL ESF
// ─────────────────────────────────────────────────────────────
export const RENGLONES = [
  // Activo corriente
  'efectivo',
  'inversiones',
  'cuentasPorCobrar',
  'inventarios',
  'otrosActivosCorrientes',
  // Activo no corriente
  'ppye',
  'otrosActivosNoCorrientes',
  // Pasivo corriente
  'financierosCorriente',
  'proveedores',
  'costosGastosPagar',
  'fiscales',
  'beneficiosEmpleados',
  'otrosPasivosCorriente',
  // Pasivo no corriente
  'financierosNoCorriente',
  'beneficiosNoCorriente',
  'otrosPasivosNoCorriente',
] as const

export type RenglonId = (typeof RENGLONES)[number]

export type Seccion =
  | 'activoCorriente'
  | 'activoNoCorriente'
  | 'pasivoCorriente'
  | 'pasivoNoCorriente'

export const SECCION_DE: Record<RenglonId, Seccion> = {
  efectivo:                 'activoCorriente',
  inversiones:              'activoCorriente',
  cuentasPorCobrar:         'activoCorriente',
  inventarios:              'activoCorriente',
  otrosActivosCorrientes:   'activoCorriente',
  ppye:                     'activoNoCorriente',
  otrosActivosNoCorrientes: 'activoNoCorriente',
  financierosCorriente:     'pasivoCorriente',
  proveedores:              'pasivoCorriente',
  costosGastosPagar:        'pasivoCorriente',
  fiscales:                 'pasivoCorriente',
  beneficiosEmpleados:      'pasivoCorriente',
  otrosPasivosCorriente:    'pasivoCorriente',
  financierosNoCorriente:   'pasivoNoCorriente',
  beneficiosNoCorriente:    'pasivoNoCorriente',
  otrosPasivosNoCorriente:  'pasivoNoCorriente',
}

export const ETIQUETA_DE: Record<RenglonId, string> = {
  efectivo:                 'Efectivo y Equivalentes al Efectivo',
  inversiones:              'Inversiones',
  cuentasPorCobrar:         'Cuentas Por Cobrar',
  inventarios:              'Inventarios',
  otrosActivosCorrientes:   'Otros Activos Corrientes',
  ppye:                     'Propiedad Planta y Equipo',
  otrosActivosNoCorrientes: 'Otros Activos',
  financierosCorriente:     'Financieros',
  proveedores:              'Proveedores y Acreedores Comerciales',
  costosGastosPagar:        'Costos y Gastos Por Pagar',
  fiscales:                 'Fiscales',
  beneficiosEmpleados:      'Por Beneficios a Empleados',
  otrosPasivosCorriente:    'Otros Pasivos',
  financierosNoCorriente:   'Financieros',
  beneficiosNoCorriente:    'Por Beneficios a Empleados',
  otrosPasivosNoCorriente:  'Otros Pasivos',
}

// ─────────────────────────────────────────────────────────────
// SCHEMA DE LA REGLA
// ─────────────────────────────────────────────────────────────
export type TipoRegla = 'mover' | 'agrupar' | 'separar' | 'renombrar'

export interface Regla {
  tipo: TipoRegla
  cuenta?: string        // código PUC, ej "1355"
  cuentas?: string[]     // para 'agrupar'
  a?: RenglonId          // renglón destino
  renglon?: RenglonId    // para 'renombrar'
  como?: string          // etiqueta nueva (separar / renombrar)
}

export interface Renglon {
  id: RenglonId
  etiqueta: string
  valor: number
  seccion: Seccion
  // Sub-líneas creadas por reglas 'separar' (se muestran debajo del renglón)
  extras: Array<{ etiqueta: string; valor: number }>
}

export type Renglones = Record<RenglonId, Renglon>

// ─────────────────────────────────────────────────────────────
// SIGNO SEGÚN LA CLASE PUC
// Activo (1), Gastos (5), Costos (6,7) → positivo en el balance
// Pasivo (2), Patrimonio (3), Ingresos (4) → negativo → se invierte
// ─────────────────────────────────────────────────────────────
function signo(codigo: string): number {
  const clase = codigo.charAt(0)
  return clase === '2' || clase === '3' || clase === '4' ? -1 : 1
}

// ─────────────────────────────────────────────────────────────
// VALOR DE UNA CUENTA (positivo en la convención del ESF)
// Busca coincidencia exacta; si no existe, suma las subcuentas
// que empiecen por ese código.
// ─────────────────────────────────────────────────────────────
export function valorCuenta(p: PeriodoCalculado, codigo: string): number {
  const saldos = p.saldosCuenta ?? {}
  const exacto = saldos[codigo]
  if (exacto !== undefined) return signo(codigo) * exacto

  let total = 0
  for (const [cod, val] of Object.entries(saldos)) {
    if (cod.startsWith(codigo) && cod.length > codigo.length) total += val
  }
  return signo(codigo) * total
}

// ─────────────────────────────────────────────────────────────
// RENGLÓN POR DEFECTO DE UNA CUENTA
// Define dónde vive cada código del PUC si no hay regla que lo mueva.
// ─────────────────────────────────────────────────────────────
export function renglonPorDefecto(codigo: string): RenglonId | null {
  const c = codigo

  // ── ACTIVO ──
  if (c.startsWith('11')) return 'efectivo'
  if (c.startsWith('12')) return 'inversiones'
  if (c.startsWith('1355')) return 'otrosActivosNoCorrientes' // anticipo impuestos
  if (c.startsWith('13')) return 'cuentasPorCobrar'
  if (c.startsWith('14')) return 'inventarios'
  if (c.startsWith('15')) return 'ppye'
  if (c.startsWith('16') || c.startsWith('17') ||
      c.startsWith('18') || c.startsWith('19')) return 'otrosActivosNoCorrientes'

  // ── PASIVO ──
  if (c.startsWith('21')) return 'financierosNoCorriente'
  if (c.startsWith('22')) return 'proveedores'
  if (c.startsWith('2335')) return 'costosGastosPagar'
  if (c.startsWith('2365') || c.startsWith('2367') ||
      c.startsWith('2368')) return 'fiscales'
  if (c.startsWith('2370')) return 'beneficiosEmpleados'  // aportes de nómina
  if (c.startsWith('2380')) return 'otrosPasivosCorriente'
  if (c.startsWith('23')) return 'proveedores'            // 2345, 2355 socios
  if (c.startsWith('24')) return 'fiscales'
  if (c.startsWith('25')) return 'beneficiosEmpleados'
  if (c.startsWith('26')) return 'beneficiosNoCorriente'
  if (c.startsWith('27') || c.startsWith('28') ||
      c.startsWith('29')) return 'otrosPasivosCorriente'

  return null
}

// ─────────────────────────────────────────────────────────────
// CONSTRUIR LOS RENGLONES BASE
// Replica exactamente el comportamiento actual del ESF (sin reglas).
// ─────────────────────────────────────────────────────────────
export function construirRenglones(p: PeriodoCalculado): Renglones {
  const ac  = p.activoCorriente
  const anc = p.activoNoCorriente
  const pc  = p.pasivoCorriente
  const pnc = p.pasivoNoCorriente

  const mk = (id: RenglonId, valor: number): Renglon => ({
    id,
    etiqueta: ETIQUETA_DE[id],
    valor,
    seccion: SECCION_DE[id],
    extras: [],
  })

  return {
    // ACTIVO CORRIENTE
    efectivo:               mk('efectivo', ac.efectivoTotal),
    inversiones:            mk('inversiones', ac.inversionesTotal),
    cuentasPorCobrar:       mk('cuentasPorCobrar',
                               ac.clientesTotal + ac.anticiposTotal +
                               (ac.otrosDeudoresTotal ?? 0)),
    inventarios:            mk('inventarios', ac.inventarioTotal),
    otrosActivosCorrientes: mk('otrosActivosCorrientes', ac.otrosActivosCorrientes ?? 0),

    // ACTIVO NO CORRIENTE  (el 1355 vive aquí por defecto)
    ppye:                     mk('ppye', anc.ppyeNeto),
    otrosActivosNoCorrientes: mk('otrosActivosNoCorrientes',
                                 anc.intangiblesTotal + anc.diferidosTotal +
                                 anc.otrosActivosNC + ac.anticipoImpuestosTotal),

    // PASIVO CORRIENTE
    financierosCorriente:  mk('financierosCorriente', pc.obligFinCorrTotal),
    proveedores:           mk('proveedores', pc.proveedoresTotal),
    costosGastosPagar:     mk('costosGastosPagar', pc.costosGastosPagar),
    fiscales:              mk('fiscales', pc.fiscalesTotal),
    beneficiosEmpleados:   mk('beneficiosEmpleados', pc.beneficiosCorrTotal),
    otrosPasivosCorriente: mk('otrosPasivosCorriente', pc.otrosPasivosCorrTotal),

    // PASIVO NO CORRIENTE
    financierosNoCorriente:  mk('financierosNoCorriente', pnc.obligFinNCTotal),
    beneficiosNoCorriente:   mk('beneficiosNoCorriente', pnc.provisionLaboralTotal),
    otrosPasivosNoCorriente: mk('otrosPasivosNoCorriente', pnc.otrosPasivosNCTotal),
  }
}

// ─────────────────────────────────────────────────────────────
// APLICAR LAS REGLAS
// Solo mueve montos entre renglones. Los totales NO cambian.
// ─────────────────────────────────────────────────────────────
export function aplicarReglas(
  base: Renglones,
  reglas: Regla[] | undefined,
  p: PeriodoCalculado
): Renglones {
  if (!reglas || reglas.length === 0) return base

  // Copia profunda (no mutar el original)
  const R: Renglones = {} as Renglones
  for (const id of RENGLONES) {
    R[id] = { ...base[id], extras: [...base[id].extras] }
  }

  const esValido = (x: unknown): x is RenglonId =>
    typeof x === 'string' && (RENGLONES as readonly string[]).includes(x)

  for (const regla of reglas) {
    try {
      switch (regla.tipo) {
        // ── MOVER: quitar de su renglón por defecto, sumar al destino ──
        case 'mover': {
          if (!regla.cuenta || !esValido(regla.a)) break
          const origen = renglonPorDefecto(regla.cuenta)
          if (!origen) break
          const monto = valorCuenta(p, regla.cuenta)
          if (Math.abs(monto) < 0.5) break
          if (origen === regla.a) break
          R[origen].valor -= monto
          R[regla.a].valor += monto
          break
        }

        // ── AGRUPAR: varias cuentas se juntan en un renglón ──
        case 'agrupar': {
          if (!regla.cuentas?.length || !esValido(regla.a)) break
          for (const cta of regla.cuentas) {
            const origen = renglonPorDefecto(cta)
            if (!origen || origen === regla.a) continue
            const monto = valorCuenta(p, cta)
            if (Math.abs(monto) < 0.5) continue
            R[origen].valor -= monto
            R[regla.a].valor += monto
          }
          break
        }

        // ── SEPARAR: la cuenta se muestra como sub-línea propia ──
        //    (el monto sigue dentro del renglón; solo se hace visible)
        case 'separar': {
          if (!regla.cuenta || !esValido(regla.a)) break
          const monto = valorCuenta(p, regla.cuenta)
          if (Math.abs(monto) < 0.5) break
          R[regla.a].extras.push({
            etiqueta: regla.como ?? `Cuenta ${regla.cuenta}`,
            valor: monto,
          })
          break
        }

        // ── RENOMBRAR: cambia solo la etiqueta ──
        case 'renombrar': {
          if (!esValido(regla.renglon) || !regla.como) break
          R[regla.renglon].etiqueta = regla.como
          break
        }
      }
    } catch {
      // Una regla mal formada nunca debe tumbar el ESF: se ignora.
      continue
    }
  }

  return R
}

// ─────────────────────────────────────────────────────────────
// VALIDACIÓN DE CUADRE DE PRESENTACIÓN
// La suma de los renglones debe seguir dando el total del motor.
// Si hay diferencia, se devuelve para poder avisar (nunca se oculta).
// ─────────────────────────────────────────────────────────────
export function validarPresentacion(R: Renglones, p: PeriodoCalculado) {
  const sumaSeccion = (s: Seccion) =>
    RENGLONES.filter(id => SECCION_DE[id] === s)
             .reduce((acc, id) => acc + R[id].valor, 0)

  const activo = sumaSeccion('activoCorriente') + sumaSeccion('activoNoCorriente')
  const pasivo = sumaSeccion('pasivoCorriente') + sumaSeccion('pasivoNoCorriente')

  return {
    activoRenglones: activo,
    pasivoRenglones: pasivo,
    difActivo: activo - p.totalActivo,
    difPasivo: pasivo - p.totalPasivo,
    ok: Math.abs(activo - p.totalActivo) < 100 &&
        Math.abs(pasivo - p.totalPasivo) < 100,
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER PARA hojaESF
// Devuelve los renglones ya con las reglas aplicadas.
// ─────────────────────────────────────────────────────────────
export function renglonesESF(p: PeriodoCalculado, reglas?: Regla[]): Renglones {
  return aplicarReglas(construirRenglones(p), reglas, p)
}