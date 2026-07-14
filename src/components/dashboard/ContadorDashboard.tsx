'use client'

// Dashboard para contador - muestra KPIs de sus clientes asignados
import { useQuery } from '@tanstack/react-query'
import { KpiCard } from '@/components/ui/KpiCard'
import { ObligationsBadge } from '@/components/tax/ObligationBadge'
import {
  Users,
  AlertTriangle,
  Clock,
  CheckCircle,
  MessageSquare,
  TrendingUp,
  CheckSquare,
  ClipboardList,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface ContadorDashboardProps {
  userId: string
}

export function ContadorDashboard({ userId }: ContadorDashboardProps) {
  const supabase = createClient()

  // Obtener estadísticas del contador
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['contador-stats', userId],
    queryFn: async () => {
      const hoy = new Date().toISOString().split('T')[0]
      const en15Dias = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

      const [clientesRes, vencidosRes, proximosRes] = await Promise.all([
        supabase
          .from('clients')
          .select('id', { count: 'exact' })
          .eq('contador_id', userId)
          .eq('activo', true),
        supabase
          .from('reminders')
          .select('id', { count: 'exact' })
          .eq('status', 'pendiente')
          .lt('fecha_vencimiento', hoy),
        supabase
          .from('reminders')
          .select('id', { count: 'exact' })
          .eq('status', 'pendiente')
          .gte('fecha_vencimiento', hoy)
          .lte('fecha_vencimiento', en15Dias),
      ])

      return {
        total_clientes: clientesRes.count ?? 0,
        obligaciones_vencidas: vencidosRes.count ?? 0,
        obligaciones_proximas: proximosRes.count ?? 0,
      }
    },
  })

  // Próximos vencimientos — consulta tax_calendar filtrado por clientes del contador
  const { data: proximosVencimientos, isLoading: loadingVenc } = useQuery({
    queryKey: ['proximos-vencimientos', userId],
    queryFn: async () => {
      const hoy = new Date().toISOString().split('T')[0]
      const en30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]
      const añoActual = new Date().getFullYear()

      // Obtener los tipos de obligaciones activas de los clientes del contador
      const { data: obligaciones } = await supabase
        .from('tax_obligations')
        .select('tipo_impuesto, clients!inner(razon_social, contador_id)')
        .eq('clients.contador_id', userId)
        .eq('activo', true)

      const tiposActivos = obligaciones && obligaciones.length > 0
        ? [...new Set(obligaciones.map((o) => o.tipo_impuesto))]
        : null

      // Consultar tax_calendar en los próximos 30 días
      let query = supabase
        .from('tax_calendar')
        .select('id, tipo_impuesto, fecha_vencimiento, digitos_nit, descripcion')
        .gte('fecha_vencimiento', hoy)
        .lte('fecha_vencimiento', en30Dias)
        .eq('año', añoActual)
        .order('fecha_vencimiento')
        .limit(10)

      if (tiposActivos && tiposActivos.length > 0) {
        query = query.in('tipo_impuesto', tiposActivos)
      }

      const { data } = await query
      return data ?? []
    },
  })

  return (
    <div className="space-y-6 animate-slide-up">
      {/* KPIs principales */}
      <section aria-labelledby="kpis-title">
        <h2 id="kpis-title" className="text-lg font-semibold text-foreground mb-4">
          Resumen del Mes
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Clientes Activos"
            value={stats?.total_clientes ?? 0}
            icon={Users}
            loading={loadingStats}
          />
          <KpiCard
            title="Obligaciones Vencidas"
            value={stats?.obligaciones_vencidas ?? 0}
            icon={AlertTriangle}
            iconColor="text-danger"
            loading={loadingStats}
          />
          <KpiCard
            title="Próximos 15 Días"
            value={stats?.obligaciones_proximas ?? 0}
            icon={Clock}
            iconColor="text-warning"
            loading={loadingStats}
          />
          <KpiCard
            title="Al Día"
            value={Math.max(0, (stats?.total_clientes ?? 0) - (stats?.obligaciones_vencidas ?? 0))}
            icon={CheckCircle}
            iconColor="text-success"
            loading={loadingStats}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximos vencimientos */}
        <section
          className="bg-card border border-border rounded-xl overflow-hidden"
          aria-labelledby="vencimientos-title"
        >
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 id="vencimientos-title" className="font-semibold text-foreground">
              Próximos Vencimientos
            </h2>
            <Link
              href="/calendario"
              className="text-xs text-primary hover:underline font-medium"
            >
              Ver todo
            </Link>
          </div>

          {loadingVenc ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : proximosVencimientos?.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-10 h-10 text-success mx-auto mb-3" aria-hidden="true" />
              <p className="text-muted-foreground text-sm">
                No hay vencimientos en los próximos 30 días
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {proximosVencimientos?.map((item) => (
                <div key={item.id} className="px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.tipo_impuesto.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.descripcion ?? (item.digitos_nit ? `NIT termina en ${item.digitos_nit}` : 'Todos los contribuyentes')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <ObligationsBadge fechaVencimiento={item.fecha_vencimiento} />
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(item.fecha_vencimiento)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Accesos rápidos */}
        <section aria-labelledby="accesos-title">
          <h2 id="accesos-title" className="font-semibold text-foreground mb-4">
            Accesos Rápidos
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                href: '/clientes/nuevo',
                label: 'Nuevo Cliente',
                description: 'Agregar cliente con RUT',
                icon: Users,
                color: 'bg-primary/10 text-primary hover:bg-primary/20',
              },
              {
                href: '/calendario',
                label: 'Calendario',
                description: 'Ver fechas DIAN 2025',
                icon: Clock,
                color: 'bg-accent/20 text-primary hover:bg-accent/30',
              },
              {
                href: '/chatbot',
                label: 'AsistenteConta',
                description: 'Consultas contables con IA',
                icon: MessageSquare,
                color: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400',
              },
              {
                href: '/declaraciones',
                label: 'Declaraciones',
                description: 'Kanban de seguimiento tributario',
                icon: ClipboardList,
                color: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400',
              },
              {
                href: '/tareas',
                label: 'Mis Tareas',
                description: 'Pendientes y tareas activas',
                icon: CheckSquare,
                color: 'bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:text-green-400',
              },
              {
                href: '/reportes',
                label: 'Reportes',
                description: 'Ver análisis financiero',
                icon: TrendingUp,
                color: 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 dark:text-purple-400',
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`p-4 rounded-xl border border-border ${item.color} transition-colors group`}
                >
                  <Icon className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform" aria-hidden="true" />
                  <p className="font-semibold text-sm">{item.label}</p>
                  <p className="text-xs opacity-75 mt-0.5">{item.description}</p>
                </Link>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
