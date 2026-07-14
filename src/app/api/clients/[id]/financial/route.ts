// src/app/api/clients/[id]/financial/route.ts
// v3.0 — agrega PATCH para editar valores individuales con trazabilidad
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseESFFile, extractESFProcessed, extractERIProcessed, type FinancialRow } from '@/lib/excel-parser/esf-parser'
import { parseExcelFile } from '@/lib/excel-parser'

type RouteParams = { params: Promise<{ id: string }> }

// ── Helper: convertir etiqueta de período a metadatos ──────────────────────
// Soporta: "Ene 2026", "Dic 2025", "2025 DICIEMBRE", "2025", etc.
const MESES_MAP: Record<string, number> = {
  ene:1, jan:1, feb:2, mar:3, abr:4, apr:4,
  may:5, jun:6, jul:7, ago:8, aug:8,
  sep:9, oct:10, nov:11, dic:12, dec:12,
  enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,
  julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12,
}

function parsePeriodoDesdeLabel(
  label: string,
  fallback: { tipo: string; valor: number; año: number }
): { tipo: string; valor: number; año: number } {
  const s = label.trim()

  // "Ene 2026", "Dic.2025", "ENE 2026"
  const m1 = s.match(/^([A-Za-záéíóúÁÉÍÓÚ]{3,})[.\s]+(\d{4})$/i)
  if (m1) {
    const mes = MESES_MAP[m1[1].toLowerCase()]
    const año = parseInt(m1[2])
    if (mes && año >= 2000 && año <= 2100) return { tipo: 'mes', valor: mes, año }
  }

  // "2025 DICIEMBRE", "2025 Dic"
  const m2 = s.match(/^(\d{4})\s+([A-Za-záéíóúÁÉÍÓÚ]+)$/i)
  if (m2) {
    const mes = MESES_MAP[m2[2].slice(0, 3).toLowerCase()] ?? MESES_MAP[m2[2].toLowerCase()]
    const año = parseInt(m2[1])
    if (mes && año >= 2000 && año <= 2100) return { tipo: 'mes', valor: mes, año }
  }

  // "2025" solo
  const m3 = s.match(/^(\d{4})$/)
  if (m3) {
    const año = parseInt(m3[1])
    if (año >= 2000 && año <= 2100) return { tipo: 'año', valor: 1, año }
  }

  return fallback
}

// Mapear tipo del parser al enum válido de la BD
// El parser puede devolver 'notas' para hojas NOTAS ESF / NOTAS ERI
// El enum de Supabase solo acepta: 'balance' | 'pyg' | 'flujo'
function mapearTipo(tipo: string, hoja: string): 'balance' | 'pyg' | 'flujo' {
  if (tipo === 'balance') return 'balance'
  if (tipo === 'pyg')     return 'pyg'
  if (tipo === 'flujo')   return 'flujo'
  // 'notas' → inferir por nombre de hoja
  if (hoja.includes('ESF') || hoja.includes('NOTAS ESF')) return 'balance'
  if (hoja.includes('ERI') || hoja.includes('NOTAS ERI') || hoja.includes('NOTAS ER')) return 'pyg'
  return 'balance' // fallback seguro
}

// POST: Subir y procesar estado financiero
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['contador', 'administrador'].includes(profile.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const formData  = await request.formData()
    const file      = formData.get('file')          as File   | null
    const periodoTipo  = (formData.get('periodo_tipo')  as string) ?? 'mes'
    const periodoValor = parseInt((formData.get('periodo_valor') as string) ?? '1')
    const año          = parseInt((formData.get('año')           as string) ?? String(new Date().getFullYear()))

    if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })

    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]
    if (!allowed.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      return NextResponse.json({ error: 'Solo se aceptan archivos Excel (.xlsx, .xls) o CSV' }, { status: 400 })
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo supera 15MB' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // ── Intentar parsear como formato CALA (multi-hoja ESF/ERI/NOTAS) ───────
    let esfSheets = null
    try {
      esfSheets = await parseESFFile(buffer)
    } catch {
      // No es formato CALA → caer al parser genérico
    }

    // ── Formato CALA ─────────────────────────────────────────────────────────
    if (esfSheets && esfSheets.length > 0) {
      const savedStatements = []

      for (const sheet of esfSheets) {
        const tipoValido = mapearTipo(sheet.tipo, sheet.hoja)

        // ── Multi-período: crear UN registro por cada columna de período ──
        // Si el archivo tiene varias columnas (Ene 2026, Dic 2025, Nov 2025, …),
        // se genera un financial_statement independiente por cada una.
        const periodosAGuardar = sheet.periodos.length > 0
          ? sheet.periodos
          : (sheet.periodoActual ? [sheet.periodoActual] : ['Período'])

        for (const periodoLabel of periodosAGuardar) {
          // Filtrar filas que tengan dato para este período
          const filasConDato = sheet.filas.filter(
            f => f.valores[periodoLabel] !== undefined
          )
          if (filasConDato.length === 0) continue   // período vacío → saltar

          // Derivar periodo_tipo / periodo_valor / año desde la etiqueta
          const pp = parsePeriodoDesdeLabel(periodoLabel, {
            tipo: periodoTipo, valor: periodoValor, año
          })

          // Recomputar processedData para este período específico
          let processedDataPeriodo: Record<string, number> = {}
          try {
            if (sheet.hoja === 'ESF' || sheet.tipo === 'balance') {
              processedDataPeriodo = extractESFProcessed(sheet.filas, periodoLabel)
            } else if (sheet.hoja === 'ERI' || sheet.tipo === 'pyg') {
              processedDataPeriodo = extractERIProcessed(sheet.filas, periodoLabel)
            }
          } catch { /* notas u hojas sin extractor → processedData vacío */ }

          const rawData = {
            empresa:     sheet.empresa,
            nit:         (sheet as any).nit ?? '',
            tipoEntidad: (sheet as any).tipoEntidad ?? 'DESCONOCIDO',
            periodos:    [periodoLabel],
            filas:       sheet.filas.slice(0, 300).map(f => ({
              cuenta: f.cuenta,
              nota:   f.nota,
              valores: Object.fromEntries(
                Object.entries(f.valores).filter(([k]) => k === periodoLabel)
              ),
            })),
          }

          const { data: statement, error: stmtErr } = await supabase
            .from('financial_statements')
            .insert({
              client_id:           clientId,
              tipo:                tipoValido,
              periodo_tipo:        pp.tipo,
              periodo_valor:       pp.valor,
              año:                 pp.año,
              hoja:                sheet.hoja,
              nombre_archivo:      file.name,
              raw_data_json:       rawData,
              processed_data_json: processedDataPeriodo,
              uploaded_by:         user.id,
            })
            .select()
            .single()

          if (stmtErr) {
            console.error('[API /financial POST] stmt error:', stmtErr)
            throw stmtErr
          }
          savedStatements.push(statement)

          // Line items para este período
          const lineItemsData = filasConDato.slice(0, 200).map((f, idx) => ({
            categoria:    sheet.hoja,
            subcategoria: f.cuenta.includes('/') ? f.cuenta.split('/')[0].trim() : undefined,
            nombre_cuenta: f.cuenta.includes('/')
              ? f.cuenta.split('/').slice(1).join('/').trim()
              : f.cuenta,
            valor: f.valores[periodoLabel] ?? 0,
            orden: idx,
          }))

          if (lineItemsData.length > 0) {
            await supabase.from('financial_line_items').insert(
              lineItemsData.map(item => ({ ...item, statement_id: statement.id }))
            )
          }
        }
      }

      await supabase.from('audit_logs').insert({
        user_id:     user.id,
        accion:      'subió estados financieros (formato CALA)',
        tabla:       'financial_statements',
        registro_id: savedStatements[0]?.id,
        datos_nuevos: {
          hojas:    esfSheets.map((s) => s.hoja),
          archivo:  file.name,
          empresa:  esfSheets[0]?.empresa,
          tipo_entidad: (esfSheets[0] as any)?.tipoEntidad,
        },
      })

      const hojasUnicas = [...new Set(esfSheets.map((s) => s.hoja))]
      const totalPeriodos = savedStatements.length
      return NextResponse.json({
        data:     savedStatements,
        hojas:    hojasUnicas,
        empresa:  esfSheets[0]?.empresa,
        nit:      (esfSheets[0] as any)?.nit,
        tipo_entidad: (esfSheets[0] as any)?.tipoEntidad,
        message:  `${totalPeriodos} registros creados (${hojasUnicas.join(', ')} × períodos detectados)`,
      }, { status: 201 })
    }

    // ── Formato genérico (fallback) ──────────────────────────────────────────
    const parsed = await parseExcelFile(buffer)

    const { data: statement, error: statementError } = await supabase
      .from('financial_statements')
      .insert({
        client_id:           clientId,
        tipo:                parsed.tipo,
        periodo_tipo:        periodoTipo,
        periodo_valor:       periodoValor,
        año,
        nombre_archivo:      file.name,
        raw_data_json:       parsed.rawData,
        processed_data_json: parsed.processedData,
        uploaded_by:         user.id,
      })
      .select()
      .single()

    if (statementError) throw statementError

    if (parsed.lineItems.length > 0) {
      await supabase.from('financial_line_items').insert(
        parsed.lineItems.map((item) => ({ ...item, statement_id: statement.id }))
      )
    }

    await supabase.from('audit_logs').insert({
      user_id:     user.id,
      accion:      'subió estado financiero',
      tabla:       'financial_statements',
      registro_id: statement.id,
    })

    return NextResponse.json({
      data:    [statement],
      message: `Estado financiero (${parsed.tipo.toUpperCase()}) cargado correctamente`,
    }, { status: 201 })

  } catch (error) {
    console.error('[API /financial POST]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al procesar el archivo' },
      { status: 500 }
    )
  }
}

// PATCH: Editar valores individuales de un estado financiero con trazabilidad
// Body: { statementId, filas: FinancialRow[], periodo: string }
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['contador', 'administrador'].includes(profile.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const { statementId, filas: filasEditadas, periodo }: {
      statementId: string
      filas: FinancialRow[]
      periodo: string
    } = body

    if (!statementId || !filasEditadas || !periodo) {
      return NextResponse.json({ error: 'statementId, filas y periodo son requeridos' }, { status: 400 })
    }

    // Cargar estado actual
    const { data: stmt } = await supabase
      .from('financial_statements')
      .select('id, hoja, tipo, raw_data_json, processed_data_json')
      .eq('id', statementId)
      .eq('client_id', clientId)
      .single()

    if (!stmt) return NextResponse.json({ error: 'Estado financiero no encontrado' }, { status: 404 })

    const rawData = stmt.raw_data_json as {
      empresa: string; nit?: string; tipoEntidad?: string
      periodos: string[]; filas: FinancialRow[]
    }

    if (!rawData?.filas) {
      return NextResponse.json({ error: 'El estado financiero no tiene datos editables' }, { status: 400 })
    }

    // Construir mapa de cambios para trazabilidad
    const cambios: Array<{ cuenta: string; anterior: number; nuevo: number }> = []
    const filasMap = new Map<string, FinancialRow>()
    for (const f of rawData.filas) filasMap.set(f.cuenta, { ...f, valores: { ...f.valores } })

    for (const fEdit of filasEditadas) {
      const existing = filasMap.get(fEdit.cuenta)
      if (!existing) continue
      const anterior = existing.valores[periodo] ?? 0
      const nuevo    = fEdit.valores[periodo] ?? 0
      if (anterior !== nuevo) {
        cambios.push({ cuenta: fEdit.cuenta, anterior, nuevo })
        existing.valores[periodo] = nuevo
      }
    }

    if (cambios.length === 0) {
      return NextResponse.json({ message: 'Sin cambios detectados', cambios: 0 })
    }

    // Reconstruir filas conservando el orden original
    const newFilas: FinancialRow[] = rawData.filas.map(f => filasMap.get(f.cuenta) ?? f)
    const newRawData = { ...rawData, filas: newFilas }

    // Recomputar processed_data_json con los nuevos valores
    let newProcessedData: Record<string, number> = (stmt.processed_data_json as Record<string, number>) ?? {}
    try {
      if (stmt.hoja === 'ESF' || stmt.tipo === 'balance') {
        newProcessedData = extractESFProcessed(newFilas, periodo)
      } else if (stmt.hoja === 'ERI' || stmt.tipo === 'pyg') {
        newProcessedData = extractERIProcessed(newFilas, periodo)
      }
    } catch (e) {
      console.warn('[PATCH /financial] No se pudo recomputar processed_data_json:', e)
    }

    // Actualizar la BD
    const { error: updateErr } = await supabase
      .from('financial_statements')
      .update({ raw_data_json: newRawData, processed_data_json: newProcessedData })
      .eq('id', statementId)
      .eq('client_id', clientId)

    if (updateErr) throw updateErr

    // Actualizar financial_line_items para las cuentas cambiadas
    for (const cambio of cambios) {
      // La clave en line_items es el último segmento del path "Sección / Cuenta"
      const nombreCuenta = cambio.cuenta.includes(' / ')
        ? cambio.cuenta.split(' / ').slice(-1)[0]
        : cambio.cuenta
      await supabase
        .from('financial_line_items')
        .update({ valor: cambio.nuevo })
        .eq('statement_id', statementId)
        .eq('nombre_cuenta', nombreCuenta)
    }

    // Registrar en audit_logs
    await supabase.from('audit_logs').insert({
      user_id:      user.id,
      accion:       'editó valores de estado financiero',
      tabla:        'financial_statements',
      registro_id:  statementId,
      datos_nuevos: {
        hoja:    stmt.hoja,
        periodo,
        cambios: cambios.length,
        detalle: cambios.slice(0, 30), // máx 30 para no saturar
      },
    })

    return NextResponse.json({
      message: `${cambios.length} valor(es) actualizado(s) en ${stmt.hoja ?? 'estado financiero'}`,
      cambios: cambios.length,
      processed_data_json: newProcessedData,
    })

  } catch (error) {
    console.error('[API /financial PATCH]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar valores' },
      { status: 500 }
    )
  }
}

// PUT: Actualizar período de estados financieros (por nombre_archivo o por IDs directos)
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['contador', 'administrador'].includes(profile.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const { periodo_tipo, periodo_valor, año, nombre_archivo, statement_ids } = body

    if (!periodo_tipo || periodo_valor === undefined || !año) {
      return NextResponse.json({ error: 'periodo_tipo, periodo_valor y año son requeridos' }, { status: 400 })
    }

    // Validar valores según el tipo
    const validaciones: Record<string, number[]> = {
      mes:       [1,2,3,4,5,6,7,8,9,10,11,12],
      trimestre: [1,2,3,4],
      semestre:  [1,2],
      año:       [1],
    }
    const validosParaTipo = validaciones[periodo_tipo]
    if (!validosParaTipo) {
      return NextResponse.json({ error: `Tipo de período inválido: ${periodo_tipo}` }, { status: 400 })
    }
    if (!validosParaTipo.includes(Number(periodo_valor))) {
      return NextResponse.json({
        error: `periodo_valor ${periodo_valor} no es válido para tipo "${periodo_tipo}". Valores válidos: ${validosParaTipo.join(', ')}`,
      }, { status: 400 })
    }

    let updateQuery = supabase
      .from('financial_statements')
      .update({ periodo_tipo, periodo_valor: Number(periodo_valor), año: Number(año) })
      .eq('client_id', clientId)

    if (nombre_archivo) {
      // Actualizar todos los registros del mismo archivo (todas las hojas)
      updateQuery = updateQuery.eq('nombre_archivo', nombre_archivo)
    } else if (statement_ids && Array.isArray(statement_ids) && statement_ids.length > 0) {
      // Actualizar IDs específicos
      updateQuery = updateQuery.in('id', statement_ids)
    } else {
      return NextResponse.json({ error: 'Se requiere nombre_archivo o statement_ids' }, { status: 400 })
    }

    const { error: updateErr, count } = await updateQuery.select()
    if (updateErr) throw updateErr

    await supabase.from('audit_logs').insert({
      user_id:     user.id,
      accion:      'editó período de estado financiero',
      tabla:       'financial_statements',
      datos_nuevos: { nombre_archivo, periodo_tipo, periodo_valor, año, registros_actualizados: count },
    })

    return NextResponse.json({
      message: `Período actualizado correctamente`,
    })

  } catch (error) {
    console.error('[API /financial PUT]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar' },
      { status: 500 }
    )
  }
}

// GET: Obtener estados financieros del cliente
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const tipo = searchParams.get('tipo')
    const hoja = searchParams.get('hoja')

    let query = supabase
      .from('financial_statements')
      .select('id, tipo, hoja, nombre_archivo, periodo_tipo, periodo_valor, año, processed_data_json, raw_data_json, created_at')
      .eq('client_id', clientId)
      .order('año',          { ascending: false })
      .order('periodo_valor',{ ascending: false })
      .limit(50)

    if (tipo) query = query.eq('tipo', tipo)
    if (hoja) query = query.eq('hoja', hoja)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Error al obtener estados financieros' }, { status: 500 })
  }
}

// DELETE: Eliminar un estado financiero por ID
// Uso: DELETE /api/clients/[clientId]/financial?statementId=xxx
// Elimina también sus line_items asociados
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['contador', 'administrador'].includes(profile.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { searchParams } = request.nextUrl
    const statementId = searchParams.get('statementId')

    if (!statementId) {
      return NextResponse.json({ error: 'statementId requerido' }, { status: 400 })
    }

    // Verificar que el statement pertenece al cliente
    const { data: stmt, error: fetchErr } = await supabase
      .from('financial_statements')
      .select('id, hoja, nombre_archivo')
      .eq('id', statementId)
      .eq('client_id', clientId)
      .single()

    if (fetchErr || !stmt) {
      return NextResponse.json({ error: 'Estado financiero no encontrado' }, { status: 404 })
    }

    // Usar service client para bypasear RLS en las eliminaciones
    // (la autorización ya fue verificada arriba con el cliente de usuario)
    const serviceClient = createServiceClient()

    // Eliminar line_items asociados primero
    await serviceClient
      .from('financial_line_items')
      .delete()
      .eq('statement_id', statementId)

    // Eliminar el statement con service role y verificar que se eliminó
    const { data: deleted, error: delErr } = await serviceClient
      .from('financial_statements')
      .delete()
      .eq('id', statementId)
      .eq('client_id', clientId)
      .select('id')

    if (delErr) throw delErr

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({
        error: 'No se encontró el registro para eliminar.',
      }, { status: 404 })
    }

    await supabase.from('audit_logs').insert({
      user_id:     user.id,
      accion:      'eliminó estado financiero',
      tabla:       'financial_statements',
      registro_id: statementId,
      datos_nuevos: { hoja: stmt.hoja, archivo: stmt.nombre_archivo },
    })

    return NextResponse.json({
      message: `Estado financiero "${stmt.hoja ?? stmt.nombre_archivo}" eliminado correctamente`,
    })

  } catch (error) {
    console.error('[API /financial DELETE]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar' },
      { status: 500 }
    )
  }
}