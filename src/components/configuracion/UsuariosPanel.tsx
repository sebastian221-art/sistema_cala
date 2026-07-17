'use client'

// Panel de gestión de usuarios — solo administradores
import { useState, useEffect } from 'react'
import { UserPlus, Loader2, Check, X, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Usuario {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
  role: string
  activo: boolean
  created_at: string
}

export function UsuariosPanel() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [creando, setCreando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    role: 'contador',
  })

  const cargar = async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/admin/usuarios')
      const json = await res.json()
      if (res.ok) setUsuarios(json.data ?? [])
      else setMensaje({ tipo: 'error', texto: json.error ?? 'Error cargando usuarios' })
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión' })
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const crear = async () => {
    setCreando(true)
    setMensaje(null)
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (res.ok) {
        setMensaje({ tipo: 'ok', texto: `Usuario ${form.email} creado correctamente` })
        setForm({ nombre: '', apellido: '', email: '', password: '', role: 'contador' })
        setMostrarForm(false)
        cargar()
      } else {
        setMensaje({ tipo: 'error', texto: json.error ?? 'Error creando usuario' })
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión' })
    } finally {
      setCreando(false)
    }
  }

  const toggleActivo = async (id: string, activo: boolean) => {
    await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, activo: !activo }),
    })
    cargar()
  }

  const formValido =
    form.nombre.trim() !== '' &&
    form.email.trim() !== '' &&
    form.password.length >= 8

  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" aria-hidden="true" />
          Usuarios del Sistema
        </h2>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary-light transition-colors font-medium"
        >
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          {mostrarForm ? 'Cancelar' : 'Nuevo usuario'}
        </button>
      </div>

      {mensaje && (
        <div
          className={cn(
            'mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2',
            mensaje.tipo === 'ok'
              ? 'bg-success/10 text-success'
              : 'bg-red-500/10 text-red-500'
          )}
        >
          {mensaje.tipo === 'ok' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {mensaje.texto}
        </div>
      )}

      {/* Formulario de creación */}
      {mostrarForm && (
        <div className="mb-5 p-4 rounded-lg border border-border bg-muted/30 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Nombre *"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              placeholder="Apellido"
              value={form.apellido}
              onChange={(e) => setForm({ ...form, apellido: e.target.value })}
              className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="email"
              placeholder="Correo electrónico *"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              placeholder="Contraseña (mín. 8 caracteres) *"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="contador">Contador</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
          <button
            onClick={crear}
            disabled={!formValido || creando}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creando && <Loader2 className="w-4 h-4 animate-spin" />}
            {creando ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      )}

      {/* Lista de usuarios */}
      {cargando ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : usuarios.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No hay usuarios registrados.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {usuarios.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {u.nombre} {u.apellido}
                </p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-medium capitalize flex-shrink-0">
                {u.role}
              </span>
              <button
                onClick={() => toggleActivo(u.id, u.activo)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md font-medium transition-colors flex-shrink-0',
                  u.activo
                    ? 'bg-success/10 text-success hover:bg-success/20'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                )}
                title={u.activo ? 'Desactivar usuario' : 'Activar usuario'}
              >
                {u.activo ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}