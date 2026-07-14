// API Route: Generar URL firmada para subir documento a Supabase Storage
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const STORAGE_BUCKET = 'documentos'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role === 'cliente') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const { fileName, fileType } = body
    if (!fileName) return NextResponse.json({ error: 'fileName requerido' }, { status: 400 })

    // Ruta: clientes/{clientId}/{timestamp}_{fileName}
    const timestamp = Date.now()
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `clientes/${clientId}/${timestamp}_${safeName}`

    const serviceClient = createServiceClient()

    // Asegurar que el bucket exista; crearlo si no existe
    const { data: buckets } = await serviceClient.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === STORAGE_BUCKET)
    if (!bucketExists) {
      const { error: createError } = await serviceClient.storage.createBucket(STORAGE_BUCKET, {
        public: false,
        fileSizeLimit: 52428800, // 50 MB
        allowedMimeTypes: [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/plain',
          'text/csv',
        ],
      })
      if (createError) {
        console.error('[upload-url] Error creando bucket:', createError)
        return NextResponse.json({
          error: `No se pudo crear el bucket de almacenamiento. Verifica que SUPABASE_SERVICE_ROLE_KEY sea válida.`,
        }, { status: 500 })
      }
    }

    const { data, error } = await serviceClient.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath)

    if (error) throw error

    return NextResponse.json({
      data: {
        signedUrl: data.signedUrl,
        storagePath,
        token: data.token,
      },
    })
  } catch (error) {
    console.error('[API POST /clients/[id]/documents/upload-url]', error)
    return NextResponse.json({ error: 'Error al generar URL de subida' }, { status: 500 })
  }
}
