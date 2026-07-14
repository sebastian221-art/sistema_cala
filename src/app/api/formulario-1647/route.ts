// src/app/api/formulario-1647/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

const execAsync = promisify(exec)

async function getPythonCmd(): Promise<string> {
  for (const cmd of ['python3', 'python', 'py']) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`)
      console.log(`[1647] Python encontrado: ${cmd} → ${stdout.trim()}`)
      return cmd
    } catch (e: any) {
      console.log(`[1647] ${cmd} no disponible: ${e.message}`)
      continue
    }
  }
  throw new Error('Python no está instalado o no está en el PATH del sistema.')
}

export async function POST(request: NextRequest) {
  console.log('[1647] ── INICIO POST ──')
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['administrador', 'contador'].includes(profile.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const formData = await request.formData()
    const archivo = formData.get('auxiliar') as File | null

    if (!archivo) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
    }

    console.log(`[1647] Archivo recibido: ${archivo.name} (${(archivo.size/1024).toFixed(1)} KB)`)

    const nombreArchivo = archivo.name.toLowerCase()
    if (!nombreArchivo.endsWith('.xls') && !nombreArchivo.endsWith('.xlsx')) {
      return NextResponse.json(
        { error: 'El archivo debe ser .xls o .xlsx' },
        { status: 400 }
      )
    }

    let pythonCmd: string
    try {
      pythonCmd = await getPythonCmd()
    } catch (e: any) {
      console.error('[1647] ✗ Python no encontrado:', e.message)
      return NextResponse.json({ error: e.message }, { status: 500 })
    }

    const tmpDir     = tmpdir()
    const timestamp  = Date.now()
    const ext        = path.extname(archivo.name)
    const inputPath  = path.join(tmpDir, `auxiliar_${timestamp}${ext}`)
    const outputPath = path.join(tmpDir, `1647_${timestamp}.xlsx`)

    console.log(`[1647] tmpDir: ${tmpDir}`)
    console.log(`[1647] inputPath: ${inputPath}`)
    console.log(`[1647] outputPath: ${outputPath}`)

    const bytes = await archivo.arrayBuffer()
    await writeFile(inputPath, Buffer.from(bytes))
    console.log('[1647] ✓ Archivo escrito en tmp')

    const scriptPath = path.join(process.cwd(), 'src', 'lib', 'formulario-1647', 'generador_1647.py')
    console.log(`[1647] scriptPath: ${scriptPath}`)

    const cmd = `"${pythonCmd}" "${scriptPath}" "${inputPath}" "${outputPath}"`
    console.log(`[1647] CMD: ${cmd}`)

    let stdout = ''
    try {
      const result = await execAsync(cmd, { timeout: 120000 })
      stdout = result.stdout
      console.log('[1647] ✓ Script ejecutado OK')
      console.log('[1647] stdout:', stdout)
      if (result.stderr) console.log('[1647] stderr:', result.stderr)
    } catch (err: any) {
      console.error('[1647] ✗ Error ejecutando script:')
      console.error('[1647]   stderr:', err.stderr)
      console.error('[1647]   stdout:', err.stdout)
      console.error('[1647]   message:', err.message)
      await unlink(inputPath).catch(() => {})
      return NextResponse.json(
        {
          error: 'Error al procesar el archivo',
          detalle: err.stderr || err.stdout || err.message,
        },
        { status: 500 }
      )
    }

    let excelBuffer: Buffer
    try {
      excelBuffer = await readFile(outputPath)
      console.log(`[1647] ✓ Excel leído: ${excelBuffer.length} bytes`)
    } catch (e: any) {
      console.error('[1647] ✗ No se pudo leer el Excel generado:', e.message)
      return NextResponse.json(
        { error: 'El script corrió pero no generó el Excel. Verifica que xlrd y openpyxl estén instalados.' },
        { status: 500 }
      )
    }

    await unlink(inputPath).catch(() => {})
    await unlink(outputPath).catch(() => {})

    const match = stdout.match(/(\d+) registros para el 1647/)
    const totalRegistros = match ? parseInt(match[1]) : 0
    console.log(`[1647] ✓ Total registros: ${totalRegistros}`)
    console.log('[1647] ── FIN POST OK ──')

    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Formulario_1647_${timestamp}.xlsx"`,
        'X-Total-Registros': String(totalRegistros),
      },
    })
  } catch (error: any) {
    console.error('[1647] ✗ Error inesperado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', detalle: error.message },
      { status: 500 }
    )
  }
}