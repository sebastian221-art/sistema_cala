// src/app/api/admin/usuarios/route.ts
// ════════════════════════════════════════════════════════════════════════
// Gestión de usuarios del sistema. Solo para el rol 'administrador'.
//
//   GET    → lista los usuarios (profiles)
//   POST   → crea un usuario nuevo (auth + profile)
//   PATCH  → activa / desactiva un usuario, o cambia su rol
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROLES_VALIDOS = ['administrador', 'contador', 'cliente'] as const

// Cliente con permisos de admin (service_role). Solo en el servidor.
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local')
  }
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Verifica que quien llama sea administrador
async function verificarAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', status: 401 as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'administrador') {
    return { error: 'Solo el administrador puede gestionar usuarios', status: 403 as const }
  }
  return { supabase, user }
}

// ════════════════════════════════════════════════════════════════════════
// GET — listar usuarios
// ════════════════════════════════════════════════════════════════════════
export async function GET(): Promise<NextResponse> {
  const check = await verificarAdmin()
  if ('error' in check) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  const { data, error } = await check.supabase
    .from('profiles')
    .select('id, email, nombre, apellido, role, telefono, activo, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/admin/usuarios]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, usuarios: data ?? [] })
}

// ════════════════════════════════════════════════════════════════════════
// POST — crear usuario
// ════════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest): Promise<NextResponse> {
  const check = await verificarAdmin()
  if ('error' in check) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  try {
    const body = await req.json()
    const email    = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const nombre   = String(body.nombre ?? '').trim()
    const apellido = String(body.apellido ?? '').trim()
    const telefono = String(body.telefono ?? '').trim()
    const role     = String(body.role ?? 'contador')

    // Validaciones
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Correo inválido' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }
    if (!nombre || !apellido) {
      return NextResponse.json({ error: 'Nombre y apellido son obligatorios' }, { status: 400 })
    }
    if (!ROLES_VALIDOS.includes(role as typeof ROLES_VALIDOS[number])) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
    }

    const admin = adminClient()

    // 1. Crear el usuario en auth
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,   // sin correo de confirmación
    })

    if (authError) {
      const msg = authError.message.includes('already')
        ? 'Ya existe un usuario con ese correo'
        : authError.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    if (!authData.user) {
      return NextResponse.json({ error: 'No se pudo crear el usuario' }, { status: 500 })
    }

    // 2. Crear la fila en profiles.
    //    (el trigger handle_new_user no se dispara al crear desde admin API)
    const { error: profileError } = await admin.from('profiles').insert({
      id:       authData.user.id,
      email,
      nombre,
      apellido,
      role,
      telefono: telefono || null,
      activo:   true,
    })

    if (profileError) {
      // Rollback: si falla el profile, borrar el usuario de auth
      await admin.auth.admin.deleteUser(authData.user.id)
      console.error('[POST /api/admin/usuarios] profile:', profileError)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      usuario: { id: authData.user.id, email, nombre, apellido, role, activo: true },
    }, { status: 201 })

  } catch (error) {
    console.error('[POST /api/admin/usuarios]', error)
    const msg = error instanceof Error ? error.message : 'Error al crear el usuario'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ════════════════════════════════════════════════════════════════════════
// PATCH — activar/desactivar o cambiar rol
// ════════════════════════════════════════════════════════════════════════
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const check = await verificarAdmin()
  if ('error' in check) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  try {
    const body = await req.json()
    const id = String(body.id ?? '')
    if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

    // No permitir que el admin se desactive a sí mismo
    if (id === check.user.id && body.activo === false) {
      return NextResponse.json(
        { error: 'No puedes desactivar tu propia cuenta' },
        { status: 400 }
      )
    }

    const cambios: Record<string, unknown> = {}
    if (typeof body.activo === 'boolean') cambios.activo = body.activo
    if (body.role && ROLES_VALIDOS.includes(body.role)) cambios.role = body.role

    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const { error } = await check.supabase
      .from('profiles')
      .update(cambios)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error('[PATCH /api/admin/usuarios]', error)
    return NextResponse.json({ error: 'Error al actualizar el usuario' }, { status: 500 })
  }
}