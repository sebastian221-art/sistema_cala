// API Route: Actualizar usuario (solo administrador)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateUserSchema = z.object({
  nombre: z.string().min(2).optional(),
  apellido: z.string().min(1).optional(),
  role: z.enum(['administrador', 'contador', 'cliente']).optional(),
  activo: z.boolean().optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

// PUT /api/admin/users/[id] - Actualizar usuario
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
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
    const result = updateUserSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message }, { status: 400 })
    }

    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(result.data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data: updatedProfile })
  } catch (error) {
    console.error('[API PUT /admin/users/[id]]', error)
    return NextResponse.json({ error: 'Error al actualizar usuario' }, { status: 500 })
  }
}
