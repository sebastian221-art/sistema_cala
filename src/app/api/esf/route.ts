// src/app/api/esf/route.ts
// ════════════════════════════════════════════════════════════════════════
// Guarda y lista los ESF generados por cliente (para re-descargar).
//   POST { nit, nombre_empresa, mes, anio, label, excel_base64 } → guarda
//   GET  ?nit=XXX  → lista los ESF de ese cliente (sin el base64, liviano)
//   GET  ?id=YYY   → devuelve UN esf con su excel_base64 (para descargar)
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime     = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const { nit, nombre_empresa, mes, anio, label, excel_base64 } = body
    if (!nit || !excel_base64) {
      return NextResponse.json({ error: 'Faltan nit o excel' }, { status: 400 })
    }

    const { error } = await supabase.from('esf_guardados').insert({
      nit,
      nombre_empresa: nombre_empresa ?? null,
      mes: mes ?? null,
      anio: anio ?? null,
      label: label ?? null,
      excel_base64,
    })
    if (error) {
      console.error('[esf guardar]', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id  = searchParams.get('id')
    const nit = searchParams.get('nit')

    // Un ESF específico con su base64 (para descargar)
    if (id) {
      const { data, error } = await supabase
        .from('esf_guardados')
        .select('id, nit, nombre_empresa, label, mes, anio, excel_base64')
        .eq('id', id)
        .single()
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 })
      return NextResponse.json({ ok: true, esf: data })
    }

    // Lista por cliente (SIN base64, para que sea liviano)
    if (nit) {
      const { data, error } = await supabase
        .from('esf_guardados')
        .select('id, nit, nombre_empresa, label, mes, anio, creado_en')
        .eq('nit', nit)
        .order('creado_en', { ascending: false })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, esfs: data ?? [] })
    }

    return NextResponse.json({ ok: false, error: 'Falta nit o id' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}