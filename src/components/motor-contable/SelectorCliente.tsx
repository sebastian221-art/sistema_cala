'use client'
// src/components/motor-contable/SelectorCliente.tsx
// ════════════════════════════════════════════════════════════════════════
// Primer paso del flujo: el contador elige si es un cliente NUEVO o uno
// EXISTENTE (ya con perfil guardado). Para existentes, muestra la lista.
// ════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { UserPlus, Users, Search, Building2, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

export interface ClienteGuardado {
  nit:            string
  nombre_empresa: string
  actualizado_en: string
}

interface Props {
  onNuevo:     () => void
  onExistente: (cliente: ClienteGuardado) => void
}

export function SelectorCliente({ onNuevo, onExistente }: Props) {
  const [modo,     setModo]     = useState<'inicio' | 'existente'>('inicio')
  const [clientes, setClientes] = useState<ClienteGuardado[]>([])
  const [loading,  setLoading]  = useState(false)
  const [busqueda, setBusqueda] = useState('')

  // Cargar lista de clientes con perfil guardado
  useEffect(() => {
    if (modo !== 'existente') return
    setLoading(true)
    const supabase = createClient()
    supabase
      .from('perfiles_cliente')
      .select('nit, nombre_empresa, actualizado_en')
      .order('actualizado_en', { ascending: false })
      .then(({ data }) => {
        setClientes((data ?? []) as ClienteGuardado[])
        setLoading(false)
      })
  }, [modo])

  const filtrados = clientes.filter(c =>
    c.nombre_empresa.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.nit.includes(busqueda)
  )

  // ── Pantalla inicial: dos tarjetas grandes ────────────────────────────
  if (modo === 'inicio') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Cliente nuevo */}
        <button
          onClick={onNuevo}
          className="group flex flex-col items-start gap-3 p-6 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
        >
          <div className="p-3 bg-primary/10 rounded-xl group-hover:bg-primary/20 transition-colors">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Cliente nuevo</p>
            <p className="text-sm text-muted-foreground mt-1">
              Primera vez. Subes el balance y describes cómo manejarlo.
              La IA crea el perfil.
            </p>
          </div>
        </button>

        {/* Cliente existente */}
        <button
          onClick={() => setModo('existente')}
          className="group flex flex-col items-start gap-3 p-6 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
        >
          <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors">
            <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Cliente existente</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ya tiene perfil guardado. Solo subes el nuevo balance del mes.
            </p>
          </div>
        </button>
      </div>
    )
  }

  // ── Lista de clientes existentes ───────────────────────────────────────
  return (
    <div className="space-y-4">
      <button
        onClick={() => setModo('inicio')}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Volver
      </button>

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o NIT..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando clientes...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {clientes.length === 0
            ? 'Todavía no hay clientes con perfil guardado. Empieza creando uno nuevo.'
            : 'No se encontraron clientes con esa búsqueda.'}
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filtrados.map(cliente => (
            <button
              key={cliente.nit}
              onClick={() => onExistente(cliente)}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
            >
              <div className="p-2 bg-muted rounded-lg">
                <Building2 className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{cliente.nombre_empresa}</p>
                <p className="text-xs text-muted-foreground">NIT {cliente.nit}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}