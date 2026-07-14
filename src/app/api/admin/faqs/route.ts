// API Route: Gestión de FAQs del chatbot (solo admin/contador)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const faqSchema = z.object({
  pregunta: z.string().min(10, 'Pregunta muy corta').max(500),
  respuesta: z.string().min(10, 'Respuesta muy corta').max(2000),
  categoria: z.string().min(2).max(100),
  activo: z.boolean().default(true),
  orden: z.number().int().default(0),
  tags: z.array(z.string()).optional(),
})

// GET /api/admin/faqs
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

    if (!profile || profile.role === 'cliente') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('chatbot_faqs')
      .select('*')
      .order('categoria')
      .order('orden')
      .order('pregunta')

    if (error) throw error

    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    console.error('GET /api/admin/faqs error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST /api/admin/faqs
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['administrador', 'contador'].includes(profile.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = faqSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Error de validación" }, { status: 400 })
    }

    const { data: faq, error } = await supabase
      .from('chatbot_faqs')
      .insert(parsed.data)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data: faq }, { status: 201 })
  } catch (error) {
    console.error('POST /api/admin/faqs error:', error)
    return NextResponse.json({ error: 'Error al crear FAQ' }, { status: 500 })
  }
}
