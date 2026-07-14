// Página: Bandeja de recordatorios
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDate, formatRelativeTime, getTipoImpuestoLabel } from '@/lib/utils'
import { ObligationsBadge } from '@/components/tax/ObligationBadge'
import { Bell, CheckCircle, XCircle, Clock } from 'lucide-react'

export const metadata = {
  title: 'Recordatorios | CALA ASOCIADOS',
}

export default async function RecordatoriosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Obtener recordatorios según rol
  let query = supabase
    .from('reminders')
    .select(`
      id, tipo, fecha_vencimiento, days_before, status, sent_at, created_at,
      client:clients(razon_social, nit, whatsapp),
      obligation:tax_obligations(tipo_impuesto)
    `)
    .order('fecha_vencimiento', { ascending: true })
    .limit(50)

  if (profile?.role === 'contador') {
    // Solo los de sus clientes
    query = query.eq('clients.contador_id', user.id)
  }

  const { data: recordatorios } = await query

  const statusConfig = {
    pendiente: { label: 'Pendiente', icon: Clock, class: 'text-warning' },
    enviado: { label: 'Enviado', icon: CheckCircle, class: 'text-success' },
    fallido: { label: 'Fallido', icon: XCircle, class: 'text-danger' },
    cancelado: { label: 'Cancelado', icon: XCircle, class: 'text-muted-foreground' },
  }

  const stats = {
    pendientes: recordatorios?.filter((r) => r.status === 'pendiente').length ?? 0,
    enviados: recordatorios?.filter((r) => r.status === 'enviado').length ?? 0,
    fallidos: recordatorios?.filter((r) => r.status === 'fallido').length ?? 0,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Recordatorios Tributarios
          </h1>
          <p className="text-muted-foreground mt-1">
            Seguimiento de alertas enviadas por WhatsApp
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pendientes', value: stats.pendientes, color: 'text-warning' },
          { label: 'Enviados', value: stats.enviados, color: 'text-success' },
          { label: 'Fallidos', value: stats.fallidos, color: 'text-danger' },
        ].map((stat) => (
          <div key={stat.label} className="kpi-card text-center">
            <p className={`text-3xl font-mono font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tabla de recordatorios */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 p-5 border-b border-border">
          <Bell className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold text-foreground">Historial de Recordatorios</h2>
        </div>

        {!recordatorios || recordatorios.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">Sin recordatorios registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table" aria-label="Historial de recordatorios">
              <thead>
                <tr>
                  <th scope="col" className="text-left">Cliente</th>
                  <th scope="col" className="text-left">Obligación</th>
                  <th scope="col" className="text-left">Vencimiento</th>
                  <th scope="col" className="text-left hidden sm:table-cell">Antelación</th>
                  <th scope="col" className="text-left">Estado</th>
                  <th scope="col" className="text-left hidden md:table-cell">Enviado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recordatorios.map((rem) => {
                  const status = statusConfig[rem.status as keyof typeof statusConfig]
                  const StatusIcon = status?.icon ?? Clock
                  const client = rem.client as { razon_social?: string; nit?: string } | null
                  const obligation = rem.obligation as { tipo_impuesto?: string } | null

                  return (
                    <tr key={rem.id} className="hover:bg-muted/20 transition-colors">
                      <td>
                        <div>
                          <p className="font-medium text-sm text-foreground truncate max-w-40">
                            {client?.razon_social ?? 'N/A'}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {client?.nit ?? ''}
                          </p>
                        </div>
                      </td>
                      <td>
                        <p className="text-sm text-foreground">
                          {obligation?.tipo_impuesto
                            ? getTipoImpuestoLabel(obligation.tipo_impuesto)
                            : rem.tipo}
                        </p>
                      </td>
                      <td>
                        <ObligationsBadge fechaVencimiento={rem.fecha_vencimiento} showIcon={false} />
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(rem.fecha_vencimiento)}
                        </p>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {rem.days_before === 0 ? 'El día' : `${rem.days_before} días antes`}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`flex items-center gap-1.5 text-sm font-medium ${status?.class ?? 'text-muted-foreground'}`}
                        >
                          <StatusIcon className="w-4 h-4" aria-hidden="true" />
                          {status?.label ?? rem.status}
                        </span>
                      </td>
                      <td className="hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {rem.sent_at ? formatRelativeTime(rem.sent_at) : '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
