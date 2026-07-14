// API Route: Chatbot contable con streaming (Vercel AI SDK + Groq)
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGroqClient, GROQ_MODEL, CHATBOT_SYSTEM_PROMPT } from '@/lib/groq/client'
import { sanitizeForAI } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json()
    const { messages, sessionId, clientContext } = body

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Mensajes inválidos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Sanitizar el último mensaje
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'user') {
      lastMessage.content = sanitizeForAI(lastMessage.content)
    }

    // Construir contexto del cliente si existe
    let systemPromptWithContext = CHATBOT_SYSTEM_PROMPT
    if (clientContext) {
      let financialContext = ''

      // Si hay ID de cliente, cargar los estados financieros más recientes
      if (clientContext.id) {
        const { data: financialStatements } = await supabase
          .from('financial_statements')
          .select('tipo, hoja, periodo_tipo, periodo_valor, año, processed_data_json, raw_data_json, nombre_archivo')
          .eq('client_id', clientContext.id)
          .order('año',          { ascending: false })
          .order('periodo_valor',{ ascending: false })
          .limit(10)

        if (financialStatements && financialStatements.length > 0) {
          const mesesLabel = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

          // Helper: extrae un valor numérico de raw_data_json buscando filas cuya cuenta
          // contenga alguna de las keywords dadas (busca en periodos[0] o primer periodo disponible)
          const extractRawVal = (raw: unknown, keywords: string[]): number => {
            if (!raw || typeof raw !== 'object') return 0
            const r = raw as { filas?: Array<{ cuenta: string; valores: Record<string, number> }>; periodos?: string[] }
            if (!r.filas || !r.periodos?.length) return 0
            const periodo = r.periodos[0]
            for (const fila of r.filas) {
              const cuentaLower = fila.cuenta.toLowerCase()
              if (keywords.some(k => cuentaLower.includes(k))) {
                const v = fila.valores[periodo]
                if (v !== undefined && v !== 0) return v
              }
            }
            return 0
          }

          // Agrupar por archivo/período para mostrar un resumen coherente
          const resumenFinanciero = financialStatements.map((s) => {
            const p = s.processed_data_json as Record<string, number> | null
            const raw = s.raw_data_json
            const periodoStr = s.periodo_tipo === 'mes'
              ? `${mesesLabel[s.periodo_valor] ?? s.periodo_valor}/${s.año}`
              : s.periodo_tipo === 'trimestre'
              ? `T${s.periodo_valor}/${s.año}`
              : s.periodo_tipo === 'semestre'
              ? `S${s.periodo_valor}/${s.año}`
              : `Anual ${s.año}`
            const hoja = s.hoja ?? (s.tipo === 'balance' ? 'ESF' : 'ERI')

            // Función de formato: usa processed_data_json si no es 0,
            // si es 0 intenta extraer de raw_data_json con keywords
            const fmt = (key: string, fallbackKeywords: string[]): string => {
              const fromProcessed = p?.[key]
              const val = (fromProcessed !== undefined && fromProcessed !== 0)
                ? fromProcessed
                : extractRawVal(raw, fallbackKeywords)
              return val !== 0 ? `$${(val / 1_000_000).toFixed(2)}M` : 'No disponible'
            }

            if (hoja === 'ESF' || s.tipo === 'balance') {
              return `  [${periodoStr} · ESF] Total Activos: ${fmt('total_activos', ['total activo'])} | Total Pasivos: ${fmt('total_pasivos', ['total pasivo'])} | Patrimonio: ${fmt('patrimonio', ['total patrimonio', 'patrimonio'])} | Act.Corriente: ${fmt('activos_corrientes', ['activo corriente'])} | Pas.Corriente: ${fmt('pasivos_corrientes', ['pasivo corriente'])}`
            }
            if (hoja === 'ERI' || s.tipo === 'pyg') {
              return `  [${periodoStr} · ERI] Ingresos: ${fmt('ingresos', ['ingreso', 'venta'])} | Costo Ventas: ${fmt('costo_ventas', ['costo de venta', 'costo venta'])} | Utilidad Bruta: ${fmt('utilidad_bruta', ['utilidad bruta', 'ganancia bruta'])} | Gastos Oper.: ${fmt('gastos_operacionales', ['gasto operacional', 'gastos operacion'])} | Utilidad Oper.: ${fmt('utilidad_operacional', ['utilidad operacional'])} | Utilidad Neta: ${fmt('utilidad_neta', ['utilidad neta', 'ganancia neta'])}`
            }
            return `  [${periodoStr} · ${hoja}] Datos disponibles`
          }).join('\n')

          financialContext = `\n\nESTADOS FINANCIEROS DISPONIBLES DEL CLIENTE (cifras en millones COP):
${resumenFinanciero}

INSTRUCCIONES PARA USAR ESTOS DATOS:
- Usa EXACTAMENTE los datos anteriores al responder sobre cifras financieras de este cliente.
- Si preguntan por un período específico (ej. "enero 2025"), busca en la lista el registro [Ene/2025] y usa esos valores.
- NUNCA digas que no tienes datos de un período si aparece en la lista de arriba.
- Menciona siempre el período al que corresponden los datos que citas.
- No uses cifras aproximadas ni inventadas; cita exactamente los valores de la lista.
- Responde en texto plano sin asteriscos, sin guiones, sin símbolos markdown.`
        } else {
          financialContext = `\n\nESTADOS FINANCIEROS: No se han subido estados financieros para este cliente aún.`
        }
      }

      systemPromptWithContext += `\n\nCONTEXTO ESPECÍFICO DEL CLIENTE:
- Nombre/Razón social: ${clientContext.razon_social}
- NIT: ${clientContext.nit}
- Actividad económica: ${clientContext.actividad_economica ?? 'No especificada'}
- Obligaciones tributarias activas: ${clientContext.obligaciones?.join(', ') ?? 'No especificadas'}${financialContext}

Responde SIEMPRE en el contexto de este cliente específico. Si el usuario pregunta sobre cifras financieras, usa los datos cargados arriba.`
    } else {
      // Sin cliente específico: cargar lista de clientes del contador para contexto general
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'contador' || profile?.role === 'administrador') {
        let clientQuery = supabase
          .from('clients')
          .select('razon_social, nit, actividad_economica, direccion, email, tax_obligations(tipo_impuesto, activo)')
          .eq('activo', true)
          .limit(30)

        // El contador solo ve sus propios clientes; el admin ve todos
        if (profile.role === 'contador') {
          clientQuery = clientQuery.eq('contador_id', user.id)
        }

        const { data: clientes } = await clientQuery

        if (clientes && clientes.length > 0) {
          const resumenClientes = clientes
            .map((c) => {
              const obActivas = ((c.tax_obligations ?? []) as Array<{ activo: boolean; tipo_impuesto: string }>)
                .filter((o) => o.activo)
                .map((o) => o.tipo_impuesto)
                .join(', ')
              return `- ${c.razon_social} (NIT: ${c.nit})${c.actividad_economica ? ` — ${c.actividad_economica}` : ''}${c.email ? ` — ${c.email}` : ''}${obActivas ? ` — Obligaciones activas: ${obActivas}` : ' — Sin obligaciones configuradas'}`
            })
            .join('\n')

          const etiqueta = profile.role === 'administrador' ? 'CLIENTES REGISTRADOS EN EL SISTEMA' : 'CLIENTES DEL CONTADOR EN EL SISTEMA'
          systemPromptWithContext += `\n\n${etiqueta} (${clientes.length} clientes activos):
${resumenClientes}
Cuando el usuario pregunte sobre alguno de estos clientes por nombre o NIT, usa esta información para responder con detalle.`
        }
      }
    }

    const groq = createGroqClient()

    // Crear stream con Groq directamente usando ReadableStream
    const groqMessages = [
      { role: 'system' as const, content: systemPromptWithContext },
      ...messages.slice(-20).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: sanitizeForAI(m.content),
      })),
    ]

    const stream = await groq.chat.completions.create({
      messages: groqMessages,
      model: GROQ_MODEL,
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    })

    // Guardar mensaje del usuario en BD (async, no esperar)
    if (sessionId) {
      void supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          role: 'user',
          content: lastMessage?.content ?? '',
        })
    }

    // Crear ReadableStream para la respuesta
    let fullResponse = ''
    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? ''
            if (delta) {
              fullResponse += delta
              // Formato compatible con Vercel AI SDK
              controller.enqueue(
                encoder.encode(`0:${JSON.stringify(delta)}\n`)
              )
            }
          }

          // Guardar respuesta del asistente en BD
          if (sessionId && fullResponse) {
            void supabase
              .from('chat_messages')
              .insert({
                session_id: sessionId,
                role: 'assistant',
                content: fullResponse,
              })
          }

          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('[API /chat]', error)
    return new Response(
      JSON.stringify({ error: 'Error en el chatbot. Intenta de nuevo.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
