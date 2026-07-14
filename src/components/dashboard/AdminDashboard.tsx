'use client'

// Dashboard para administrador - vista global del sistema
import { useQuery } from '@tanstack/react-query'
import { KpiCard } from '@/components/ui/KpiCard'
import { Users, FileText, Bell, MessageSquare, Shield, Activity } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface AdminDashboardProps {
  userId: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AdminDashboard({ userId: _userId }: AdminDashboardProps) {
  const supabase = createClient()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [clientesRes, contadoresRes, recordatoriosRes, sesionesRes] =
        await Promise.all([
          supabase.from('clients').select('id', { count: 'exact' }).eq('activo', true),
          supabase
            .from('profiles')
            .select('id', { count: 'exact' })
            .eq('role', 'contador')
            .eq('activo', true),
          supabase
            .from('reminders')
            .select('id', { count: 'exact' })
            .eq('status', 'enviado')
            .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
          supabase
            .from('chat_sessions')
            .select('id', { count: 'exact' })
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        ])

      return {
        total_clientes: clientesRes.count ?? 0,
        total_contadores: contadoresRes.count ?? 0,
        recordatorios_mes: recordatoriosRes.count ?? 0,
        sesiones_chat_mes: sesionesRes.count ?? 0,
      }
    },
  })

  // Últimas actividades del sistema
  const { data: auditLogs, isLoading: loadingLogs } = useQuery({
    queryKey: ['audit-logs-recent'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select(`
          id, accion, tabla, created_at,
          user:profiles(nombre, apellido)
        `)
        .order('created_at', { ascending: false })
        .limit(10)
      return data ?? []
    },
  })

  return (
    <div className="space-y-6 animate-slide-up">
      <section aria-labelledby="admin-kpis">
        <h2 id="admin-kpis" className="text-lg font-semibold text-foreground mb-4">
          Vista Global del Sistema
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Clientes Activos"
            value={stats?.total_clientes ?? 0}
            icon={Users}
            loading={isLoading}
          />
          <KpiCard
            title="Contadores"
            value={stats?.total_contadores ?? 0}
            icon={Shield}
            loading={isLoading}
          />
          <KpiCard
            title="Recordatorios (mes)"
            value={stats?.recordatorios_mes ?? 0}
            icon={Bell}
            iconColor="text-warning"
            loading={isLoading}
          />
          <KpiCard
            title="Sesiones Chatbot (mes)"
            value={stats?.sesiones_chat_mes ?? 0}
            icon={MessageSquare}
            iconColor="text-blue-500"
            loading={isLoading}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actividad reciente */}
        <section
          className="bg-card border border-border rounded-xl overflow-hidden"
          aria-labelledby="actividad-title"
        >
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 id="actividad-title" className="font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" aria-hidden="true" />
              Actividad Reciente
            </h2>
          </div>
          {loadingLogs ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {auditLogs?.map((log) => (
                <div key={log.id} className="px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-foreground">
                        <span className="font-medium">
                          {(log.user as { nombre?: string; apellido?: string } | null)?.nombre}{' '}
                          {(log.user as { nombre?: string; apellido?: string } | null)?.apellido}
                        </span>{' '}
                        {log.accion}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tabla: {log.tabla}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap text-right">
                      <span className="block">{new Date(log.created_at).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}</span>
                      <span className="block">{new Date(log.created_at).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}</span>
                    </span>
                  </div>
                </div>
              ))}
              {auditLogs?.length === 0 && (
                <p className="p-5 text-sm text-muted-foreground text-center">
                  No hay actividad reciente
                </p>
              )}
            </div>
          )}
        </section>

        {/* Gestión rápida */}
        <section aria-labelledby="gestion-title">
          <h2 id="gestion-title" className="font-semibold text-foreground mb-4">
            Gestión del Sistema
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                href: '/configuracion/usuarios',
                label: 'Usuarios',
                description: 'Administrar contadores y clientes',
                icon: Users,
              },
              {
                href: '/configuracion/whatsapp',
                label: 'WhatsApp',
                description: 'Configurar plantillas y API',
                icon: MessageSquare,
              },
              {
                href: '/reportes',
                label: 'Reportes',
                description: 'Análisis global del sistema',
                icon: FileText,
              },
              {
                href: '/configuracion',
                label: 'Configuración',
                description: 'Parámetros del sistema',
                icon: Shield,
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors group"
                >
                  <Icon className="w-6 h-6 mb-2 text-primary group-hover:scale-110 transition-transform" aria-hidden="true" />
                  <p className="font-semibold text-sm text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </Link>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
