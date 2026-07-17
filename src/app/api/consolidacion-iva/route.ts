// src/app/api/consolidacion-iva/route.ts
// Dos acciones:
//   POST con action=preview  → lee el listado, detecta el cliente y devuelve las
//                              facturas (marca "conocido" las tarifas guardadas).
//   POST con action=generar  → genera el Excel y guarda las tarifas del cliente.
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createClient } from '@/lib/supabase/server'

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
      const salida = await runPython([SCRIPT, 'preview', listadoPath])
      const data = JSON.parse(salida)

      // Marcar como "conocido" los terceros con tarifa ya guardada para este cliente
      const clienteNit = String(data.cliente_nit ?? '').trim()
      if (clienteNit && Array.isArray(data.facturas)) {
        try {
          const supabase = await createClient()
          const { data: guardadas } = await supabase
            .from('tarifas_cliente')
            .select('tercero_nit, tarifa')
            .eq('cliente_nit', clienteNit)

          const mapa = new Map(
            (guardadas ?? []).map((r: any) => [String(r.tercero_nit), Number(r.tarifa)])
          )
          if (mapa.size) {
            for (const f of data.facturas) {
              const t = mapa.get(String(f.nit_proveedor))
              if (t !== undefined) {
                f.tarifa = t
                f.origen = 'conocido'
              }
            }
          }
        } catch (e) {
          console.error('[cargar tarifas cliente]', e)
          // si falla la carga, seguimos con las presuntas al 19%
        }
      }

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

      // Guardar las tarifas por cliente (solo excepciones; borra las que volvieron a 19%)
      const clienteNit = String(form.get('cliente_nit') ?? '').trim()
      const tarifasTerceroRaw = form.get('tarifas_tercero')
      if (clienteNit && tarifasTerceroRaw) {
        try {
          const mapa = JSON.parse(String(tarifasTerceroRaw)) as Record<string, number>
          const supabase = await createClient()
          const terceros = Object.keys(mapa).filter((nit) => nit)

          const excepciones = terceros
            .filter((nit) => Number(mapa[nit]) !== 19)
            .map((nit) => ({
              cliente_nit: clienteNit,
              tercero_nit: nit,
              tarifa: Number(mapa[nit]),
              actualizado_en: new Date().toISOString(),
            }))
          const volvieronA19 = terceros.filter((nit) => Number(mapa[nit]) === 19)

          if (excepciones.length) {
            await supabase
              .from('tarifas_cliente')
              .upsert(excepciones, { onConflict: 'cliente_nit,tercero_nit' })
          }
          if (volvieronA19.length) {
            await supabase
              .from('tarifas_cliente')
              .delete()
              .eq('cliente_nit', clienteNit)
              .in('tercero_nit', volvieronA19)
          }
        } catch (e) {
          console.error('[guardar tarifas cliente]', e)
          // no abortamos la descarga si el guardado falla
        }
      }

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