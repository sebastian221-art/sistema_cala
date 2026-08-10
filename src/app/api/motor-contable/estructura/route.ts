// src/app/api/motor-contable/estructura/route.ts
// ════════════════════════════════════════════════════════════════════════
// Paso 1 del flujo nuevo: SOLO parsea los balances y extrae la estructura.
// NO corre el motor ni genera Excel.
//
// CAMBIO SIESA: ahora (1) pasa el nombre de archivo al parser para inferir
// mes/año, y (2) acepta 'nit_manual' y 'empresa_manual' del formulario para
// cuando el balance no trae esa info (caso SIESA). Devuelve 'requiereDatos'
// para que el front sepa que debe pedir NIT/empresa antes de confirmar.
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

    // Recolectar archivos + sus NOMBRES (para inferir mes/año)
    const buffers: Buffer[] = []
    const nombres: string[] = []
    const balancePrincipal = formData.get('balance') as File | null
    if (!balancePrincipal) {
      return NextResponse.json({ error: 'Se requiere al menos un balance' }, { status: 400 })
    }
    buffers.push(Buffer.from(await balancePrincipal.arrayBuffer()))
    nombres.push(balancePrincipal.name ?? '')

    const numAdicionales = parseInt(formData.get('num_adicionales') as string ?? '0') || 0
    for (let i = 0; i < numAdicionales; i++) {
      const archivo = formData.get(`balance_adicional_${i}`) as File | null
      if (archivo) {
        buffers.push(Buffer.from(await archivo.arrayBuffer()))
        nombres.push(archivo.name ?? '')
      }
    }

    // Overrides manuales (para formatos sin metadata, ej. SIESA)
    const nitManual     = (formData.get('nit_manual') as string ?? '').trim()
    const empresaManual = (formData.get('empresa_manual') as string ?? '').trim()

    // Parsear (pasando los nombres para inferir período)
    const multiPeriodo = parsearBalancesMultiples(buffers, nombres)

    // Aplicar overrides si el balance no trajo la info o si el usuario la corrigió
    const empresaFinal = empresaManual || multiPeriodo.empresa
    const nitFinal      = nitManual     || multiPeriodo.nit

    // ¿El balance no trajo NIT/empresa reales? (caso SIESA) → avisar al front
    const empresaGenerica = !multiPeriodo.empresa || multiPeriodo.empresa.startsWith('EMPRESA (')
    const sinNit          = !multiPeriodo.nit
    const requiereDatos   = (empresaGenerica || sinNit) && (!empresaManual || !nitManual)

    // Extraer estructura del período más reciente
    const ultimoPeriodo = multiPeriodo.periodos[multiPeriodo.periodos.length - 1]
    const estructura = extraerEstructura(ultimoPeriodo)

    return NextResponse.json({
      ok: true,
      empresa: empresaFinal,
      nit:     nitFinal,
      // El front usa esto para pedir NIT/empresa editables antes de confirmar:
      requiereDatos,
      empresaGenerica,
      sinNit,
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