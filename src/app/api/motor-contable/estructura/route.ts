// src/app/api/motor-contable/estructura/route.ts
// ════════════════════════════════════════════════════════════════════════
// Paso 1 del flujo nuevo: SOLO parsea los balances y extrae la estructura
// compacta. NO corre el motor ni genera Excel. Es rápido y liviano.
// Devuelve: empresa, nit, estructura (para la IA) y metadata de períodos.
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsearBalancesMultiples } from '@/lib/motor-contable/parser'
import { extraerEstructura } from '@/lib/motor-contable/extraerEstructura'

export const runtime     = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const formData = await request.formData()

    // Recolectar archivos (mismo formato que la ruta principal)
    const buffers: Buffer[] = []
    const balancePrincipal = formData.get('balance') as File | null
    if (!balancePrincipal) {
      return NextResponse.json({ error: 'Se requiere al menos un balance' }, { status: 400 })
    }
    buffers.push(Buffer.from(await balancePrincipal.arrayBuffer()))

    const numAdicionales = parseInt(formData.get('num_adicionales') as string ?? '0') || 0
    for (let i = 0; i < numAdicionales; i++) {
      const archivo = formData.get(`balance_adicional_${i}`) as File | null
      if (archivo) buffers.push(Buffer.from(await archivo.arrayBuffer()))
    }

    // Parsear (sin correr el motor)
    const multiPeriodo = parsearBalancesMultiples(buffers)

    // Extraer estructura del período más reciente (el último cronológicamente)
    const ultimoPeriodo = multiPeriodo.periodos[multiPeriodo.periodos.length - 1]
    const estructura = extraerEstructura(ultimoPeriodo)

    return NextResponse.json({
      ok: true,
      empresa: multiPeriodo.empresa,
      nit:     multiPeriodo.nit,
      estructura,
      periodos: multiPeriodo.periodos.map(p => ({
        mes:   p.metadata.mes,
        anio:  p.metadata.anio,
        label: `${p.metadata.mes}/${p.metadata.anio}`,
      })),
      advertencias: multiPeriodo.advertencias,
    })

  } catch (error) {
    console.error('[estructura]', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Error al extraer estructura' },
      { status: 500 }
    )
  }
}