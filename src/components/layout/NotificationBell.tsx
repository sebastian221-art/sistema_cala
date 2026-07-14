'use client'

// Centro de Notificaciones - campana en el topbar
import { useState, useEffect, useRef } from 'react'
import { Bell, X, CheckCheck, ExternalLink, Loader2 } from 'lucide-react'
import { Notification, NotificationTipo } from '@/types'
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'

const TIPO_ICONS: Record<NotificationTipo, string> = {
  tarea_asignada: '✅',
  tarea_vencida: '⚠️',
  obligacion_proxima: '📅',
  obligacion_vencida: '🚨',
  documento_subido: '📄',
  estado_financiero: '📊',
  mensaje_nuevo: '💬',
  sistema: '🔔',
}

const TIPO_COLOR: Record<NotificationTipo, string> = {
  tarea_asignada: 'bg-blue-500/10 text-blue-500',
  tarea_vencida: 'bg-warning/10 text-warning',
  obligacion_proxima: 'bg-primary/10 text-primary',
  obligacion_vencida: 'bg-red-500/10 text-red-500',
  documento_subido: 'bg-success/10 text-success',
  estado_financiero: 'bg-purple-500/10 text-purple-500',
  mensaje_nuevo: 'bg-cyan-500/10 text-cyan-500',
  sistema: 'bg-muted text-muted-foreground',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [marking, setMarking] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=15')
      const json = await res.json()
      if (res.ok) {
        setNotifications(json.data ?? [])
        setUnreadCount(json.unread_count ?? 0)
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }

  // Fetch al abrir y polling cada 60s
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(() => {
      fetchNotifications()
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open])

  // Cerrar al click fuera
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const markAllRead = async () => {
    setMarking(true)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all: true }),
      })
      setNotifications(prev => prev.map(n => ({ ...n, leido: true })))
      setUnreadCount(0)
    } catch {
      // silently ignore
    } finally {
      setMarking(false)
    }
  }

  const markOneRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, leido: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // silently ignore
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-red-500 text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-semibold text-foreground text-sm">Notificaciones</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={marking}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="Marcar todas como leídas"
                >
                  {marking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                  Marcar leídas
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <Bell className="w-10 h-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No tienes notificaciones</p>
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors',
                    !notification.leido && 'bg-primary/5',
                    'hover:bg-muted/50 cursor-default'
                  )}
                  onClick={() => !notification.leido && markOneRead(notification.id)}
                >
                  <span className={cn(
                    'flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sm',
                    TIPO_COLOR[notification.tipo]
                  )}>
                    {TIPO_ICONS[notification.tipo]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        'text-xs font-medium text-foreground leading-tight',
                        !notification.leido && 'font-semibold'
                      )}>
                        {notification.titulo}
                      </p>
                      {!notification.leido && (
                        <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notification.mensaje}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground/70">
                        {formatDistanceToNow(parseISO(notification.created_at), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                      {notification.link_url && (
                        <Link
                          href={notification.link_url}
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                        >
                          Ver <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
