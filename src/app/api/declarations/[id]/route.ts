// API Route: Actualizar declaración y obtener historial
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateSchema = z.object({
  status: z.enum([
    'pendiente_info', 'en_proceso', 'lista_revisar',
    'presentada', 'pagada', 'no_aplica', 'rechazada'
  ]).optional(),
  monto_impuesto: z.number().nonnegative().nullable().optional(),
  monto_sanciones: z.number().nonnegative().nullable().optional(),
  monto_total: z.number().nonnegative().nullable().optional(),
  formulario: z.string().max(20).nullable().optional(),
  numero_radicado: z.string().max(50).nullable().optional(),
  fecha_presentacion: z.string().nullable().optional(),
  fecha_pago: z.string().nullable().optional(),
  notas_internas: z.string().max(1000).nullable().optional(),
  notas_cliente: z.string().max(1000).nullable().optional(),
  info_solicitada: z.string().max(500).nullable().optional(),
  fecha_vencimiento: z.string().nullable().optional(),
  comentario_historial: z.string().max(300).optional(), // Solo para registrar en historial
})

// GET /api/declarations/[id] - Obtener detalle con historial
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: decl, error } = await supabase
      .from('declarations')
      .select(`
        *,
        client:clients!declarations_client_id_fkey(id, nit, razon_social, email, whatsapp),
        contador:profiles!declarations_contador_id_fkey(id, nombre, apellido),
        history:declaration_history(
          *,
          changer:profiles!declaration_history_changed_by_fkey(id, nombre, apellido)
        )
      `)
      .eq('id', id)
      .single()

    if (error || !decl) {
      return NextResponse.json({ error: 'Declaración no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ data: decl })
  } catch (error) {
    console.error('GET /api/declarations/[id]:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// PUT /api/declarations/[id] - Actualizar declaración
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role === 'cliente') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Error de validación' },
        { status: 400 }
      )
    }

    const { comentario_historial, ...updateData } = parsed.data

    // Recalcular total si cambian montos
    if (updateData.monto_impuesto !== undefined || updateData.monto_sanciones !== undefined) {
      const { data: current } = await supabase
        .from('declarations').select('monto_impuesto, monto_sanciones').eq('id', id).single()
      const impuesto = updateData.monto_impuesto ?? current?.monto_impuesto ?? 0
      const sanciones = updateData.monto_sanciones ?? current?.monto_sanciones ?? 0
      if (impuesto !== null && sanciones !== null) {
        updateData.monto_total = (impuesto ?? 0) + (sanciones ?? 0)
      }
    }

    // Registrar fecha de pago automáticamente
    if (updateData.status === 'pagada' && !updateData.fecha_pago) {
      updateData.fecha_pago = new Date().toISOString().split('T')[0]
    }
    if (updateData.status === 'presentada' && !updateData.fecha_presentacion) {
      updateData.fecha_presentacion = new Date().toISOString().split('T')[0]
    }

    const { data: decl, error } = await supabase
      .from('declarations')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        client:clients!declarations_client_id_fkey(id, nit, razon_social),
        contador:profiles!declarations_contador_id_fkey(id, nombre, apellido)
      `)
      .single()

    if (error) throw error

    // Agregar comentario al historial si se proveyó
    if (comentario_historial && updateData.status) {
      await supabase.from('declaration_history').insert({
        declaration_id: id,
        status_nuevo: updateData.status,
        comentario: comentario_historial,
        changed_by: user.id,
      })
    }

    return NextResponse.json({ data: decl })
  } catch (error) {
    console.error('PUT /api/declarations/[id]:', error)
    return NextResponse.json({ error: 'Error al actualizar declaración' }, { status: 500 })
  }
}

// DELETE /api/declarations/[id] - Soft delete
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { error } = await supabase
      .from('declarations').update({ activo: false }).eq('id', id)
    if (error) throw error

    return NextResponse.json({ message: 'Declaración eliminada' })
  } catch (error) {
    console.error('DELETE /api/declarations/[id]:', error)
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  }
}
