'use client'

// Página: Gestión de Usuarios del sistema
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, UserCheck, UserX, Shield, Users, Plus, X, Loader2, Eye, EyeOff, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface UserProfile {
  id: string
  email: string
  nombre: string
  apellido: string
  role: string
  activo: boolean
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  administrador: 'Administrador',
  contador: 'Contador',
  cliente: 'Cliente',
}

const ROLE_COLORS: Record<string, string> = {
  administrador: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  contador: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  cliente: 'bg-green-500/10 text-green-700 dark:text-green-400',
}

export default function UsuariosConfigPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isRepairing, setIsRepairing] = useState(false)

  const [form, setForm] = useState({
    email: '',
    nombre: '',
    apellido: '',
    role: 'contador' as 'administrador' | 'contador' | 'cliente',
    password: '',
  })

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        if (res.status === 403) {
          toast.error('Solo los administradores pueden gestionar usuarios')
          return
        }
        throw new Error('Error al cargar usuarios')
      }
      const { data } = await res.json()
      setUsers(data ?? [])
    } catch {
      toast.error('Error al cargar usuarios')
    } finally {
      setIsLoading(false)
    }
  }

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email || !form.nombre || !form.apellido || !form.password) {
      toast.error('Todos los campos son requeridos')
      return
    }

    setIsCreating(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al crear usuario')
      }

      toast.success(`Usuario ${form.nombre} ${form.apellido} creado correctamente`)
      setForm({ email: '', nombre: '', apellido: '', role: 'contador', password: '' })
      setShowCreateForm(false)
      await loadUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear usuario')
    } finally {
      setIsCreating(false)
    }
  }

  const repairUsers = async () => {
    setIsRepairing(true)
    try {
      const res = await fetch('/api/admin/users/repair', { method: 'POST' })
      const { data, error } = await res.json()
      if (!res.ok) throw new Error(error ?? 'Error al reparar')
      toast.success(`Perfiles reparados: ${data.reparados} de ${data.total_auth_users} usuarios sincronizados`)
      await loadUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al reparar perfiles')
    } finally {
      setIsRepairing(false)
    }
  }

  const toggleActive = async (u: UserProfile) => {
    setTogglingId(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !u.activo }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al actualizar')
      }

      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, activo: !x.activo } : x)))
      toast.success(`Usuario ${u.activo ? 'desactivado' : 'activado'} correctamente`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar usuario')
    } finally {
      setTogglingId(null)
    }
  }

  const totalUsers = users.length
  const totalActivos = users.filter((u) => u.activo).length
  const totalContadores = users.filter((u) => u.role === 'contador').length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/configuracion"
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Volver a configuración"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold text-foreground">Gestión de Usuarios</h1>
          <p className="text-muted-foreground mt-1">Administra los contadores y clientes del sistema</p>
        </div>
        <button
          onClick={repairUsers}
          disabled={isRepairing}
          title="Sincroniza todos los usuarios de Supabase Auth con la tabla profiles. Úsalo si un usuario fue creado pero no aparece en la lista o tiene la cuenta inactiva."
          className="flex items-center gap-2 px-3 py-2 border border-border text-muted-foreground rounded-xl text-sm font-medium hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {isRepairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
          {isRepairing ? 'Reparando...' : 'Reparar perfiles'}
        </button>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary-light transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total usuarios', value: totalUsers, icon: Users, color: 'text-foreground' },
          { label: 'Activos', value: totalActivos, icon: UserCheck, color: 'text-success' },
          { label: 'Contadores', value: totalContadores, icon: Shield, color: 'text-primary' },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${stat.color}`} aria-hidden="true" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Formulario de creación */}
      {showCreateForm && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Crear nuevo usuario</h2>
            <button
              onClick={() => setShowCreateForm(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Nombre <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                placeholder="Carlos"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Apellido <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.apellido}
                onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                placeholder="García"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Email <span className="text-danger">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                placeholder="usuario@empresa.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Rol <span className="text-danger">*</span>
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              >
                <option value="contador">Contador</option>
                <option value="administrador">Administrador</option>
                <option value="cliente">Cliente</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Contraseña temporal <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                El usuario deberá cambiar su contraseña al iniciar sesión por primera vez.
              </p>
            </div>

            <div className="sm:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium',
                  'hover:bg-primary-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
                )}
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isCreating ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla de usuarios */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Usuarios registrados</h2>
          <span className="text-sm text-muted-foreground">{totalUsers} usuarios</span>
        </div>

        {users.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No hay usuarios registrados aún.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {(u.nombre?.[0] ?? '?').toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {u.nombre} {u.apellido}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.email ?? 'Sin email'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      ROLE_COLORS[u.role] ?? 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>

                  <button
                    onClick={() => toggleActive(u)}
                    disabled={togglingId === u.id}
                    className={cn(
                      'flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors',
                      u.activo
                        ? 'text-success hover:bg-success/10'
                        : 'text-muted-foreground hover:bg-muted',
                      'disabled:opacity-50'
                    )}
                    title={u.activo ? 'Desactivar usuario' : 'Activar usuario'}
                  >
                    {togglingId === u.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : u.activo ? (
                      <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Requiere <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> configurada para crear usuarios.
      </p>
    </div>
  )
}
