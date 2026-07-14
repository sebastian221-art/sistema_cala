// API Route: Estado del sistema y variables de entorno (solo administrador)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'administrador') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  // Verificar estado de cada variable crítica (sin exponer los valores)
  const vars = {
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: {
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      value: process.env.NEXT_PUBLIC_SUPABASE_URL
        ? process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/https?:\/\//, '').split('.')[0] + '.supabase.co'
        : null,
      required: true,
      description: 'URL del proyecto Supabase',
      where: 'Supabase → Project Settings → API → Project URL',
    },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: {
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20) + '...'
        : null,
      required: true,
      description: 'Clave anónima de Supabase (pública)',
      where: 'Supabase → Project Settings → API → anon (public)',
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      value: process.env.SUPABASE_SERVICE_ROLE_KEY
        ? process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...'
        : null,
      required: true,
      description: 'Service Role Key — necesaria para crear usuarios',
      where: 'Supabase → Project Settings → API → service_role (secret)',
    },
    // IA
    GROQ_API_KEY: {
      configured: Boolean(process.env.GROQ_API_KEY),
      value: process.env.GROQ_API_KEY ? 'gsk_...' + process.env.GROQ_API_KEY.slice(-4) : null,
      required: true,
      description: 'API Key de Groq para el chatbot IA',
      where: 'console.groq.com → API Keys',
    },
    // WhatsApp
    META_WHATSAPP_TOKEN: {
      configured: Boolean(process.env.META_WHATSAPP_TOKEN),
      value: process.env.META_WHATSAPP_TOKEN ? '***configurado***' : null,
      required: false,
      description: 'Token de acceso de Meta WhatsApp Business API',
      where: 'Meta for Developers → WhatsApp → Configuration → Access Token',
    },
    META_WHATSAPP_PHONE_ID: {
      configured: Boolean(process.env.META_WHATSAPP_PHONE_ID),
      value: process.env.META_WHATSAPP_PHONE_ID ?? null,
      required: false,
      description: 'ID del número de teléfono en Meta Business',
      where: 'Meta for Developers → WhatsApp → Getting Started → Phone Number ID',
    },
    WHATSAPP_VERIFY_TOKEN: {
      configured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
      value: process.env.WHATSAPP_VERIFY_TOKEN ? '***configurado***' : null,
      required: false,
      description: 'Token de verificación del webhook de WhatsApp',
      where: 'Definido por ti — cualquier texto seguro',
    },
    // Twilio (alternativa a Meta)
    TWILIO_ACCOUNT_SID: {
      configured: Boolean(process.env.TWILIO_ACCOUNT_SID),
      value: process.env.TWILIO_ACCOUNT_SID ? 'AC...' + process.env.TWILIO_ACCOUNT_SID.slice(-4) : null,
      required: false,
      description: 'Account SID de Twilio (alternativa a Meta para WhatsApp)',
      where: 'console.twilio.com → Account Info',
    },
    TWILIO_AUTH_TOKEN: {
      configured: Boolean(process.env.TWILIO_AUTH_TOKEN),
      value: process.env.TWILIO_AUTH_TOKEN ? '***configurado***' : null,
      required: false,
      description: 'Auth Token de Twilio',
      where: 'console.twilio.com → Account Info',
    },
    TWILIO_WHATSAPP_NUMBER: {
      configured: Boolean(process.env.TWILIO_WHATSAPP_NUMBER),
      value: process.env.TWILIO_WHATSAPP_NUMBER ?? null,
      required: false,
      description: 'Número de WhatsApp de Twilio (formato: whatsapp:+1234567890)',
      where: 'console.twilio.com → Messaging → WhatsApp',
    },
    // Cron
    CRON_SECRET: {
      configured: Boolean(process.env.CRON_SECRET),
      value: process.env.CRON_SECRET ? '***configurado***' : null,
      required: false,
      description: 'Token secreto para proteger el endpoint del cron de Vercel',
      where: 'Cualquier texto seguro generado por ti',
    },
  }

  // Contar estadísticas de la BD
  const [{ count: totalClientes }, { count: totalContadores }, { count: totalRecordatorios }] =
    await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'contador').eq('activo', true),
      supabase.from('reminders').select('*', { count: 'exact', head: true }).eq('status', 'pendiente'),
    ])

  return NextResponse.json({
    data: {
      vars,
      stats: {
        clientes_activos: totalClientes ?? 0,
        contadores_activos: totalContadores ?? 0,
        recordatorios_pendientes: totalRecordatorios ?? 0,
      },
    },
  })
}
