// API Route: CRUD de Tareas
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const taskSchema = z.object({
  titulo: z.string().min(3, 'Título muy corto').max(200),
  descripcion: z.string().max(1000).optional(),
  tipo: z.enum([
    'documento_pendiente', 'declaracion_tributaria', 'revision_contable',
    'reunion', 'pago', 'envio_informacion', 'renovacion', 'otro'
  ]),
  prioridad: z.enum(['alta', 'media', 'baja']).default('media'),
  fecha_limite: z.string().optional(),
  client_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  visible_cliente: z.boolean().default(false),
  notas: z.string().max(500).optional(),
})

// GET /api/tasks - Listar tareas
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const client_id = searchParams.get('client_id')
    const prioridad = searchParams.get('prioridad')
    const vencidas = searchParams.get('vencidas') === 'true'

    let query = supabase
      .from('tasks')
      .select(`
        *,
        client:clients!tasks_client_id_fkey(id, nit, razon_social),
        creator:profiles!tasks_created_by_fkey(id, nombre, apellido),
        assignee:profiles!tasks_assigned_to_fkey(id, nombre, apellido)
      `)
      .eq('activo', true)
      .order('fecha_limite', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    // Filtros por rol
    if (profile.role === 'contador') {
      query = query.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
    } else if (profile.role === 'cliente') {
      query = query.eq('visible_cliente', true)
    }

    // Filtros opcionales
    if (status) query = query.eq('status', status)
    if (client_id) query = query.eq('client_id', client_id)
    if (prioridad) query = query.eq('prioridad', prioridad)
    if (vencidas) {
      const hoy = new Date().toISOString().split('T')[0]
      query = query.lt('fecha_limite', hoy).neq('status', 'completada').neq('status', 'cancelada')
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('GET /api/tasks error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// POST /api/tasks - Crear tarea
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role === 'cliente') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = taskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Error de validación" }, { status: 400 })
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({ ...parsed.data, created_by: user.id })
      .select(`
        *,
        client:clients!tasks_client_id_fkey(id, nit, razon_social),
        creator:profiles!tasks_created_by_fkey(id, nombre, apellido),
        assignee:profiles!tasks_assigned_to_fkey(id, nombre, apellido)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ data: task }, { status: 201 })
  } catch (error) {
    console.error('POST /api/tasks error:', error)
    return NextResponse.json({ error: 'Error al crear tarea' }, { status: 500 })
  }
}
