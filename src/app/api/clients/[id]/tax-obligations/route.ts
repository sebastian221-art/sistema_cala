// API Route: CRUD de obligaciones tributarias por cliente
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { TaxObligation } from '@/types'

const taxObligationSchema = z.object({
  tipo_impuesto: z.enum([
    'IVA_BIMESTRAL', 'IVA_CUATRIMESTRAL', 'IVA_ANUAL',
    'RETENCION_FUENTE_MENSUAL', 'RENTA_ANUAL', 'RENTA_BIMESTRAL_ANTICIPO',
    'ICA_BIMESTRAL', 'ICA_TRIMESTRAL', 'ICA_ANUAL',
    'EXOGENA_ANUAL', 'RETENCION_ICA_BIMESTRAL',
    'PATRIMONIO_ANUAL', 'GMF', 'OTROS',
  ]),
  periodicidad: z.enum(['mensual', 'bimestral', 'trimestral', 'cuatrimestral', 'semestral', 'anual']),
  regimen: z.string().optional(),
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  notas: z.string().optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

// GET: Listar obligaciones del cliente
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data, error } = await supabase
      .from('tax_obligations')
      .select('*')
      .eq('client_id', id)
      .order('tipo_impuesto')

    if (error) throw error

    return NextResponse.json({ data: data as TaxObligation[] })
  } catch {
    return NextResponse.json({ error: 'Error al obtener obligaciones' }, { status: 500 })
  }
}

// POST: Crear nueva obligación
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const validation = taxObligationSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('tax_obligations')
      .insert({ ...validation.data, client_id: clientId })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error al crear obligación' }, { status: 500 })
  }
}
