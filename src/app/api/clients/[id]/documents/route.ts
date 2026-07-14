// API Route: Gestión documental del cliente
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const STORAGE_BUCKET = 'documentos'

const uploadSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  categoria: z.enum([
    'rut', 'camara_comercio', 'renta', 'iva', 'retencion',
    'ica', 'estados_financieros', 'contrato', 'otro',
  ]),
  descripcion: z.string().optional(),
  file_url: z.string().url('URL inválida'),
  file_name: z.string().min(1),
  file_size: z.number().optional(),
  file_type: z.string().optional(),
  periodo: z.string().optional(),
  storage_path: z.string().optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/clients/[id]/documents
export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    // Verificar acceso al cliente
    const { data: client } = await supabase.from('clients').select('id, contador_id').eq('id', id).single()
    if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    if (profile.role === 'contador' && client.contador_id !== user.id) {
      return NextResponse.json({ error: 'Sin permisos para este cliente' }, { status: 403 })
    }

    let query = supabase
      .from('client_documents')
      .select('*, uploaded_by:profiles!client_documents_uploaded_by_fkey(nombre, apellido)')
      .eq('client_id', id)
      .order('categoria')
      .order('created_at', { ascending: false })

    // Clientes solo ven documentos habilitados por el contador
    if (profile.role === 'cliente') {
      query = query.eq('visible_to_client', true)
    }

    const { data: docs, error } = await query
    if (error) throw error
    return NextResponse.json({ data: docs ?? [] })
  } catch (error) {
    console.error('[API GET /clients/[id]/documents]', error)
    return NextResponse.json({ error: 'Error al obtener documentos' }, { status: 500 })
  }
}

// POST /api/clients/[id]/documents — registrar documento ya subido a Storage
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role === 'cliente') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const result = uploadSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message }, { status: 400 })
    }

    const { data: doc, error } = await supabase
      .from('client_documents')
      .insert({
        client_id: id,
        uploaded_by: user.id,
        visible_to_client: false,
        ...result.data,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data: doc }, { status: 201 })
  } catch (error) {
    console.error('[API POST /clients/[id]/documents]', error)
    return NextResponse.json({ error: 'Error al registrar documento' }, { status: 500 })
  }
}

// PATCH /api/clients/[id]/documents?docId=xxx — togglear visibilidad para cliente
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role === 'cliente') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const docId = searchParams.get('docId')
    if (!docId) return NextResponse.json({ error: 'docId requerido' }, { status: 400 })

    const body = await request.json()
    const visible = Boolean(body.visible_to_client)

    const serviceClient = createServiceClient()
    const { data: doc, error } = await serviceClient
      .from('client_documents')
      .update({ visible_to_client: visible })
      .eq('id', docId)
      .eq('client_id', clientId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
      }
      throw error
    }
    return NextResponse.json({ data: doc })
  } catch (error) {
    console.error('[API PATCH /clients/[id]/documents]', error)
    return NextResponse.json({ error: 'Error al actualizar visibilidad' }, { status: 500 })
  }
}

// DELETE — eliminar documento
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role === 'cliente') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const docId = searchParams.get('docId')
    if (!docId) return NextResponse.json({ error: 'docId requerido' }, { status: 400 })

    const { data: doc } = await supabase
      .from('client_documents')
      .select('id, storage_path')
      .eq('id', docId)
      .eq('client_id', clientId)
      .single()

    if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

    if (doc.storage_path) {
      const serviceClient = createServiceClient()
      await serviceClient.storage.from(STORAGE_BUCKET).remove([doc.storage_path])
    }

    const { error } = await supabase.from('client_documents').delete().eq('id', docId)
    if (error) throw error

    return NextResponse.json({ data: { deleted: true } })
  } catch (error) {
    console.error('[API DELETE /clients/[id]/documents]', error)
    return NextResponse.json({ error: 'Error al eliminar documento' }, { status: 500 })
  }
}
