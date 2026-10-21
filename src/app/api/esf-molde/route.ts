// src/app/api/esf-molde/route.ts
// ════════════════════════════════════════════════════════════════════════
// ESF POR MOLDE — el sistema no inventa la estructura: copia la de la contadora.
//
//   POST (form) action=aprender   esf=<xlsx> balance=<xlsx>
//        Aprende el molde de la empresa cruzando su ESF histórico con el
//        balance del MISMO mes. Guarda el ESF tal cual (sin modificar) como
//        versión base y devuelve el reporte de cruce.
//   POST (form) action=extender   nit=<nit> balance=<xlsx>   (o id=<version base>)
//        Toma la última versión del ESF de la empresa, le agrega la columna
//        del mes del balance y guarda la versión nueva. Devuelve el reporte
//        de revisión (celdas manuales, terceros nuevos, cuentas sin ubicar).
//   GET  ?empresas=1        → empresas con molde (última versión de cada una)
//   GET  ?nit=XXX           → versiones de esa empresa
//   GET  ?id=YYY&descargar=1→ el Excel de esa versión
//   GET  ?id=YYY            → metadatos + reporte de esa versión
//   DELETE ?id=YYY          → borra una versión (y su archivo)
//
// La lógica pesada corre en Python (src/lib/esf-molde/molde.py, openpyxl):
// insertar columnas corriendo referencias cruzadas entre ~30 hojas no es
// viable con ExcelJS. El balance se parsea con el parser.ts existente.
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parsearBalanceAJson } from '@/lib/esf-molde/balanceAJson'

export const runtime = 'nodejs'
export const maxDuration = 300

const PY = process.env.PYTHON_BIN || 'python3'
const SCRIPT = join(process.cwd(), 'src', 'lib', 'esf-molde', 'molde.py')
const BUCKET = 'esf-moldes'
const MESES = ['', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

function runPython(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [SCRIPT, ...args], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    let out = ''
    let err = ''
    p.stdout.on('data', d => (out += d.toString()))
    p.stderr.on('data', d => (err += d.toString()))
    p.on('error', e => reject(new Error(`No se pudo ejecutar python3: ${e.message}`)))
    p.on('close', code => {
      // El script imprime UNA línea JSON al final; antes puede haber ruido.
      const linea = out.trim().split('\n').filter(Boolean).pop() ?? ''
      let json: any = null
      try { json = JSON.parse(linea) } catch { json = null }
      if (code === 0 && json?.ok) return resolve(json)
      const msg = json?.error || err.split('\n').filter(Boolean).slice(-3).join(' | ') || `python salió con código ${code}`
      reject(new Error(msg))
    })
  })
}

function limpiarNit(n: string) {
  return String(n ?? '').trim()
}

function nombreArchivo(empresa: string, anio: number, mes: number) {
  const emp = (empresa || 'EMPRESA').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `ESF_${emp}_${MESES[mes] ?? mes}_${anio}.xlsx`
}

async function usuario() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ─────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await usuario()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const form = await req.formData()
  const action = String(form.get('action') ?? '')
  const balanceFile = form.get('balance') as File | null
  if (!balanceFile) return NextResponse.json({ ok: false, error: 'Falta el balance de prueba.' }, { status: 400 })

  const admin = createServiceClient()
  const dir = await mkdtemp(join(tmpdir(), 'cala-molde-'))
  try {
    // Balance → JSON con el parser existente (Siigo / WO / SIESA / SYD)
    const balBuf = Buffer.from(await balanceFile.arrayBuffer())
    let balanceJson
    try {
      balanceJson = parsearBalanceAJson(balBuf, balanceFile.name)
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: `No se pudo leer el balance: ${e?.message ?? e}` }, { status: 400 })
    }
    if (!balanceJson.mes || !balanceJson.anio) {
      return NextResponse.json({ ok: false, error: 'No se detectó el mes/año del balance. Revisa que el archivo traiga el período (o ponlo en el nombre del archivo, ej. BALANCE_MAYO_2026.xlsx).' }, { status: 400 })
    }
    const balancePath = join(dir, 'balance.json')
    await writeFile(balancePath, JSON.stringify(balanceJson), 'utf-8')
    const nit = limpiarNit(String(form.get('nit') ?? '').trim() || balanceJson.nit)
    const empresa = String(form.get('nombre_empresa') ?? '').trim() || balanceJson.empresa
    // World Office y SIESA no traen empresa/NIT en el archivo: hay que pedirlos
    if (action === 'aprender' && (!nit || !empresa || /^EMPRESA \(/.test(empresa))) {
      return NextResponse.json({ ok: false, faltan_datos: true, error: 'El balance no trae el NIT o el nombre de la empresa (pasa con World Office y SIESA). Escríbelos abajo y vuelve a intentar.' }, { status: 400 })
    }
    if (action === 'aprender' && /^EMPRESA \(/.test(empresa)) {
      return NextResponse.json({ ok: false, faltan_datos: true, error: 'Escribe el nombre de la empresa.' }, { status: 400 })
    }

    // ══ APRENDER ══
    if (action === 'aprender') {
      const esfFile = form.get('esf') as File | null
      if (!esfFile) return NextResponse.json({ ok: false, error: 'Falta el ESF histórico (Excel).' }, { status: 400 })
      const esfPath = join(dir, 'esf.xlsx')
      const esfBuf = Buffer.from(await esfFile.arrayBuffer())
      await writeFile(esfPath, esfBuf)
      const moldePath = join(dir, 'molde.json')

      const res = await runPython(['aprender', esfPath, balancePath, moldePath])
      const molde = JSON.parse(await readFile(moldePath, 'utf-8'))
      const { anio, mes } = res.periodo_base as { anio: number; mes: number }

      // El ESF se guarda TAL CUAL (sin modificar) como versión base
      const path = `${nit}/${Date.now()}_${nombreArchivo(empresa, anio, mes)}`
      const up = await admin.storage.from(BUCKET).upload(path, esfBuf, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false,
      })
      if (up.error) throw new Error(`Storage: ${up.error.message}`)

      const { data: fila, error } = await admin.from('esf_moldes').insert({
        nit, nombre_empresa: empresa, anio, mes, label: `${MESES[mes]} ${anio}`,
        origen: 'aprendido', archivo_path: path, molde_json: molde, reporte_json: res.reporte,
        creado_por: user.id,
      }).select('id').single()
      if (error) throw new Error(`DB: ${error.message}`)

      return NextResponse.json({ ok: true, id: fila.id, nit, empresa, anio, mes, reporte: res.reporte })
    }

    // ══ EXTENDER ══
    if (action === 'extender') {
      const id = String(form.get('id') ?? '')
      let q = admin.from('esf_moldes').select('*')
      q = id ? q.eq('id', id) : q.eq('nit', nit).order('anio', { ascending: false }).order('mes', { ascending: false }).order('creado_en', { ascending: false }).limit(1)
      const { data: rows, error: e1 } = await q
      const base = rows?.[0]
      if (e1 || !base) return NextResponse.json({ ok: false, error: 'No hay un ESF aprendido para esta empresa. Primero sube el ESF histórico + el balance de ese mes.' }, { status: 404 })
      if (!base.molde_json) return NextResponse.json({ ok: false, error: 'Esta versión no tiene molde.' }, { status: 400 })

      const dl = await admin.storage.from(BUCKET).download(base.archivo_path)
      if (dl.error || !dl.data) throw new Error(`Storage: ${dl.error?.message ?? 'no se pudo descargar el ESF base'}`)
      const esfPath = join(dir, 'esf.xlsx')
      await writeFile(esfPath, Buffer.from(await dl.data.arrayBuffer()))
      const moldePath = join(dir, 'molde.json')
      await writeFile(moldePath, JSON.stringify(base.molde_json), 'utf-8')
      const salidaPath = join(dir, 'salida.xlsx')

      const res = await runPython(['extender', esfPath, moldePath, balancePath, salidaPath])
      const moldeNuevo = JSON.parse(await readFile(moldePath, 'utf-8'))   // el script lo actualiza (columna nueva, terceros nuevos)
      const salida = await readFile(salidaPath)
      const { anio, mes } = balanceJson

      const path = `${base.nit}/${Date.now()}_${nombreArchivo(base.nombre_empresa ?? empresa, anio, mes)}`
      const up = await admin.storage.from(BUCKET).upload(path, salida, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false,
      })
      if (up.error) throw new Error(`Storage: ${up.error.message}`)

      const { data: fila, error } = await admin.from('esf_moldes').insert({
        nit: base.nit, nombre_empresa: base.nombre_empresa ?? empresa, anio, mes, label: `${MESES[mes]} ${anio}`,
        origen: 'extendido', archivo_path: path, molde_json: moldeNuevo, reporte_json: res.reporte,
        creado_por: user.id,
      }).select('id').single()
      if (error) throw new Error(`DB: ${error.message}`)

      return NextResponse.json({ ok: true, id: fila.id, nit: base.nit, empresa: base.nombre_empresa, anio, mes, reporte: res.reporte })
    }

    return NextResponse.json({ ok: false, error: `Acción desconocida: ${action}` }, { status: 400 })
  } catch (e: any) {
    console.error('[esf-molde POST]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error procesando.' }, { status: 500 })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// ─────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await usuario()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  const admin = createServiceClient()
  const sp = new URL(req.url).searchParams
  const id = sp.get('id')
  const nit = sp.get('nit')

  try {
    if (id && sp.get('descargar')) {
      const { data: v, error } = await admin.from('esf_moldes').select('archivo_path, nombre_empresa, anio, mes').eq('id', id).single()
      if (error || !v) return NextResponse.json({ ok: false, error: 'Versión no encontrada' }, { status: 404 })
      const dl = await admin.storage.from(BUCKET).download(v.archivo_path)
      if (dl.error || !dl.data) return NextResponse.json({ ok: false, error: 'No se pudo descargar el archivo' }, { status: 500 })
      const bytes = new Uint8Array(await dl.data.arrayBuffer())
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${nombreArchivo(v.nombre_empresa ?? '', v.anio, v.mes)}"`,
        },
      })
    }
    if (id) {
      const { data, error } = await admin.from('esf_moldes').select('id, nit, nombre_empresa, anio, mes, label, origen, reporte_json, creado_en').eq('id', id).single()
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 })
      return NextResponse.json({ ok: true, version: data })
    }
    if (nit) {
      const { data, error } = await admin.from('esf_moldes')
        .select('id, nit, nombre_empresa, anio, mes, label, origen, creado_en')
        .eq('nit', nit).order('anio', { ascending: false }).order('mes', { ascending: false }).order('creado_en', { ascending: false })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, versiones: data ?? [] })
    }
    // empresas: última versión de cada NIT
    const { data, error } = await admin.from('esf_moldes')
      .select('id, nit, nombre_empresa, anio, mes, label, origen, creado_en')
      .order('anio', { ascending: false }).order('mes', { ascending: false }).order('creado_en', { ascending: false })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const vistos = new Set<string>()
    const empresas = (data ?? []).filter((r: any) => (vistos.has(r.nit) ? false : (vistos.add(r.nit), true)))
    return NextResponse.json({ ok: true, empresas })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await usuario()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'Falta id' }, { status: 400 })
  const admin = createServiceClient()
  const { data: v } = await admin.from('esf_moldes').select('archivo_path').eq('id', id).single()
  if (v?.archivo_path) await admin.storage.from(BUCKET).remove([v.archivo_path])
  const { error } = await admin.from('esf_moldes').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
