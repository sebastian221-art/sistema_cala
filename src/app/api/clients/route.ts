// API Route: CRUD de clientes
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { ApiResponse, Client, PaginatedResponse } from '@/types'

// Schema de validación para crear/actualizar cliente
const clientSchema = z.object({
  nit: z.string().min(8, 'NIT inválido').max(15),
  razon_social: z.string().min(2, 'Razón social requerida').max(200),
  tipo: z.enum(['persona_natural', 'persona_juridica']),
  actividad_economica: z.string().optional(),
  codigo_ciiu: z.string().optional(),
  direccion: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefono: z.string().optional(),
  whatsapp: z.string().optional(),
  // contador_id es opcional: si no viene o viene 'current', se asigna el usuario autenticado
  contador_id: z.string().optional(),
})

// GET /api/clients - Listar clientes con paginación y filtros
export async function GET(request: NextRequest): Promise<NextResponse> {
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

    if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

    // Parámetros de búsqueda y paginación
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') ?? '1')
    const perPage = parseInt(searchParams.get('per_page') ?? '25')
    const search = searchParams.get('search') ?? ''
    const activo = searchParams.get('activo')

    const from = (page - 1) * perPage
    const to = from + perPage - 1

    let query = supabase
      .from('clients')
      .select(
        `
        id, nit, razon_social, tipo, actividad_economica,
        email, telefono, whatsapp, activo, created_at,
        contador:profiles!clients_contador_id_fkey(id, nombre, apellido),
        tax_obligations(id, tipo_impuesto, activo)
      `,
        { count: 'exact' }
      )
      .range(from, to)
      .order('razon_social')

    // Filtrar por rol
    if (profile.role === 'contador') {
      query = query.eq('contador_id', user.id)
    }

    // Filtros opcionales
    if (search) {
      query = query.or(`razon_social.ilike.%${search}%,nit.ilike.%${search}%`)
    }

    if (activo !== null && activo !== undefined && activo !== '') {
      query = query.eq('activo', activo === 'true')
    }

    const { data, error, count } = await query

    if (error) throw error

    const response: PaginatedResponse<Client> = {
      data: data as unknown as Client[],
      total: count ?? 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count ?? 0) / perPage),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[API GET /clients]', error)
    return NextResponse.json({ error: 'Error al obtener clientes' }, { status: 500 })
  }
}

// POST /api/clients - Crear nuevo cliente
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<Client>>> {
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

    if (!profile || !['contador', 'administrador'].includes(profile.role)) {
      return NextResponse.json({ error: 'Sin permisos para crear clientes' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = clientSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: validationResult.error.issues[0]?.message },
        { status: 400 }
      )
    }

    const clientData = validationResult.data

    // Resolver contador_id: si no viene o es 'current', usar el usuario autenticado
    const contadorId =
      !clientData.contador_id || clientData.contador_id === 'current'
        ? user.id
        : clientData.contador_id

    // Si es contador, solo puede asignar clientes a sí mismo
    if (profile.role === 'contador' && contadorId !== user.id) {
      return NextResponse.json(
        { error: 'Solo puedes crear clientes asignados a ti mismo' },
        { status: 403 }
      )
    }

    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({
        ...clientData,
        contador_id: contadorId,
        email: clientData.email || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe un cliente con ese NIT' },
          { status: 409 }
        )
      }
      throw error
    }

    // Log de auditoría
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      accion: 'creó cliente',
      tabla: 'clients',
      registro_id: newClient.id,
      datos_nuevos: clientData,
    })

    return NextResponse.json({ data: newClient as Client }, { status: 201 })
  } catch (error) {
    console.error('[API POST /clients]', error)
    return NextResponse.json({ error: 'Error al crear cliente' }, { status: 500 })
  }
}
