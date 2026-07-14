'use client'

// Panel de Gestión de Tareas - componente principal
import { useState, useEffect, useCallback } from 'react'
import { Task, TaskStatus, TaskTipo, TaskPrioridad } from '@/types'
import { cn } from '@/lib/utils'
import {
  CheckSquare, Plus, Filter, Clock, AlertCircle, CheckCircle2,
  XCircle, Edit2, Trash2, ChevronDown, Flag, User, Building2,
  Calendar, Tag, X, Save, Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isAfter, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Helpers de visualización ────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.ElementType }> = {
  pendiente: { label: 'Pendiente', color: 'text-warning bg-warning/10', icon: Clock },
  en_progreso: { label: 'En progreso', color: 'text-blue-500 bg-blue-500/10', icon: AlertCircle },
  completada: { label: 'Completada', color: 'text-success bg-success/10', icon: CheckCircle2 },
  cancelada: { label: 'Cancelada', color: 'text-muted-foreground bg-muted', icon: XCircle },
}

const PRIORIDAD_CONFIG: Record<TaskPrioridad, { label: string; color: string }> = {
  alta: { label: 'Alta', color: 'text-red-500' },
  media: { label: 'Media', color: 'text-warning' },
  baja: { label: 'Baja', color: 'text-success' },
}

const TIPO_LABELS: Record<TaskTipo, string> = {
  documento_pendiente: 'Documento pendiente',
  declaracion_tributaria: 'Declaración tributaria',
  revision_contable: 'Revisión contable',
  reunion: 'Reunión',
  pago: 'Pago',
  envio_informacion: 'Envío de información',
  renovacion: 'Renovación',
  otro: 'Otro',
}

// ─── Formulario de nueva tarea ────────────────────────────────────────────

interface TaskFormProps {
  clients: Array<{ id: string; razon_social: string; nit: string }>
  contadores: Array<{ id: string; nombre: string; apellido: string }>
  initialClientId?: string
  onSave: (task: Task) => void
  onCancel: () => void
  editTask?: Task | null
}

function TaskForm({ clients, contadores, initialClientId, onSave, onCancel, editTask }: TaskFormProps) {
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    titulo: editTask?.titulo ?? '',
    descripcion: editTask?.descripcion ?? '',
    tipo: editTask?.tipo ?? 'otro' as TaskTipo,
    prioridad: editTask?.prioridad ?? 'media' as TaskPrioridad,
    fecha_limite: editTask?.fecha_limite?.split('T')[0] ?? '',
    client_id: editTask?.client_id ?? initialClientId ?? '',
    assigned_to: editTask?.assigned_to ?? '',
    visible_cliente: editTask?.visible_cliente ?? false,
    notas: editTask?.notas ?? '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...formData,
        fecha_limite: formData.fecha_limite || undefined,
        client_id: formData.client_id || undefined,
        assigned_to: formData.assigned_to || undefined,
        descripcion: formData.descripcion || undefined,
        notas: formData.notas || undefined,
      }

      const url = editTask ? `/api/tasks/${editTask.id}` : '/api/tasks'
      const method = editTask ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar')

      toast.success(editTask ? 'Tarea actualizada' : 'Tarea creada exitosamente')
      onSave(json.data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar la tarea')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Título <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.titulo}
          onChange={(e) => setFormData(p => ({ ...p, titulo: e.target.value }))}
          required
          minLength={3}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Ej: Enviar declaración de renta 2025"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Tipo</label>
          <select
            value={formData.tipo}
            onChange={(e) => setFormData(p => ({ ...p, tipo: e.target.value as TaskTipo }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {Object.entries(TIPO_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Prioridad</label>
          <select
            value={formData.prioridad}
            onChange={(e) => setFormData(p => ({ ...p, prioridad: e.target.value as TaskPrioridad }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Cliente</label>
          <select
            value={formData.client_id}
            onChange={(e) => setFormData(p => ({ ...p, client_id: e.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Sin cliente asociado</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.razon_social} ({c.nit})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Fecha límite</label>
          <input
            type="date"
            value={formData.fecha_limite}
            onChange={(e) => setFormData(p => ({ ...p, fecha_limite: e.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {contadores.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Asignar a</label>
          <select
            value={formData.assigned_to}
            onChange={(e) => setFormData(p => ({ ...p, assigned_to: e.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Sin asignar</option>
            {contadores.map(c => (
              <option key={c.id} value={c.id}>{c.nombre} {c.apellido}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Descripción</label>
        <textarea
          value={formData.descripcion}
          onChange={(e) => setFormData(p => ({ ...p, descripcion: e.target.value }))}
          rows={2}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Detalles adicionales de la tarea..."
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="visible_cliente"
          checked={formData.visible_cliente}
          onChange={(e) => setFormData(p => ({ ...p, visible_cliente: e.target.checked }))}
          className="rounded border-border"
        />
        <label htmlFor="visible_cliente" className="text-sm text-foreground cursor-pointer">
          Visible para el cliente
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary-light transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {editTask ? 'Guardar cambios' : 'Crear tarea'}
        </button>
      </div>
    </form>
  )
}

// ─── Tarjeta de tarea ─────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task
  canEdit: boolean
  onStatusChange: (id: string, status: TaskStatus) => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
}

function TaskCard({ task, canEdit, onStatusChange, onEdit, onDelete }: TaskCardProps) {
  const statusCfg = STATUS_CONFIG[task.status]
  const StatusIcon = statusCfg.icon
  const prioridadCfg = PRIORIDAD_CONFIG[task.prioridad]

  const isOverdue = task.fecha_limite &&
    task.status !== 'completada' &&
    task.status !== 'cancelada' &&
    isAfter(new Date(), parseISO(task.fecha_limite))

  return (
    <div className={cn(
      'bg-card border rounded-xl p-4 space-y-3 transition-all duration-200 hover:shadow-md',
      isOverdue ? 'border-red-500/40' : 'border-border',
      task.status === 'completada' && 'opacity-70'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Flag className={cn('w-4 h-4 mt-0.5 flex-shrink-0', prioridadCfg.color)} />
          <div className="min-w-0">
            <p className={cn(
              'font-medium text-sm text-foreground leading-tight',
              task.status === 'completada' && 'line-through text-muted-foreground'
            )}>
              {task.titulo}
            </p>
            {task.descripcion && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.descripcion}</p>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(task)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Editar"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium', statusCfg.color)}>
          <StatusIcon className="w-3 h-3" />
          {statusCfg.label}
        </span>

        <span className="text-muted-foreground capitalize">
          <Tag className="w-3 h-3 inline mr-1" />
          {TIPO_LABELS[task.tipo]}
        </span>

        {task.fecha_limite && (
          <span className={cn(
            'inline-flex items-center gap-1',
            isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'
          )}>
            <Calendar className="w-3 h-3" />
            {isOverdue && 'VENCIDA · '}
            {format(parseISO(task.fecha_limite), 'd MMM yyyy', { locale: es })}
          </span>
        )}

        {task.client && (
          <span className="text-muted-foreground">
            <Building2 className="w-3 h-3 inline mr-1" />
            {task.client.razon_social}
          </span>
        )}

        {task.assignee && (
          <span className="text-muted-foreground">
            <User className="w-3 h-3 inline mr-1" />
            {task.assignee.nombre} {task.assignee.apellido}
          </span>
        )}
      </div>

      {/* Cambio de estado rápido */}
      {canEdit && task.status !== 'cancelada' && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <span className="text-xs text-muted-foreground">Cambiar estado:</span>
          <div className="flex gap-1">
            {(['pendiente', 'en_progreso', 'completada'] as TaskStatus[])
              .filter(s => s !== task.status)
              .map(s => {
                const cfg = STATUS_CONFIG[s]
                const Ico = cfg.icon
                return (
                  <button
                    key={s}
                    onClick={() => onStatusChange(task.id, s)}
                    className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors hover:opacity-80', cfg.color)}
                    title={`Marcar como ${cfg.label}`}
                  >
                    <Ico className="w-3 h-3" />
                    {cfg.label}
                  </button>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Panel Principal ──────────────────────────────────────────────────────

interface TasksPanelProps {
  userRole: 'administrador' | 'contador' | 'cliente'
  clients?: Array<{ id: string; razon_social: string; nit: string }>
  contadores?: Array<{ id: string; nombre: string; apellido: string }>
  initialClientId?: string
  compact?: boolean
}

export function TasksPanel({
  userRole,
  clients = [],
  contadores = [],
  initialClientId,
  compact = false,
}: TasksPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPrioridad, setFilterPrioridad] = useState<string>('all')

  const canCreate = userRole !== 'cliente'

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (initialClientId) params.set('client_id', initialClientId)
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (filterPrioridad !== 'all') params.set('prioridad', filterPrioridad)

      const res = await fetch(`/api/tasks?${params.toString()}`)
      const json = await res.json()
      if (res.ok) setTasks(json.data ?? [])
    } catch {
      toast.error('Error al cargar tareas')
    } finally {
      setLoading(false)
    }
  }, [initialClientId, filterStatus, filterPrioridad])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setTasks(prev => prev.map(t => t.id === id ? json.data : t))
      toast.success(`Tarea marcada como ${STATUS_CONFIG[status].label}`)
    } catch {
      toast.error('Error al actualizar estado')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setTasks(prev => prev.filter(t => t.id !== id))
      toast.success('Tarea eliminada')
    } catch {
      toast.error('Error al eliminar')
    }
  }

  const handleSave = (task: Task) => {
    if (editTask) {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    } else {
      setTasks(prev => [task, ...prev])
    }
    setShowForm(false)
    setEditTask(null)
  }

  // Estadísticas rápidas
  const stats = {
    total: tasks.length,
    pendientes: tasks.filter(t => t.status === 'pendiente').length,
    enProgreso: tasks.filter(t => t.status === 'en_progreso').length,
    completadas: tasks.filter(t => t.status === 'completada').length,
    vencidas: tasks.filter(t =>
      t.fecha_limite &&
      t.status !== 'completada' &&
      t.status !== 'cancelada' &&
      isAfter(new Date(), parseISO(t.fecha_limite))
    ).length,
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              <CheckSquare className="w-6 h-6 text-primary" />
              Gestión de Tareas
            </h1>
            <p className="text-muted-foreground mt-1">
              {userRole === 'cliente'
                ? 'Tareas y pendientes asignados a tu cuenta'
                : 'Administra pendientes y tareas de tu equipo'}
            </p>
          </div>
          {canCreate && (
            <button
              onClick={() => { setShowForm(true); setEditTask(null) }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary-light transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva Tarea
            </button>
          )}
        </div>
      )}

      {/* KPIs */}
      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pendientes', value: stats.pendientes, color: 'text-warning' },
            { label: 'En progreso', value: stats.enProgreso, color: 'text-blue-500' },
            { label: 'Completadas', value: stats.completadas, color: 'text-success' },
            { label: 'Vencidas', value: stats.vencidas, color: 'text-red-500' },
          ].map(s => (
            <div key={s.label} className="kpi-card text-center">
              <p className={cn('text-2xl font-mono font-bold', s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Formulario */}
      {(showForm || editTask) && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">
              {editTask ? 'Editar tarea' : 'Nueva tarea'}
            </h2>
            <button onClick={() => { setShowForm(false); setEditTask(null) }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <TaskForm
            clients={clients}
            contadores={contadores}
            initialClientId={initialClientId}
            editTask={editTask}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditTask(null) }}
          />
        </div>
      )}

      {/* Filtros */}
      {!compact && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Todos los estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="en_progreso">En progreso</option>
              <option value="completada">Completadas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
          <select
            value={filterPrioridad}
            onChange={(e) => setFilterPrioridad(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todas las prioridades</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
      )}

      {/* Lista de tareas */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckSquare className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">
            {filterStatus !== 'all' || filterPrioridad !== 'all'
              ? 'No hay tareas con estos filtros'
              : userRole === 'cliente'
                ? 'No tienes tareas pendientes'
                : 'No hay tareas registradas'}
          </p>
          {canCreate && filterStatus === 'all' && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Plus className="w-4 h-4" />
              Crear primera tarea
            </button>
          )}
        </div>
      ) : (
        <div className={cn('space-y-3', compact && 'max-h-96 overflow-y-auto pr-1')}>
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              canEdit={canCreate}
              onStatusChange={handleStatusChange}
              onEdit={(t) => { setEditTask(t); setShowForm(false) }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Botón compacto para nueva tarea */}
      {compact && canCreate && !showForm && !editTask && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mt-2 inline-flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva tarea
        </button>
      )}
    </div>
  )
}
