// src/app/api/motor-contable/generar/route.ts v2.0
// Recibe los estados editados por el contador en el preview
// y regenera el Excel — detecta PN o PJ automáticamente

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generarExcelPN, construirPeriodos } from '@/lib/motor-contable/generarESF'
import { generarExcelPJ, construirPeriodosPJ } from '@/lib/motor-contable/generador_pj'

export const runtime     = 'nodejs'
export const maxDuration = 20

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const { estados, ajustes } = body

    if (!estados) return NextResponse.json({ error: 'Sin estados' }, { status: 400 })

    // Convertir al formato del motor
    const ef = mapearAMotor(estados)

    // Extraer fecha del período
    const fechaLabel = extraerFechaLabel(ef.periodo || '')

    // ── Detectar tipo de entidad y generar con el generador correcto ──────
    const esPJ = ef.tipoEntidad === 'PJ'
    console.log(`[Generar] Tipo entidad: ${ef.tipoEntidad} → generador ${esPJ ? 'PJ' : 'PN'}`)

    let xlsxBuffer: Buffer

    if (esPJ) {
      const periodosPJ = construirPeriodosPJ([{
        ef: ef as any,
        fecha: fechaLabel,
        esAcumulado: true,
      }])
      xlsxBuffer = await generarExcelPJ(periodosPJ, ajustes ?? {})
    } else {
      const periodosPN = construirPeriodos([{
        ef: ef as any,
        fecha: fechaLabel,
        esAcumulado: true,
      }])
      xlsxBuffer = await generarExcelPN(periodosPN)
    }

    const excelBase64 = xlsxBuffer.toString('base64')

    return NextResponse.json({ ok: true, excel_base64: excelBase64 })

  } catch (error) {
    console.error('[Generar Excel]', error)
    return NextResponse.json({ ok: false, error: 'Error generando Excel' }, { status: 500 })
  }
}

// ── Mapear del formato API (snake_case) al formato del motor ──────────────
function mapearAMotor(s: Record<string, unknown>) {
  return {
    empresa:     s.empresa as string,
    nit:         s.nit as string,
    periodo:     s.periodo as string,
    tipoEntidad: (s.tipo_entidad ?? s.tipoEntidad) as 'PN' | 'PJ',

    // Activos
    efectivo:         num(s.efectivo),
    inversiones:      num(s.inversiones),
    cxc_clientes:     num(s.cxc_clientes),
    cxc_impuestos:    num(s.cxc_impuestos),
    cxc_total:        num(s.cxc_total) || (num(s.cxc_clientes) + num(s.cxc_impuestos)),
    inventarios:      num(s.inventarios),
    otros_activos_c:  num(s.otros_activos_c),
    ppye:             num(s.ppye),
    intangibles:      num(s.intangibles),
    diferidos:        num(s.diferidos),
    otros_activos_nc: num(s.otros_activos_nc),
    total_activo_corriente: num(s.total_activo_corriente),
    total_activo_nc:        num(s.total_activo_nc),
    total_activo:           num(s.total_activo),

    // Pasivos
    oblig_fin:           num(s.oblig_fin),
    oblig_fin_cp:        num(s.oblig_fin_cp),
    oblig_fin_lp:        num(s.oblig_fin_lp),
    proveedores:         num(s.proveedores),
    cxp_gtos:            num(s.cxp_gtos),
    impuestos_xpagar:    num(s.impuestos_xpagar),
    oblig_lab:           num(s.oblig_lab),
    provisiones:         num(s.provisiones),
    anticipos_recibidos: num(s.anticipos_recibidos),
    otros_pasivos:       num(s.otros_pasivos),
    total_pasivo_corriente: num(s.total_pasivo_corriente),
    total_pasivo_nc:        num(s.total_pasivo_nc),
    total_pasivo:           num(s.total_pasivo),

    // Patrimonio
    capital_historico:     num(s.capital_historico),
    ajuste_fiscal:         num(s.ajuste_fiscal),
    capital_pn_neto:       num(s.capital_pn_neto),
    capital_social:        num(s.capital_social),
    superavit_capital:     num(s.superavit_capital),
    reservas:              num(s.reservas),
    reserva_legal:         num(s.reserva_legal) || num(s.reservas),
    resultados_anteriores: num(s.resultados_anteriores),
    otros_patrimonio:      num(s.otros_patrimonio),
    resultado_periodo:     num(s.resultado_periodo),
    total_patrimonio:      num(s.total_patrimonio),

    // ERI
    ingresos_brutos:   num(s.ingresos_brutos),
    devoluciones:      num(s.devoluciones),
    ingresos_op:       num(s.ingresos_op),
    otros_ingresos:    num(s.otros_ingresos),
    ingresos_netos:    num(s.ingresos_netos),
    costo_ventas:      num(s.costo_ventas),
    ganancia_bruta:    num(s.ganancia_bruta),
    gtos_admin:        num(s.gtos_admin),
    gtos_ventas:       num(s.gtos_ventas),
    ebitda:            num(s.ebitda),
    depreciaciones:    num(s.depreciaciones),
    utilidad_operacional:       num(s.utilidad_operacional),
    utilidad_antes_financieros: num(s.utilidad_antes_financieros),
    gtos_financieros:  num(s.gtos_financieros),
    otros_gtos:        num(s.otros_gtos),
    gtos_diversos:     num(s.gtos_diversos),
    utilidad_neta:     num(s.utilidad_neta),

    // Costos
    inventario_inicial:   num(s.inventario_inicial),
    compras_periodo:      num(s.compras_periodo),
    mercancia_disponible: num(s.mercancia_disponible),
    costo_ventas_juego:   num(s.costo_ventas_juego),

    // Indicadores
    margen_bruto:       num(s.margen_bruto),
    margen_ebitda:      num(s.margen_ebitda),
    margen_operacional: num(s.margen_operacional),
    margen_neto:        num(s.margen_neto),
    razon_corriente:    num(s.razon_corriente),
    prueba_acida:       num(s.prueba_acida),
    nivel_endeudamiento: num(s.nivel_endeudamiento),
    capital_trabajo:    num(s.capital_trabajo),
    roa:                num(s.roa),
    roe:                num(s.roe),
    cobertura_intereses: num(s.cobertura_intereses),
    diferencia_balance: num(s.diferencia_balance),
    balance_cuadra:     Boolean(s.balance_cuadra),

    // Notas y terceros
    detalle:      (s.detalle      ?? {}) as Record<string, unknown[]>,
    terceros:     (s.terceros     ?? {}) as Record<string, unknown[]>,
    advertencias: (s.advertencias ?? []) as string[],
  }
}

function num(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  return 0
}

// ── Helper: extraer fecha del string de período ───────────────────────────
function extraerFechaLabel(periodo: string): string {
  if (!periodo) return '31.12.2025'

  const m1 = periodo.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (m1) return m1[0]

  const m2 = periodo.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (m2) return `${m2[1]}.${m2[2]}.${m2[3]}`

  const meses: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  }
  const periodoLow = periodo.toLowerCase()
  const anio = periodo.match(/\b(20\d{2})\b/)?.[1] ?? '2025'
  for (const [nombre, num] of Object.entries(meses)) {
    if (periodoLow.includes(nombre)) {
      const diasMes: Record<string, string> = {
        '01':'31','02':'28','03':'31','04':'30','05':'31','06':'30',
        '07':'31','08':'31','09':'30','10':'31','11':'30','12':'31',
      }
      return `${diasMes[num]}.${num}.${anio}`
    }
  }

  return `31.12.${anio}`
}