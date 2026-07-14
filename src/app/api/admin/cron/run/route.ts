// API Route: Ejecutar recordatorios manualmente (solo administrador)
// Reutiliza la misma lógica del cron pero autenticado por rol de usuario
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  sendWhatsAppMessage,
  generateReminderMessage,
  generateMonthlySummaryMessage,
} from '@/lib/whatsapp'
import { format, addDays, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Autenticar como administrador (no requiere bearer token de Vercel)
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabaseAuth
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'administrador') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  // Parsear opción: "test" solo devuelve conteo sin enviar, "enviar" envía de verdad
  const body = await request.json().catch(() => ({}))
  const modo: 'test' | 'enviar' = body.modo === 'enviar' ? 'enviar' : 'test'
  const forzarResumenMensual: boolean = body.forzar_resumen === true

  const supabase = createServiceClient()
  const hoy = new Date()
  const hoyStr = hoy.toISOString().split('T')[0]

  const results = {
    fecha: hoyStr,
    modo,
    recordatorios_enviados: 0,
    resumenes_enviados: 0,
    recordatorios_pendientes: 0,
    errores: 0,
    detalle: [] as string[],
  }

  try {
    // 1. RESUMEN MENSUAL (el 1ro de cada mes o si se fuerza)
    if (hoy.getDate() === 1 || forzarResumenMensual) {
      const mesActual = format(hoy, 'MMMM yyyy', { locale: es })
      const inicioMes = startOfMonth(hoy).toISOString().split('T')[0]
      const finMes = endOfMonth(hoy).toISOString().split('T')[0]

      const { data: contadores } = await supabase
        .from('profiles')
        .select('id, nombre, whatsapp')
        .eq('role', 'contador')
        .eq('activo', true)
        .not('whatsapp', 'is', null)

      for (const contador of contadores ?? []) {
        if (!contador.whatsapp) continue

        const { data: vencimientos } = await supabase
          .from('tax_calendar')
          .select('tipo_impuesto, fecha_vencimiento, clients!inner(razon_social, contador_id)')
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

        if (modo === 'enviar') {
          try {
            await sendWhatsAppMessage({ to: contador.whatsapp, message: mensaje })
            results.resumenes_enviados++
            results.detalle.push(`Resumen enviado a ${contador.nombre} (${vencimientos.length} vencimientos)`)
          } catch {
            results.errores++
            results.detalle.push(`Error enviando resumen a ${contador.nombre}`)
          }
        } else {
          results.resumenes_enviados++
          results.detalle.push(`[TEST] Resumen para ${contador.nombre}: ${vencimientos.length} vencimientos en ${mesActual}`)
        }
      }
    }

    // 2. RECORDATORIOS INDIVIDUALES
    const { data: configs } = await supabase
      .from('reminder_configs')
      .select('*')
      .eq('active', true)

    for (const config of configs ?? []) {
      const fechaObjetivo = addDays(hoy, config.days_before).toISOString().split('T')[0]

      const { data: recordatorios } = await supabase
        .from('reminders')
        .select(`
          id, fecha_vencimiento,
          obligation:tax_obligations(tipo_impuesto),
          client:clients(razon_social, whatsapp, contador:profiles!clients_contador_id_fkey(nombre, whatsapp))
        `)
        .eq('fecha_vencimiento', fechaObjetivo)
        .eq('status', 'pendiente')

      for (const rec of recordatorios ?? []) {
        const client = rec.client as {
          razon_social?: string; whatsapp?: string
          contador?: { nombre?: string; whatsapp?: string }
        } | null
        const obligation = rec.obligation as { tipo_impuesto?: string } | null
        const tipoImpuesto = obligation?.tipo_impuesto ?? 'Obligación tributaria'
        const clientName = client?.razon_social ?? 'Cliente'

        const mensaje = generateReminderMessage({
          clientName,
          tipoImpuesto,
          fechaVencimiento: rec.fecha_vencimiento,
          diasRestantes: config.days_before,
          contadorNombre: client?.contador?.nombre,
        })

        results.recordatorios_pendientes++

        if (modo === 'enviar') {
          let enviado = false
          if (config.send_to_client && client?.whatsapp) {
            try {
              await sendWhatsAppMessage({ to: client.whatsapp, message: mensaje })
              results.recordatorios_enviados++
              enviado = true
            } catch { results.errores++ }
          }
          if (config.send_to_contador && client?.contador?.whatsapp) {
            try {
              await sendWhatsAppMessage({
                to: client.contador.whatsapp,
                message: `[Para tu cliente ${clientName}]\n\n${mensaje}`,
              })
              results.recordatorios_enviados++
              enviado = true
            } catch { results.errores++ }
          }
          if (enviado) {
            await supabase.from('reminders').update({ status: 'enviado', sent_at: new Date().toISOString() }).eq('id', rec.id)
          }
          results.detalle.push(`Enviado: ${clientName} — ${tipoImpuesto} — vence ${rec.fecha_vencimiento}`)
        } else {
          results.detalle.push(`[TEST] Pendiente: ${clientName} — ${tipoImpuesto} — vence ${rec.fecha_vencimiento} (${config.days_before}d antes)`)
        }
      }
    }

    // 3. URGENTES (vencen hoy)
    const { data: urgentes } = await supabase
      .from('reminders')
      .select(`
        id, fecha_vencimiento,
        obligation:tax_obligations(tipo_impuesto),
        client:clients(razon_social, whatsapp, contador:profiles!clients_contador_id_fkey(nombre, whatsapp))
      `)
      .eq('fecha_vencimiento', hoyStr)
      .eq('status', 'pendiente')

    for (const rec of urgentes ?? []) {
      const client = rec.client as { razon_social?: string; whatsapp?: string; contador?: { nombre?: string; whatsapp?: string } } | null
      const obligation = rec.obligation as { tipo_impuesto?: string } | null
      const clientName = client?.razon_social ?? 'Cliente'
      const tipoImpuesto = obligation?.tipo_impuesto ?? 'Obligación'

      if (modo === 'enviar') {
        try {
          const mensaje = generateReminderMessage({ clientName, tipoImpuesto, fechaVencimiento: hoyStr, diasRestantes: 0 })
          if (client?.whatsapp) await sendWhatsAppMessage({ to: client.whatsapp, message: mensaje })
          if (client?.contador?.whatsapp) await sendWhatsAppMessage({ to: client.contador.whatsapp, message: `URGENTE hoy: ${clientName} — ${tipoImpuesto}` })
          results.recordatorios_enviados++
          await supabase.from('reminders').update({ status: 'enviado', sent_at: new Date().toISOString() }).eq('id', rec.id)
        } catch { results.errores++ }
      } else {
        results.detalle.push(`[TEST URGENTE] ${clientName} — ${tipoImpuesto} — VENCE HOY`)
        results.recordatorios_pendientes++
      }
    }

    return NextResponse.json({ data: results })
  } catch (error) {
    console.error('[API admin/cron/run]', error)
    return NextResponse.json({ error: 'Error al ejecutar recordatorios' }, { status: 500 })
  }
}
