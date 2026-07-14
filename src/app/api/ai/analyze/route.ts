// src/app/api/ai/analyze/route.ts — v2.1
// FIX: busca 'NOTAS ER' además de 'NOTAS ERI' para formato PJ

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { createGroqClient, GROQ_MODEL, FINANCIAL_ANALYSIS_PROMPT } from '@/lib/groq/client'
import { sanitizeForAI }             from '@/lib/utils'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { statementId, clientId } = await request.json()
    if (!statementId || !clientId) {
      return NextResponse.json({ error: 'statementId y clientId son requeridos' }, { status: 400 })
    }

    // Statement base (para período/año)
    const { data: statement } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('id', statementId)
      .single()

    if (!statement) return NextResponse.json({ error: 'Estado financiero no encontrado' }, { status: 404 })

    // Info del cliente
    const { data: client } = await supabase
      .from('clients')
      .select('razon_social, actividad_economica, nit')
      .eq('id', clientId)
      .single()

    if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    // Todas las hojas del mismo período
    const { data: allSheets } = await supabase
      .from('financial_statements')
      .select('hoja, tipo, periodo_valor, año, processed_data_json, raw_data_json')
      .eq('client_id', clientId)
      .eq('periodo_valor', statement.periodo_valor)
      .eq('año', statement.año)

    type SheetRow = { cuenta: string; valores: Record<string, number> }
    interface RawSheetData { filas?: SheetRow[]; periodos?: string[] }

    const esfSheet      = allSheets?.find(s => s.hoja === 'ESF')
    const eriSheet      = allSheets?.find(s => s.hoja === 'ERI')
    const notasEsfSheet = allSheets?.find(s => s.hoja === 'NOTAS ESF')
    // FIX v2.1: aceptar 'NOTAS ER' (PJ) además de 'NOTAS ERI' (PN)
    const notasEriSheet = allSheets?.find(s => s.hoja === 'NOTAS ERI' || s.hoja === 'NOTAS ER')

    const buildSheetSummary = (raw: RawSheetData | null, maxRows = 80): string => {
      if (!raw?.filas?.length) return 'Sin datos'
      const period = raw.periodos?.[0] ?? ''
      return raw.filas
        .slice(0, maxRows)
        .filter(f => {
          const v = f.valores[period]
          return v !== undefined && v !== 0
        })
        .map(f => {
          const v = f.valores[period]
          return `  ${f.cuenta}: ${new Intl.NumberFormat('es-CO').format(v ?? 0)}`
        })
        .join('\n')
    }

    const esfSummary      = buildSheetSummary(esfSheet?.raw_data_json      as RawSheetData | null)
    const eriSummary      = buildSheetSummary(eriSheet?.raw_data_json      as RawSheetData | null)
    const notasEsfSummary = buildSheetSummary(notasEsfSheet?.raw_data_json as RawSheetData | null, 60)
    const notasEriSummary = buildSheetSummary(notasEriSheet?.raw_data_json as RawSheetData | null, 60)

    const esfKpis    = esfSheet?.processed_data_json  ?? {}
    const eriKpis    = eriSheet?.processed_data_json  ?? {}
    const kpiSummary = sanitizeForAI(JSON.stringify({ ...esfKpis, ...eriKpis }, null, 2))

    const prompt = FINANCIAL_ANALYSIS_PROMPT(
      client.razon_social,
      client.actividad_economica ?? 'No especificada',
      kpiSummary,
      sanitizeForAI(esfSummary),
      sanitizeForAI(eriSummary),
      sanitizeForAI(notasEsfSummary),
      sanitizeForAI(notasEriSummary),
      statement.periodo_valor,
      statement.año
    )

    const groq = createGroqClient()
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Eres un analista financiero senior especializado en empresas colombianas bajo NIIF PYMES. Tu análisis es exhaustivo, específico y basado en datos concretos. Respondes ÚNICAMENTE con JSON válido, sin texto antes ni después, sin markdown, sin backticks.',
        },
        { role: 'user', content: prompt },
      ],
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 4096,
    })

    const responseText = completion.choices[0]?.message?.content ?? '{}'

    // Extracción robusta del JSON: buscar primer { y último } para ignorar texto extra
    function extractJSON(text: string): string {
      const start = text.indexOf('{')
      const end   = text.lastIndexOf('}')
      if (start === -1 || end === -1 || end <= start) return '{}'
      return text.slice(start, end + 1)
    }

    let analysis
    try {
      analysis = JSON.parse(extractJSON(responseText))
    } catch {
      // Segunda oportunidad: limpiar markdown y reintentar
      try {
        const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        analysis = JSON.parse(extractJSON(cleaned))
      } catch {
        console.error('[AI analyze] JSON parse failed, raw response:', responseText.slice(0, 500))
        analysis = {
          tendencias:       ['No se pudo procesar la respuesta de la IA. Intenta de nuevo.'],
          fortalezas:       [],
          riesgos:          [],
          recomendaciones:  ['Vuelve a hacer clic en "Analizar" para reintentar el análisis.'],
          semaforo:         'amarillo',
          resumen_ejecutivo: 'El análisis fue generado pero no pudo procesarse correctamente. Por favor intenta de nuevo.',
        }
      }
    }

    const { data: savedInsight } = await supabase
      .from('ai_insights')
      .insert({
        client_id:       clientId,
        statement_id:    statementId,
        tendencias:      analysis.tendencias      ?? [],
        fortalezas:      analysis.fortalezas      ?? [],
        riesgos:         analysis.riesgos         ?? [],
        recomendaciones: analysis.recomendaciones ?? [],
        semaforo:        analysis.semaforo        ?? 'amarillo',
        ...(analysis.resumen_ejecutivo      ? { resumen_ejecutivo:      analysis.resumen_ejecutivo }      : {}),
        ...(analysis.semaforo_detalle       ? { semaforo_detalle:       analysis.semaforo_detalle }       : {}),
        ...(analysis.alertas_fiscales       ? { alertas_fiscales:       analysis.alertas_fiscales }       : {}),
        ...(analysis.indicadores_calculados ? { indicadores_calculados: analysis.indicadores_calculados } : {}),
      })
      .select()
      .single()

    return NextResponse.json({
      data: { ...analysis, insightId: savedInsight?.id },
    })

  } catch (error) {
    console.error('[API /ai/analyze]', error)
    return NextResponse.json({ error: 'Error al analizar estados financieros' }, { status: 500 })
  }
}