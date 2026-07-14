// Módulo de integración WhatsApp (Meta Business API / Twilio)
// Soporta ambos proveedores según las variables de entorno

export type WhatsAppProvider = 'meta' | 'twilio'

interface SendMessageParams {
  to: string // Número en formato +57XXXXXXXXXX
  message: string
  templateName?: string
  templateParams?: string[]
}

// Enviar mensaje de texto simple vía Meta WhatsApp Business API
async function sendViaMetaAPI(params: SendMessageParams): Promise<string> {
  const { to, message } = params

  const phoneNumberId = process.env.META_WHATSAPP_PHONE_ID
  const token = process.env.META_WHATSAPP_TOKEN

  if (!phoneNumberId || !token) {
    throw new Error('Credenciales de Meta WhatsApp no configuradas')
  }

  const response = await fetch(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''), // Solo números
        type: 'text',
        text: { body: message },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Meta API error: ${JSON.stringify(error)}`)
  }

  const data = await response.json()
  return data.messages?.[0]?.id ?? 'unknown'
}

// Enviar mensaje vía Twilio WhatsApp
async function sendViaTwilio(params: SendMessageParams): Promise<string> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Credenciales de Twilio no configuradas')
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Twilio = require('twilio')
  const client = new Twilio(accountSid, authToken)

  const message = await client.messages.create({
    body: params.message,
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${params.to}`,
  })

  return message.sid
}

// Función principal para enviar mensaje de WhatsApp
export async function sendWhatsAppMessage(params: SendMessageParams): Promise<string> {
  // Determinar proveedor según variables de entorno disponibles
  const provider: WhatsAppProvider = process.env.META_WHATSAPP_TOKEN
    ? 'meta'
    : 'twilio'

  try {
    if (provider === 'meta') {
      return await sendViaMetaAPI(params)
    } else {
      return await sendViaTwilio(params)
    }
  } catch (error) {
    console.error('[WhatsApp] Error al enviar mensaje:', error)
    throw error
  }
}

// Generar mensaje de recordatorio de vencimiento tributario
export function generateReminderMessage(params: {
  clientName: string
  tipoImpuesto: string
  fechaVencimiento: string
  diasRestantes: number
  contadorNombre?: string
}): string {
  const { clientName, tipoImpuesto, fechaVencimiento, diasRestantes, contadorNombre } = params

  const urgencia =
    diasRestantes === 0
      ? '⚠️ *HOY VENCE*'
      : diasRestantes <= 3
      ? `🔴 *URGENTE - ${diasRestantes} día(s) restante(s)*`
      : `🟡 *${diasRestantes} días restantes*`

  return `${urgencia}

📋 *CALA ASOCIADOS - Recordatorio Tributario*

Cliente: ${clientName}
Obligación: *${tipoImpuesto.replace(/_/g, ' ')}*
Fecha de vencimiento: *${fechaVencimiento}*

${diasRestantes === 0
  ? '⚡ Esta obligación vence HOY. Asegúrate de haberla presentado.'
  : `Tienes *${diasRestantes} día(s)* para presentar esta declaración.`
}

${contadorNombre ? `Tu contador: ${contadorNombre}` : ''}

_CALA ASOCIADOS - Sistema de Gestión Contable_`
}

// Generar resumen mensual para el contador
export function generateMonthlySummaryMessage(params: {
  contadorNombre: string
  mes: string
  vencimientos: Array<{
    clienteNombre: string
    tipoImpuesto: string
    fechaVencimiento: string
  }>
}): string {
  const { contadorNombre, mes, vencimientos } = params

  const lista = vencimientos
    .slice(0, 10) // Máximo 10 en el mensaje
    .map((v) => `• ${v.clienteNombre}: ${v.tipoImpuesto.replace(/_/g, ' ')} - ${v.fechaVencimiento}`)
    .join('\n')

  return `📅 *CALA ASOCIADOS - Resumen de ${mes}*

Hola ${contadorNombre}, estos son los vencimientos tributarios del mes:

${lista}

${vencimientos.length > 10 ? `_...y ${vencimientos.length - 10} más. Ver todos en CALA ASOCIADOS._` : ''}

Total: ${vencimientos.length} obligación(es) pendiente(s).

_Recuerda revisar el calendario tributario en CALA ASOCIADOS para más detalles._`
}
