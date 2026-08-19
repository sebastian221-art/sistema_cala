// src/app/api/esf/route.ts
// ════════════════════════════════════════════════════════════════════════
// Guarda, lista, descarga y REGENERA los ESF por cliente.
//   POST body.accion='guardar'  → guarda ESF + perfil + balances
//   POST body.accion='regenerar'→ regenera un ESF guardado con perfil corregido
//                                  (o agregando balances nuevos) y lo devuelve
//   GET  ?nit=XXX  → lista (liviano, sin base64)
//   GET  ?id=YYY   → un ESF con su excel_base64 (descargar)
//   GET  ?id=YYY&full=1 → un ESF con perfil + balances (para regenerar/editar)
//   DELETE ?id=YYY → borra un ESF guardado
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsearBalancesMultiples } from '@/lib/motor-contable/parser'
import { procesarBalances } from '@/lib/motor-contable/motor'
import { generarTanda1 } from '@/lib/motor-contable/esf'
import { extraerEstructura } from '@/lib/motor-contable/extraerEstructura'
import { corregirPerfilConIA } from '@/lib/perfiles/generarPerfil'

export const runtime     = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const accion = body.accion ?? 'guardar'

    // ── GUARDAR: ESF + perfil + balances ──
    if (accion === 'guardar') {
      const { nit, nombre_empresa, mes, anio, label, excel_base64, perfil_json, balances_json } = body
      if (!nit || !excel_base64) {
        return NextResponse.json({ error: 'Faltan nit o excel' }, { status: 400 })
      }
      const { error } = await supabase.from('esf_guardados').insert({
        nit, nombre_empresa: nombre_empresa ?? null,
        mes: mes ?? null, anio: anio ?? null, label: label ?? null,
        excel_base64,
        perfil_json:   perfil_json   ?? null,
        balances_json: balances_json ?? null,
      })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── REGENERAR: toma un ESF guardado, aplica perfil corregido y/o balances
    //    nuevos, regenera el Excel y (opcional) lo guarda como nuevo. ──
    if (accion === 'regenerar') {
      const { id, perfil_corregido, balances_extra, guardar_nuevo } = body
      if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

      const { data: esf, error: e1 } = await supabase
        .from('esf_guardados')
        .select('nit, nombre_empresa, perfil_json, balances_json')
        .eq('id', id).single()
      if (e1 || !esf) return NextResponse.json({ ok: false, error: 'ESF no encontrado' }, { status: 404 })
      if (!esf.balances_json) {
        return NextResponse.json({ ok: false, error: 'Este ESF no tiene balances guardados (fue creado antes de esta función). Genéralo de nuevo para poder regenerarlo.' }, { status: 400 })
      }

      // Reconstruir buffers de los balances guardados + los nuevos (si hay)
      const balancesTodos = [...(esf.balances_json as any[]), ...((balances_extra as any[]) ?? [])]
      const buffers = balancesTodos.map(b => Buffer.from(b.base64, 'base64'))
      const nombres = balancesTodos.map(b => b.nombre ?? '')

      const multi = parsearBalancesMultiples(buffers, nombres)
      let perfil: any = perfil_corregido ?? esf.perfil_json ?? undefined

      // Si la contadora escribió una corrección en texto, la IA ajusta el perfil
      if (body.correccion && String(body.correccion).trim()) {
        try {
          const ult = multi.periodos[multi.periodos.length - 1]
          const estructura = extraerEstructura(ult)
          perfil = await corregirPerfilConIA(estructura, perfil ?? {}, String(body.correccion))
        } catch (err) {
          return NextResponse.json({ ok: false, error: 'La IA no pudo aplicar la corrección: ' + (err instanceof Error ? err.message : '') }, { status: 500 })
        }
      }

      const resultado = procesarBalances(multi, perfil)
      const wb = generarTanda1(resultado)

      const buf = await wb.xlsx.writeBuffer()
      const excel_base64 = Buffer.from(buf).toString('base64')

      // Guardar como nuevo registro si se pidió
      if (guardar_nuevo) {
        const p = multi.periodos[multi.periodos.length - 1]
        await supabase.from('esf_guardados').insert({
          nit: esf.nit, nombre_empresa: esf.nombre_empresa,
          mes: p?.metadata.mes ?? null, anio: p?.metadata.anio ?? null,
          label: p ? `${p.metadata.mes}/${p.metadata.anio}` : null,
          excel_base64, perfil_json: perfil, balances_json: balancesTodos,
        })
      }

      return NextResponse.json({
        ok: true, excel_base64,
        advertencias: resultado.advertencias,
        periodos: multi.periodos.map(p => ({ mes: p.metadata.mes, anio: p.metadata.anio })),
      })
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  } catch (e) {
    console.error('[esf POST]', e)
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
    const full = searchParams.get('full')

    if (id) {
      const cols = full
        ? 'id, nit, nombre_empresa, label, mes, anio, excel_base64, perfil_json, balances_json'
        : 'id, nit, nombre_empresa, label, mes, anio, excel_base64'
      const { data, error } = await supabase.from('esf_guardados').select(cols).eq('id', id).single()
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 })
      return NextResponse.json({ ok: true, esf: data })
    }
    if (nit) {
      const { data, error } = await supabase.from('esf_guardados')
        .select('id, nit, nombre_empresa, label, mes, anio, creado_en, balances_json')
        .eq('nit', nit).order('creado_en', { ascending: false })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      // marcar cuáles se pueden regenerar (tienen balances)
      const esfs = (data ?? []).map((x: any) => ({
        ...x, regenerable: !!x.balances_json, balances_json: undefined,
      }))
      return NextResponse.json({ ok: true, esfs })
    }
    return NextResponse.json({ ok: false, error: 'Falta nit o id' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const { error } = await supabase.from('esf_guardados').delete().eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}