'use client'

// Página: Configuración de WhatsApp (interactiva)
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, MessageSquare, CheckCircle, XCircle, Info, Plus, Save, X, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Template {
  id: string
  nombre: string
  tipo: string
  contenido: string
  activo: boolean
}

interface WhatsAppSettings {
  whatsapp_token_configured: boolean
  whatsapp_phone_id_configured: boolean
  whatsapp_phone_number: string
  whatsapp_verify_token_configured: boolean
  templates: Template[]
}

const TIPO_OPTIONS = [
  { value: 'mensual_contador', label: 'Resumen mensual (Contador)' },
  { value: 'anticipado_cliente', label: 'Recordatorio anticipado (Cliente)' },
  { value: 'dia_vencimiento', label: 'Día de vencimiento' },
  { value: 'urgente_vencido', label: 'Urgente / Vencido' },
]

const TEMPLATE_EXAMPLES: Record<string, string> = {
  mensual_contador: '📊 Resumen mensual: Tu cliente [empresa] tiene [N] vencimientos en [mes]. Revisa el sistema.',
  anticipado_cliente: '📅 Recordatorio DIAN: Tu [IVA] vence el [fecha]. Contacta a tu contador.',
  dia_vencimiento: '⏰ HOY vence tu [IVA]. Asegúrate de haber presentado tu declaración.',
  urgente_vencido: '⚠️ URGENTE: Tu [IVA] vence MAÑANA [fecha]. Evita sanciones de la DIAN.',
}

export default function WhatsAppConfigPage() {
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)

  const [form, setForm] = useState({
    id: '',
    nombre: '',
    tipo: 'anticipado_cliente',
    contenido: '',
    activo: true,
  })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) {
        if (res.status === 403) {
          toast.error('Solo los administradores pueden acceder a esta configuración')
          return
        }
        throw new Error()
      }
      const { data } = await res.json()
      setSettings(data)
    } catch {
      toast.error('Error al cargar configuración')
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateForm = () => {
    setEditingTemplate(null)
    setForm({ id: '', nombre: '', tipo: 'anticipado_cliente', contenido: '', activo: true })
    setShowForm(true)
  }

  const openEditForm = (t: Template) => {
    setEditingTemplate(t)
    setForm({ id: t.id, nombre: t.nombre, tipo: t.tipo, contenido: t.contenido ?? '', activo: t.activo })
    setShowForm(true)
  }

  const saveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre || !form.tipo || !form.contenido) {
      toast.error('Nombre, tipo y contenido son requeridos')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al guardar')
      }

      toast.success(form.id ? 'Plantilla actualizada' : 'Plantilla creada correctamente')
      setShowForm(false)
      await loadSettings()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  const configItems = settings
    ? [
        {
          label: 'WHATSAPP_TOKEN',
          description: 'Token de acceso permanente de Meta for Developers',
          configured: settings.whatsapp_token_configured,
        },
        {
          label: 'WHATSAPP_PHONE_ID',
          description: 'ID del número de teléfono en Meta Business',
          configured: settings.whatsapp_phone_id_configured,
        },
        {
          label: 'WHATSAPP_PHONE_NUMBER',
          description: 'Número de WhatsApp de envío (formato internacional)',
          configured: settings.whatsapp_phone_id_configured,
          value: settings.whatsapp_phone_number || 'No configurado',
        },
        {
          label: 'WHATSAPP_VERIFY_TOKEN',
          description: 'Token de verificación para el webhook',
          configured: settings.whatsapp_verify_token_configured,
        },
      ]
    : []

  const allConfigured = configItems.every((c) => c.configured)

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
          <h1 className="text-2xl font-display font-bold text-foreground">Configuración WhatsApp</h1>
          <p className="text-muted-foreground mt-1">
            Integración con Meta Cloud API para recordatorios automáticos
          </p>
        </div>
      </div>

      {/* Estado general */}
      <div
        className={cn(
          'flex items-center gap-3 p-4 rounded-xl border',
          allConfigured
            ? 'bg-success/10 border-success/30 text-success'
            : 'bg-warning/10 border-warning/30 text-warning'
        )}
      >
        <MessageSquare className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold text-sm">
            {allConfigured ? 'WhatsApp configurado correctamente' : 'WhatsApp no configurado completamente'}
          </p>
          <p className="text-xs mt-0.5 opacity-80">
            {allConfigured
              ? `Número activo: ${settings?.whatsapp_phone_number}`
              : 'Configura las variables de entorno en tu archivo .env.local o en Vercel'}
          </p>
        </div>
      </div>

      {/* Variables de entorno */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Variables de entorno requeridas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configura estas variables en tu archivo <code className="font-mono">.env.local</code> o en el panel de Vercel
          </p>
        </div>
        <div className="divide-y divide-border">
          {configItems.map((item) => (
            <div key={item.label} className="flex items-start justify-between px-5 py-4 gap-4">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                {item.value && item.configured && (
                  <p className="text-xs text-foreground mt-1 font-mono">{item.value}</p>
                )}
              </div>
              {item.configured ? (
                <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" aria-label="Configurado" />
              ) : (
                <XCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" aria-label="No configurado" />
              )}
            </div>
          ))}
        </div>

        <div className="px-5 py-4 bg-muted/30 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Las variables de entorno deben configurarse en el servidor y requieren reinicio de la aplicación.
            Usa el comando: <code className="font-mono bg-muted px-1 py-0.5 rounded">WHATSAPP_TOKEN=xxx WHATSAPP_PHONE_ID=xxx</code>
          </p>
        </div>
      </div>

      {/* Webhook info */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" aria-hidden="true" />
          Configuración del Webhook
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-32 flex-shrink-0">URL del Webhook:</span>
            <code className="font-mono text-foreground bg-muted px-2 py-0.5 rounded text-xs break-all">
              https://tu-dominio.com/api/webhooks/whatsapp
            </code>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-32 flex-shrink-0">Método:</span>
            <code className="font-mono text-foreground bg-muted px-2 py-0.5 rounded text-xs">POST</code>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Configura este webhook en tu cuenta de Meta for Developers → WhatsApp → Configuración → Webhooks.
        </p>
      </div>

      {/* Plantillas de mensajes */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Plantillas de mensajes</h2>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva plantilla
          </button>
        </div>

        {/* Formulario de plantilla */}
        {showForm && (
          <div className="p-5 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-sm text-foreground">
                {editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={saveTemplate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Nombre de la plantilla <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="recordatorio_iva"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Tipo <span className="text-danger">*</span>
                  </label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value, contenido: TEMPLATE_EXAMPLES[e.target.value] ?? '' })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {TIPO_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Contenido del mensaje <span className="text-danger">*</span>
                </label>
                <textarea
                  value={form.contenido}
                  onChange={(e) => setForm({ ...form, contenido: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  rows={3}
                  placeholder={TEMPLATE_EXAMPLES[form.tipo]}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Variables disponibles: [empresa], [NIT], [impuesto], [fecha], [dias]
                </p>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span className="text-sm text-foreground">Plantilla activa</span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium',
                      'hover:bg-primary-light transition-colors disabled:opacity-60'
                    )}
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Lista de plantillas */}
        {!settings?.templates || settings.templates.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            No hay plantillas configuradas. Crea una para personalizar los mensajes.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {settings.templates.map((template) => (
              <div key={template.id} className="flex items-center justify-between p-4 gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs font-semibold text-primary">{template.nombre}</p>
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        template.activo
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {template.activo ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {TIPO_OPTIONS.find((o) => o.value === template.tipo)?.label ?? template.tipo}
                  </p>
                </div>
                <button
                  onClick={() => openEditForm(template)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                  title="Editar plantilla"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
