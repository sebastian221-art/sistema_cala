// API Route: Actualizar / Eliminar tarea individual
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateSchema = z.object({
  titulo: z.string().min(3).max(200).optional(),
  descripcion: z.string().max(1000).optional(),
  tipo: z.enum([
    'documento_pendiente', 'declaracion_tributaria', 'revision_contable',
    'reunion', 'pago', 'envio_informacion', 'renovacion', 'otro'
  ]).optional(),
  prioridad: z.enum(['alta', 'media', 'baja']).optional(),
  status: z.enum(['pendiente', 'en_progreso', 'completada', 'cancelada']).optional(),
  fecha_limite: z.string().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  visible_cliente: z.boolean().optional(),
  notas: z.string().max(500).optional(),
})

// PUT /api/tasks/[id] - Actualizar tarea
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Error de validación" }, { status: 400 })
    }

    const updates: Record<string, unknown> = { ...parsed.data }

    // Si se está completando, registrar fecha
    if (parsed.data.status === 'completada') {
      updates.completada_en = new Date().toISOString()
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        client:clients!tasks_client_id_fkey(id, nit, razon_social),
        creator:profiles!tasks_created_by_fkey(id, nombre, apellido),
        assignee:profiles!tasks_assigned_to_fkey(id, nombre, apellido)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ data: task })
  } catch (error) {
    console.error('PUT /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar tarea' }, { status: 500 })
  }
}

// DELETE /api/tasks/[id] - Soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { error } = await supabase
      .from('tasks')
      .update({ activo: false })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ message: 'Tarea eliminada' })
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar tarea' }, { status: 500 })
  }
}
