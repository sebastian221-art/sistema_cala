// API Route: Procesar y parsear archivo RUT con IA
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processRUTFile } from '@/lib/rut-parser'
import { ApiResponse, ExtractedRutData } from '@/types'

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<ExtractedRutData>>> {
  try {
    // Verificar autenticación
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Verificar que sea contador o administrador
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['contador', 'administrador'].includes(profile.role)) {
      return NextResponse.json({ error: 'Sin permisos para procesar RUT' }, { status: 403 })
    }

    // Obtener el archivo del FormData
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se encontró el archivo' }, { status: 400 })
    }

    // Validar tipo de archivo
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no soportado. Use PDF, JPG o PNG' },
        { status: 400 }
      )
    }

    // Validar tamaño (10MB máximo)
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'El archivo supera el tamaño máximo de 10MB' },
        { status: 400 }
      )
    }

    // Convertir File a Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Procesar el RUT
    const extractedData = await processRUTFile(buffer, file.type)

    return NextResponse.json({ data: extractedData })
  } catch (error) {
    console.error('[API /rut/parse] Error:', error)
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
