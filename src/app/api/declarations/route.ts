// API Route: Seguimiento de declaraciones tributarias
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const declarationSchema = z.object({
  client_id: z.string().uuid(),
  tipo_impuesto: z.enum([
    'IVA_BIMESTRAL', 'IVA_CUATRIMESTRAL', 'IVA_ANUAL',
    'RETENCION_FUENTE_MENSUAL', 'RENTA_ANUAL', 'RENTA_BIMESTRAL_ANTICIPO',
    'ICA_BIMESTRAL', 'ICA_TRIMESTRAL', 'ICA_ANUAL',
    'EXOGENA_ANUAL', 'RETENCION_ICA_BIMESTRAL',
    'PATRIMONIO_ANUAL', 'GMF', 'OTROS'
  ]),
  periodo_mes: z.number().int().min(1).max(12).optional(),
  periodo_año: z.number().int().min(2020).max(2035),
  fecha_vencimiento: z.string().optional(),
  status: z.enum([
    'pendiente_info', 'en_proceso', 'lista_revisar',
    'presentada', 'pagada', 'no_aplica', 'rechazada'
  ]).default('pendiente_info'),
  monto_impuesto: z.number().nonnegative().optional(),
  monto_sanciones: z.number().nonnegative().optional(),
  monto_total: z.number().nonnegative().optional(),
  formulario: z.string().max(20).optional(),
  notas_internas: z.string().max(1000).optional(),
  notas_cliente: z.string().max(1000).optional(),
  info_solicitada: z.string().max(500).optional(),
  obligation_id: z.string().uuid().optional(),
})

const SELECT_FIELDS = `
  *,
  client:clients!declarations_client_id_fkey(id, nit, razon_social),
  contador:profiles!declarations_contador_id_fkey(id, nombre, apellido)
`

// GET /api/declarations - Listar declaraciones
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

    const { searchParams } = request.nextUrl
    const client_id = searchParams.get('client_id')
    const status = searchParams.get('status')
    const año = searchParams.get('año')
    const tipo = searchParams.get('tipo')

    let query = supabase
      .from('declarations')
      .select(SELECT_FIELDS)
      .eq('activo', true)
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    // Filtrar por rol: el contador ve sus declaraciones y las de sus clientes
    if (profile.role === 'contador') {
      const { data: contadorClients } = await supabase
        .from('clients')
        .select('id')
        .eq('contador_id', user.id)
        .eq('activo', true)
      const clientIds = contadorClients?.map((c) => c.id) ?? []

      if (clientIds.length > 0) {
        query = query.or(
          `contador_id.eq.${user.id},created_by.eq.${user.id},client_id.in.(${clientIds.join(',')})`
        )
      } else {
        query = query.or(`contador_id.eq.${user.id},created_by.eq.${user.id}`)
      }
    }

    // Filtros opcionales
    if (client_id) query = query.eq('client_id', client_id)
    if (status) query = query.eq('status', status)
    if (año) query = query.eq('periodo_año', parseInt(año))
    if (tipo) query = query.eq('tipo_impuesto', tipo)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    console.error('GET /api/declarations:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST /api/declarations - Crear declaración
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role === 'cliente') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = declarationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Error de validación' },
        { status: 400 }
      )
    }

    // Calcular total automáticamente
    const data = parsed.data
    if (data.monto_impuesto !== undefined || data.monto_sanciones !== undefined) {
      data.monto_total = (data.monto_impuesto ?? 0) + (data.monto_sanciones ?? 0)
    }

    // Si el creador es administrador, usar el contador_id del cliente para que el contador pueda ver la declaración
    let contadorId = user.id
    if (profile.role === 'administrador') {
      const { data: clientData } = await supabase
        .from('clients')
        .select('contador_id')
        .eq('id', data.client_id)
        .single()
      if (clientData?.contador_id) {
        contadorId = clientData.contador_id
      }
    }

    const { data: decl, error } = await supabase
      .from('declarations')
      .insert({ ...data, contador_id: contadorId, created_by: user.id })
      .select(SELECT_FIELDS)
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe una declaración para este impuesto y periodo' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json({ data: decl }, { status: 201 })
  } catch (error) {
    console.error('POST /api/declarations:', error)
    return NextResponse.json({ error: 'Error al crear declaración' }, { status: 500 })
  }
}
