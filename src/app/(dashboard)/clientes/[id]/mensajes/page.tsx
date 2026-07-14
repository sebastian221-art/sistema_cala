'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, Loader2, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  content: string
  created_at: string
  sender_id: string
  is_read: boolean
  sender: { nombre: string; apellido: string; role: string }
}

interface Profile {
  id: string
  nombre: string
  apellido: string
  role: string
}

export default function MensajesPage() {
  const { id: clientId } = useParams<{ id: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/messages`)
      if (res.ok) {
        const { data } = await res.json()
        setMessages(data ?? [])
      }
    } catch {
      toast.error('Error al cargar mensajes')
    } finally {
      setIsLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetch('/api/auth/profile')
      .then((r) => r.json())
      .then(({ data }) => setProfile(data))
      .catch(() => {})
  }, [])

  useEffect(() => { loadMessages() }, [loadMessages])

  // Auto-scroll al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Polling cada 10 segundos para nuevos mensajes
  useEffect(() => {
    const interval = setInterval(loadMessages, 10000)
    return () => clearInterval(interval)
  }, [loadMessages])

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || sending) return

    setSending(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.trim() }),
      })
      const { data, error } = await res.json()
      if (!res.ok) throw new Error(error ?? 'Error al enviar')
      setMessages((prev) => [...prev, data])
      setText('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al enviar mensaje')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })

  const isOwn = (msg: Message) => msg.sender_id === profile?.id

  const getRoleLabel = (role: string) => {
    if (role === 'administrador' || role === 'contador') return 'Contador'
    return 'Cliente'
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-border flex-shrink-0">
        <Link
          href={`/clientes/${clientId}`}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Volver al perfil del cliente"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Mensajes internos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Canal de comunicación entre cliente y contador
          </p>
        </div>
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No hay mensajes aún</p>
            <p className="text-sm text-muted-foreground mt-1">
              Envía el primer mensaje para iniciar la comunicación.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const own = isOwn(msg)
              return (
                <div
                  key={msg.id}
                  className={cn('flex flex-col gap-1', own ? 'items-end' : 'items-start')}
                >
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs text-muted-foreground font-medium">
                      {own ? 'Tú' : `${msg.sender.nombre} ${msg.sender.apellido}`}
                    </span>
                    <span className="text-xs text-muted-foreground/60">
                      · {getRoleLabel(msg.sender.role)}
                    </span>
                    <span className="text-xs text-muted-foreground/50">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                      own
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-card border border-border text-foreground rounded-tl-sm'
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border pt-4 flex-shrink-0">
        <form onSubmit={handleSend} className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje... (Enter para enviar, Shift+Enter para nueva línea)"
            rows={2}
            className={cn(
              'flex-1 px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring resize-none',
              'placeholder:text-muted-foreground'
            )}
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className={cn(
              'p-3 rounded-xl bg-primary text-primary-foreground transition-colors flex-shrink-0',
              'hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label="Enviar mensaje"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">
          Los mensajes son privados entre el cliente y el contador asignado.
        </p>
      </div>
    </div>
  )
}
