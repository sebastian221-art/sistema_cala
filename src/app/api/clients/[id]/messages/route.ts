// API Route: Mensajes internos entre cliente y contador
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    const serviceClient = createServiceClient()

    // Verificar acceso: admin ve todo, contador solo sus clientes, cliente solo los suyos
    if (profile.role === 'contador') {
      const { data: client } = await serviceClient
        .from('clients').select('contador_id').eq('id', clientId).single()
      if (!client || client.contador_id !== user.id) {
        return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
      }
    } else if (profile.role === 'cliente') {
      const { data: client } = await serviceClient
        .from('clients').select('profile_id').eq('id', clientId).single()
      if (!client || client.profile_id !== user.id) {
        return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
      }
    }

    const { data, error } = await serviceClient
      .from('client_messages')
      .select(`
        id, content, created_at, sender_id, is_read,
        sender:profiles(nombre, apellido, role)
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })

    if (error) throw error

    // Marcar como leídos los mensajes no propios
    await serviceClient
      .from('client_messages')
      .update({ is_read: true })
      .eq('client_id', clientId)
      .neq('sender_id', user.id)
      .eq('is_read', false)

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[GET /api/clients/[id]/messages]', error)
    return NextResponse.json({ error: 'Error al cargar mensajes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    const { content } = await request.json()
    if (!content?.trim()) {
      return NextResponse.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Verificar acceso
    if (profile.role === 'contador') {
      const { data: client } = await serviceClient
        .from('clients').select('contador_id').eq('id', clientId).single()
      if (!client || client.contador_id !== user.id) {
        return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
      }
    } else if (profile.role === 'cliente') {
      const { data: client } = await serviceClient
        .from('clients').select('profile_id').eq('id', clientId).single()
      if (!client || client.profile_id !== user.id) {
        return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
      }
    }

    const { data, error } = await serviceClient
      .from('client_messages')
      .insert({
        client_id: clientId,
        sender_id: user.id,
        content: content.trim(),
        is_read: false,
      })
      .select(`
        id, content, created_at, sender_id, is_read,
        sender:profiles(nombre, apellido, role)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/clients/[id]/messages]', error)
    return NextResponse.json({ error: 'Error al enviar mensaje' }, { status: 500 })
  }
}
