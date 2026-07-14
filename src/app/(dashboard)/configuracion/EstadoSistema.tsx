'use client'

// Estado de las conexiones del sistema (Supabase, Groq, etc.)
import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface EstadoServicio {
  nombre: string
  descripcion: string
  configurado: boolean
  conectado: boolean
  detalle: string
  latenciaMs: number | null
}

export function EstadoSistema() {
  const [servicios, setServicios] = useState<EstadoServicio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const verificar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const res = await fetch('/api/admin/estado')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al verificar')
      setServicios(json.servicios ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al verificar el estado')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    verificar()
  }, [verificar])

  const Icono = ({ s }: { s: EstadoServicio }) => {
    if (s.conectado) return <CheckCircle2 className="w-5 h-5 text-emerald-600" />
    if (s.configurado) return <XCircle className="w-5 h-5 text-red-500" />
    return <AlertTriangle className="w-5 h-5 text-amber-500" />
  }

  const etiqueta = (s: EstadoServicio) => {
    if (s.conectado) return { txt: 'Conectado', cls: 'bg-emerald-500/10 text-emerald-700' }
    if (s.configurado) return { txt: 'Con error', cls: 'bg-red-500/10 text-red-600' }
    return { txt: 'Sin configurar', cls: 'bg-amber-500/10 text-amber-700' }
  }

  return (
    <section className="bg-card border border-border rounded-xl">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" aria-hidden="true" />
            Estado de las conexiones
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verifica que los servicios que usa CALA respondan correctamente.
          </p>
        </div>
        <button
          onClick={verificar}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {cargando ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Verificar
        </button>
      </div>

      {error && (
        <div className="m-5 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          {error}
        </div>
      )}

      {cargando && servicios.length === 0 ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {servicios.map((s) => {
            const et = etiqueta(s)
            return (
              <div key={s.nombre} className="flex items-start gap-3 px-5 py-4">
                <div className="mt-0.5 flex-shrink-0">
                  <Icono s={s} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{s.nombre}</p>
                    <span
                      className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                        et.cls
                      )}
                    >
                      {et.txt}
                    </span>
                    {s.latenciaMs !== null && (
                      <span className="text-[10px] text-muted-foreground">
                        {s.latenciaMs} ms
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.descripcion}
                  </p>
                  <p className="text-xs text-muted-foreground/80 mt-1 font-mono">
                    {s.detalle}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="px-5 py-3 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground">
          Por seguridad, las claves de acceso nunca se muestran aquí. Solo se
          verifica si están configuradas y si el servicio responde.
        </p>
      </div>
    </section>
  )
}