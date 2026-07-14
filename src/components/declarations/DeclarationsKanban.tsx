'use client'

// Kanban de Seguimiento de Declaraciones Tributarias
import { useState, useEffect, useCallback } from 'react'
import { Declaration, DeclarationStatus, TipoImpuesto } from '@/types'
import { cn } from '@/lib/utils'
import {
  Plus, ChevronRight, AlertCircle, Clock, CheckCircle2, XCircle,
  DollarSign, FileText, Calendar, Building2, Loader2, X, Save,
  ChevronDown, Eye, EyeOff, History, ArrowRight, Filter
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO, isAfter } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Configuración de columnas Kanban ─────────────────────────────────────

interface ColumnConfig {
  label: string
  color: string
  bgColor: string
  borderColor: string
  icon: React.ElementType
  description: string
}

export const COLUMNS: Record<DeclarationStatus, ColumnConfig> = {
  pendiente_info: {
    label: 'Pendiente Info',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
    icon: Clock,
    description: 'Esperando información del cliente',
  },
  en_proceso: {
    label: 'En Proceso',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    icon: AlertCircle,
    description: 'Contador está elaborando la declaración',
  },
  lista_revisar: {
    label: 'Lista p/ Revisar',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800',
    icon: Eye,
    description: 'Lista para revisión del cliente',
  },
  presentada: {
    label: 'Presentada',
    color: 'text-primary',
    bgColor: 'bg-primary/5',
    borderColor: 'border-primary/20',
    icon: FileText,
    description: 'Presentada ante la DIAN',
  },
  pagada: {
    label: 'Pagada',
    color: 'text-success',
    bgColor: 'bg-success/5',
    borderColor: 'border-success/20',
    icon: CheckCircle2,
    description: 'Impuesto pagado exitosamente',
  },
  no_aplica: {
    label: 'No Aplica',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/30',
    borderColor: 'border-border',
    icon: EyeOff,
    description: 'No aplica en este periodo',
  },
  rechazada: {
    label: 'Rechazada',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
    icon: XCircle,
    description: 'Rechazada o con error',
  },
}

const TIPO_LABELS: Partial<Record<TipoImpuesto, string>> = {
  IVA_BIMESTRAL: 'IVA Bimestral',
  IVA_CUATRIMESTRAL: 'IVA Cuatrimestral',
  IVA_ANUAL: 'IVA Anual',
  RETENCION_FUENTE_MENSUAL: 'Retención Fuente',
  RENTA_ANUAL: 'Renta Anual',
  RENTA_BIMESTRAL_ANTICIPO: 'Anticipo Renta',
  ICA_BIMESTRAL: 'ICA Bimestral',
  ICA_TRIMESTRAL: 'ICA Trimestral',
  ICA_ANUAL: 'ICA Anual',
  EXOGENA_ANUAL: 'Exógena Anual',
  RETENCION_ICA_BIMESTRAL: 'Retención ICA',
  PATRIMONIO_ANUAL: 'Patrimonio',
  GMF: 'GMF',
  OTROS: 'Otros',
}

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const formatCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)

// ─── Formulario de declaración ─────────────────────────────────────────────

interface DeclarationFormProps {
  clients: Array<{ id: string; razon_social: string; nit: string }>
  onSave: (d: Declaration) => void
  onCancel: () => void
  initialClientId?: string
  editDecl?: Declaration | null
}

function DeclarationForm({ clients, onSave, onCancel, initialClientId, editDecl }: DeclarationFormProps) {
  const [saving, setSaving] = useState(false)
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState({
    client_id: editDecl?.client_id ?? initialClientId ?? '',
    tipo_impuesto: editDecl?.tipo_impuesto ?? '' as TipoImpuesto,
    periodo_mes: editDecl?.periodo_mes?.toString() ?? '',
    periodo_año: editDecl?.periodo_año?.toString() ?? currentYear.toString(),
    fecha_vencimiento: editDecl?.fecha_vencimiento?.split('T')[0] ?? '',
    status: editDecl?.status ?? 'pendiente_info' as DeclarationStatus,
    monto_impuesto: editDecl?.monto_impuesto?.toString() ?? '',
    monto_sanciones: editDecl?.monto_sanciones?.toString() ?? '',
    formulario: editDecl?.formulario ?? '',
    notas_internas: editDecl?.notas_internas ?? '',
    notas_cliente: editDecl?.notas_cliente ?? '',
    info_solicitada: editDecl?.info_solicitada ?? '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_id || !form.tipo_impuesto || !form.periodo_año) {
      toast.error('Cliente, tipo de impuesto y año son obligatorios')
      return
    }
    setSaving(true)
    try {
      const payload = {
        client_id: form.client_id,
        tipo_impuesto: form.tipo_impuesto,
        periodo_mes: form.periodo_mes ? parseInt(form.periodo_mes) : undefined,
        periodo_año: parseInt(form.periodo_año),
        fecha_vencimiento: form.fecha_vencimiento || undefined,
        status: form.status,
        monto_impuesto: form.monto_impuesto ? parseFloat(form.monto_impuesto) : undefined,
        monto_sanciones: form.monto_sanciones ? parseFloat(form.monto_sanciones) : undefined,
        formulario: form.formulario || undefined,
        notas_internas: form.notas_internas || undefined,
        notas_cliente: form.notas_cliente || undefined,
        info_solicitada: form.info_solicitada || undefined,
      }

      const url = editDecl ? `/api/declarations/${editDecl.id}` : '/api/declarations'
      const method = editDecl ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar')
      toast.success(editDecl ? 'Declaración actualizada' : 'Declaración creada')
      onSave(json.data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Cliente <span className="text-red-500">*</span>
          </label>
          <select
            value={form.client_id}
            onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
            required
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Seleccionar cliente...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.razon_social} ({c.nit})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Tipo de Impuesto <span className="text-red-500">*</span>
          </label>
          <select
            value={form.tipo_impuesto}
            onChange={e => setForm(p => ({ ...p, tipo_impuesto: e.target.value as TipoImpuesto }))}
            required
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Seleccionar tipo...</option>
            {Object.entries(TIPO_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Año <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.periodo_año}
            onChange={e => setForm(p => ({ ...p, periodo_año: e.target.value }))}
            min={2020}
            max={2035}
            required
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Mes (opcional)</label>
          <select
            value={form.periodo_mes}
            onChange={e => setForm(p => ({ ...p, periodo_mes: e.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Anual —</option>
            {MESES.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Fecha vencimiento</label>
          <input
            type="date"
            value={form.fecha_vencimiento}
            onChange={e => setForm(p => ({ ...p, fecha_vencimiento: e.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Monto impuesto (COP)</label>
          <input
            type="number"
            value={form.monto_impuesto}
            onChange={e => setForm(p => ({ ...p, monto_impuesto: e.target.value }))}
            min={0}
            step={1000}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Sanciones/intereses</label>
          <input
            type="number"
            value={form.monto_sanciones}
            onChange={e => setForm(p => ({ ...p, monto_sanciones: e.target.value }))}
            min={0}
            step={1000}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Formulario DIAN</label>
          <input
            type="text"
            value={form.formulario}
            onChange={e => setForm(p => ({ ...p, formulario: e.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ej: 300, 350, 490"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Info solicitada al cliente
        </label>
        <input
          type="text"
          value={form.info_solicitada}
          onChange={e => setForm(p => ({ ...p, info_solicitada: e.target.value }))}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Ej: Enviar facturas de ventas del bimestre, soportes de retenciones..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Notas para el cliente
          </label>
          <textarea
            value={form.notas_cliente}
            onChange={e => setForm(p => ({ ...p, notas_cliente: e.target.value }))}
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Mensaje visible para el cliente..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Notas internas (solo contador)
          </label>
          <textarea
            value={form.notas_internas}
            onChange={e => setForm(p => ({ ...p, notas_internas: e.target.value }))}
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Notas internas del equipo..."
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm rounded-xl border border-border hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary-light disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {editDecl ? 'Guardar cambios' : 'Crear declaración'}
        </button>
      </div>
    </form>
  )
}

// ─── Tarjeta de declaración ────────────────────────────────────────────────

interface DeclarationCardProps {
  decl: Declaration
  canEdit: boolean
  onStatusChange: (id: string, status: DeclarationStatus, comentario?: string) => void
  onEdit: (d: Declaration) => void
  onDelete: (id: string) => void
}

const NEXT_STATUS: Partial<Record<DeclarationStatus, DeclarationStatus>> = {
  pendiente_info: 'en_proceso',
  en_proceso: 'lista_revisar',
  lista_revisar: 'presentada',
  presentada: 'pagada',
}

function DeclarationCard({ decl, canEdit, onStatusChange, onEdit, onDelete }: DeclarationCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [movingTo, setMovingTo] = useState<DeclarationStatus | null>(null)
  const [comentario, setComentario] = useState('')

  const cfg = COLUMNS[decl.status]
  const StatusIcon = cfg.icon
  const nextStatus = NEXT_STATUS[decl.status]

  const isOverdue = decl.fecha_vencimiento &&
    !['pagada', 'no_aplica', 'rechazada'].includes(decl.status) &&
    isAfter(new Date(), parseISO(decl.fecha_vencimiento))

  const periodoLabel = decl.periodo_mes
    ? `${MESES[decl.periodo_mes]} ${decl.periodo_año}`
    : `Año ${decl.periodo_año}`

  const handleMoveConfirm = () => {
    if (!movingTo) return
    onStatusChange(decl.id, movingTo, comentario || undefined)
    setMovingTo(null)
    setComentario('')
  }

  return (
    <div className={cn(
      'rounded-xl border p-3 space-y-2 bg-card transition-all duration-200 hover:shadow-sm group',
      isOverdue ? 'border-red-400/50' : 'border-border',
      decl.status === 'pagada' && 'opacity-80',
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {TIPO_LABELS[decl.tipo_impuesto] ?? decl.tipo_impuesto.replace(/_/g, ' ')}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">{periodoLabel}</span>
            {decl.formulario && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md text-muted-foreground">
                Form. {decl.formulario}
              </span>
            )}
            {isOverdue && (
              <span className="text-[10px] text-red-500 font-semibold">VENCIDA</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Cliente */}
      {decl.client && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Building2 className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{decl.client.razon_social}</span>
        </div>
      )}

      {/* Monto */}
      {decl.monto_total !== undefined && decl.monto_total !== null && decl.monto_total > 0 && (
        <div className="flex items-center gap-1 text-xs font-mono font-medium text-foreground">
          <DollarSign className="w-3 h-3 text-success" />
          {formatCOP(decl.monto_total)}
        </div>
      )}

      {/* Fecha vencimiento */}
      {decl.fecha_vencimiento && (
        <div className={cn(
          'flex items-center gap-1 text-[10px]',
          isOverdue ? 'text-red-500' : 'text-muted-foreground'
        )}>
          <Calendar className="w-3 h-3" />
          Vence: {format(parseISO(decl.fecha_vencimiento), 'd MMM yyyy', { locale: es })}
        </div>
      )}

      {/* Contenido expandido */}
      {expanded && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          {decl.notas_cliente && (
            <div className="text-[10px] bg-blue-500/5 border border-blue-500/20 rounded-lg p-2">
              <span className="font-medium text-blue-500">Nota al cliente:</span>
              <p className="text-muted-foreground mt-0.5">{decl.notas_cliente}</p>
            </div>
          )}
          {decl.info_solicitada && (
            <div className="text-[10px] bg-orange-500/5 border border-orange-500/20 rounded-lg p-2">
              <span className="font-medium text-orange-500">Info solicitada:</span>
              <p className="text-muted-foreground mt-0.5">{decl.info_solicitada}</p>
            </div>
          )}
          {decl.numero_radicado && (
            <p className="text-[10px] text-muted-foreground">
              Radicado: <span className="font-mono font-medium">{decl.numero_radicado}</span>
            </p>
          )}
          {decl.fecha_presentacion && (
            <p className="text-[10px] text-muted-foreground">
              Presentada: {format(parseISO(decl.fecha_presentacion), 'd MMM yyyy', { locale: es })}
            </p>
          )}
          {decl.fecha_pago && (
            <p className="text-[10px] text-success">
              Pagada: {format(parseISO(decl.fecha_pago), 'd MMM yyyy', { locale: es })}
            </p>
          )}

          {/* Editar / eliminar */}
          {canEdit && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => onEdit(decl)}
                className="flex-1 text-[10px] py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Editar
              </button>
              <button onClick={() => onDelete(decl.id)}
                className="flex-1 text-[10px] py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-500/10 transition-colors dark:border-red-800"
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mover a siguiente estado */}
      {canEdit && nextStatus && !['pagada', 'no_aplica', 'rechazada'].includes(decl.status) && (
        <>
          {movingTo ? (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <p className="text-[10px] font-medium text-foreground">
                Mover a: <span className={COLUMNS[movingTo].color}>{COLUMNS[movingTo].label}</span>
              </p>
              <input
                type="text"
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                placeholder="Comentario opcional..."
                className="w-full text-[10px] rounded-lg border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex gap-2">
                <button onClick={handleMoveConfirm}
                  className="flex-1 text-[10px] py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary-light transition-colors"
                >
                  Confirmar
                </button>
                <button onClick={() => { setMovingTo(null); setComentario('') }}
                  className="flex-1 text-[10px] py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setMovingTo(nextStatus)}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium border transition-colors',
                COLUMNS[nextStatus].color, COLUMNS[nextStatus].borderColor,
                'hover:opacity-80'
              )}
            >
              <ArrowRight className="w-3 h-3" />
              Mover a {COLUMNS[nextStatus].label}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── Columna Kanban ────────────────────────────────────────────────────────

interface KanbanColumnProps {
  status: DeclarationStatus
  declarations: Declaration[]
  canEdit: boolean
  onStatusChange: (id: string, status: DeclarationStatus, comentario?: string) => void
  onEdit: (d: Declaration) => void
  onDelete: (id: string) => void
  onNew: (status: DeclarationStatus) => void
}

function KanbanColumn({ status, declarations, canEdit, onStatusChange, onEdit, onDelete, onNew }: KanbanColumnProps) {
  const cfg = COLUMNS[status]
  const Icon = cfg.icon

  // Solo mostrar columnas relevantes o que tengan tarjetas
  const isMainColumn = !['no_aplica', 'rechazada'].includes(status)
  if (!isMainColumn && declarations.length === 0) return null

  return (
    <div className={cn('flex flex-col rounded-xl border min-w-[220px] max-w-[280px] w-full', cfg.borderColor, cfg.bgColor)}>
      {/* Header de columna */}
      <div className={cn('flex items-center justify-between px-3 py-2.5 border-b', cfg.borderColor)}>
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', cfg.color)} />
          <span className={cn('text-xs font-semibold', cfg.color)}>{cfg.label}</span>
          {declarations.length > 0 && (
            <span className={cn(
              'w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold',
              cfg.color, 'bg-current/10'
            )}>
              {declarations.length}
            </span>
          )}
        </div>
        {canEdit && isMainColumn && (
          <button
            onClick={() => onNew(status)}
            className={cn('p-1 rounded-lg hover:bg-current/10 transition-colors', cfg.color)}
            title={`Nueva declaración en ${cfg.label}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tarjetas */}
      <div className="flex-1 p-2 space-y-2 min-h-[100px]">
        {declarations.length === 0 ? (
          <p className="text-[10px] text-center text-muted-foreground/60 py-4">
            Sin declaraciones
          </p>
        ) : (
          declarations.map(d => (
            <DeclarationCard
              key={d.id}
              decl={d}
              canEdit={canEdit}
              onStatusChange={onStatusChange}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Panel Principal ───────────────────────────────────────────────────────

interface DeclarationsKanbanProps {
  userRole: 'administrador' | 'contador' | 'cliente'
  clients?: Array<{ id: string; razon_social: string; nit: string }>
  initialClientId?: string
}

export function DeclarationsKanban({ userRole, clients = [], initialClientId }: DeclarationsKanbanProps) {
  const [declarations, setDeclarations] = useState<Declaration[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editDecl, setEditDecl] = useState<Declaration | null>(null)
  const [filterAño, setFilterAño] = useState(new Date().getFullYear().toString())
  const [filterCliente, setFilterCliente] = useState(initialClientId ?? 'all')
  const [newStatus, setNewStatus] = useState<DeclarationStatus>('pendiente_info')

  const canEdit = userRole !== 'cliente'

  const loadDeclarations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterAño) params.set('año', filterAño)
      if (filterCliente && filterCliente !== 'all') params.set('client_id', filterCliente)

      const res = await fetch(`/api/declarations?${params}`)
      const json = await res.json()
      if (res.ok) setDeclarations(json.data ?? [])
    } catch {
      toast.error('Error al cargar declaraciones')
    } finally {
      setLoading(false)
    }
  }, [filterAño, filterCliente])

  useEffect(() => { loadDeclarations() }, [loadDeclarations])

  const handleStatusChange = async (id: string, status: DeclarationStatus, comentario?: string) => {
    try {
      const res = await fetch(`/api/declarations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, comentario_historial: comentario }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setDeclarations(prev => prev.map(d => d.id === id ? json.data : d))
      toast.success(`Declaración movida a: ${COLUMNS[status].label}`)
    } catch {
      toast.error('Error al actualizar estado')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta declaración?')) return
    try {
      const res = await fetch(`/api/declarations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setDeclarations(prev => prev.filter(d => d.id !== id))
      toast.success('Declaración eliminada')
    } catch {
      toast.error('Error al eliminar')
    }
  }

  const handleSave = (d: Declaration) => {
    if (editDecl) {
      setDeclarations(prev => prev.map(x => x.id === d.id ? d : x))
    } else {
      setDeclarations(prev => [d, ...prev])
    }
    setShowForm(false)
    setEditDecl(null)
  }

  const handleNewInColumn = (status: DeclarationStatus) => {
    setNewStatus(status)
    setEditDecl(null)
    setShowForm(true)
  }

  // Agrupar por estado
  const byStatus = (Object.keys(COLUMNS) as DeclarationStatus[]).reduce<Record<DeclarationStatus, Declaration[]>>(
    (acc, s) => {
      acc[s] = declarations.filter(d => d.status === s)
      return acc
    },
    {} as Record<DeclarationStatus, Declaration[]>
  )

  // Stats
  const stats = {
    total: declarations.length,
    pendientes: byStatus.pendiente_info.length + byStatus.en_proceso.length,
    presentadas: byStatus.presentada.length,
    pagadas: byStatus.pagada.length,
    vencidas: declarations.filter(d =>
      d.fecha_vencimiento &&
      !['pagada', 'no_aplica'].includes(d.status) &&
      isAfter(new Date(), parseISO(d.fecha_vencimiento))
    ).length,
  }

  const años = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString())

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <ChevronRight className="w-6 h-6 text-primary" />
            Seguimiento de Declaraciones
          </h1>
          <p className="text-muted-foreground mt-1">
            {userRole === 'cliente'
              ? 'Estado de tus declaraciones tributarias'
              : 'Gestiona el ciclo de vida de cada declaración tributaria'}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setShowForm(true); setEditDecl(null); setNewStatus('pendiente_info') }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary-light transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva Declaración
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total declaraciones', value: stats.total, color: 'text-foreground' },
          { label: 'En proceso', value: stats.pendientes, color: 'text-blue-500' },
          { label: 'Presentadas', value: stats.presentadas, color: 'text-primary' },
          { label: 'Pagadas', value: stats.pagadas, color: 'text-success' },
        ].map(s => (
          <div key={s.label} className="kpi-card text-center">
            <p className={cn('text-2xl font-mono font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Alerta de vencidas */}
      {stats.vencidas > 0 && (
        <div className="flex items-center gap-3 p-3.5 bg-red-500/5 border border-red-500/20 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">
            <strong>{stats.vencidas}</strong> declaraci{stats.vencidas === 1 ? 'ón' : 'ones'} con fecha de vencimiento pasada y sin presentar.
          </p>
        </div>
      )}

      {/* Formulario */}
      {(showForm || editDecl) && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">
              {editDecl ? 'Editar declaración' : 'Nueva declaración'}
            </h2>
            <button onClick={() => { setShowForm(false); setEditDecl(null) }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <DeclarationForm
            clients={clients}
            initialClientId={filterCliente !== 'all' ? filterCliente : undefined}
            editDecl={editDecl}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditDecl(null) }}
          />
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={filterAño}
            onChange={e => setFilterAño(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {años.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {clients.length > 1 && (
          <select
            value={filterCliente}
            onChange={e => setFilterCliente(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos los clientes</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.razon_social}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tablero Kanban */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {(Object.keys(COLUMNS) as DeclarationStatus[]).map(status => (
              <KanbanColumn
                key={status}
                status={status}
                declarations={byStatus[status]}
                canEdit={canEdit}
                onStatusChange={handleStatusChange}
                onEdit={(d) => { setEditDecl(d); setShowForm(false) }}
                onDelete={handleDelete}
                onNew={handleNewInColumn}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
