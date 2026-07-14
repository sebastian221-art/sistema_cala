// src/app/api/motor-contable/route.ts v6.0
// CAMBIO v6: recibe perfil_json (opcional) y lo pasa al motor para que
// aplique las reglas del cliente. Si no viene perfil, usa comportamiento
// por defecto (igual que v5).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsearBalancesMultiples } from '@/lib/motor-contable/parser'
import { procesarBalances } from '@/lib/motor-contable/motor'
import { generarTanda1 } from '@/lib/motor-contable/generarESF'
import type { PerfilCliente } from '@/lib/perfiles/calcularSimilitud'

export const runtime     = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const formData = await request.formData()

    // ── 1. Recolectar archivos ─────────────────────────────────────────────
    const buffers: Buffer[] = []
    const balancePrincipal = formData.get('balance') as File | null
    if (!balancePrincipal) {
      return NextResponse.json({ error: 'Se requiere al menos un balance de prueba' }, { status: 400 })
    }
    buffers.push(Buffer.from(await balancePrincipal.arrayBuffer()))

    const numAdicionales = parseInt(formData.get('num_adicionales') as string ?? '0') || 0
    for (let i = 0; i < numAdicionales; i++) {
      const archivo = formData.get(`balance_adicional_${i}`) as File | null
      if (archivo) buffers.push(Buffer.from(await archivo.arrayBuffer()))
    }

    // ── 1b. Leer el perfil (si viene) ───────────────────────────────────────
    let perfil: PerfilCliente | undefined
    const perfilRaw = formData.get('perfil_json') as string | null
    if (perfilRaw) {
      try {
        perfil = JSON.parse(perfilRaw) as PerfilCliente
        console.log('[Motor v6] Perfil recibido:', {
          mostrarAux: perfil.ingresos?.mostrarAuxiliares,
          subcuentas: perfil.ingresos?.subcuentasConAuxiliar,
        })
      } catch {
        console.warn('[Motor v6] perfil_json inválido, se ignora')
      }
    }

    console.log(`[Motor v6] Procesando ${buffers.length} balance(s)`)

    // ── 2. Parsear ──────────────────────────────────────────────────────────
    const multiPeriodo = parsearBalancesMultiples(buffers)
    console.log(`[Motor v6] Empresa: ${multiPeriodo.empresa} | NIT: ${multiPeriodo.nit}`)

    // ── 3. Correr motor (CON perfil) ────────────────────────────────────────
    const resultado = procesarBalances(multiPeriodo, perfil)

    // ── 4. Generar Excel ────────────────────────────────────────────────────
    const workbook = generarTanda1(resultado)
    const xlsxBuffer = await workbook.xlsx.writeBuffer() as Buffer
    const excelBase64 = Buffer.from(xlsxBuffer).toString('base64')

    // ── 5. Respuesta ────────────────────────────────────────────────────────
    const todasLasAdvertencias = [
      ...multiPeriodo.advertencias,
      ...resultado.advertencias,
      ...resultado.periodos.flatMap(p => p.advertencias),
    ]

    return NextResponse.json({
      ok: true,
      empresa: resultado.empresa,
      nit:     resultado.nit,
      periodos: resultado.periodos.map(p => ({
        mes: p.mes, anio: p.anio, label: p.label, fechaCorte: p.fechaCorte,
        totalActivo: p.totalActivo,
        totalPasivo: p.totalPasivo,
        totalPatrimonio: p.patrimonio.totalPatrimonio,
        cuadra: Math.abs(p.totalActivo - p.totalPasivoMasPatrimonio) < 100,
        advertencias: p.advertencias,
      })),
      resumen: construirResumen(resultado),
      advertencias: todasLasAdvertencias,
      excel_base64: excelBase64,
    })

  } catch (error) {
    console.error('[Motor v6]', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Error interno del motor' },
      { status: 500 }
    )
  }
}

// ── Helper: resumen legible ─────────────────────────────────────────────────
function construirResumen(resultado: ReturnType<typeof procesarBalances>) {
  const ultimo = resultado.periodos[resultado.periodos.length - 1]
  if (!ultimo) return null
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n))

  return {
    periodo:    `${ultimo.label} ${ultimo.anio}`,
    fechaCorte: ultimo.fechaCorte,
    totalActivo:       ultimo.totalActivo,
    activoCorriente:   ultimo.activoCorriente.totalActivoCorriente,
    activoNoCorriente: ultimo.activoNoCorriente.totalActivoNoCorriente,
    caja:        ultimo.activoCorriente.cajaTotal,
    bancos:      ultimo.activoCorriente.bancosTotal,
    cxc:         ultimo.activoCorriente.cxcTotal,
    inventario:  ultimo.activoCorriente.inventarioTotal,
    ppye:        ultimo.activoNoCorriente.ppyeNeto,
    totalPasivo:       ultimo.totalPasivo,
    pasivoCorriente:   ultimo.pasivoCorriente.totalPasivoCorriente,
    pasivoNoCorriente: ultimo.pasivoNoCorriente.totalPasivoNoCorriente,
    proveedores:      ultimo.pasivoCorriente.proveedoresTotal,
    obligFinancieras: ultimo.pasivoNoCorriente.obligFinNCTotal,
    totalPatrimonio:    ultimo.patrimonio.totalPatrimonio,
    capitalSocial:      ultimo.patrimonio.capitalSocial,
    resultadoEjercicio: ultimo.patrimonio.resultadoEjercicio,
    diferencia: Math.abs(ultimo.totalActivo - ultimo.totalPasivoMasPatrimonio),
    cuadra:     Math.abs(ultimo.totalActivo - ultimo.totalPasivoMasPatrimonio) < 100,
    eriMes: {
      ingresos:  ultimo.eriMensual.ingresosTotal,
      costos:    ultimo.eriMensual.costoTotal,
      gastos:    ultimo.eriMensual.gastosOperTotal,
      resultado: ultimo.eriMensual.resultadoNeto,
    },
    texto: [
      `Empresa: ${resultado.empresa} | NIT: ${resultado.nit}`,
      `Período: ${ultimo.label} ${ultimo.anio} (corte: ${ultimo.fechaCorte})`,
      ``,
      `ACTIVO TOTAL:     $${fmt(ultimo.totalActivo)}`,
      `PASIVO TOTAL:     $${fmt(ultimo.totalPasivo)}`,
      `PATRIMONIO TOTAL: $${fmt(ultimo.patrimonio.totalPatrimonio)}`,
    ].join('\n'),
  }
}