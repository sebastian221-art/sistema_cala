// API Route: Listar contadores (para asignación de clientes)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'administrador') {
      return NextResponse.json({ error: 'Solo administradores pueden listar contadores' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, nombre, apellido, email')
      .eq('role', 'contador')
      .eq('activo', true)
      .order('nombre')

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    console.error('[API GET /contadores]', error)
    return NextResponse.json({ error: 'Error al obtener contadores' }, { status: 500 })
  }
}
