// API: Próximos vencimientos de un cliente en los próximos 30 días
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const hoy = new Date()
    const en30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    // Traer obligaciones activas del cliente
    const { data: obligations } = await supabase
      .from('tax_obligations')
      .select('tipo_impuesto')
      .eq('client_id', id)
      .eq('activo', true)

    if (!obligations || obligations.length === 0) {
      return NextResponse.json({ data: [] })
    }

    const tipos = obligations.map(o => o.tipo_impuesto)
    const año = hoy.getFullYear()

    // Buscar en el calendario
    const { data: calEntries } = await supabase
      .from('tax_calendar')
      .select('tipo_impuesto, fecha_vencimiento')
      .eq('año', año)
      .in('tipo_impuesto', tipos)
      .gte('fecha_vencimiento', hoy.toISOString().split('T')[0])
      .lte('fecha_vencimiento', en30.toISOString().split('T')[0])
      .order('fecha_vencimiento')

    return NextResponse.json({ data: calEntries ?? [] })
  } catch (error) {
    console.error('GET upcoming-dates:', error)
    return NextResponse.json({ data: [] })
  }
}
