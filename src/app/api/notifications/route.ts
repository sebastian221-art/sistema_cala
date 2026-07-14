// API Route: Centro de Notificaciones
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/notifications - Listar notificaciones del usuario
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const onlyUnread = searchParams.get('unread') === 'true'
    const limit = parseInt(searchParams.get('limit') ?? '20')

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (onlyUnread) {
      query = query.eq('leido', false)
    }

    const { data, error } = await query
    if (error) throw error

    // Contar no leídas
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('leido', false)

    return NextResponse.json({ data: data ?? [], unread_count: count ?? 0 })
  } catch (error) {
    console.error('GET /api/notifications error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// PATCH /api/notifications - Marcar como leídas
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const { ids, mark_all } = body

    let query = supabase
      .from('notifications')
      .update({ leido: true, leido_en: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('leido', false)

    if (!mark_all && ids?.length > 0) {
      query = query.in('id', ids)
    }

    const { error } = await query
    if (error) throw error

    return NextResponse.json({ message: 'Notificaciones marcadas como leídas' })
  } catch (error) {
    console.error('PATCH /api/notifications error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
