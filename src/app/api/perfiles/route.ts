// src/app/api/perfiles/route.ts
// ════════════════════════════════════════════════════════════════════════
// API de perfiles de cliente.
//
//   GET  /api/perfiles?nit=901863483-5
//        → devuelve el perfil guardado (si existe) + lista de casos_tipo
//
//   POST /api/perfiles
//        body: { accion: 'guardar' | 'generar' | 'corregir', ... }
//        - 'generar'  → llama a la IA para crear un perfil desde instrucciones
//        - 'corregir' → ajusta un perfil existente con una corrección
//        - 'guardar'  → persiste el perfil del cliente (y opcionalmente como caso_tipo)
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generarPerfilConIA,
  corregirPerfilConIA,
  type ProveedorIA,
} from '@/lib/perfiles/generarPerfil'
import {
  ordenarPorSimilitud,
  PERFIL_DEFECTO,
  type CasoTipo,
  type PerfilCliente,
} from '@/lib/perfiles/calcularSimilitud'
import type { EstructuraCliente } from '@/lib/motor-contable/extraerEstructura'

export const runtime     = 'nodejs'
export const maxDuration = 60

// Proveedor de IA por defecto. Cambia a 'deepseek' si configuras la key.
const PROVEEDOR_IA: ProveedorIA = 'groq'

// ════════════════════════════════════════════════════════════════════════
// GET — buscar perfil por NIT + traer casos_tipo para similitud
// ════════════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const nit = req.nextUrl.searchParams.get('nit')

    // Perfil específico del cliente (si ya existe)
    let perfilCliente: { perfil_json: PerfilCliente; nombre_empresa: string; instrucciones_contador: string | null } | null = null
    if (nit) {
      const { data } = await supabase
        .from('perfiles_cliente')
        .select('perfil_json, nombre_empresa, instrucciones_contador')
        .eq('nit', nit)
        .maybeSingle()
      perfilCliente = data ?? null
    }

    // Todos los casos tipo (para calcular similitud en el cliente)
    const { data: casos } = await supabase
      .from('casos_tipo')
      .select('*')
      .order('veces_usado', { ascending: false })

    return NextResponse.json({
      ok: true,
      perfilExistente: perfilCliente,
      casos: (casos ?? []) as CasoTipo[],
    })

  } catch (error) {
    console.error('[GET /api/perfiles]', error)
    return NextResponse.json({ error: 'Error al buscar perfil' }, { status: 500 })
  }
}

// ════════════════════════════════════════════════════════════════════════
// POST — generar / corregir / guardar
// ════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const accion: string = body.accion

    // ── GENERAR perfil nuevo con IA ──────────────────────────────────────
    if (accion === 'generar') {
      const estructura: EstructuraCliente = body.estructura
      const instrucciones: string = body.instrucciones ?? ''
      const casosSimilares = (body.casos ?? []) as CasoTipo[]

      if (!estructura) {
        return NextResponse.json({ error: 'Falta la estructura' }, { status: 400 })
      }

      // Calcular similitud con casos existentes
      const similares = ordenarPorSimilitud(estructura, casosSimilares)

      const { perfil, raw, proveedor } = await generarPerfilConIA(
        estructura, instrucciones, PROVEEDOR_IA
      )

      return NextResponse.json({
        ok: true,
        perfil,
        similares,
        debug: { proveedor, raw: raw.slice(0, 500) },
      })
    }

    // ── CORREGIR perfil con una indicación del contador ──────────────────
    if (accion === 'corregir') {
      const estructura: EstructuraCliente = body.estructura
      const perfilActual: PerfilCliente   = body.perfil ?? PERFIL_DEFECTO
      const correccion: string            = body.correccion ?? ''

      if (!correccion.trim()) {
        return NextResponse.json({ error: 'Falta la corrección' }, { status: 400 })
      }

      const { perfil, raw } = await corregirPerfilConIA(
        estructura, perfilActual, correccion, PROVEEDOR_IA
      )

      return NextResponse.json({ ok: true, perfil, debug: { raw: raw.slice(0, 500) } })
    }

    // ── GUARDAR perfil del cliente (y opcionalmente como caso_tipo) ──────
    if (accion === 'guardar') {
      const nit: string                 = body.nit
      const nombreEmpresa: string        = body.nombre_empresa
      const perfil: PerfilCliente        = body.perfil
      const instrucciones: string        = body.instrucciones ?? ''
      const prefijos: string[]           = body.prefijos ?? []
      const guardarComoCaso: boolean     = body.guardar_como_caso ?? false
      const nombreCaso: string           = body.nombre_caso ?? ''
      const descripcionCaso: string      = body.descripcion_caso ?? ''
      const casoTipoIdUsado: string|null = body.caso_tipo_id ?? null

      if (!nit || !perfil) {
        return NextResponse.json({ error: 'Faltan nit o perfil' }, { status: 400 })
      }

      // Upsert del perfil del cliente
      const { data: perfilGuardado, error: errPerfil } = await supabase
        .from('perfiles_cliente')
        .upsert({
          nit,
          nombre_empresa:         nombreEmpresa,
          perfil_json:            perfil,
          instrucciones_contador: instrucciones,
          caso_tipo_id:           casoTipoIdUsado,
          actualizado_en:         new Date().toISOString(),
        }, { onConflict: 'nit' })
        .select()
        .single()

      if (errPerfil) {
        console.error('[guardar perfil]', errPerfil)
        return NextResponse.json({ error: errPerfil.message }, { status: 500 })
      }

      // Si se reutilizó un caso tipo, incrementar su contador de uso
      if (casoTipoIdUsado) {
        await supabase.rpc('incrementar_uso_caso', { caso_id: casoTipoIdUsado })
          .then(undefined, () => { /* RPC opcional, ignorar si no existe */ })
      }

      // Guardar como nuevo caso_tipo en la biblioteca
      if (guardarComoCaso && nombreCaso.trim()) {
        await supabase.from('casos_tipo').insert({
          nombre:           nombreCaso.trim(),
          descripcion:      descripcionCaso.trim() || `Generado desde ${nombreEmpresa}`,
          prefijos_cuentas: prefijos,
          perfil_json:      perfil,
          veces_usado:      1,
        })
      }

      return NextResponse.json({ ok: true, perfil: perfilGuardado })
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })

  } catch (error) {
    console.error('[POST /api/perfiles]', error)
    return NextResponse.json({ error: 'Error procesando la solicitud' }, { status: 500 })
  }
}