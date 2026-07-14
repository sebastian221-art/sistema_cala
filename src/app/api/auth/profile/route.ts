import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, nombre, apellido, role, email')
      .eq('id', user.id)
      .single()

    return NextResponse.json({ data: profile })
  } catch {
    return NextResponse.json({ error: 'Error al obtener perfil' }, { status: 500 })
  }
}
