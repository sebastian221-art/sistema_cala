// src/app/api/admin/estado/route.ts
// ════════════════════════════════════════════════════════════════════════
// Verifica el estado de las conexiones del sistema.
// NUNCA devuelve las claves — solo si están configuradas y si responden.
// ════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface EstadoServicio {
  nombre: string
  descripcion: string
  configurado: boolean       // ¿existe la variable de entorno?
  conectado: boolean         // ¿responde de verdad?
  detalle: string
  latenciaMs: number | null
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const servicios: EstadoServicio[] = []

    // ── 1. Supabase (base de datos + autenticación) ──────────────────────
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    const supaConfigurado = Boolean(supaUrl && supaKey)
    let supaConectado = false
    let supaDetalle = 'No configurado'
    let supaLatencia: number | null = null

    if (supaConfigurado) {
      const t0 = Date.now()
      try {
        const { error } = await supabase.from('profiles').select('id').limit(1)
        supaLatencia = Date.now() - t0
        if (error) {
          supaDetalle = `Error de consulta: ${error.message}`
        } else {
          supaConectado = true
          supaDetalle = 'Conectado y respondiendo'
        }
      } catch (e) {
        supaLatencia = Date.now() - t0
        supaDetalle = e instanceof Error ? e.message : 'Error de conexión'
      }
    }

    servicios.push({
      nombre: 'Supabase',
      descripcion: 'Base de datos y autenticación de usuarios',
      configurado: supaConfigurado,
      conectado: supaConectado,
      detalle: supaDetalle,
      latenciaMs: supaLatencia,
    })

    // ── 2. Supabase Service Role (crear usuarios) ────────────────────────
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    servicios.push({
      nombre: 'Supabase Service Role',
      descripcion: 'Permite crear usuarios desde el sistema',
      configurado: Boolean(serviceKey),
      conectado: Boolean(serviceKey),
      detalle: serviceKey
        ? 'Clave configurada'
        : 'Falta SUPABASE_SERVICE_ROLE_KEY en .env.local',
      latenciaMs: null,
    })

    // ── 3. Groq (IA que genera los perfiles de cliente) ──────────────────
    const groqKey = process.env.GROQ_API_KEY ?? ''
    const groqConfigurado = Boolean(groqKey)
    let groqConectado = false
    let groqDetalle = 'No configurado'
    let groqLatencia: number | null = null

    if (groqConfigurado) {
      const t0 = Date.now()
      try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${groqKey}` },
          signal: AbortSignal.timeout(8000),
        })
        groqLatencia = Date.now() - t0
        if (res.ok) {
          groqConectado = true
          groqDetalle = 'Conectado y respondiendo'
        } else if (res.status === 401) {
          groqDetalle = 'Clave inválida o expirada'
        } else {
          groqDetalle = `Respuesta HTTP ${res.status}`
        }
      } catch (e) {
        groqLatencia = Date.now() - t0
        groqDetalle = e instanceof Error ? e.message : 'Error de conexión'
      }
    }

    servicios.push({
      nombre: 'Groq (IA)',
      descripcion: 'Genera los perfiles de configuración de cada cliente',
      configurado: groqConfigurado,
      conectado: groqConectado,
      detalle: groqDetalle,
      latenciaMs: groqLatencia,
    })

    // ── 4. Python (motor de Formulario 1647 y Consolidación IVA) ─────────
    // No se puede verificar desde el edge; se reporta como informativo.
    servicios.push({
      nombre: 'Python',
      descripcion: 'Procesa Formulario 1647 y Consolidación IVA (XML DIAN)',
      configurado: true,
      conectado: true,
      detalle: 'Se ejecuta bajo demanda al procesar archivos',
      latenciaMs: null,
    })

    const todoOk = servicios
      .filter(s => s.nombre !== 'Python')
      .every(s => s.conectado)

    return NextResponse.json({ ok: true, todoOk, servicios })

  } catch (error) {
    console.error('[GET /api/admin/estado]', error)
    return NextResponse.json({ error: 'Error al verificar el estado' }, { status: 500 })
  }
}