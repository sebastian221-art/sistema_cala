// Página: Reportes globales (solo admin/contador)
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BarChart2, Users, TrendingUp, Calendar } from 'lucide-react'
import { ExportReporteButton } from '@/components/reports/ExportButton'

export const metadata = {
  title: 'Reportes | CALA ASOCIADOS',
}

export default async function ReportesPage() {
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

  if (!profile || profile.role === 'cliente') {
    redirect('/?error=sin_permisos')
  }

  // Estadísticas generales
  const [clientesRes, obligacionesRes, statementsRes] = await Promise.all([
    supabase.from('clients').select('id, tipo, activo', { count: 'exact' }).eq('activo', true),
    supabase.from('tax_obligations').select('tipo_impuesto, activo', { count: 'exact' }).eq('activo', true),
    supabase.from('financial_statements').select('tipo, año', { count: 'exact' }),
  ])

  // Distribución por tipo de impuesto
  const obligacionesPorTipo = (obligacionesRes.data ?? []).reduce<Record<string, number>>(
    (acc, o) => {
      acc[o.tipo_impuesto] = (acc[o.tipo_impuesto] ?? 0) + 1
      return acc
    },
    {}
  )

  const topObligaciones = Object.entries(obligacionesPorTipo)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          Reportes del Sistema
        </h1>
        <p className="text-muted-foreground mt-1">
          Vista global de actividad y estadísticas
        </p>
      </div>
      <ExportReporteButton
        totalClientes={clientesRes.count ?? 0}
        obligacionesActivas={obligacionesRes.count ?? 0}
        estadosFinancieros={statementsRes.count ?? 0}
        topObligaciones={topObligaciones}
        clientesPorTipo={{
          persona_juridica: (clientesRes.data ?? []).filter(c => c.tipo === 'persona_juridica').length,
          persona_natural: (clientesRes.data ?? []).filter(c => c.tipo === 'persona_natural').length,
        }}
      />

      {/* KPIs globales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: 'Total Clientes Activos',
            value: clientesRes.count ?? 0,
            icon: Users,
            color: 'text-primary',
          },
          {
            title: 'Obligaciones Activas',
            value: obligacionesRes.count ?? 0,
            icon: Calendar,
            color: 'text-warning',
          },
          {
            title: 'Estados Financieros',
            value: statementsRes.count ?? 0,
            icon: TrendingUp,
            color: 'text-success',
          },
          {
            title: 'Análisis IA Generados',
            value: 0, // Placeholder
            icon: BarChart2,
            color: 'text-blue-500',
          },
        ].map((kpi) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.title} className="kpi-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
                <div className={`p-2 rounded-lg bg-muted ${kpi.color}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
              </div>
              <p className="text-3xl font-mono font-bold text-foreground">
                {kpi.value.toLocaleString('es-CO')}
              </p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top obligaciones tributarias */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">
              Obligaciones más Comunes
            </h2>
          </div>
          <div className="p-5 space-y-4">
            {topObligaciones.map(([tipo, count]) => {
              const maxCount = topObligaciones[0]?.[1] ?? 1
              const pct = Math.round((count / maxCount) * 100)
              return (
                <div key={tipo}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-foreground font-medium">
                      {tipo.replace(/_/g, ' ')}
                    </span>
                    <span className="text-muted-foreground font-mono">{count}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {topObligaciones.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin datos disponibles
              </p>
            )}
          </div>
        </section>

        {/* Distribución de clientes por tipo */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">
              Clientes por Tipo de Contribuyente
            </h2>
          </div>
          <div className="p-5 space-y-4">
            {['persona_juridica', 'persona_natural'].map((tipo) => {
              const count = (clientesRes.data ?? []).filter(
                (c) => c.tipo === tipo && c.activo
              ).length
              const total = clientesRes.count ?? 1
              const pct = Math.round((count / total) * 100)

              return (
                <div key={tipo}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-foreground font-medium capitalize">
                      {tipo.replace('_', ' ')}
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className={`h-2 rounded-full transition-all duration-700 ${
                        tipo === 'persona_juridica' ? 'bg-primary' : 'bg-accent'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
