// API Route: Configuración de WhatsApp guardada en BD
// Permite ver y actualizar la config de WhatsApp desde la interfaz
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/admin/settings?type=whatsapp
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
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

    // Retornar estado de las variables de entorno (sin exponer valores)
    const settings = {
      whatsapp_token_configured: !!process.env.WHATSAPP_TOKEN || !!process.env.META_WHATSAPP_TOKEN,
      whatsapp_phone_id_configured: !!process.env.WHATSAPP_PHONE_ID || !!process.env.META_WHATSAPP_PHONE_ID,
      whatsapp_phone_number: process.env.WHATSAPP_PHONE_NUMBER || process.env.META_WHATSAPP_PHONE_NUMBER || '',
      whatsapp_verify_token_configured: !!process.env.WHATSAPP_VERIFY_TOKEN || !!process.env.META_WHATSAPP_VERIFY_TOKEN,
      // Info sobre las plantillas guardadas en BD
      templates: [] as Array<{ id: string; nombre: string; tipo: string; contenido: string; activo: boolean }>,
    }

    // Obtener plantillas guardadas (con contenido para poder editar)
    const { data: templates } = await supabase
      .from('whatsapp_templates')
      .select('id, nombre, tipo, contenido, activo')
      .order('tipo')

    settings.templates = templates ?? []

    return NextResponse.json({ data: settings })
  } catch (error) {
    console.error('[API GET /admin/settings]', error)
    return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }
}

// POST /api/admin/settings - Guardar/actualizar plantilla de WhatsApp
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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
    const { id, nombre, tipo, contenido, activo } = body

    if (!nombre || !tipo || !contenido) {
      return NextResponse.json({ error: 'nombre, tipo y contenido son requeridos' }, { status: 400 })
    }

    let result
    if (id) {
      // Actualizar plantilla existente
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .update({ nombre, tipo, contenido, activo: activo ?? true })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      result = data
    } else {
      // Crear nueva plantilla
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .insert({ nombre, tipo, contenido, activo: activo ?? true, variables_json: {} })
        .select()
        .single()
      if (error) throw error
      result = data
    }

    return NextResponse.json({ data: result }, { status: id ? 200 : 201 })
  } catch (error) {
    console.error('[API POST /admin/settings]', error)
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 })
  }
}
