// API Route: Operaciones por ID de cliente (GET, PUT, DELETE)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { ApiResponse, Client } from '@/types'

const updateClientSchema = z.object({
  nit: z.string().min(8).max(15).optional(),
  razon_social: z.string().min(2).max(200).optional(),
  tipo: z.enum(['persona_natural', 'persona_juridica']).optional(),
  actividad_economica: z.string().optional(),
  codigo_ciiu: z.string().optional(),
  direccion: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional(),
  whatsapp: z.string().optional(),
  activo: z.boolean().optional(),
  contador_id: z.string().uuid().optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/clients/[id] - Obtener cliente por ID
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<Client>>> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: client, error } = await supabase
      .from('clients')
      .select(`
        *,
        contador:profiles!clients_contador_id_fkey(id, nombre, apellido, email, telefono),
        tax_obligations(*),
        rut_files(id, file_url, uploaded_at, version)
      `)
      .eq('id', id)
      .single()

    if (error || !client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ data: client as unknown as Client })
  } catch (error) {
    console.error('[API GET /clients/[id]]', error)
    return NextResponse.json({ error: 'Error al obtener cliente' }, { status: 500 })
  }
}

// PUT /api/clients/[id] - Actualizar cliente
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<Client>>> {
  try {
    const { id } = await params
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

    if (!profile || !['contador', 'administrador'].includes(profile.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = updateClientSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0]?.message },
        { status: 400 }
      )
    }

    const updateData = { ...validationResult.data }

    // Solo admins pueden cambiar el contador asignado
    if (updateData.contador_id && profile.role !== 'administrador') {
      delete updateData.contador_id
    }

    const { data: updatedClient, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Log de auditoría
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      accion: 'actualizó cliente',
      tabla: 'clients',
      registro_id: id,
      datos_nuevos: validationResult.data,
    })

    return NextResponse.json({ data: updatedClient as Client })
  } catch (error) {
    console.error('[API PUT /clients/[id]]', error)
    return NextResponse.json({ error: 'Error al actualizar cliente' }, { status: 500 })
  }
}

// DELETE /api/clients/[id] - Soft delete (desactivar)
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const { id } = await params
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
      return NextResponse.json({ error: 'Solo el administrador puede eliminar clientes' }, { status: 403 })
    }

    // Soft delete - desactivar en lugar de eliminar
    await supabase
      .from('clients')
      .update({ activo: false })
      .eq('id', id)

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      accion: 'desactivó cliente',
      tabla: 'clients',
      registro_id: id,
    })

    return NextResponse.json({ data: null, message: 'Cliente desactivado correctamente' })
  } catch (error) {
    console.error('[API DELETE /clients/[id]]', error)
    return NextResponse.json({ error: 'Error al eliminar cliente' }, { status: 500 })
  }
}
