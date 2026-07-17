// src/app/api/consolidacion-iva/route.ts
// Dos acciones:
//   POST con action=preview  → lee el listado y devuelve las facturas (JSON)
//   POST con action=generar  → recibe las tarifas confirmadas y devuelve el Excel
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

export const runtime = 'nodejs'
export const maxDuration = 120

const PY = 'python3'
const SCRIPT = join(process.cwd(), 'src', 'lib', 'consolidacion-iva', 'consolidar_iva.py')

function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d.toString()))
    p.stderr.on('data', (d) => (err += d.toString()))
    p.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(err || `python salió con código ${code}`))
    )
  })
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const action = String(form.get('action') ?? 'preview')
  const listado = form.get('listado') as File | null

  if (!listado) {
    return NextResponse.json({ error: 'Falta el listado de la DIAN (token dian).' }, { status: 400 })
  }

  const dir = await mkdtemp(join(tmpdir(), 'cala-iva-'))
  try {
    const listadoPath = join(dir, 'listado.xlsx')
    await writeFile(listadoPath, Buffer.from(await listado.arrayBuffer()))

    // ── PREVIEW: devuelve las facturas como JSON ──
    if (action === 'preview') {
      const args = [SCRIPT, 'preview', listadoPath]

      // Modo cliente (opcional): tarifas ya conocidas por NIT
      const tarifasRaw = form.get('tarifas')
      if (tarifasRaw) {
        args.push('--tarifas', String(tarifasRaw))
      }

      const salida = await runPython(args)
      const data = JSON.parse(salida)
      return NextResponse.json(data)
    }

    // ── GENERAR: recibe las decisiones y devuelve el Excel ──
    if (action === 'generar') {
      const decisionesRaw = form.get('decisiones')
      if (!decisionesRaw) {
        return NextResponse.json({ error: 'Faltan las decisiones de tarifa.' }, { status: 400 })
      }
      const decisionesPath = join(dir, 'decisiones.json')
      await writeFile(decisionesPath, String(decisionesRaw), 'utf-8')

      const salidaPath = join(dir, 'consolidacion_iva.xlsx')
      const resumen = await runPython([SCRIPT, 'generar', listadoPath, salidaPath, decisionesPath])
      const bytes = await readFile(salidaPath)

      return new NextResponse(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="consolidacion_iva.xlsx"',
          'X-Resumen': Buffer.from(resumen).toString('base64'),
        },
      })
    }

    return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error procesando el archivo.' }, { status: 500 })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}