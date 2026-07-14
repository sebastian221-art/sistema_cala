// Webhook de WhatsApp - recibe mensajes entrantes y responde con el chatbot
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createGroqClient, GROQ_MODEL, CHATBOT_SYSTEM_PROMPT } from '@/lib/groq/client'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sanitizeForAI } from '@/lib/utils'

// GET: Verificación del webhook (Meta)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    return new Response(challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

// POST: Recibir mensajes entrantes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Verificar firma de Meta (seguridad)
    // En producción, validar X-Hub-Signature-256

    // Estructura del webhook de Meta WhatsApp
    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    if (!value?.messages) {
      return NextResponse.json({ status: 'ok' })
    }

    const message = value.messages[0]
    const fromNumber = message.from // Número del remitente
    const messageText = message.text?.body ?? ''

    if (!messageText || !fromNumber) {
      return NextResponse.json({ status: 'ok' })
    }

    const supabase = createServiceClient()

    // Buscar si el número corresponde a un cliente o contador
    const { data: clienteByWhatsapp } = await supabase
      .from('clients')
      .select(`
        id, razon_social, nit, actividad_economica,
        tax_obligations(tipo_impuesto),
        contador:profiles!clients_contador_id_fkey(id, nombre, whatsapp)
      `)
      .eq('whatsapp', fromNumber)
      .single()

    const { data: profileByWhatsapp } = await supabase
      .from('profiles')
      .select('id, nombre, role')
      .eq('whatsapp', fromNumber)
      .single()

    // Crear o recuperar sesión de WhatsApp
    let sessionId: string | null = null
    const userId = profileByWhatsapp?.id

    if (userId) {
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('channel', 'whatsapp')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (session) {
        sessionId = session.id
      } else {
        const { data: newSession } = await supabase
          .from('chat_sessions')
          .insert({ user_id: userId, channel: 'whatsapp' })
          .select()
          .single()
        sessionId = newSession?.id ?? null
      }
    }

    // Obtener historial reciente del chat (últimos 5 mensajes)
    const recentMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (sessionId) {
      const { data: history } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (history) {
        recentMessages.push(...history.reverse().map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })))
      }
    }

    // Construir contexto del cliente
    let systemPrompt = CHATBOT_SYSTEM_PROMPT
    systemPrompt += '\n\nIMPORTANTE: Esta consulta viene de WhatsApp. Responde de forma breve (máximo 250 palabras), sin markdown complejo. Usa emojis con moderación.'

    if (clienteByWhatsapp) {
      const obligaciones = (clienteByWhatsapp.tax_obligations as Array<{ tipo_impuesto: string }> | undefined)
        ?.map((o) => o.tipo_impuesto) ?? []

      systemPrompt += `\n\nCONTEXTO DEL CLIENTE:
- Razón social: ${clienteByWhatsapp.razon_social}
- NIT: ${clienteByWhatsapp.nit}
- Actividad: ${clienteByWhatsapp.actividad_economica ?? 'No especificada'}
- Obligaciones: ${obligaciones.join(', ') || 'No especificadas'}`
    }

    // Generar respuesta con Groq
    const groq = createGroqClient()
    const sanitizedMessage = sanitizeForAI(messageText)

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentMessages,
        { role: 'user', content: sanitizedMessage },
      ],
      model: GROQ_MODEL,
      temperature: 0.7,
      max_tokens: 400, // Respuestas cortas para WhatsApp
    })

    const responseText = completion.choices[0]?.message?.content ?? 'Lo siento, no pude procesar tu consulta. Intenta de nuevo.'

    // Enviar respuesta por WhatsApp
    await sendWhatsAppMessage({
      to: fromNumber,
      message: responseText,
    })

    // Guardar conversación en BD
    if (sessionId) {
      await supabase.from('chat_messages').insert([
        { session_id: sessionId, role: 'user', content: sanitizedMessage },
        { session_id: sessionId, role: 'assistant', content: responseText },
      ])
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[Webhook WhatsApp]', error)
    // Siempre retornar 200 para que Meta no reintente
    return NextResponse.json({ status: 'ok' })
  }
}
