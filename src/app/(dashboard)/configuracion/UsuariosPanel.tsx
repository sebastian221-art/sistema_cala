'use client'

// Gestión de usuarios del sistema (crear, activar/desactivar, cambiar rol)
import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  UserPlus,
  Loader2,
  Check,
  X,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Usuario {
  id: string
  email: string
  nombre: string
  apellido: string
  role: string
  telefono: string | null
  activo: boolean
  created_at: string
}

const ROLES = [
  { value: 'contador', label: 'Contador' },
  { value: 'administrador', label: 'Administrador' },
  { value: 'cliente', label: 'Cliente' },
]

export function UsuariosPanel({ miId }: { miId: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  // Formulario
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [verPass, setVerPass] = useState(false)
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    telefono: '',
    role: 'contador',
  })

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/admin/usuarios')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setUsuarios(json.usuarios ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar usuarios')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const crear = async () => {
    setGuardando(true)
    setError('')
    setExito('')
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al crear')

      setExito(`Usuario ${form.nombre} creado correctamente`)
      setForm({ nombre: '', apellido: '', email: '', password: '', telefono: '', role: 'contador' })
      setAbierto(false)
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el usuario')
    } finally {
      setGuardando(false)
    }
  }

  const alternar = async (u: Usuario) => {
    setError('')
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, activo: !u.activo }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al actualizar')
      setUsuarios((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, activo: !x.activo } : x))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar')
    }
  }

  const cambiarRol = async (u: Usuario, role: string) => {
    setError('')
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, role }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al actualizar')
      setUsuarios((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, role } : x))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar el rol')
    }
  }

  const formValido =
    form.nombre.trim() &&
    form.apellido.trim() &&
    form.email.includes('@') &&
    form.password.length >= 8

  return (
    <section className="bg-card border border-border rounded-xl">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" aria-hidden="true" />
            Usuarios del sistema
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Crea contadores y administra sus accesos.
          </p>
        </div>
        <button
          onClick={() => setAbierto(!abierto)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          {abierto ? 'Cancelar' : 'Nuevo usuario'}
        </button>
      </div>

      {/* Mensajes */}
      {error && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          {error}
        </div>
      )}
      {exito && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-emerald-500/10 text-emerald-700 text-sm">
          {exito}
        </div>
      )}

      {/* Formulario de creación */}
      {abierto && (
        <div className="p-5 border-b border-border bg-muted/20 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                Nombre
              </label>
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="María"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                Apellido
              </label>
              <input
                value={form.apellido}
                onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Gómez"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">
              Correo electrónico
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="contador@calaasociados.com"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                Contraseña (mínimo 8 caracteres)
              </label>
              <div className="relative">
                <input
                  type={verPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setVerPass(!verPass)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={verPass ? 'Ocultar' : 'Mostrar'}
                >
                  {verPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                Rol
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={crear}
            disabled={!formValido || guardando}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {guardando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Crear usuario
          </button>
        </div>
      )}

      {/* Lista */}
      {cargando ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : usuarios.length === 0 ? (
        <div className="p-10 text-center text-muted-foreground text-sm">
          No hay usuarios registrados.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {usuarios.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-5 py-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-accent/20 text-primary text-xs font-semibold flex-shrink-0">
                {(u.nombre[0] ?? '') + (u.apellido[0] ?? '')}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {u.nombre} {u.apellido}
                  </p>
                  {u.id === miId && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                      Tú
                    </span>
                  )}
                  {u.role === 'administrador' && (
                    <ShieldCheck
                      className="w-3.5 h-3.5 text-primary flex-shrink-0"
                      aria-label="Administrador"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>

              {/* Rol */}
              <select
                value={u.role}
                onChange={(e) => cambiarRol(u, e.target.value)}
                disabled={u.id === miId}
                className="text-xs rounded-lg border border-border bg-background text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 flex-shrink-0"
                aria-label={`Rol de ${u.nombre}`}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              {/* Activo / Inactivo */}
              <button
                onClick={() => alternar(u)}
                disabled={u.id === miId}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed',
                  u.activo
                    ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                )}
                title={u.activo ? 'Desactivar' : 'Activar'}
              >
                {u.activo ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                {u.activo ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}