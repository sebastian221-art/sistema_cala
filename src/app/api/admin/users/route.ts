// API Route: Gestión de usuarios (solo administrador)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { z } from 'zod'

const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  nombre: z.string().min(2, 'Nombre requerido'),
  apellido: z.string().min(1, 'Apellido requerido'),
  role: z.enum(['administrador', 'contador', 'cliente']),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

// GET /api/admin/users - Listar usuarios
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'administrador') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { data: users } = await supabase
      .from('profiles')
      .select('id, nombre, apellido, role, activo, created_at, email')
      .order('role')
      .order('nombre')

    return NextResponse.json({ data: users ?? [] })
  } catch (error) {
    console.error('[API GET /admin/users]', error)
    return NextResponse.json({ error: 'Error al obtener usuarios' }, { status: 500 })
  }
}

// POST /api/admin/users - Crear usuario
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'administrador') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const result = createUserSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 }
      )
    }

    const { email, nombre, apellido, role, password } = result.data

    // Usar Supabase Admin client para crear el usuario en auth
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json(
        { error: 'Configuración del servidor incompleta. Se requiere SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      )
    }

    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Crear usuario en auth con metadata para el trigger handle_new_user
    const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido, role },
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
      }
      // Error de autorización = Service Role Key inválida
      if (authError.status === 401 || (authError as { code?: string }).code === 'no_authorization') {
        return NextResponse.json(
          {
            error:
              'La variable SUPABASE_SERVICE_ROLE_KEY no es válida o es incorrecta. ' +
              'Ve a Supabase → Project Settings → API → Service Role Key y cópiala en tu archivo .env.local',
          },
          { status: 500 }
        )
      }
      // Error de base de datos = trigger handle_new_user está fallando
      const isDbError =
        (authError as { code?: string }).code === 'unexpected_failure' ||
        authError.message?.toLowerCase().includes('database error')
      if (isDbError) {
        return NextResponse.json(
          {
            error:
              'Error en el trigger de base de datos (handle_new_user). ' +
              'Ve a Configuración → Estado del Sistema y ejecuta el SQL de reparación en Supabase → SQL Editor.',
          },
          { status: 500 }
        )
      }
      throw authError
    }

    // El trigger handle_new_user crea automáticamente el perfil en profiles.
    // Verificar/actualizar el perfil creado por el trigger
    if (newAuthUser.user) {
      await supabase
        .from('profiles')
        .update({ nombre, apellido, role, email })
        .eq('id', newAuthUser.user.id)
    }

    return NextResponse.json(
      { data: { id: newAuthUser.user?.id, email, nombre, apellido, role } },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API POST /admin/users]', error)
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 })
  }
}
