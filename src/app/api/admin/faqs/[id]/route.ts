// API Route: Actualizar / eliminar FAQ individual
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const faqUpdateSchema = z.object({
  pregunta: z.string().min(10).max(500).optional(),
  respuesta: z.string().min(10).max(2000).optional(),
  categoria: z.string().min(2).max(100).optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
})

async function checkPermission() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', status: 401, supabase: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['administrador', 'contador'].includes(profile.role)) {
    return { error: 'Sin permisos', status: 403, supabase: null }
  }

  return { error: null, status: 200, supabase }
}

// PUT /api/admin/faqs/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const { error, status, supabase } = await checkPermission()
    if (error || !supabase) return NextResponse.json({ error }, { status })

    const body = await request.json()
    const parsed = faqUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Error de validación" }, { status: 400 })
    }

    const { data: faq, error: dbError } = await supabase
      .from('chatbot_faqs')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single()

    if (dbError) throw dbError

    return NextResponse.json({ data: faq })
  } catch (err) {
    console.error('PUT /api/admin/faqs/[id] error:', err)
    return NextResponse.json({ error: 'Error al actualizar FAQ' }, { status: 500 })
  }
}

// DELETE /api/admin/faqs/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const { error, status, supabase } = await checkPermission()
    if (error || !supabase) return NextResponse.json({ error }, { status })

    const { error: dbError } = await supabase
      .from('chatbot_faqs')
      .delete()
      .eq('id', id)

    if (dbError) throw dbError

    return NextResponse.json({ message: 'FAQ eliminada' })
  } catch (err) {
    console.error('DELETE /api/admin/faqs/[id] error:', err)
    return NextResponse.json({ error: 'Error al eliminar FAQ' }, { status: 500 })
  }
}
