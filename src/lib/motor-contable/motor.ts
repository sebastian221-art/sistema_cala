/**
 * ============================================================
 * MOTOR CONTABLE — GENÉRICO COLOMBIA / SIIGO
 * ============================================================
 * Versión: 4.0.0
 *
 * CAMBIOS v4:
 *   - anticImpuestosDetalle: auxiliares 1355 agrupados (OTRAS CXC)
 *   - tercerosCxp ahora incluye detalle completo para CXP
 *   - creditosLP con nombres limpios para OBLI. FIN
 *   - provisionDetalle para OTROS PASIVOS
 *   - ingresosDetalle: subcuentas clase 4 con terceros (INGRESOS)
 *   - acreedoresVariosDetalle + anticiposTerceros (OTROS PASIVOS)
 *   - inversionesAuxiliares: auxiliares 12xx por entidad (INVERSIONES)
 *   - inventarioAuxiliares: auxiliares 14xx detalle subcuenta (INVENTARIO)
 *   - costosDetalle: subcuentas 61xx/71xx con terceros (COSTOS)
 * ============================================================
 */

import {
  BalancesMultiPeriodo,
  BalanceParseado,
  TerceroAgrupado,
  obtenerSF,
  obtenerSFPrefijo,
  obtenerTercerosPrefijo,
} from './parser'
import type { PerfilCliente } from '@/lib/perfiles/calcularSimilitud'
// ══════════════════════════════════════════════════════════════
// TIPOS DE SALIDA
// ══════════════════════════════════════════════════════════════

export interface BancoDetalle {
  nombre: string
  totalSaldoFinal: number
  cuentas: Array<{
    numero: string
    saldoFinal: number
    debito: number
    credito: number
  }>
}

export interface CreditoDetalle {
  nombre: string
  codigo: string
  saldoFinal: number
}

export interface ItemDetalle {
  nombre: string
  codigo: string
  valor: number
}
// ─────────────────────────────────────────────────────────────
export interface AnticipoCuentaDetalle {
  codigo: string        // '133005', '133015', etc.
  nombre: string        // 'A proveedores', 'A trabajadores'
  total: number
  terceros: TerceroAgrupado[]
}
// ─────────────────────────────────────────────────────────────
export interface ActivoCorriente {
  // CAJA [1105]
  cajaTotal: number
  cajaDetalle: ItemDetalle[]

  // BANCOS [1110]
  bancos: BancoDetalle[]
  bancosTotal: number
  efectivoTotal: number

  // INVERSIONES [12xx]
  inversionesTotal: number
  inversionesDetalle: ItemDetalle[]
  inversionesAuxiliares: ItemDetalle[]

  // CXC [13xx]
  clientesTotal: number
  anticiposTotal: number
  anticipoImpuestosTotal: number
  anticRenta: number
  anticReteFuente: number
  anticICA: number
  anticOtros: number
  anticImpuestosDetalle: ItemDetalle[]
  otrosDeudoresTotal: number
  cxcTotal: number
  tercerosCxc: TerceroAgrupado[]
   anticiposDetalle: AnticipoCuentaDetalle[]
  tercerosAnticipios: TerceroAgrupado[]
  

  // INVENTARIO [14xx]
  inventarioTotal: number
  inventarioDetalle: ItemDetalle[]
  inventarioAuxiliares: ItemDetalle[]

  // Otros activos corrientes [17xx, 19xx]
  otrosActivosCorrientes: number
  tercerosBancos: TerceroAgrupado[]

  totalActivoCorriente: number
}

// ─────────────────────────────────────────────────────────────
export interface ActivoNoCorriente {
  ppyeBruto: number
  depreciacionAcumulada: number
  ppyeNeto: number
  detallePPyE: ItemDetalle[]
  detalleDepreciacion: ItemDetalle[]
  intangiblesTotal: number
  intangiblesDetalle: ItemDetalle[]
  diferidosTotal: number
  otrosActivosNC: number
  totalActivoNoCorriente: number
  detallePPyEConAux: PPyESubcuentaDetalle[]
}
export interface CxpSubcuentaDetalle {
  codigo: string
  nombre: string
  total: number
  terceros: TerceroAgrupado[]
}

// ─────────────────────────────────────────────────────────────
export interface PasivoCorriente {
  obligFinCorrTotal: number
  creditosCorr: CreditoDetalle[]
  proveedoresTotal: number
  tercerosCxp: TerceroAgrupado[]
  costosGastosPagar: number
  costosGastosDetalle: ItemDetalle[]
  otrosCxp: number
  cxpTotal: number
  reteSalarios: number
  reteHonorarios: number
  reteServicios: number
  reteArrendamientos: number
  reteCompras: number
  autoretenciones: number
  reteTotal: number
  reteDetalleSubcuentas: ItemDetalle[] 
  icaRetenido: number
  aporteEPS: number
  aporteARL: number
  aporteICBF: number
  aportePension: number
  aporteNomina: number
  nominaTotal: number
  impuestosRenta: number
  ivaTotal: number
  icaTotal: number
  fiscalesTotal: number
  beneficiosCorrTotal: number
  beneficiosDetalle: ItemDetalle[]
  otrosPasivosCorrTotal: number
  acreedoresVariosTotal: number
  acreedoresVariosDetalle: ItemDetalle[]
  totalPasivoCorriente: number
  tercerosCostosGastos: TerceroAgrupado[]
  cxpDetalle: CxpSubcuentaDetalle[]
}

// ─────────────────────────────────────────────────────────────
export interface PasivoNoCorriente {
  obligFinNCTotal: number
  creditosLP: CreditoDetalle[]
  oblFinDetalle: ItemDetalle[]
  cesantias: number
  intCesantias: number
  vacaciones: number
  prima: number
  provisionLaboralTotal: number
  provisionDetalle: ItemDetalle[]
  diferidosPasivoTotal: number
  anticiposClientes: number
  otrosPasivosNCTotal: number
  anticiposTerceros: TerceroAgrupado[]
  otrosPasivos28Detalle: Array<{
    codigo:   string
    nombre:   string
    total:    number
    terceros: TerceroAgrupado[]
  }>
  totalPasivoNoCorriente: number
}

// ─────────────────────────────────────────────────────────────
export interface Patrimonio {
  capitalSocial: number
  superavitCapital: number
  reservas: number
  revalorizacion: number
  resultadoEjercicioAnterior: number
  resultadosAnteriores: number
  resultadoEjercicio: number
  totalPatrimonio: number
}

// ─────────────────────────────────────────────────────────────
export interface EriMensual {
  mes: number
  anio: number
  label: string
  fechaInicio: string
  fechaFin: string
  ingresosOperacionales: number
  ingresosNoOperacionales: number
  ingresosTotal: number
  costoVentas: number
  costoProduccion: number
  costoTotal: number
  utilidadBruta: number
  margenBruto: number
  gastosAdmon: number
  gastosVentas: number
  gastosOperTotal: number
  depreciacion: number
  ebitda: number
  gananciaOperacional: number
  gastosBancarios: number
  comisiones: number
  intereses: number
  gastosNoOpOtros: number
  gastosNoOp: number
  resultadoAnteImpuesto: number
  provisionRenta: number
  resultadoNeto: number
}

// ─────────────────────────────────────────────────────────────
export interface EriAcumulado {
  periodoInicio: string
  periodoFin: string
  ingresosOperacionales: number
  ingresosNoOperacionales: number
  ingresosTotal: number
  costoTotal: number
  utilidadBruta: number
  gastosOperTotal: number
  depreciacion: number
  ebitda: number
  gananciaOperacional: number
  gastosNoOp: number
  resultadoAnteImpuesto: number
  provisionRenta: number
  resultadoNeto: number
}

export interface IngresoAuxiliarDetalle {
  codigo: string           // '41800101'
  nombre: string           // 'Servicio de Hospedaje'
  total: number
  terceros: TerceroAgrupado[]
}

// ─────────────────────────────────────────────────────────────
export interface IngresoSubcuentaDetalle {
  codigo: string
  nombre: string
  esOperacional: boolean
  esDevolucion: boolean
  total: number
  terceros: TerceroAgrupado[]
  auxiliares?: IngresoAuxiliarDetalle[]
}

// ─────────────────────────────────────────────────────────────
export interface CostoSubcuentaDetalle {
  codigo: string
  nombre: string
  esVentas: boolean       // true = 61xx | false = 71xx
  total: number           // saldoFinal (positivo = costo)
  terceros: TerceroAgrupado[]
  auxiliares: ItemDetalle[] 
  auxiliaresConTerceros: CostoAuxiliarDetalle[]  // auxiliares por subcuenta (Mano de Obra, Insumos, etc.)
}
export interface CostoAuxiliarDetalle {
  codigo: string   // '61701501'
  nombre: string   // 'Servicios'
  total: number
  terceros: TerceroAgrupado[]
}
// ─────────────────────────────────────────────────────────────
export interface GastoSubcuentaDetalle {
  codigo: string
  nombre: string
  esOperacional: boolean   // true = 51/52xx | false = 53xx
  total: number            // SF positivo (débito > crédito)
  auxiliares: ItemDetalle[]
}
export interface PPyESubcuentaDetalle {
  codigo: string; nombre: string; total: number
  auxiliares: ItemDetalle[]
}
// ──────────────────────────export function procesarBalances(multi: BalancesMultiPeriodo): ResultadoMotor {───────────────────────────────────
export interface PeriodoCalculado {
  mes: number
  anio: number
  label: string
  fechaCorte: string
  activoCorriente: ActivoCorriente
  activoNoCorriente: ActivoNoCorriente
  totalActivo: number
  pasivoCorriente: PasivoCorriente
  pasivoNoCorriente: PasivoNoCorriente
  totalPasivo: number
  patrimonio: Patrimonio
  totalPasivoMasPatrimonio: number
  eriMensual: EriMensual
  advertencias: string[]
  ingresosDetalle: IngresoSubcuentaDetalle[]
  costosDetalle: CostoSubcuentaDetalle[]
  gastosDetalle: GastoSubcuentaDetalle[]
}

export interface ResultadoMotor {
  empresa: string
  nit: string
  periodos: PeriodoCalculado[]
  eriAcumulado: EriAcumulado[]
  advertencias: string[]
  perfil?: PerfilCliente
}

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

const NOMBRES_MES: Record<number, string> = {
  1:'ENERO', 2:'FEBRERO', 3:'MARZO',    4:'ABRIL',
  5:'MAYO',  6:'JUNIO',   7:'JULIO',    8:'AGOSTO',
  9:'SEPTIEMBRE', 10:'OCTUBRE', 11:'NOVIEMBRE', 12:'DICIEMBRE',
}

const DIAS_CIERRE: Record<number, string> = {
  1:'31', 2:'28', 3:'31', 4:'30', 5:'31', 6:'30',
  7:'31', 8:'31', 9:'30', 10:'31', 11:'30', 12:'31',
}

const TASA_RENTA = 0.35

// ══════════════════════════════════════════════════════════════
// UTILIDADES
// ══════════════════════════════════════════════════════════════

const neg = (v: number) => -v

function fechaCierre(mes: number, anio: number): string {
  const dia = mes === 2 ? '28' : (DIAS_CIERRE[mes] ?? '30')
  return `${dia}.${String(mes).padStart(2,'0')}.${anio}`
}

function fechaInicio(mes: number, anio: number): string {
  return `01.${String(mes).padStart(2,'0')}.${anio}`
}

function varMesPrefijo(
  periodos: BalanceParseado[], idx: number,
  prefijo: string,
  nivel: 'Cuenta' | 'Subcuenta' | 'Auxiliar' = 'Subcuenta'
): number {
  const actual = obtenerSFPrefijo(periodos[idx], prefijo, nivel)
  if (idx === 0) return actual
  return actual - obtenerSFPrefijo(periodos[idx - 1], prefijo, nivel)
}

function subcuentasComoDetalle(balance: BalanceParseado, prefijo: string): ItemDetalle[] {
  return balance.subcuentas
    .filter(c => c.codigo.startsWith(prefijo) && !c.esBasura && Math.abs(c.saldoFinal) > 0)
    .map(c => ({ nombre: c.nombre, codigo: c.codigo, valor: c.saldoFinal }))
}

function auxiliaresAgrupados(balance: BalanceParseado, prefijo: string): ItemDetalle[] {
  const mapa = new Map<string, { nombre: string; valor: number }>()
  for (const a of balance.auxiliares) {
    if (!a.codigo.startsWith(prefijo) || a.esBasura) continue
    const entry = mapa.get(a.codigo)
    if (entry) {
      entry.valor += a.saldoFinal
    } else {
      mapa.set(a.codigo, { nombre: a.nombre, valor: a.saldoFinal })
    }
  }
  return [...mapa.entries()]
    .map(([codigo, { nombre, valor }]) => ({ codigo, nombre, valor }))
    .filter(x => Math.abs(x.valor) > 0)
    .sort((a, b) => b.valor - a.valor)
}
function auxiliaresListadoPPyE(balance: BalanceParseado, prefijo: string): ItemDetalle[] {
  const mapa = new Map<string, { codigo: string; valor: number }>()
  for (const a of balance.auxiliares) {
    if (!a.codigo.startsWith(prefijo) || a.esBasura) continue
    const nombreKey = a.nombre.trim()
    const entry = mapa.get(nombreKey)
    if (entry) { entry.valor += a.saldoFinal }
    else { mapa.set(nombreKey, { codigo: a.codigo, valor: a.saldoFinal }) }
  }
  return [...mapa.entries()]
    .map(([nombre, { codigo, valor }]) => ({ nombre, codigo, valor }))
    .filter(x => Math.abs(x.valor) > 0)
    .sort((a, b) => b.valor - a.valor)
}

// ══════════════════════════════════════════════════════════════
// HOJA: CAJA — [1105xx]
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// FIX 2 — REEMPLAZAR función calcCAJA en motor.ts
// CAMBIO: retorna cajaDetalle con subcuentas 1105xx individuales
//   (Caja General, Caja Menor, etc.)
// ══════════════════════════════════════════════════════════════
 
function calcCAJA(balance: BalanceParseado) {
  const cajaTotal =
    obtenerSFPrefijo(balance, '1105', 'Subcuenta') ||
    obtenerSF(balance, '1105')
 
  // ← FIX: capturar subcuentas individuales de 1105xx
  // Permite mostrar Caja General, Caja Menor, etc. por separado
  // Si solo hay una caja, cajaDetalle tendrá un solo item
  const cajaDetalle: ItemDetalle[] = balance.subcuentas
    .filter(c => {
      const cod = String(c.codigo).replace(/\.0$/, '').trim()
      return cod.startsWith('1105') && !c.esBasura && Math.abs(c.saldoFinal) > 0
    })
    .map(c => ({
      nombre: c.nombre,
      codigo: String(c.codigo).replace(/\.0$/, '').trim(),
      valor:  c.saldoFinal,
    }))
 
  return { cajaTotal, cajaDetalle }
}
 

// ══════════════════════════════════════════════════════════════
// HOJA: BANCOS — [1110xx]
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// MOTOR — reemplazar función calcBANCOS completa en motor.ts
// ══════════════════════════════════════════════════════════════
//
// PROBLEMA RAÍZ (PIVOTE FILMS):
//   El balance por tercero tiene el código 11100501 (Bancolombia - 3306)
//   repetido CIENTOS de veces — una fila por cada tercero/proveedor.
//   El parser los carga todos como auxiliares individuales, entonces
//   calcBANCOS creaba un banco por cada tercero → cientos de "Bancolombia".
//
// SOLUCIÓN: deduplicar por código sumando saldoFinal ANTES de crear bancos.
//   - Todos los 11100501 se colapsan en UNO solo con el total acumulado.
//   - Para VEGA RODRIGUEZ (11100501, 11100502, 11100503) siguen siendo 3 bancos.
//   - Funciona con CUALQUIER cliente.

function calcBANCOS(balance: BalanceParseado) {
  const todos1110 = balance.auxiliares.filter(c => {
    const cod = String(c.codigo).replace(/\.0$/, '').trim()
    return cod.startsWith('1110') && !c.esBasura
  })

  const bancosTotal =
    obtenerSF(balance, '1110') ||
    obtenerSFPrefijo(balance, '111', 'Subcuenta')

  if (todos1110.length === 0) return { bancos: [], bancosTotal }

  // El nivel banco = código más corto entre todos los 1110xx
  const minLen = Math.min(
    ...todos1110.map(c => String(c.codigo).replace(/\.0$/, '').trim().length)
  )

  // DEDUPLICAR por código sumando saldos
  // Esto resuelve el caso PIVOTE FILMS donde 11100501 aparece
  // cientos de veces (una por tercero) y deben sumarse en un solo banco
  const codigoMap = new Map<string, { nombre: string; saldoFinal: number }>()
  for (const aux of todos1110) {
    const cod = String(aux.codigo).replace(/\.0$/, '').trim()
    if (cod.length !== minLen) continue  // solo el nivel banco
    const entry = codigoMap.get(cod)
    if (entry) {
      entry.saldoFinal += aux.saldoFinal
    } else {
      codigoMap.set(cod, { nombre: aux.nombre, saldoFinal: aux.saldoFinal })
    }
  }

  // Solo bancos con saldo distinto de cero
  const aux1110 = [...codigoMap.entries()]
    .map(([codigo, { nombre, saldoFinal }]) => ({ codigo, nombre, saldoFinal }))
    .filter(x => Math.abs(x.saldoFinal) > 0)

  const todosSubaux: Array<{ codigo: string; nombre: string; saldoFinal: number; esBasura?: boolean }> =
    (balance as any).subauxiliares ?? []

  const bancos: BancoDetalle[] = []

  for (const banco of aux1110) {
    const bCod = String(banco.codigo).replace(/\.0$/, '').trim()

    // Subauxiliares de este banco (números de cuenta individuales)
    const cuentaMap = new Map<string, { nombre: string; valor: number }>()
    for (const sa of todosSubaux) {
      const saCod = String(sa.codigo).replace(/\.0$/, '').trim()
      if (!saCod.startsWith(bCod) || sa.esBasura) continue
      const entry = cuentaMap.get(sa.codigo)
      if (entry) entry.valor += sa.saldoFinal
      else cuentaMap.set(sa.codigo, { nombre: sa.nombre, valor: sa.saldoFinal })
    }

    const cuentas = [...cuentaMap.entries()]
      .map(([, { nombre, valor }]) => ({
        numero: nombre,
        saldoFinal: valor,
        debito: 0,
        credito: 0,
      }))
      .filter(c => Math.abs(c.saldoFinal) > 0)

    bancos.push({
      nombre: banco.nombre,
      totalSaldoFinal: banco.saldoFinal,
      cuentas,
    })
  }

  return { bancos, bancosTotal }
}

// ══════════════════════════════════════════════════════════════
// HOJA: INVERSIONES — [12xx]
// Observación: "saldo final de la cuenta 12 por entidad"
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// REEMPLAZAR función calcINVERSIONES en motor.ts
//
// FIX: cuando no hay subcuentas de 6 dígitos para 12xx,
//   usar balance.cuentasN3 (Nivel='Cuenta', 4 dígitos) como detalle.
//   Esto permite mostrar el TIPO de inversión (CDT=1225, Acciones=1205, etc.)
//   con sus entidades (auxiliares) debajo, igual al patrón de calcCOSTOS.
//
// ANTES: inversionesDetalle = subcuentasComoDetalle('12') → solo 6 dígitos
//   Si el cliente solo tiene 1225, 1205... a nivel Cuenta → detalle vacío
//
// DESPUÉS: si no hay subcuentas de 6 dígitos → usar cuentasN3 (4 dígitos)
//   CDT (1225): Bancolombia CDT / Davivienda CDT
//   Acciones (1205): Empresa X / Empresa Y
// ══════════════════════════════════════════════════════════════
 
function calcINVERSIONES(balance: BalanceParseado) {
  // 12xx = CDT, acciones, bonos, etc.
  const inv12Total = obtenerSFPrefijo(balance, '12', 'Cuenta')

  // 1145xx = Fiducias / Inversiones en efectivo (bajo Grupo 11)
  const inv1145Total = obtenerSFPrefijo(balance, '1145', 'Cuenta')

  const inversionesTotal = inv12Total + inv1145Total

  // ── Detalle 12xx ──────────────────────────────────────────
  const detalle6 = subcuentasComoDetalle(balance, '12')
  const detalle4 = balance.cuentasN3
    .filter(c => {
      const cod = String(c.codigo).replace(/\.0$/, '').trim()
      return cod.startsWith('12') && !c.esBasura && Math.abs(c.saldoFinal) > 0
    })
    .map(c => ({
      nombre: c.nombre,
      codigo: String(c.codigo).replace(/\.0$/, '').trim(),
      valor:  c.saldoFinal,
    }))
  const detalle12 = detalle6.length > 0 ? detalle6 : detalle4

  // ── Detalle 1145xx (Fiducias) ─────────────────────────────
  const detalle1145sub = balance.subcuentas
    .filter(c => {
      const cod = String(c.codigo).replace(/\.0$/, '').trim()
      return cod.startsWith('1145') && !c.esBasura && Math.abs(c.saldoFinal) > 0
    })
    .map(c => ({
      nombre: c.nombre,
      codigo: String(c.codigo).replace(/\.0$/, '').trim(),
      valor:  c.saldoFinal,
    }))
  const detalle1145 = detalle1145sub.length > 0
    ? detalle1145sub
    : inv1145Total !== 0
      ? [{ nombre: 'Inversiones en efectivo', codigo: '1145', valor: inv1145Total }]
      : []

  const inversionesDetalle = [...detalle12, ...detalle1145]

  // ── Auxiliares (entidades individuales) ───────────────────
  const inversionesAuxiliares = [
    ...auxiliaresAgrupados(balance, '12'),
    ...auxiliaresAgrupados(balance, '1145'),
  ]

  return { inversionesTotal, inversionesDetalle, inversionesAuxiliares }
}

// ══════════════════════════════════════════════════════════════
// HOJA: CXC + OTRAS CXC — [13xx]
// ══════════════════════════════════════════════════════════════

function calcCXC(balance: BalanceParseado) {
  const clientesTotal =
    obtenerSFPrefijo(balance, '1305', 'Subcuenta') +
    obtenerSFPrefijo(balance, '1306', 'Subcuenta')

  const anticiposTotal = obtenerSFPrefijo(balance, '133', 'Subcuenta')

  const anticRenta      = obtenerSF(balance, '135505')
  const anticReteFuente = obtenerSF(balance, '135515')
  const anticICA        = obtenerSF(balance, '135518')
  const anticOtros = Math.max(
    0,
    obtenerSFPrefijo(balance, '1355', 'Subcuenta') - anticRenta - anticReteFuente - anticICA
  )
  const anticipoImpuestosTotal = anticRenta + anticReteFuente + anticICA + anticOtros
  const anticImpuestosDetalle  = subcuentasComoDetalle(balance, '1355')

  const grupo13Total = obtenerSFPrefijo(balance, '13', 'Cuenta')
  const otrosDeudoresTotal = Math.max(
    0,
    grupo13Total - clientesTotal - anticiposTotal - anticipoImpuestosTotal
  )
  const cxcTotal = clientesTotal + anticiposTotal + anticipoImpuestosTotal + otrosDeudoresTotal

  const tercerosCxc = [
    ...obtenerTercerosPrefijo(balance, '1305'),
    ...obtenerTercerosPrefijo(balance, '1306'),
  ].sort((a, b) => Math.abs(b.saldoFinal) - Math.abs(a.saldoFinal))

  const anticiposDetalle = balance.subcuentas
    .filter(c => {
      const cod = String(c.codigo).replace(/\.0$/, '').trim()
      return cod.startsWith('133') && !c.esBasura && Math.abs(c.saldoFinal) > 0
    })
    .map(c => {
      const cod = String(c.codigo).replace(/\.0$/, '').trim()
      return {
        codigo:   cod,
        nombre:   c.nombre,
        total:    c.saldoFinal,
        terceros: obtenerTercerosPrefijo(balance, cod),
      }
    })

  const tercerosAnticipios = anticiposDetalle.flatMap(sc => sc.terceros)

  return {
    clientesTotal, anticiposTotal,
    anticipoImpuestosTotal, anticRenta, anticReteFuente, anticICA, anticOtros,
    anticImpuestosDetalle,
    otrosDeudoresTotal, cxcTotal, tercerosCxc,
    tercerosAnticipios, anticiposDetalle,
  }
}

// ══════════════════════════════════════════════════════════════
// HOJA: INVENTARIO — [14xx]
// Observación: "saldo final de la cuenta 14 detallando subcuenta"
// ══════════════════════════════════════════════════════════════

function calcINVENTARIO(balance: BalanceParseado) {
  const inventarioTotal      = obtenerSFPrefijo(balance, '14', 'Cuenta')
  const inventarioDetalle    = subcuentasComoDetalle(balance, '14')
  const inventarioAuxiliares = auxiliaresAgrupados(balance, '14')
  return { inventarioTotal, inventarioDetalle, inventarioAuxiliares }
}

// ══════════════════════════════════════════════════════════════
// HOJA: PYP — activos fijos [15xx] + depreciación [1592xx]
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// MOTOR — reemplazar función calcPYP completa en motor.ts
// ══════════════════════════════════════════════════════════════
//
// PROBLEMA CON VEGA RODRIGUEZ:
//   balance.subcuentas tiene AMBOS niveles para 15xx:
//     Cuenta (4 dígitos):    1504 Terrenos, 1520 Maquinaria...
//     Subcuenta (6 dígitos): 150410 Rurales, 152001 Maquinaria...
//   El código anterior mezclaba ambos → duplicación.
//
// SOLUCIÓN:
//   Si hay entradas de 4 dígitos → usarlas como headers principales
//   (el accountant dijo "subcuenta y su auxiliar" = cuenta → items)
//   Si SOLO hay 6 dígitos → usarlas como headers
//   Los auxiliares (nombres de activos individuales) vienen de balance.auxiliares
//
// RESULTADO PARA VEGA:
//   Terrenos (1504)                511M
//     Finca Mil flores             125M
//     Finca El Porvenir            250M
//     Lote la esmeralda            136M
//   Maquinaria y equipo (1520)     897M
//     Maquinaria y equipo          685M  ← suma de todos los terceros con ese nombre
//     Leasing Maquina               78M
//     Maquinaria Agricola Yunnei... 67M
//   Equipo de oficina (1524)       5.6M
//     Muebles y enseres            5.6M
//   ...
// ══════════════════════════════════════════════════════════════

function calcPYP(balance: BalanceParseado): ActivoNoCorriente {

  // ── Todos los 15xx excepto 159xx, normalizando código ─────
  const all15 = balance.subcuentas.filter(c => {
    const cod = String(c.codigo).replace(/\.0$/, '').trim()
    return cod.startsWith('15') && !cod.startsWith('159') && !c.esBasura
  })

  // ── Preferir 4-digit (Cuenta) si existen → son los headers ─
  // Si solo hay 6-digit (Subcuenta) → usar esos
  // Intentar obtener 4-digit desde balance.cuentas (parser los separa)
  const balCuentas = (balance as any).cuentas as
    Array<{ codigo: string | number; nombre: string; saldoFinal: number; esBasura?: boolean }> | undefined

  // Buscar entradas EXACTAMENTE de 4 dígitos (Cuenta nivel)
  // en balance.cuentas primero, luego en balance.subcuentas
  const cuentas15_4d = (balCuentas ?? []).filter(c => {
    const cod = String(c.codigo).replace(/\.0$/, '').trim()
    return cod.startsWith('15') && !cod.startsWith('159') &&
           cod.length === 4 &&   // ← ESTRICTAMENTE 4 dígitos
           !c.esBasura && Math.abs(c.saldoFinal) > 0
  })

  const subcuentas15_4d = all15.filter(c =>
    String(c.codigo).replace(/\.0$/, '').trim().length === 4
  )

  const headers15 =
    cuentas15_4d.length > 0   ? cuentas15_4d   :   // balance.cuentas tiene 4-digit
    subcuentas15_4d.length > 0 ? subcuentas15_4d :  // balance.subcuentas tiene 4-digit
    all15.filter(c => String(c.codigo).replace(/\.0$/, '').trim().length === 6) // fallback 6-digit
  // ── PPyE bruto = suma de headers (sin duplicar) ───────────
  const ppyeBruto = headers15
    .filter(c => Math.abs(c.saldoFinal) > 0)
    .reduce((s, c) => s + c.saldoFinal, 0)

  // ── detallePPyE (lista plana sin auxiliares) ──────────────
  const detallePPyE: ItemDetalle[] = headers15
    .filter(c => Math.abs(c.saldoFinal) > 0)
    .map(c => ({
      nombre: c.nombre,
      codigo: String(c.codigo).replace(/\.0$/, '').trim(),
      valor:  c.saldoFinal,
    }))

  // ── detallePPyEConAux (con auxiliares de balance.auxiliares) ─
  // auxiliaresListadoPPyE agrupa por NOMBRE del auxiliar,
  // sumando terceros con mismo nombre (ej: "Maquinaria y equipo" de varios vendors)
// DESPUÉS — pegar esto:
  const detallePPyEConAux: PPyESubcuentaDetalle[] = headers15
    .filter(c => Math.abs(c.saldoFinal) > 0)
    .map(c => {
      const cod = String(c.codigo).replace(/\.0$/, '').trim()

      let auxiliares = auxiliaresListadoPPyE(balance, cod)

      if (auxiliares.length === 0) {
        auxiliares = balance.subcuentas
          .filter(s => {
            const sCod = String(s.codigo).replace(/\.0$/, '').trim()
            return (
              sCod.startsWith(cod) &&
              !sCod.startsWith('159') &&
              !s.esBasura &&
              Math.abs(s.saldoFinal) > 0
            )
          })
          .map(s => ({
            nombre: s.nombre,
            codigo: String(s.codigo).replace(/\.0$/, '').trim(),
            valor:  s.saldoFinal,
          }))
      }

      return {
        codigo:    cod,
        nombre:    c.nombre,
        total:     c.saldoFinal,
        auxiliares,
      }
    })

  // ── Depreciación acumulada (1592xx) ───────────────────────
  const subcuentas1592 = balance.subcuentas.filter(c => {
    const cod = String(c.codigo).replace(/\.0$/, '').trim()
    return cod.startsWith('1592') && !c.esBasura
  })
  const depreciacionAcumulada = subcuentas1592.reduce((s, c) => s + c.saldoFinal, 0)
  const detalleDepreciacion   = subcuentas1592
    .filter(c => Math.abs(c.saldoFinal) > 0)
    .map(c => ({
      nombre: c.nombre,
      codigo: String(c.codigo).replace(/\.0$/, '').trim(),
      valor:  c.saldoFinal,
    }))

  const ppyeNeto           = ppyeBruto + depreciacionAcumulada
  const intangiblesTotal   = obtenerSFPrefijo(balance, '16', 'Cuenta')
  const intangiblesDetalle = subcuentasComoDetalle(balance, '16')
  const diferidosTotal     = obtenerSFPrefijo(balance, '17', 'Cuenta')
  const otrosActivosNC     = Math.max(
    0,
    obtenerSFPrefijo(balance, '19', 'Cuenta') -
    obtenerSFPrefijo(balance, '195', 'Subcuenta')
  )
  const totalActivoNoCorriente =
    ppyeNeto + intangiblesTotal + diferidosTotal + otrosActivosNC

  return {
    ppyeBruto, depreciacionAcumulada, ppyeNeto,
    detallePPyE, detalleDepreciacion,
    intangiblesTotal, intangiblesDetalle,
    diferidosTotal, otrosActivosNC,
    totalActivoNoCorriente,
    detallePPyEConAux,
  }
}
// ══════════════════════════════════════════════════════════════
// HOJA: OBLI. FIN — corriente [211xx, 212xx]
// ══════════════════════════════════════════════════════════════

function calcOBLIFINCorriente(balance: BalanceParseado) {
  const leasing211 = neg(obtenerSFPrefijo(balance, '211', 'Subcuenta'))
  const leasing212 = neg(obtenerSFPrefijo(balance, '212', 'Subcuenta'))
  const obligFinCorrTotal = leasing211 + leasing212

  const creditosCorr: CreditoDetalle[] = balance.subcuentas
    .filter(c =>
      (c.codigo.startsWith('211') || c.codigo.startsWith('212')) &&
      !c.esBasura && Math.abs(c.saldoFinal) > 0
    )
    .map(c => ({ nombre: c.nombre, codigo: c.codigo, saldoFinal: neg(c.saldoFinal) }))

  return { obligFinCorrTotal, creditosCorr }
}

// ══════════════════════════════════════════════════════════════
// HOJA: OBLI. FIN — no corriente [2105xx, 2106xx]
// ══════════════════════════════════════════════════════════════

function calcOBLIFINNC(balance: BalanceParseado) {
  const obligFinNCTotal =
    neg(obtenerSFPrefijo(balance, '2105', 'Subcuenta')) +
    neg(obtenerSFPrefijo(balance, '2106', 'Subcuenta'))

  const creditosLP: CreditoDetalle[] = balance.subcuentas
    .filter(c =>
      (c.codigo.startsWith('2105') || c.codigo.startsWith('2106')) &&
      !c.esBasura && Math.abs(c.saldoFinal) > 0
    )
    .map(c => ({ nombre: c.nombre, codigo: c.codigo, saldoFinal: neg(c.saldoFinal) }))

  const oblFinDetalle = auxiliaresAgrupados(balance, '21')
    .map(x => ({ ...x, valor: neg(x.valor) }))
    .filter(x => Math.abs(x.valor) > 0)

  return { obligFinNCTotal, creditosLP, oblFinDetalle }
}

// ══════════════════════════════════════════════════════════════
// HOJA: CXP — proveedores [2205xx] + costos y gastos [233xx]
// Observación: cuenta 22 y 23 sin 2365 / 2370 / 2380
// ══════════════════════════════════════════════════════════════

const EXCLUIR_CXP = ['2365', '2368', '2370', '2380', '2299']
 
function calcCXP(balance: BalanceParseado) {
 
  // ── Todas las subcuentas de 22 y 23 no excluidas, no basura ───
  const subcuentasValidas = balance.subcuentas.filter(c => {
    const cod = String(c.codigo).replace(/\.0$/, '').trim()
    return (
      (cod.startsWith('22') || cod.startsWith('23')) &&
      !EXCLUIR_CXP.some(excl => cod.startsWith(excl)) &&
      !c.esBasura &&
      Math.abs(c.saldoFinal) > 0
    )
  })
 
  // ── Detalle por subcuenta con sus terceros ────────────────────
  const cxpDetalle: CxpSubcuentaDetalle[] = subcuentasValidas.map(c => {
    const cod = String(c.codigo).replace(/\.0$/, '').trim()
    const terceros = obtenerTercerosPrefijo(balance, cod)
      .filter(t => Math.abs(t.saldoFinal) >= 1)
      .sort((a, b) => Math.abs(b.saldoFinal) - Math.abs(a.saldoFinal))
    return {
      codigo:   cod,
      nombre:   c.nombre,
      total:    neg(c.saldoFinal),   // positivo = lo que se debe
      terceros,
    }
  })
 
  // ── Total CXP (suma de subcuentas válidas) ────────────────────
  const cxpTotal = cxpDetalle.reduce((s, x) => s + x.total, 0)
 
  // ── Campos legados — se mantienen para hojaNCTASESF ──────────
  // hojaNCTASESF usa proveedoresTotal + costosGastosPagar + acreedoresVariosTotal
  // para calcular totalCxpCorregido. NO cambiar esos campos.
  const proveedoresTotal = neg(obtenerSFPrefijo(balance, '2205', 'Subcuenta'))
 
  const tercerosCxp = obtenerTercerosPrefijo(balance, '2205')
    .sort((a, b) => Math.abs(b.saldoFinal) - Math.abs(a.saldoFinal))
 
  const costosGastosPagar =
    neg(obtenerSFPrefijo(balance, '2305', 'Subcuenta')) +
    neg(obtenerSFPrefijo(balance, '233', 'Subcuenta'))
 
  const tercerosCuenta23Map = new Map<string, TerceroAgrupado>()
  for (const t of [
    ...obtenerTercerosPrefijo(balance, '2305'),
    ...obtenerTercerosPrefijo(balance, '233'),
  ]) {
    const key = t.nit || t.nombreTercero
    if (!key) continue
    const prev = tercerosCuenta23Map.get(key)
    if (prev) prev.saldoFinal += t.saldoFinal
    else tercerosCuenta23Map.set(key, { ...t })
  }
  const tercerosCostosGastos = [...tercerosCuenta23Map.values()]
    .filter(t => Math.abs(t.saldoFinal) >= 1)
    .sort((a, b) => Math.abs(b.saldoFinal) - Math.abs(a.saldoFinal))
 
  return {
    proveedoresTotal, tercerosCxp,
    costosGastosPagar, tercerosCostosGastos,
    costosGastosDetalle: [],
    otrosCxp: 0, cxpTotal,
    cxpDetalle,   // ← nuevo
  }
}



// ══════════════════════════════════════════════════════════════
// MOTOR — reemplazar función calcFISCALES completa en motor.ts
// ══════════════════════════════════════════════════════════════
//
// FIXES:
//   1. reteDetalleSubcuentas: normalizar códigos (maneja floats de VEGA)
//      → incluye 236575 Autorretenciones dentro de Retención Fuente
//      → detalle por tipo: Salarios, Honorarios, Servicios, Arrendamientos,
//        Compras, Autorretenciones
//
//   2. ivaDetalleSubcuentas: negación consistente
//      → PIVOTE: 240806 IVA generado (neg) + 240810 descontable (neg)
//         suma = 54M = ivaTotal ✓
//      → VEGA: IVA a favor (net > 0) → no muestra detalle, ivaTotal = 0 ✓
//
//   3. Todos los detalle arrays usan String(c.codigo).replace para
//      manejar balances con códigos numéricos (VEGA) o string (PIVOTE)

function calcFISCALES(balance: BalanceParseado) {

  // ── Helper local: normalizar código ──────────────────────
  const normCod = (c: any): string =>
    String(c.codigo).replace(/\.0$/, '').trim()

  // ── RETENCIÓN EN LA FUENTE (2365xx) ───────────────────────
  // Totales por subcuenta (para el total general)
  const reteSalarios       = neg(obtenerSF(balance, '236505'))
  const reteHonorarios     = neg(obtenerSF(balance, '236515'))
  const reteServicios      = neg(obtenerSF(balance, '236525'))
  const reteArrendamientos = neg(obtenerSF(balance, '236530'))
  const reteCompras        = neg(obtenerSF(balance, '236540'))
  const autoretenciones    = neg(obtenerSF(balance, '236575'))
  

  // Detalle por subcuenta con código normalizado
  // Incluye TODAS las 2365xx incluyendo 236575 Autorretenciones
  const reteDetalleSubcuentas = balance.subcuentas
    .filter(c => {
      const cod = normCod(c)
      return cod.startsWith('2365') && !c.esBasura && Math.abs(c.saldoFinal) > 0
    })
    .map(c => ({
      nombre: c.nombre,
      codigo: normCod(c),
      valor:  neg(c.saldoFinal),  // positivo = monto a pagar
    }))
    const reteTotal = reteDetalleSubcuentas.reduce((s, x) => s + x.valor, 0)

  // ── ICA RETENIDO (2368xx) ─────────────────────────────────
  const icaRetenido = neg(obtenerSFPrefijo(balance, '2368', 'Subcuenta'))
  const icaRetenidoDetalleSubcuentas = balance.subcuentas
    .filter(c => normCod(c).startsWith('2368') && !c.esBasura && Math.abs(c.saldoFinal) > 0)
    .map(c => ({ nombre: c.nombre, codigo: normCod(c), valor: neg(c.saldoFinal) }))

  // ── APORTES DE NÓMINA (2370xx) ────────────────────────────
  const aporteEPS     = neg(obtenerSF(balance, '237005'))
  const aporteARL     = neg(obtenerSF(balance, '237006'))
  const aporteICBF    = neg(obtenerSF(balance, '237010'))
  // 237045 = Fondos (VEGA) | 238030 = Fondos cesantías/pensiones (PIVOTE → acreedores varios)
const aportePension =
  neg(obtenerSF(balance, '237045')) +
  neg(obtenerSF(balance, '238030'))
  const aporteNomina  = aporteEPS + aporteARL + aporteICBF + aportePension
  const nominaTotal   = reteTotal + icaRetenido + aporteNomina

  // ── IMPUESTO DE RENTA (2404xx) ────────────────────────────
  const impuestosRenta = neg(obtenerSFPrefijo(balance, '2404', 'Subcuenta'))
  const rentaDetalleSubcuentas = balance.subcuentas
    .filter(c => normCod(c).startsWith('2404') && !c.esBasura && Math.abs(c.saldoFinal) > 0)
    .map(c => ({ nombre: c.nombre, codigo: normCod(c), valor: neg(c.saldoFinal) }))

  // ── IVA (2408xx) ─────────────────────────────────────────
  // El saldo neto de 2408 puede ser:
  //   Negativo → IVA a pagar (pasivo) → mostrar en FISCALES
  //   Positivo → IVA a favor (activo) → NO mostrar en FISCALES (va en activos)
  const ivaNet = obtenerSFPrefijo(balance, '2408', 'Subcuenta')
  const ivaTotal = ivaNet < 0 ? neg(ivaNet) : 0

 // Detalle 2408xx: siempre mostrar subcuentas con saldo,
  // independiente de si el IVA es a pagar o a favor.
  // El signo negado refleja la naturaleza de cada subcuenta:
  //   IVA generado (2408xx con SF negativo) → valor positivo = a pagar
  //   IVA descontable (2408xx con SF positivo) → valor negativo = a favor
  const ivaDetalleSubcuentas = balance.subcuentas
    .filter(c => normCod(c).startsWith('2408') && !c.esBasura && Math.abs(c.saldoFinal) > 0)
    .map(c => ({ nombre: c.nombre, codigo: normCod(c), valor: neg(c.saldoFinal) }))

  // ── ICA (2412xx) ──────────────────────────────────────────
  const icaTotal = neg(obtenerSFPrefijo(balance, '2412', 'Subcuenta'))
  const icaDetalleSubcuentas = balance.subcuentas
    .filter(c => normCod(c).startsWith('2412') && !c.esBasura && Math.abs(c.saldoFinal) > 0)
    .map(c => ({ nombre: c.nombre, codigo: normCod(c), valor: neg(c.saldoFinal) }))

  const fiscalesTotal = reteTotal + icaRetenido + impuestosRenta + ivaTotal + icaTotal

  return {
    reteSalarios, reteHonorarios, reteServicios, reteArrendamientos,
    reteCompras, autoretenciones, reteTotal, icaRetenido,
    reteDetalleSubcuentas, icaRetenidoDetalleSubcuentas,
    aporteEPS, aporteARL, aporteICBF, aportePension, aporteNomina,
    nominaTotal, impuestosRenta, ivaTotal, icaTotal, fiscalesTotal,
    rentaDetalleSubcuentas, ivaDetalleSubcuentas, icaDetalleSubcuentas,
  }
}
// ══════════════════════════════════════════════════════════════
// HOJA: OTROS PASIVOS — corriente [25xx, 2380xx, 2805]
// ══════════════════════════════════════════════════════════════

function calcOTROSPASIVOSCorriente(balance: BalanceParseado) {
  const beneficiosCorrTotal = neg(obtenerSFPrefijo(balance, '25', 'Cuenta'))
  const beneficiosDetalle   = subcuentasComoDetalle(balance, '25')
    .map(c => ({ ...c, valor: neg(c.valor) }))

  const otrosPasivosCorrTotal = neg(obtenerSFPrefijo(balance, '2805', 'Subcuenta'))

  // Excluir 238030 (va a aporteNomina)
  const acreedoresVariosTotal =
    neg(obtenerSFPrefijo(balance, '2380', 'Subcuenta')) -
    neg(obtenerSF(balance, '238030'))
  const acreedoresVariosDetalle = subcuentasComoDetalle(balance, '2380')
    .filter(c => !c.codigo.startsWith('238030'))
    .map(c => ({ ...c, valor: neg(c.valor) }))

  return {
    beneficiosCorrTotal, beneficiosDetalle,
    otrosPasivosCorrTotal,
    acreedoresVariosTotal, acreedoresVariosDetalle,
  }
}

// ══════════════════════════════════════════════════════════════
// HOJA: OTROS PASIVOS — provisiones laborales [26xx]
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// HOJA: OTROS PASIVOS — provisiones laborales [26xx]  (TANDA 6.5)
// ══════════════════════════════════════════════════════════════

function calcPROVISIONES(balance: BalanceParseado) {
  const cesantias    = neg(obtenerSFPrefijo(balance, '261005', 'Subcuenta'))
  const intCesantias = neg(obtenerSFPrefijo(balance, '261010', 'Subcuenta'))
  const vacaciones   = neg(obtenerSFPrefijo(balance, '261015', 'Subcuenta'))
  const prima        = neg(obtenerSFPrefijo(balance, '261020', 'Subcuenta'))

  const desglose26 = cesantias + intCesantias + vacaciones + prima
  const grupo26    = neg(obtenerSFPrefijo(balance, '26', 'Cuenta'))

  // FIX doble conteo (TANDA 6.5):
  // El 2510 es subcuenta del grupo 25, que YA se cuenta como beneficios
  // CORRIENTES (beneficiosCorrTotal = neg(25)). El fallback a 2510 lo sumaba
  // OTRA VEZ aquí en no corriente, duplicando el beneficio.
  // Ahora la provisión NO corriente usa SOLO el grupo 26 real.
  //   · Clientes con grupo 26 (ej. VEGA): sin cambio.
  //   · Clientes sin grupo 26 pero con 2510 (ej. TURISMO): ya no duplica,
  //     el beneficio queda completo en corriente (como lo hace la contadora).
  const provisionLaboralTotal =
    desglose26 > 0 ? desglose26 :
    grupo26    > 0 ? grupo26    :
    0
 
  // ── Detalle 26xx (VEGA): subcuentas directas ──────────────
  const det26 = subcuentasComoDetalle(balance, '26')
    .map(c => ({ ...c, valor: neg(c.valor) }))
 
  // ── Detalle 2510xx (PIVOTE): auxiliares agrupados ─────────
  const aux2510Map = new Map<string, { nombre: string; valor: number }>()
  for (const a of balance.auxiliares) {
    const cod = String(a.codigo).replace(/\.0$/, '').trim()
    if (!cod.startsWith('2510') || a.esBasura) continue
    const entry = aux2510Map.get(cod)
    if (entry) entry.valor += a.saldoFinal
    else aux2510Map.set(cod, { nombre: a.nombre, valor: a.saldoFinal })
  }
  const det2510 = [...aux2510Map.entries()]
    .filter(([, v]) => Math.abs(v.valor) > 0)
    .map(([codigo, { nombre, valor }]) => ({ nombre, codigo, valor: neg(valor) }))
 
  const det2510Final = det2510.length > 0
    ? det2510
    : subcuentasComoDetalle(balance, '2510').map(c => ({ ...c, valor: neg(c.valor) }))
 
  // ← FIX: usar solo UNA fuente, no ambas
  // Si hay desglose individual (26xx: cesantías, intereses, vacaciones, prima)
  // → usar solo det26 (no agregar 2510 que ES la suma de esos)
  // Si no hay det26 (PIVOTE usa 2510 con auxiliares) → usar det2510Final
  // Detalle alineado con el total: solo grupo 26. Si no hay 26, no hay
  // provisión no corriente (el beneficio aparece completo en la hoja corriente).
  const provisionDetalle = det26
 
  return { cesantias, intCesantias, vacaciones, prima, provisionLaboralTotal, provisionDetalle }
}


// ══════════════════════════════════════════════════════════════
// HOJA: OTROS PASIVOS — no corriente [27xx, 28xx]
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// FIX 3 — REEMPLAZAR función calcOTROSPASIVOSNC completa en motor.ts
// CAMBIO: agrega otrosPasivos28Detalle con TODAS las subcuentas 28xx
//   y sus terceros. Antes solo capturaba 2805.
// ══════════════════════════════════════════════════════════════
 
function calcOTROSPASIVOSNC(balance: BalanceParseado) {
  const diferidosPasivoTotal = neg(obtenerSFPrefijo(balance, '27', 'Cuenta'))
  const anticiposClientes    = neg(obtenerSF(balance, '280505'))
  const otrosPasivosNCTotal  = Math.max(
    0,
    neg(obtenerSFPrefijo(balance, '28', 'Cuenta')) -
    neg(obtenerSFPrefijo(balance, '2805', 'Subcuenta'))
  )
  const anticiposTerceros = obtenerTercerosPrefijo(balance, '2805')
 
  // ← FIX: capturar TODAS las subcuentas de 28xx con sus terceros
  // Antes solo se usaba anticiposTerceros (2805) → otras 28xx sin detalle
  const otrosPasivos28Detalle = balance.subcuentas
    .filter(c => {
      const cod = String(c.codigo).replace(/\.0$/, '').trim()
      return cod.startsWith('28') && !c.esBasura && Math.abs(c.saldoFinal) > 0
    })
    .map(c => {
      const cod = String(c.codigo).replace(/\.0$/, '').trim()
      return {
        codigo:   cod,
        nombre:   c.nombre,
        total:    neg(c.saldoFinal),
        terceros: obtenerTercerosPrefijo(balance, cod),
      }
    })
 
  return {
    diferidosPasivoTotal,
    anticiposClientes,
    otrosPasivosNCTotal,
    anticiposTerceros,
    otrosPasivos28Detalle,   // ← nuevo campo
  }
}

// ══════════════════════════════════════════════════════════════
// HOJA: ESF — Patrimonio [31xx–37xx]
// ══════════════════════════════════════════════════════════════

function calcPATRIMONIO(balance: BalanceParseado, resultadoEjercicio: number): Patrimonio {
  const capitalSocial              = neg(obtenerSFPrefijo(balance, '31', 'Cuenta'))
  const superavitCapital           = neg(obtenerSFPrefijo(balance, '32', 'Cuenta'))
  const reservas                   = neg(obtenerSFPrefijo(balance, '33', 'Cuenta'))
  const revalorizacion             = neg(obtenerSFPrefijo(balance, '34', 'Cuenta'))
  const resultadoEjercicioAnterior = neg(obtenerSFPrefijo(balance, '36', 'Cuenta'))
  const resultadosAnteriores       = neg(obtenerSFPrefijo(balance, '37', 'Cuenta'))

  const totalPatrimonio =
    capitalSocial + superavitCapital + reservas + revalorizacion +
    resultadoEjercicioAnterior + resultadosAnteriores + resultadoEjercicio

  return {
    capitalSocial, superavitCapital, reservas, revalorizacion,
    resultadoEjercicioAnterior, resultadosAnteriores,
    resultadoEjercicio, totalPatrimonio,
  }
}

// ══════════════════════════════════════════════════════════════
// REEMPLAZAR función calcERIMENSUAL en motor.ts
// CAMBIO: agregar prefijo '62' (Compras) a costoVentas
// ══════════════════════════════════════════════════════════════
 
function calcERIMENSUAL(periodos: BalanceParseado[], idx: number): EriMensual {
  const { mes, anio } = periodos[idx].metadata
 
  const ingresosOperacionales   = Math.abs(varMesPrefijo(periodos, idx, '41', 'Cuenta'))
  const ingresosNoOperacionales = Math.abs(varMesPrefijo(periodos, idx, '42', 'Cuenta'))
  const ingresosTotal           = ingresosOperacionales + ingresosNoOperacionales
 
  // ← FIX: agregar '62' (Compras) para clientes como TURISMO que usan
  //   6210 De Materias Primas en lugar de 61xx Costo de ventas
  const costoVentas     = varMesPrefijo(periodos, idx, '61', 'Cuenta')
                        + varMesPrefijo(periodos, idx, '62', 'Cuenta')
  const costoProduccion = varMesPrefijo(periodos, idx, '71', 'Cuenta')
  const costoTotal      = costoVentas + costoProduccion
 
  const utilidadBruta = ingresosOperacionales - costoTotal
  const margenBruto   = ingresosOperacionales !== 0 ? utilidadBruta / ingresosOperacionales : 0
 
  const gastosAdmon     = varMesPrefijo(periodos, idx, '51', 'Cuenta')
  const gastosVentas    = varMesPrefijo(periodos, idx, '52', 'Cuenta')
  const gastosOperTotal = gastosAdmon + gastosVentas
  const depreciacion    = varMesPrefijo(periodos, idx, '516', 'Subcuenta')
 
  const ebitda              = utilidadBruta - gastosOperTotal + depreciacion
  const gananciaOperacional = utilidadBruta - gastosOperTotal + ingresosNoOperacionales
 
  const gastosBancarios = varMesPrefijo(periodos, idx, '530505', 'Subcuenta')
  const comisiones      = varMesPrefijo(periodos, idx, '530515', 'Subcuenta')
  const intereses       = varMesPrefijo(periodos, idx, '530520', 'Subcuenta')
  const gastosNoOpOtros = Math.max(
    0,
    varMesPrefijo(periodos, idx, '53', 'Cuenta') - gastosBancarios - comisiones - intereses
  )
  const gastosNoOp = gastosBancarios + comisiones + intereses + gastosNoOpOtros
 
  const resultadoAnteImpuesto = gananciaOperacional - gastosNoOp
  const provisionRenta = resultadoAnteImpuesto > 0 ? resultadoAnteImpuesto * TASA_RENTA : 0
  const resultadoNeto  = resultadoAnteImpuesto - provisionRenta
 
  return {
    mes, anio,
    label: NOMBRES_MES[mes] ?? String(mes),
    fechaInicio: fechaInicio(mes, anio),
    fechaFin: fechaCierre(mes, anio),
    ingresosOperacionales, ingresosNoOperacionales, ingresosTotal,
    costoVentas, costoProduccion, costoTotal,
    utilidadBruta, margenBruto,
    gastosAdmon, gastosVentas, gastosOperTotal, depreciacion,
    ebitda, gananciaOperacional,
    gastosBancarios, comisiones, intereses, gastosNoOpOtros, gastosNoOp,
    resultadoAnteImpuesto, provisionRenta, resultadoNeto,
  }
}

// ══════════════════════════════════════════════════════════════
// HOJA: INGRESOS — subcuentas [41xx, 42xx] con terceros
// Observación: "resultado de crédito menos débito cuenta 4
//               detallando subcuenta y tercero"
// ══════════════════════════════════════════════════════════════

function calcINGRESOS(
  balance: BalanceParseado,
  perfil?: PerfilCliente
): IngresoSubcuentaDetalle[] {
  const result: IngresoSubcuentaDetalle[] = []

  const mostrarAux       = perfil?.ingresos?.mostrarAuxiliares ?? false
  const subcuentasConAux = perfil?.ingresos?.subcuentasConAuxiliar ?? []
  const excluirDebSinCre = perfil?.terceros?.excluirDebitoSinCredito ?? false

  const subcuentas4 = balance.subcuentas.filter(
    c => (c.codigo.startsWith('41') || c.codigo.startsWith('42')) && !c.esBasura
  )

  // Deduplicar terceros de un código (suma Auxiliar + Subauxiliar)
  const dedupTerceros = (codigo: string): TerceroAgrupado[] => {
    const raw = obtenerTercerosPrefijo(balance, codigo)
    const map = new Map<string, TerceroAgrupado>()
    for (const t of raw) {
      const key = (t.nit || t.nombreTercero || '').trim()
      if (!key) continue
      const prev = map.get(key)
      if (prev) {
        prev.movimientoDebito  += t.movimientoDebito
        prev.movimientoCredito += t.movimientoCredito
        prev.saldoFinal        += t.saldoFinal
        prev.saldoInicial      += t.saldoInicial
      } else {
        map.set(key, { ...t })
      }
    }
    let arr = [...map.values()]
    if (excluirDebSinCre) {
      arr = arr.filter(t => !(t.movimientoDebito > 0 && t.movimientoCredito === 0))
    }
    return arr
      .filter(t => Math.abs(t.movimientoCredito - t.movimientoDebito) >= 1)
      .sort((a, b) =>
        Math.abs(b.movimientoCredito - b.movimientoDebito) -
        Math.abs(a.movimientoCredito - a.movimientoDebito)
      )
  }

  for (const sc of subcuentas4) {
    const esDevolucion = sc.codigo.startsWith('4175')
    const total = esDevolucion
      ? (sc.movimientoDebito - sc.movimientoCredito)
      : (sc.movimientoCredito - sc.movimientoDebito)

    if (Math.abs(total) < 1) continue

    const esAjuste = sc.nombre.toLowerCase().includes('ajuste')

    const debeDiscriminar =
      mostrarAux &&
      subcuentasConAux.includes(sc.codigo) &&
      !esDevolucion && !esAjuste

    if (debeDiscriminar) {
      // Auxiliares de 8 dígitos hijos de esta subcuenta
      const auxiliares8 = balance.auxiliares.filter(a => {
        const cod = String(a.codigo).replace(/\.0$/, '').trim()
        return cod.length === 8 && cod.startsWith(sc.codigo) && !a.esBasura
      })
      const codigosAux = [...new Set(
        auxiliares8.map(a => String(a.codigo).replace(/\.0$/, '').trim())
      )].sort()

      const auxiliaresDetalle: IngresoAuxiliarDetalle[] = []
      for (const codAux of codigosAux) {
        const auxEntry = auxiliares8.find(
          a => String(a.codigo).replace(/\.0$/, '').trim() === codAux
        )
        const totalAux = (auxEntry?.movimientoCredito ?? 0) - (auxEntry?.movimientoDebito ?? 0)
        const tercerosAux = dedupTerceros(codAux)
        const totalDesdeTerceros = tercerosAux.reduce(
          (s, t) => s + (t.movimientoCredito - t.movimientoDebito), 0
        )
        const totalFinal = Math.abs(totalAux) >= 1 ? totalAux : totalDesdeTerceros
        if (Math.abs(totalFinal) < 1 && tercerosAux.length === 0) continue

        auxiliaresDetalle.push({
          codigo:   codAux,
          nombre:   auxEntry?.nombre ?? codAux,
          total:    totalFinal,
          terceros: tercerosAux,
        })
      }

      result.push({
        codigo:        sc.codigo,
        nombre:        sc.nombre,
        esOperacional: sc.codigo.startsWith('41'),
        esDevolucion,
        total,
        terceros:      [],
        auxiliares:    auxiliaresDetalle,
      })

    } else {
      const terceros = (esDevolucion || esAjuste) ? [] : dedupTerceros(sc.codigo)
      result.push({
        codigo:        sc.codigo,
        nombre:        sc.nombre,
        esOperacional: sc.codigo.startsWith('41'),
        esDevolucion,
        total,
        terceros,
      })
    }
  }

  return result
}

// ══════════════════════════════════════════════════════════════
// REEMPLAZAR función calcCOSTOS en motor.ts
// FIX de duplicación: usar balance.cuentasN3 (solo 4 dígitos)
// en lugar de (balance as any).cuentas (todos los niveles)
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// REEMPLAZAR función calcCOSTOS en motor.ts
// FIX v2:
//   1. Usar movimientoDebito - movimientoCredito (no saldoFinal)
//   2. Agrupar terceros por subcuenta de 6 dígitos cuando existen
//      (Hotel Cabañas, Restaurante Hotel, etc.)
//   3. buildAuxConTerceros usa obtenerTercerosPrefijo en vez de
//      escanear balance.auxiliares manualmente
// ══════════════════════════════════════════════════════════════

function calcCOSTOS(balance: BalanceParseado): CostoSubcuentaDetalle[] {
  const result: CostoSubcuentaDetalle[] = []

  const PREFIJOS = ['61', '62', '71']

  // ── Paso 1: subcuentas de 6 dígitos en balance.subcuentas ──
  const sc6 = balance.subcuentas.filter(c => {
    const cod = String(c.codigo).replace(/\.0$/, '').trim()
    return PREFIJOS.some(p => cod.startsWith(p)) && !c.esBasura &&
           (Math.abs(c.movimientoDebito) > 0 || Math.abs(c.movimientoCredito) > 0)
  })

  // ── Paso 2: cuentas de 4 dígitos en balance.cuentasN3 ──────
  const sc4 = balance.cuentasN3.filter(c => {
    const cod = String(c.codigo).replace(/\.0$/, '').trim()
    return PREFIJOS.some(p => cod.startsWith(p)) && !c.esBasura &&
           (Math.abs(c.movimientoDebito) > 0 || Math.abs(c.movimientoCredito) > 0)
  })

  // Códigos de 4 dígitos que ya tienen hijos de 6 dígitos → no duplicar
  const codigosConHijos = new Set(
    sc6.map(c => String(c.codigo).replace(/\.0$/, '').trim().slice(0, 4))
  )

  // ── Paso 3: agrupar sc6 por primeros 4 dígitos ─────────────
  const byGrupo = new Map<string, {
    nombre: string
    total: number
    subs: { codigo: string; nombre: string; valor: number }[]
  }>()

  for (const item of sc6) {
    const cod    = String(item.codigo).replace(/\.0$/, '').trim()
    const grpCod = cod.slice(0, 4)
    // FIX: usar movimiento, no saldoFinal
    const mov = item.movimientoDebito - item.movimientoCredito

    if (cod.length === 4) {
      const e = byGrupo.get(grpCod)
      if (e) { e.nombre = item.nombre; e.total = mov }
      else byGrupo.set(grpCod, { nombre: item.nombre, total: mov, subs: [] })
    } else {
      const sub = { codigo: cod, nombre: item.nombre, valor: mov }
      const e = byGrupo.get(grpCod)
      if (e) e.subs.push(sub)
      else byGrupo.set(grpCod, { nombre: grpCod, total: 0, subs: [sub] })
    }
  }

  // Calcular total desde subcuentas cuando no hay cuenta madre explícita
  for (const [, grp] of byGrupo) {
    if (grp.total === 0 && grp.subs.length > 0) {
      grp.total = grp.subs.reduce((s, x) => s + x.valor, 0)
    }
  }

  // Rellenar nombres desde cuentasN3
  for (const [cod, grp] of byGrupo) {
    if (grp.nombre === cod) {
      const found = balance.cuentasN3.find(
        c => String(c.codigo).replace(/\.0$/, '').trim() === cod
      )
      if (found) grp.nombre = found.nombre
    }
  }

  // FIX: buildAuxConTerceros usa obtenerTercerosPrefijo (no escaneo manual)
  // y filtra por movimientoDebito - movimientoCredito
const buildAuxConTerceros = (auxiliares: { codigo: string; nombre: string; valor: number }[]): CostoAuxiliarDetalle[] => {
  const result: CostoAuxiliarDetalle[] = []

  for (const aux of auxiliares) {
    const auxCod = aux.codigo

    // Claves de 10 dígitos (Hotel, Cabañas, Terraza, etc.)
    const keys10 = [...new Set(
      [...balance.tercerosPorSubcuenta.keys()]
        .filter(k => k.startsWith(auxCod) && k.length === 10)
    )].sort()

    // Claves de 8 dígitos con terceros directos (Bar regular, IVA Mayor, etc.)
    // Solo los que NO son padre de algún key de 10 dígitos
    const standaloneKeys8 = [...new Set(
      [...balance.tercerosPorSubcuenta.keys()]
        .filter(k => k.startsWith(auxCod) && k.length === 8)
    )].sort().filter(k8 => !keys10.some(k10 => k10.startsWith(k8)))

    const totalNodos = keys10.length + standaloneKeys8.length

    if (totalNodos > 1) {
      // ── Hay subdivisión → header + cada nodo ─────────────────────
      result.push({ codigo: auxCod, nombre: aux.nombre, total: aux.valor, terceros: [] })

      // Nodos 10-digit (Hotel, Cabañas, etc.)
      for (const k10 of keys10) {
        const nodeName = balance.subauxiliares.find(s =>
          String(s.codigo).replace(/\.0$/, '').trim() === k10
        )?.nombre ?? k10
        const mov10 = balance.subauxiliares
          .filter(s => String(s.codigo).replace(/\.0$/, '').trim() === k10 && !s.esBasura)
          .reduce((sum, s) => sum + s.movimientoDebito - s.movimientoCredito, 0)
        const terceros = obtenerTercerosPrefijo(balance, k10)
          .filter(t => Math.abs(t.movimientoDebito - t.movimientoCredito) >= 1)
          .sort((a, b) => Math.abs(b.movimientoDebito - b.movimientoCredito) - Math.abs(a.movimientoDebito - a.movimientoCredito))
        if (Math.abs(mov10) < 1 && terceros.length === 0) continue
        result.push({ codigo: k10, nombre: nodeName, total: mov10, terceros })
      }

      // Nodos 8-digit standalone (Bar IVA Mayor, Restaurante IVA Mayor, etc.)
      for (const k8 of standaloneKeys8) {
        const a8Entry = balance.auxiliares.find(a =>
          String(a.codigo).replace(/\.0$/, '').trim() === k8 && !a.esBasura
        )
        const a8MovEntry = a8Entry ? (a8Entry.movimientoDebito - a8Entry.movimientoCredito) : 0
        const a8MovTerceros = (balance.tercerosPorSubcuenta.get(k8) ?? [])
        .reduce((sum, t) => sum + (t.movimientoDebito - t.movimientoCredito), 0)
        const a8Mov = Math.abs(a8MovEntry) >= 1 ? a8MovEntry : a8MovTerceros
        const a8Nombre = a8Entry?.nombre ?? k8
        const terceros = obtenerTercerosPrefijo(balance, k8)
          .filter(t => Math.abs(t.movimientoDebito - t.movimientoCredito) >= 1)
          .sort((a, b) => Math.abs(b.movimientoDebito - b.movimientoCredito) - Math.abs(a.movimientoDebito - a.movimientoCredito))
        if (Math.abs(a8Mov) < 1 && terceros.length === 0) continue
        result.push({ codigo: k8, nombre: a8Nombre, total: a8Mov, terceros })
      }
    } else {
      // ── Sin subdivisión → terceros flat ──────────────────────────
      const terceros = obtenerTercerosPrefijo(balance, auxCod)
        .filter(t => Math.abs(t.movimientoDebito - t.movimientoCredito) >= 1)
        .sort((a, b) => Math.abs(b.movimientoDebito - b.movimientoCredito) - Math.abs(a.movimientoDebito - a.movimientoCredito))
      result.push({ codigo: auxCod, nombre: aux.nombre, total: aux.valor, terceros })
    }
  }
  return result
}

  // Helper: deduplicar terceros (flat, para cuando no hay auxiliares)
  const buildTerceros = (cod: string): TerceroAgrupado[] => {
    const terceroMap = new Map<string, TerceroAgrupado>()
    for (const t of obtenerTercerosPrefijo(balance, cod)) {
      const key = t.nit || t.nombreTercero
      if (!key) continue
      const prev = terceroMap.get(key)
      if (prev) {
        prev.movimientoDebito  += t.movimientoDebito
        prev.movimientoCredito += t.movimientoCredito
        prev.saldoFinal        += t.saldoFinal
      } else terceroMap.set(key, { ...t })
    }
    return [...terceroMap.values()].filter(t =>
      Math.abs(t.movimientoDebito - t.movimientoCredito) >= 1
    )
  }

  // ── Paso 4: convertir byGrupo (entradas con hijos de 6 dígitos) ─
  for (const [cod, { nombre, total, subs }] of byGrupo) {
    const auxiliares = subs.length > 0
      ? subs
      : auxiliaresAgrupados(balance, cod).map(a => ({
          ...a,
          // re-calcular valor como movimiento (auxiliaresAgrupados usa saldoFinal)
          valor: balance.auxiliares
            .filter(ba => String(ba.codigo).replace(/\.0$/, '').trim() === a.codigo && !ba.esBasura)
            .reduce((s, ba) => s + ba.movimientoDebito - ba.movimientoCredito, 0) || a.valor,
        }))

    result.push({
      codigo:   cod,
      nombre,
      esVentas: cod.startsWith('61') || cod.startsWith('62'),
      total,
      terceros:              buildTerceros(cod),
      auxiliares:            auxiliares.map(s => ({ nombre: s.nombre, codigo: s.codigo, valor: s.valor })),
      auxiliaresConTerceros: buildAuxConTerceros(auxiliares),
    })
  }

  // ── Paso 5: cuentas de 4 dígitos sin hijos (TURISMO 6210) ──
for (const item of sc4) {
  const cod = String(item.codigo).replace(/\.0$/, '').trim()
  if (codigosConHijos.has(cod)) continue
  if (byGrupo.has(cod))         continue

  const subcuentasBajo = balance.subcuentas.filter(s => {
    const sCod = String(s.codigo).replace(/\.0$/, '').trim()
    return sCod.startsWith(cod) && sCod.length === 6 && !s.esBasura &&
           (Math.abs(s.movimientoDebito) > 0 || Math.abs(s.movimientoCredito) > 0)
  })

  let auxiliaresConTerceros: CostoAuxiliarDetalle[]
  let auxiliares: ItemDetalle[]

  if (subcuentasBajo.length > 0) {
  auxiliaresConTerceros = []
  auxiliares = []

  for (const sub6 of subcuentasBajo) {
    const sub6Cod = String(sub6.codigo).replace(/\.0$/, '').trim()
    const sub6Mov = sub6.movimientoDebito - sub6.movimientoCredito
    if (Math.abs(sub6Mov) < 1) continue

    auxiliares.push({ nombre: sub6.nombre, codigo: sub6Cod, valor: sub6Mov })

    // buildAuxConTerceros ahora detecta automáticamente subdivisiones 10-digit
    const built = buildAuxConTerceros([{ codigo: sub6Cod, nombre: sub6.nombre, valor: sub6Mov }])
    for (const item of built) auxiliaresConTerceros.push(item)
  }
} else {
  // Sin subcuentas intermedias → terceros flat
  const auxRaw = auxiliaresAgrupados(balance, cod)
  auxiliares = auxRaw.map(a => ({
    ...a,
    valor: balance.auxiliares
      .filter(ba => String(ba.codigo).replace(/\.0$/, '').trim() === a.codigo && !ba.esBasura)
      .reduce((s, ba) => s + ba.movimientoDebito - ba.movimientoCredito, 0) || a.valor,
  }))
  auxiliaresConTerceros = buildAuxConTerceros(auxiliares)
}

  result.push({
    codigo:   cod,
    nombre:   item.nombre,
    esVentas: cod.startsWith('61') || cod.startsWith('62'),
    total:    item.movimientoDebito - item.movimientoCredito,
    terceros: buildTerceros(cod),
    auxiliares,
    auxiliaresConTerceros,
  })
}

  return result.sort((a, b) => a.codigo.localeCompare(b.codigo))
}
// ══════════════════════════════════════════════════════════════
// MOTOR — reemplazar función calcGASTOS completa en motor.ts
// ══════════════════════════════════════════════════════════════
//
// PROBLEMA: el parser separa los niveles en arrays distintos.
//   balance.subcuentas → solo Nivel='Subcuenta' (6 dígitos)
//   balance.cuentas    → solo Nivel='Cuenta'    (4 dígitos)
//
// Para PIVOTE FILMS gastos 51xx:
//   balance.subcuentas tiene: 510506 Sueldos, 510527 Aux transporte...
//   balance.cuentas    tiene: 5105 Personal, 5130 Seguros...
//   (no accesibles como balance.subcuentas)
//
// SOLUCIÓN: agrupar balance.subcuentas por los primeros 4 dígitos.
//   "510506 Sueldos" → grupo "5105" Personal
//   "510527 Aux transporte" → grupo "5105" Personal
//   "511005 Honorarios" → grupo "5110" Honorarios
//   Funciona para CUALQUIER cliente sin importar cómo el parser
//   distribuye los niveles.
// ══════════════════════════════════════════════════════════════

function calcGASTOS(balance: BalanceParseado): GastoSubcuentaDetalle[] {
  const result: GastoSubcuentaDetalle[] = []

  // ── Todos los gastos 51/52/53 de balance.subcuentas ───────
  const all5x = balance.subcuentas.filter(c => {
    const cod = String(c.codigo).replace(/\.0$/, '').trim()
    return (
      (cod.startsWith('51') || cod.startsWith('52') || cod.startsWith('53')) &&
      !c.esBasura &&
      Math.abs(c.saldoFinal) > 0
    )
  })

  if (all5x.length === 0) return []

  // ── Agrupar por los primeros 4 dígitos (cuenta mayor) ─────
  // Ej: 510506, 510527, 510530 → grupo '5105'
  //     513520, 513540         → grupo '5135'
  const byGrupo = new Map<string, {
    nombre: string
    total: number
    subs: ItemDetalle[]
  }>()

  for (const item of all5x) {
    const cod     = String(item.codigo).replace(/\.0$/, '').trim()
    const grpCod  = cod.slice(0, 4)   // primeros 4 dígitos = cuenta mayor

    if (cod.length === 4) {
      // Es la cuenta mayor misma (si el parser la incluye en subcuentas)
      const e = byGrupo.get(grpCod)
      if (e) {
        e.nombre = item.nombre       // usar el nombre real
        e.total  = item.movimientoDebito - item.movimientoCredito // usar el total real
      } else {
        byGrupo.set(grpCod, { nombre: item.nombre, total: item.movimientoDebito - item.movimientoCredito, subs: [] })
      }
    } else {
      // Es una subcuenta (6 dígitos) → va dentro de su cuenta mayor
      const sub: ItemDetalle = {
        nombre: item.nombre,
        codigo: cod,
        valor:  item.movimientoDebito - item.movimientoCredito,
      }
      const e = byGrupo.get(grpCod)
      if (e) {
        e.subs.push(sub)
      } else {
        // Aún no existe el grupo → crearlo con nombre pendiente
        byGrupo.set(grpCod, { nombre: grpCod, total: 0, subs: [sub] })
      }
    }
  }

  // ── Si la cuenta mayor no tenía entrada propia, calcular total ─
  //    desde la suma de sus subcuentas (por si el parser no la incluye)
  for (const [cod, grp] of byGrupo) {
    if (grp.total === 0 && grp.subs.length > 0) {
      grp.total = grp.subs.reduce((s, x) => s + x.valor, 0)
    }
  }

  // ── También intentar rellenar nombres desde balance.auxiliares ─
  //    (para clientes donde el nombre de la cuenta mayor solo está
  //     disponible en el array de auxiliares del parser)
  // Si el nombre sigue siendo solo el código, buscar en balance como any
  for (const [cod, grp] of byGrupo) {
    if (grp.nombre === cod) {
      // Intentar encontrar el nombre en (balance as any).cuentas
      const balCuentas = (balance as any).cuentas as
        Array<{ codigo: string | number; nombre: string; saldoFinal: number }> | undefined
      if (balCuentas) {
        const found = balCuentas.find(
          c => String(c.codigo).replace(/\.0$/, '').trim() === cod
        )
        if (found) grp.nombre = found.nombre
      }
    }
  }

  // ── Convertir Map a array ordenado por código ─────────────
  for (const [cod, { nombre, total, subs }] of byGrupo) {
    result.push({
      codigo:        cod,
      nombre,
      esOperacional: !cod.startsWith('53'),
      total,
      auxiliares:    subs.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)),
    })
  }

  return result.sort((a, b) => a.codigo.localeCompare(b.codigo))
}
export function procesarBalances(multi: BalancesMultiPeriodo, perfil?: PerfilCliente): ResultadoMotor {
  const advGlobal = [...multi.advertencias]
  const resultado: PeriodoCalculado[] = []
  const eriAcumArr: EriAcumulado[] = []

  let ingOpAcum = 0, ingNoOpAcum = 0, costoAcum = 0
  let gastosOpAcum = 0, depAcum = 0, gastosNoOpAcum = 0
  let resultNetAcum = 0

  for (let i = 0; i < multi.periodos.length; i++) {
    const balance = multi.periodos[i]
    const adv: string[] = [...balance.advertencias]
    const { mes, anio } = balance.metadata

    // ── ACTIVO ────────────────────────────────────────────────
    const caja       = calcCAJA(balance)
    const bancos     = calcBANCOS(balance)
    const inv        = calcINVERSIONES(balance)
    const cxc        = calcCXC(balance)
    
    const inventario = calcINVENTARIO(balance)
    const efectivoTotal = caja.cajaTotal + bancos.bancosTotal
    const otrosAC = obtenerSFPrefijo(balance, '17', 'Cuenta') +
                    obtenerSFPrefijo(balance, '195', 'Subcuenta')
    // ─────────────────────────────────────────────────────────────


    const activoCorriente: ActivoCorriente = {
      cajaTotal:               caja.cajaTotal,
      cajaDetalle: caja.cajaDetalle,
      bancos:                  bancos.bancos,
      bancosTotal:             bancos.bancosTotal,
      efectivoTotal,
      inversionesTotal:        inv.inversionesTotal,
      inversionesDetalle:      inv.inversionesDetalle,
      inversionesAuxiliares:   inv.inversionesAuxiliares,
      clientesTotal:           cxc.clientesTotal,
      anticiposTotal:          cxc.anticiposTotal,
      anticipoImpuestosTotal:  cxc.anticipoImpuestosTotal,
      anticRenta:              cxc.anticRenta,
      anticReteFuente:         cxc.anticReteFuente,
      anticICA:                cxc.anticICA,
      anticOtros:              cxc.anticOtros,
      anticImpuestosDetalle:   cxc.anticImpuestosDetalle,
      otrosDeudoresTotal:      cxc.otrosDeudoresTotal,
      cxcTotal:                cxc.cxcTotal,
      tercerosCxc:             cxc.tercerosCxc,
      tercerosAnticipios:      cxc.tercerosAnticipios,
      anticiposDetalle:        cxc.anticiposDetalle,
      inventarioTotal:         inventario.inventarioTotal,
      inventarioDetalle:       inventario.inventarioDetalle,
      inventarioAuxiliares:    inventario.inventarioAuxiliares,
      otrosActivosCorrientes:  otrosAC,
      tercerosBancos:          obtenerTercerosPrefijo(balance, '111'),
      totalActivoCorriente:
        efectivoTotal + inv.inversionesTotal + cxc.cxcTotal +
        inventario.inventarioTotal + otrosAC,
    }
    
    const activoNoCorriente = calcPYP(balance)
    const totalActivo = activoCorriente.totalActivoCorriente + activoNoCorriente.totalActivoNoCorriente

    // ── ERI MENSUAL ───────────────────────────────────────────
    const eriMensual = calcERIMENSUAL(multi.periodos, i)
    ingOpAcum      += eriMensual.ingresosOperacionales
    ingNoOpAcum    += eriMensual.ingresosNoOperacionales
    costoAcum      += eriMensual.costoTotal
    gastosOpAcum   += eriMensual.gastosOperTotal
    depAcum        += eriMensual.depreciacion
    gastosNoOpAcum += eriMensual.gastosNoOp
    resultNetAcum  += eriMensual.resultadoNeto

    // ── PASIVO CORRIENTE ──────────────────────────────────────
    const obligFin = calcOBLIFINCorriente(balance)
    const cxp      = calcCXP(balance)
    const fiscales = calcFISCALES(balance)
    const otrosPC  = calcOTROSPASIVOSCorriente(balance)

    const pasivoCorriente: PasivoCorriente = {
      ...obligFin, ...cxp, ...fiscales, ...otrosPC,
      // FIX doble conteo: cxpTotal YA incluye proveedoresTotal (el 2205).
      // Sumar proveedoresTotal aparte lo contaba dos veces e inflaba el pasivo.
      totalPasivoCorriente:
        obligFin.obligFinCorrTotal + cxp.cxpTotal +
        fiscales.fiscalesTotal + otrosPC.beneficiosCorrTotal + otrosPC.otrosPasivosCorrTotal,
    }
    // ── PASIVO NO CORRIENTE ───────────────────────────────────
    const obligFinNC  = calcOBLIFINNC(balance)
    const provisiones = calcPROVISIONES(balance)
    const otrosPNC    = calcOTROSPASIVOSNC(balance)

    const pasivoNoCorriente: PasivoNoCorriente = {
      ...obligFinNC, ...provisiones, ...otrosPNC,
      totalPasivoNoCorriente:
        obligFinNC.obligFinNCTotal + provisiones.provisionLaboralTotal +
        otrosPNC.diferidosPasivoTotal + otrosPNC.otrosPasivosNCTotal,
    }

    const totalPasivo =
      pasivoCorriente.totalPasivoCorriente + pasivoNoCorriente.totalPasivoNoCorriente

    // ── PATRIMONIO ────────────────────────────────────────────
    const patrimonio = calcPATRIMONIO(balance, resultNetAcum)
    const totalPasivoMasPatrimonio = totalPasivo + patrimonio.totalPatrimonio

    // ── VALIDACIÓN DE CUADRE ──────────────────────────────────
    const dif = Math.abs(totalActivo - totalPasivoMasPatrimonio)
    if (dif > 100) {
      adv.push(
        `⚠️ No cuadra: Activo=${totalActivo.toFixed(0)}, ` +
        `Pas+Pat=${totalPasivoMasPatrimonio.toFixed(0)}, dif=${dif.toFixed(0)}`
      )
    }

    // ── ERI ACUMULADO ─────────────────────────────────────────
    const utilBrutaAcum  = ingOpAcum - costoAcum
    const ganOpAcum      = utilBrutaAcum - gastosOpAcum + ingNoOpAcum
    const resAnteImpAcum = ganOpAcum - gastosNoOpAcum
    const provAcum       = resAnteImpAcum > 0 ? resAnteImpAcum * TASA_RENTA : 0

    eriAcumArr.push({
      periodoInicio: fechaInicio(multi.periodos[0].metadata.mes, multi.periodos[0].metadata.anio),
      periodoFin:    fechaCierre(mes, anio),
      ingresosOperacionales:   ingOpAcum,
      ingresosNoOperacionales: ingNoOpAcum,
      ingresosTotal:           ingOpAcum + ingNoOpAcum,
      costoTotal:              costoAcum,
      utilidadBruta:           utilBrutaAcum,
      gastosOperTotal:         gastosOpAcum,
      depreciacion:            depAcum,
      ebitda:                  utilBrutaAcum - gastosOpAcum + depAcum,
      gananciaOperacional:     ganOpAcum,
      gastosNoOp:              gastosNoOpAcum,
      resultadoAnteImpuesto:   resAnteImpAcum,
      provisionRenta:          provAcum,
      resultadoNeto:           resAnteImpAcum - provAcum,
    })

    resultado.push({
      mes, anio,
      label:      NOMBRES_MES[mes] ?? String(mes),
      fechaCorte: fechaCierre(mes, anio),
      activoCorriente, activoNoCorriente, totalActivo,
      pasivoCorriente, pasivoNoCorriente, totalPasivo,
      patrimonio, totalPasivoMasPatrimonio,
      eriMensual, advertencias: adv,
      ingresosDetalle: calcINGRESOS(balance, perfil),
      costosDetalle:   calcCOSTOS(balance),
      gastosDetalle:   calcGASTOS(balance),
    })
  }

  return {
    empresa:      multi.empresa,
    nit:          multi.nit,
    periodos:     resultado,
    eriAcumulado: eriAcumArr,
    advertencias: advGlobal,
    perfil,
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS DE CONSULTA
// ══════════════════════════════════════════════════════════════

export function resumenUltimoPeriodo(r: ResultadoMotor): string {
  const u = r.periodos[r.periodos.length - 1]
  if (!u) return 'Sin períodos'
  const f = (n: number) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n))
  return [
    `${r.empresa} | NIT: ${r.nit}`,
    `Período: ${u.label} ${u.anio} | Corte: ${u.fechaCorte}`,
    '',
    `ACTIVO:              $${f(u.totalActivo)}`,
    `  Corriente:         $${f(u.activoCorriente.totalActivoCorriente)}`,
    `    Efectivo:        $${f(u.activoCorriente.efectivoTotal)}`,
    `    Inversiones:     $${f(u.activoCorriente.inversionesTotal)}`,
    `    CxC:             $${f(u.activoCorriente.cxcTotal)}`,
    `    Inventarios:     $${f(u.activoCorriente.inventarioTotal)}`,
    `  No Corriente:      $${f(u.activoNoCorriente.totalActivoNoCorriente)}`,
    `    PPyE Neto:       $${f(u.activoNoCorriente.ppyeNeto)}`,
    '',
    `PASIVO:              $${f(u.totalPasivo)}`,
    `  Corriente:         $${f(u.pasivoCorriente.totalPasivoCorriente)}`,
    `  No Corriente:      $${f(u.pasivoNoCorriente.totalPasivoNoCorriente)}`,
    '',
    `PATRIMONIO:          $${f(u.patrimonio.totalPatrimonio)}`,
    `PAS + PAT:           $${f(u.totalPasivoMasPatrimonio)}`,
    `DIFERENCIA:          $${f(Math.abs(u.totalActivo - u.totalPasivoMasPatrimonio))}`,
    '',
    `ERI ${u.label}:`,
    `  Ingresos:          $${f(u.eriMensual.ingresosTotal)}`,
    `  Costos:            $${f(u.eriMensual.costoTotal)}`,
    `  Gastos Op.:        $${f(u.eriMensual.gastosOperTotal)}`,
    `  Resultado Neto:    $${f(u.eriMensual.resultadoNeto)}`,
    ...(u.advertencias.length ? ['', 'ADVERTENCIAS:', ...u.advertencias] : []),
  ].join('\n')
}