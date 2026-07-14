// API Route: Estadísticas de recordatorios
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const today = new Date().toISOString().split('T')[0]

    const [{ count: pendientes }, { count: hoy }] = await Promise.all([
      supabase
        .from('reminders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendiente'),
      supabase
        .from('reminders')
        .select('id', { count: 'exact', head: true })
        .eq('fecha_vencimiento', today)
        .eq('status', 'pendiente'),
    ])

    return NextResponse.json({ pendientes: pendientes ?? 0, hoy: hoy ?? 0 })
  } catch (error) {
    console.error('[API GET /reminders/stats]', error)
    return NextResponse.json({ pendientes: 0, hoy: 0 })
  }
}
