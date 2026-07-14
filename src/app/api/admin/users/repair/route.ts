// API Route: Reparar perfiles huérfanos (usuarios en auth sin perfil en profiles)
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(): Promise<NextResponse> {
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

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada' }, { status: 500 })
    }

    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Usar service client para el upsert (sin RLS)
    const serviceClient = createServiceClient()

    // Listar todos los usuarios de auth
    const { data: authUsers, error: listError } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
    })

    if (listError) throw listError

    let reparados = 0
    const detalle: string[] = []

    for (const authUser of authUsers.users) {
      const meta = authUser.user_metadata ?? {}
      const nombre = meta.nombre ?? meta.full_name ?? 'Usuario'
      const apellido = meta.apellido ?? ''
      const roleMeta = meta.role

      const roleValido = ['administrador', 'contador', 'cliente'].includes(roleMeta)
        ? (roleMeta as 'administrador' | 'contador' | 'cliente')
        : 'cliente'

      // Solo crear el perfil si NO existe (no sobrescribir perfiles existentes)
      const { data: existente } = await serviceClient
        .from('profiles')
        .select('id, activo')
        .eq('id', authUser.id)
        .maybeSingle()

      if (existente) {
        // Si existe pero está inactivo, solo activarlo sin cambiar rol ni datos
        if (!existente.activo) {
          const { error: activarError } = await serviceClient
            .from('profiles')
            .update({ activo: true })
            .eq('id', authUser.id)
          if (!activarError) {
            reparados++
            detalle.push(`Activado: ${authUser.email}`)
          }
        }
        // Si ya existe y está activo, no hacer nada
        continue
      }

      // Perfil no existe — crearlo
      const { error: insertError } = await serviceClient
        .from('profiles')
        .insert({
          id: authUser.id,
          email: authUser.email ?? '',
          nombre,
          apellido,
          role: roleValido,
          activo: true,
        })

      if (insertError) {
        detalle.push(`Error en ${authUser.email ?? authUser.id}: ${insertError.message}`)
      } else {
        reparados++
        detalle.push(`Creado: ${authUser.email} (${nombre} ${apellido}, rol: ${roleValido})`)
      }
    }

    return NextResponse.json({
      data: {
        total_auth_users: authUsers.users.length,
        reparados,
        detalle,
      },
    })
  } catch (error) {
    console.error('[API POST /admin/users/repair]', error)
    return NextResponse.json({ error: 'Error al reparar perfiles' }, { status: 500 })
  }
}
