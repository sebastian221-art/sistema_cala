'use client'

// Dashboard para cliente - vista de sus propias obligaciones y estados
import { useQuery } from '@tanstack/react-query'
import { KpiCard } from '@/components/ui/KpiCard'
import { ObligationsBadge } from '@/components/tax/ObligationBadge'
import { Calendar, AlertTriangle, TrendingUp, MessageSquare, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'

interface ClienteDashboardProps {
  userId: string
}

export function ClienteDashboard({ userId }: ClienteDashboardProps) {
  const supabase = createClient()

  // Obtener info del cliente vinculado al usuario
  const { data: clientInfo, isLoading } = useQuery({
    queryKey: ['cliente-info', userId],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single()

      if (!profile) return null

      const { data: client } = await supabase
        .from('clients')
        .select(`
          id, razon_social, nit,
          tax_obligations(id, tipo_impuesto, periodicidad, activo)
        `)
        .eq('email', profile.email)
        .eq('activo', true)
        .single()

      return client
    },
  })

  // Próximos vencimientos del cliente — consulta tax_calendar filtrado por sus obligaciones
  const { data: vencimientos, isLoading: loadingVenc } = useQuery({
    queryKey: ['vencimientos-cliente', clientInfo?.id],
    enabled: !!clientInfo?.id,
    queryFn: async () => {
      const hoy = new Date().toISOString().split('T')[0]
      const en60Dias = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]
      const añoActual = new Date().getFullYear()

      const tiposActivos = (clientInfo?.tax_obligations as Array<{ tipo_impuesto: string; activo: boolean }> | undefined)
        ?.filter((o) => o.activo)
        .map((o) => o.tipo_impuesto) ?? []

      let query = supabase
        .from('tax_calendar')
        .select('id, tipo_impuesto, fecha_vencimiento, digitos_nit, descripcion')
        .gte('fecha_vencimiento', hoy)
        .lte('fecha_vencimiento', en60Dias)
        .eq('año', añoActual)
        .order('fecha_vencimiento')
        .limit(8)

      if (tiposActivos.length > 0) {
        query = query.in('tipo_impuesto', tiposActivos)
      }

      const { data } = await query
      return data ?? []
    },
  })

  const obligacionesActivas =
    (clientInfo?.tax_obligations as Array<{ activo: boolean }> | undefined)
      ?.filter((o) => o.activo).length ?? 0

  const vencimientosUrgentes = vencimientos?.filter((v) => {
    const diff = new Date(v.fecha_vencimiento).getTime() - Date.now()
    return diff < 7 * 24 * 60 * 60 * 1000
  }).length ?? 0

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Bienvenida */}
      {clientInfo && (
        <div className="bg-primary rounded-2xl p-6 text-white">
          <h2 className="text-2xl font-display font-bold mb-1">
            {clientInfo.razon_social}
          </h2>
          <p className="text-white/70 text-sm">NIT: {clientInfo.nit}</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Obligaciones Activas"
          value={obligacionesActivas}
          icon={Calendar}
          loading={isLoading}
        />
        <KpiCard
          title="Vencimientos Urgentes"
          value={vencimientosUrgentes}
          icon={AlertTriangle}
          iconColor="text-danger"
          loading={isLoading || loadingVenc}
        />
        <KpiCard
          title="Próximos 60 días"
          value={vencimientos?.length ?? 0}
          icon={Clock}
          iconColor="text-warning"
          loading={loadingVenc}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mis vencimientos */}
        <section
          className="bg-card border border-border rounded-xl overflow-hidden"
          aria-labelledby="mis-venc-title"
        >
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 id="mis-venc-title" className="font-semibold text-foreground">
              Mis Próximos Vencimientos
            </h2>
            <Link href="/calendario" className="text-xs text-primary hover:underline">
              Ver calendario
            </Link>
          </div>

          {loadingVenc ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-14 w-full" />
              ))}
            </div>
          ) : vencimientos?.length === 0 ? (
            <div className="p-8 text-center">
              <TrendingUp className="w-10 h-10 text-success mx-auto mb-3" aria-hidden="true" />
              <p className="text-muted-foreground text-sm">
                No tienes vencimientos en los próximos 60 días
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {vencimientos?.map((item) => (
                <div key={item.id} className="px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {item.tipo_impuesto.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.descripcion ?? (item.digitos_nit ? `NIT termina en ${item.digitos_nit}` : `Vence: ${formatDate(item.fecha_vencimiento)}`)}
                      </p>
                    </div>
                    <ObligationsBadge fechaVencimiento={item.fecha_vencimiento} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Acciones disponibles */}
        <section aria-labelledby="acciones-title">
          <h2 id="acciones-title" className="font-semibold text-foreground mb-4">
            Mis Herramientas
          </h2>
          <div className="space-y-3">
            <Link
              href="/chatbot"
              className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:bg-muted/30 transition-colors group"
            >
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">AsistenteConta</p>
                <p className="text-xs text-muted-foreground">
                  Consulta sobre IVA, retenciones, DIAN y más
                </p>
              </div>
            </Link>

            <Link
              href="/calendario"
              className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:bg-muted/30 transition-colors group"
            >
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">Calendario Tributario</p>
                <p className="text-xs text-muted-foreground">
                  Fechas de vencimiento DIAN 2025
                </p>
              </div>
            </Link>

            <Link
              href={clientInfo ? `/clientes/${clientInfo.id}/financiero` : '#'}
              className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:bg-muted/30 transition-colors group"
            >
              <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">Mis Estados Financieros</p>
                <p className="text-xs text-muted-foreground">
                  Ver análisis y comparativos financieros
                </p>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
