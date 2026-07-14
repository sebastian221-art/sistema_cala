// Cron Job: Envío automático de recordatorios tributarios
// Se ejecuta diariamente a las 8am via Vercel Cron
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  sendWhatsAppMessage,
  generateReminderMessage,
  generateMonthlySummaryMessage,
} from '@/lib/whatsapp'
import { format, addDays, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

// Verificar que la solicitud viene de Vercel Cron
function isVercelCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(request: NextRequest) {
  // Seguridad: solo permitir solicitudes de Vercel Cron
  if (!isVercelCronRequest(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const hoy = new Date()
  const hoyStr = hoy.toISOString().split('T')[0]
  const results = {
    recordatorios_enviados: 0,
    resumenes_enviados: 0,
    errores: 0,
  }

  try {
    // 1. RESUMEN MENSUAL (solo el día 1 de cada mes)
    if (hoy.getDate() === 1) {
      await enviarResumenesMensuales(supabase, hoy, results)
    }

    // 2. RECORDATORIOS INDIVIDUALES según configuración
    const { data: configs } = await supabase
      .from('reminder_configs')
      .select('*')
      .eq('active', true)

    if (configs) {
      for (const config of configs) {
        const fechaObjetivo = addDays(hoy, config.days_before)
          .toISOString()
          .split('T')[0]

        await enviarRecordatoriosPorFecha(supabase, config, fechaObjetivo, results)
      }
    }

    // 3. RECORDATORIO URGENTE (vencimientos de hoy)
    await enviarRecordatoriosUrgentes(supabase, hoyStr, results)

    console.log('[Cron Reminders] Resultado:', results)

    return NextResponse.json({
      success: true,
      fecha: hoyStr,
      ...results,
    })
  } catch (error) {
    console.error('[Cron Reminders] Error:', error)
    return NextResponse.json({ error: 'Error en el cron job' }, { status: 500 })
  }
}

async function enviarResumenesMensuales(
  supabase: ReturnType<typeof createServiceClient>,
  hoy: Date,
  results: { resumenes_enviados: number; errores: number }
) {
  const mesActual = format(hoy, 'MMMM yyyy', { locale: es })
  const inicioMes = startOfMonth(hoy).toISOString().split('T')[0]
  const finMes = endOfMonth(hoy).toISOString().split('T')[0]

  // Obtener todos los contadores activos con clientes
  const { data: contadores } = await supabase
    .from('profiles')
    .select('id, nombre, whatsapp')
    .eq('role', 'contador')
    .eq('activo', true)
    .not('whatsapp', 'is', null)

  if (!contadores) return

  for (const contador of contadores) {
    if (!contador.whatsapp) continue

    // Obtener vencimientos del mes para los clientes de este contador
    const { data: vencimientos } = await supabase
      .from('tax_calendar')
      .select(`
        tipo_impuesto,
        fecha_vencimiento,
        clients!inner(razon_social, contador_id)
      `)
      .gte('fecha_vencimiento', inicioMes)
      .lte('fecha_vencimiento', finMes)
      .eq('clients.contador_id', contador.id)
      .order('fecha_vencimiento')

    if (!vencimientos || vencimientos.length === 0) continue

    const mensaje = generateMonthlySummaryMessage({
      contadorNombre: contador.nombre,
      mes: mesActual,
      vencimientos: vencimientos.map((v: { clients: unknown; tipo_impuesto: string; fecha_vencimiento: string }) => ({
        clienteNombre: (v.clients as { razon_social?: string } | null)?.razon_social ?? 'Cliente',
        tipoImpuesto: v.tipo_impuesto,
        fechaVencimiento: v.fecha_vencimiento,
      })),
    })

    try {
      await sendWhatsAppMessage({
        to: contador.whatsapp,
        message: mensaje,
      })
      results.resumenes_enviados++
    } catch (error) {
      console.error(`[Cron] Error enviando resumen a ${contador.nombre}:`, error)
      results.errores++
    }
  }
}

async function enviarRecordatoriosPorFecha(
  supabase: ReturnType<typeof createServiceClient>,
  config: {
    days_before: number
    send_to_client: boolean
    send_to_contador: boolean
  },
  fechaObjetivo: string,
  results: { recordatorios_enviados: number; errores: number }
) {
  // Buscar recordatorios pendientes para esa fecha
  const { data: recordatorios } = await supabase
    .from('reminders')
    .select(`
      id,
      fecha_vencimiento,
      obligation:tax_obligations(tipo_impuesto),
      client:clients(
        razon_social, whatsapp,
        contador:profiles!clients_contador_id_fkey(nombre, whatsapp)
      )
    `)
    .eq('fecha_vencimiento', fechaObjetivo)
    .eq('status', 'pendiente')
    .eq('days_before', config.days_before)

  if (!recordatorios) return

  for (const recordatorio of recordatorios) {
    const client = recordatorio.client as {
      razon_social?: string
      whatsapp?: string
      contador?: { nombre?: string; whatsapp?: string }
    } | null

    const obligation = recordatorio.obligation as { tipo_impuesto?: string } | null

    const tipoImpuesto = obligation?.tipo_impuesto ?? 'Obligación tributaria'
    const clientName = client?.razon_social ?? 'Cliente'
    const fechaVencimiento = recordatorio.fecha_vencimiento
    const diasRestantes = config.days_before

    const mensaje = generateReminderMessage({
      clientName,
      tipoImpuesto,
      fechaVencimiento,
      diasRestantes,
      contadorNombre: client?.contador?.nombre,
    })

    let enviado = false

    // Enviar al cliente
    if (config.send_to_client && client?.whatsapp) {
      try {
        await sendWhatsAppMessage({ to: client.whatsapp, message: mensaje })
        enviado = true
        results.recordatorios_enviados++
      } catch (error) {
        console.error(`[Cron] Error enviando a cliente ${clientName}:`, error)
        results.errores++
      }
    }

    // Enviar al contador
    if (config.send_to_contador && client?.contador?.whatsapp) {
      try {
        await sendWhatsAppMessage({
          to: client.contador.whatsapp,
          message: `[Para tu cliente ${clientName}]\n\n${mensaje}`,
        })
        enviado = true
        results.recordatorios_enviados++
      } catch {
        results.errores++
      }
    }

    // Actualizar estado del recordatorio
    if (enviado) {
      await supabase
        .from('reminders')
        .update({
          status: 'enviado',
          sent_at: new Date().toISOString(),
        })
        .eq('id', recordatorio.id)
    }
  }
}

async function enviarRecordatoriosUrgentes(
  supabase: ReturnType<typeof createServiceClient>,
  hoy: string,
  results: { recordatorios_enviados: number; errores: number }
) {
  await enviarRecordatoriosPorFecha(
    supabase,
    { days_before: 0, send_to_client: true, send_to_contador: true },
    hoy,
    results
  )
}
