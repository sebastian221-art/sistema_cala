'use client'

// Interfaz de chat con AsistenteConta - streaming en tiempo real
import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatInterfaceProps {
  userId: string
  clientContext?: {
    id?: string
    razon_social: string
    nit: string
    actividad_economica?: string
    obligaciones?: string[]
  }
  initialMessage?: string
}

export function ChatInterface({ userId, clientContext, initialMessage }: ChatInterfaceProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Cargar sesión existente (últimas 24h) o crear nueva
  useEffect(() => {
    const loadOrCreateSession = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: existingSession } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('channel', 'web')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let currentSessionId: string

      if (existingSession) {
        currentSessionId = existingSession.id
        setSessionId(currentSessionId)

        // Cargar mensajes previos
        const { data: prevMessages } = await supabase
          .from('chat_messages')
          .select('id, role, content, created_at')
          .eq('session_id', currentSessionId)
          .order('created_at', { ascending: true })
          .limit(30)

        if (prevMessages && prevMessages.length > 0) {
          setMessages(
            prevMessages.map((m) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: new Date(m.created_at),
            }))
          )
          return
        }
      } else {
        const { data: newSession } = await supabase
          .from('chat_sessions')
          .insert({ user_id: userId, channel: 'web' })
          .select()
          .single()

        if (!newSession) return
        currentSessionId = newSession.id
        setSessionId(currentSessionId)
      }

      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: clientContext
            ? `¡Hola! Soy **AsistenteConta**. Listo para ayudarte con consultas sobre **${clientContext.razon_social}** (NIT: ${clientContext.nit}). ¿En qué puedo ayudarte?`
            : '¡Hola! Soy **AsistenteConta**, tu asistente contable y tributario especializado en Colombia. Puedo ayudarte con IVA, retenciones, renta, ICA, NIIF, nómina, procesos DIAN y más. ¿En qué puedo ayudarte hoy?',
          timestamp: new Date(),
        },
      ])

      if (initialMessage) {
        setTimeout(() => sendMessage(initialMessage), 500)
      }
    }

    loadOrCreateSession()
  }, [userId])

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMessage])
      setInput('')
      setIsLoading(true)
      setStreamingContent('')

      // Ajustar altura del textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              ...messages.map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: content.trim() },
            ],
            sessionId,
            clientContext,
          }),
        })

        if (!response.ok) throw new Error('Error en el servidor')
        if (!response.body) throw new Error('No hay respuesta del servidor')

        // Leer stream
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value)
          const lines = text.split('\n').filter(Boolean)

          for (const line of lines) {
            if (line.startsWith('0:')) {
              try {
                const content = JSON.parse(line.slice(2))
                accumulated += content
                setStreamingContent(accumulated)
              } catch {
                // Ignorar líneas malformadas
              }
            }
          }
        }

        // Agregar respuesta completa como mensaje
        if (accumulated) {
          const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: accumulated,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, assistantMessage])
        }
      } catch (error) {
        toast.error('Error al conectar con AsistenteConta. Intenta de nuevo.')
        console.error('[ChatInterface]', error)
      } finally {
        setIsLoading(false)
        setStreamingContent('')
      }
    },
    [messages, sessionId, clientContext, isLoading]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  const clearChat = async () => {
    const { data } = await supabase
      .from('chat_sessions')
      .insert({ user_id: userId, channel: 'web' })
      .select()
      .single()

    if (data) {
      setSessionId(data.id)
      setMessages([
        {
          id: 'welcome-new',
          role: 'assistant',
          content: '¡Nueva conversación iniciada! ¿En qué puedo ayudarte?',
          timestamp: new Date(),
        },
      ])
    }
  }

  // Preguntas frecuentes sugeridas
  const SUGGESTED_QUESTIONS = [
    '¿Cuándo vence el IVA este mes?',
    '¿Qué documentos necesito para declarar renta?',
    '¿Cuál es la tarifa del IVA en Colombia?',
    '¿Cómo calcular la retención en la fuente?',
  ]

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header del chat */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-primary">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-white">AsistenteConta</p>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-accent rounded-full animate-pulse" aria-hidden="true" />
              <p className="text-xs text-white/70">
                Powered by Groq · Llama 3.3
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Nueva conversación"
          title="Nueva conversación"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Área de mensajes */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
        role="log"
        aria-live="polite"
        aria-label="Conversación con AsistenteConta"
      >
        {/* Preguntas sugeridas (solo si no hay mensajes del usuario) */}
        {messages.length <= 1 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground px-1">
              Preguntas frecuentes:
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-xs px-3 py-1.5 bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground rounded-lg transition-colors border border-border"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mensajes */}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Mensaje en streaming */}
        {isLoading && streamingContent && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              timestamp: new Date(),
            }}
            isStreaming
          />
        )}

        {/* Indicador de carga */}
        {isLoading && !streamingContent && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div className="chat-bubble-assistant px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">Pensando...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input de mensaje */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-3 p-4 border-t border-border"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu consulta contable... (Enter para enviar)"
          className={cn(
            'flex-1 resize-none px-4 py-3 rounded-xl border border-border bg-background',
            'text-foreground text-sm placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
            'min-h-[48px] max-h-[120px] transition-all'
          )}
          rows={1}
          aria-label="Escribe tu mensaje"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
            'bg-primary text-primary-foreground transition-all',
            'hover:bg-primary-light active:scale-95',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
          )}
          aria-label="Enviar mensaje"
        >
          <Send className="w-5 h-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}

// Componente de burbuja de mensaje individual
interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  // Renderizar markdown básico (negrita, listas)
  const renderContent = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
          isUser ? 'bg-primary/10' : 'bg-accent/20'
        )}
        aria-hidden="true"
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary" />
        ) : (
          <Bot className="w-4 h-4 text-primary" />
        )}
      </div>

      {/* Burbuja */}
      <div
        className={cn(
          'max-w-[75%] px-4 py-3 text-sm',
          isUser ? 'chat-bubble-user' : 'chat-bubble-assistant',
          isStreaming && 'after:content-["▌"] after:animate-pulse after:text-primary'
        )}
        dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}
      />
    </div>
  )
}
