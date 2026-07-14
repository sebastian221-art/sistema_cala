'use client'

// Página: Configuración de recordatorios automáticos (interactiva)
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bell, Clock, Users, Zap, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ReminderConfig {
  id: string
  days_before: number
  active: boolean
  send_to_client: boolean
  send_to_contador: boolean
}

const CONFIG_INFO: Record<number, { tipo: string; descripcion: string; icon: typeof Bell; urgente: boolean }> = {
  15: { tipo: 'Primer aviso', descripcion: 'Recordatorio inicial informativo', icon: Bell, urgente: false },
  10: { tipo: 'Segundo aviso', descripcion: 'Recordatorio de seguimiento', icon: Bell, urgente: false },
  7: { tipo: 'Tercer aviso', descripcion: 'Alerta de preparación de documentos', icon: Bell, urgente: false },
  5: { tipo: 'Cuarto aviso', descripcion: 'Alerta de preparación urgente', icon: Bell, urgente: false },
  3: { tipo: 'Aviso urgente', descripcion: 'Alerta de urgencia con énfasis', icon: Zap, urgente: true },
  1: { tipo: 'Aviso crítico', descripcion: 'Alerta de vencimiento inminente', icon: Zap, urgente: true },
}

export default function RecordatoriosConfigPage() {
  const [configs, setConfigs] = useState<ReminderConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [hoyCount, setHoyCount] = useState(0)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [configsRes, statsRes] = await Promise.all([
        fetch('/api/reminder-configs'),
        fetch('/api/reminders/stats'),
      ])

      if (configsRes.ok) {
        const { data } = await configsRes.json()
        setConfigs(data ?? [])
      }

      if (statsRes.ok) {
        const stats = await statsRes.json()
        setPendingCount(stats.pendientes ?? 0)
        setHoyCount(stats.hoy ?? 0)
      }
    } catch {
      toast.error('Error al cargar configuraciones')
    } finally {
      setIsLoading(false)
    }
  }

  const updateConfig = async (config: ReminderConfig) => {
    setSavingId(config.id)
    try {
      const res = await fetch('/api/reminder-configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al guardar')
      }

      const { data } = await res.json()
      setConfigs((prev) => prev.map((c) => (c.id === data.id ? data : c)))
      toast.success(`Configuración de ${config.days_before} días actualizada`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar')
    } finally {
      setSavingId(null)
    }
  }

  const toggleField = (config: ReminderConfig, field: keyof Pick<ReminderConfig, 'active' | 'send_to_client' | 'send_to_contador'>) => {
    const updated = { ...config, [field]: !config[field] }
    updateConfig(updated)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/configuracion"
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Volver a configuración"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Configuración de Recordatorios
          </h1>
          <p className="text-muted-foreground mt-1">
            Parámetros de envío automático de alertas tributarias
          </p>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <Bell className="w-8 h-8 text-primary" aria-hidden="true" />
          <div>
            <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Recordatorios pendientes</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-8 h-8 text-warning" aria-hidden="true" />
          <div>
            <p className="text-2xl font-bold text-foreground">{hoyCount}</p>
            <p className="text-xs text-muted-foreground">A enviar hoy</p>
          </div>
        </div>
      </div>

      {/* Parámetros de envío */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Parámetros de anticipación</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Activa o desactiva cada recordatorio y sus destinatarios
          </p>
        </div>

        {configs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No hay configuraciones. Ejecuta el schema SQL para crear los valores por defecto.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {configs
              .sort((a, b) => b.days_before - a.days_before)
              .map((config) => {
                const info = CONFIG_INFO[config.days_before] ?? {
                  tipo: `${config.days_before} días antes`,
                  descripcion: '',
                  icon: Bell,
                  urgente: config.days_before <= 3,
                }
                const Icon = info.icon
                const isSaving = savingId === config.id

                return (
                  <div key={config.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <Icon
                        className={cn('w-5 h-5 mt-0.5 flex-shrink-0', info.urgente ? 'text-danger' : 'text-primary')}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div>
                            <p className="font-medium text-sm text-foreground">
                              {info.tipo} — {config.days_before} días antes
                            </p>
                            <p className="text-xs text-muted-foreground">{info.descripcion}</p>
                          </div>
                          {isSaving && <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />}
                        </div>

                        {/* Controles */}
                        <div className="mt-3 flex flex-wrap gap-4">
                          {/* Activo */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <button
                              type="button"
                              onClick={() => toggleField(config, 'active')}
                              disabled={isSaving}
                              className={cn(
                                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
                                config.active ? 'bg-primary' : 'bg-muted',
                                'disabled:opacity-50'
                              )}
                              role="switch"
                              aria-checked={config.active}
                            >
                              <span
                                className={cn(
                                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                                  config.active ? 'translate-x-4' : 'translate-x-0.5'
                                )}
                              />
                            </button>
                            <span className="text-xs text-foreground">Activo</span>
                          </label>

                          {/* Enviar a cliente */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <button
                              type="button"
                              onClick={() => toggleField(config, 'send_to_client')}
                              disabled={isSaving || !config.active}
                              className={cn(
                                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
                                config.send_to_client && config.active ? 'bg-success' : 'bg-muted',
                                'disabled:opacity-50'
                              )}
                              role="switch"
                              aria-checked={config.send_to_client}
                            >
                              <span
                                className={cn(
                                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                                  config.send_to_client ? 'translate-x-4' : 'translate-x-0.5'
                                )}
                              />
                            </button>
                            <span className="text-xs text-foreground">Enviar a cliente</span>
                          </label>

                          {/* Enviar a contador */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <button
                              type="button"
                              onClick={() => toggleField(config, 'send_to_contador')}
                              disabled={isSaving || !config.active}
                              className={cn(
                                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
                                config.send_to_contador && config.active ? 'bg-success' : 'bg-muted',
                                'disabled:opacity-50'
                              )}
                              role="switch"
                              aria-checked={config.send_to_contador}
                            >
                              <span
                                className={cn(
                                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                                  config.send_to_contador ? 'translate-x-4' : 'translate-x-0.5'
                                )}
                              />
                            </button>
                            <span className="text-xs text-foreground">Enviar a contador</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* Destinatarios info */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" aria-hidden="true" />
            Destinatarios de recordatorios
          </h2>
        </div>
        <div className="divide-y divide-border">
          {[
            {
              grupo: 'Clientes con WhatsApp',
              descripcion: 'Reciben recordatorio directo al número de WhatsApp registrado',
            },
            {
              grupo: 'Contadores asignados',
              descripcion: 'Reciben copia de cada recordatorio enviado a sus clientes',
            },
          ].map((dest) => (
            <div key={dest.grupo} className="flex items-center gap-4 px-5 py-4">
              <div>
                <p className="font-medium text-sm text-foreground">{dest.grupo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{dest.descripcion}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cron job */}
      <div className="bg-muted/30 border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          Ejecución automática
        </h2>
        <p className="text-sm text-muted-foreground">
          Los recordatorios se procesan diariamente mediante el cron job en{' '}
          <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">/api/cron/reminders</code>.
          Configura el trigger en Vercel Cron o en tu servicio de hosting para ejecutarse cada día a las 8:00 AM.
        </p>
        <div className="mt-3 p-3 bg-muted rounded-lg">
          <code className="text-xs font-mono text-foreground">
            # vercel.json — schedule: &quot;0 8 * * *&quot;
          </code>
        </div>
      </div>
    </div>
  )
}
