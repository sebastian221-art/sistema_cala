// API Route: Editar una entrada del calendario tributario (solo administrador)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateSchema = z.object({
  fecha_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  descripcion: z.string().optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params
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

    if (!profile || profile.role !== 'administrador') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const result = updateSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message }, { status: 400 })
    }

    const fecha = new Date(result.data.fecha_vencimiento)
    const { data: updated, error } = await supabase
      .from('tax_calendar')
      .update({
        fecha_vencimiento: result.data.fecha_vencimiento,
        dia_vencimiento: fecha.getUTCDate(),
        mes: fecha.getUTCMonth() + 1,
        ...(result.data.descripcion !== undefined && { descripcion: result.data.descripcion }),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('[API PATCH /admin/calendar/[id]]', error)
    return NextResponse.json({ error: 'Error al actualizar entrada del calendario' }, { status: 500 })
  }
}
