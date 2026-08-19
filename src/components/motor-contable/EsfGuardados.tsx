'use client'
// src/components/motor-contable/EsfGuardados.tsx
// Lista de ESF guardados. Al hacer clic en uno → se abre un panel con TODAS
// las acciones: descargar, editar con IA (regenerar), agregar mes, borrar.

import { useState, useEffect } from 'react'
import {
  Download, FileText, Loader2, Clock, Trash2, Sparkles, Send,
  Plus, Upload, ChevronRight, ArrowLeft, Building2, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

interface EsfItem {
  id: string
  nombre_empresa: string | null
  label: string | null
  mes: number | null
  anio: number | null
  creado_en: string
  regenerable?: boolean
}

export function EsfGuardados({ nit, empresa }: { nit: string; empresa: string }) {
  const [items, setItems]     = useState<EsfItem[]>([])
  const [loading, setLoading] = useState(true)
  const [abierto, setAbierto] = useState<EsfItem | null>(null)   // ESF seleccionado

  // acciones
  const [bajando, setBajando]         = useState(false)
  const [borrando, setBorrando]       = useState(false)
  const [texto, setTexto]             = useState('')
  const [regenerando, setRegenerando] = useState(false)
  const [subiendoMes, setSubiendoMes] = useState(false)
  const [modoEditar, setModoEditar]   = useState(false)
  const [modoMes, setModoMes]         = useState(false)

  const cargar = () => {
    setLoading(true)
    fetch(`/api/esf?nit=${encodeURIComponent(nit)}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setItems(d.esfs ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(cargar, [nit])

  const descargarBase64 = (b64: string, item: EsfItem) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ESF_${(item.nombre_empresa ?? empresa).replace(/[^a-zA-Z0-9]/g, '_')}_${item.label ?? ''}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }

  const descargar = async (item: EsfItem) => {
    setBajando(true)
    try {
      const d = await (await fetch(`/api/esf?id=${item.id}`)).json()
      if (!d.ok || !d.esf?.excel_base64) { toast.error('No se pudo descargar'); return }
      descargarBase64(d.esf.excel_base64, item); toast.success('Excel descargado')
    } catch { toast.error('Error al descargar') } finally { setBajando(false) }
  }

  const borrar = async (item: EsfItem) => {
    if (!confirm(`¿Borrar el estado financiero ${item.label ?? ''}? No se puede deshacer.`)) return
    setBorrando(true)
    try {
      const d = await (await fetch(`/api/esf?id=${item.id}`, { method: 'DELETE' })).json()
      if (!d.ok) { toast.error('No se pudo borrar'); return }
      toast.success('Estado financiero borrado')
      setItems(prev => prev.filter(x => x.id !== item.id)); setAbierto(null)
    } catch { toast.error('Error al borrar') } finally { setBorrando(false) }
  }

  const regenerar = async (item: EsfItem) => {
    if (!texto.trim()) return
    setRegenerando(true)
    try {
      const d = await (await fetch('/api/esf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'regenerar', id: item.id, correccion: texto, guardar_nuevo: true }),
      })).json()
      if (!d.ok) { toast.error(d.error ?? 'No se pudo regenerar'); return }
      descargarBase64(d.excel_base64, item)
      toast.success('Regenerado con el cambio y descargado')
      setTexto(''); setModoEditar(false); cargar(); setAbierto(null)
    } catch { toast.error('Error al regenerar') } finally { setRegenerando(false) }
  }

  const agregarMes = async (item: EsfItem, file: File) => {
    setSubiendoMes(true)
    try {
      const base64 = btoa(new Uint8Array(await file.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), ''))
      const d = await (await fetch('/api/esf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'regenerar', id: item.id, guardar_nuevo: true, balances_extra: [{ nombre: file.name, base64 }] }),
      })).json()
      if (!d.ok) { toast.error(d.error ?? 'No se pudo agregar el mes'); return }
      descargarBase64(d.excel_base64, item)
      const np = d.periodos?.[d.periodos.length - 1]
      toast.success(`Mes agregado${np ? ` (${np.mes}/${np.anio})` : ''} y descargado`)
      setModoMes(false); cargar(); setAbierto(null)
    } catch { toast.error('Error al agregar el mes') } finally { setSubiendoMes(false) }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
      <Loader2 className="w-4 h-4 animate-spin" /> Cargando estados financieros...
    </div>
  )
  if (items.length === 0) return (
    <p className="text-sm text-muted-foreground py-2">
      Este cliente aún no tiene estados financieros guardados. Genera uno y confírmalo para verlo aquí.
    </p>
  )

  // ── PANEL DE UN ESF (al hacer clic) ──
  if (abierto) {
    const item = abierto
    const btn = 'flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-colors'
    return (
      <div className="space-y-4">
        <button onClick={() => { setAbierto(null); setModoEditar(false); setModoMes(false) }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver a la lista
        </button>

        <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
          <div className="p-2.5 bg-primary/10 rounded-xl"><Building2 className="w-5 h-5 text-primary" /></div>
          <div>
            <p className="font-bold text-foreground">{item.nombre_empresa ?? empresa}</p>
            <p className="text-xs text-muted-foreground">
              Estado financiero {item.label ? `· Período ${item.label}` : ''} · guardado el{' '}
              {new Date(item.creado_en).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        {!item.regenerable && (
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Este estado financiero se guardó antes de la última actualización, así que no tiene
              los balances para regenerarlo. Solo se puede descargar o borrar. Genéralo de nuevo
              para poder editarlo con IA o agregarle meses.
            </p>
          </div>
        )}

        {/* Acciones */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => descargar(item)} disabled={bajando}
            className={`${btn} bg-primary text-primary-foreground hover:bg-primary-light disabled:opacity-50`}>
            {bajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar
          </button>
          <button onClick={() => borrar(item)} disabled={borrando}
            className={`${btn} text-red-500 border border-red-500/30 hover:bg-red-500/10 disabled:opacity-50`}>
            {borrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Borrar
          </button>
          {item.regenerable && (
            <button onClick={() => { setModoEditar(!modoEditar); setModoMes(false) }}
              className={`${btn} bg-muted text-foreground hover:bg-muted/70`}>
              <Sparkles className="w-4 h-4" /> Editar con IA
            </button>
          )}
          {item.regenerable && (
            <button onClick={() => { setModoMes(!modoMes); setModoEditar(false) }}
              className={`${btn} bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20`}>
              <Plus className="w-4 h-4" /> Agregar mes
            </button>
          )}
        </div>

        {/* Editar con IA */}
        {modoEditar && item.regenerable && (
          <div className="p-3 border border-border rounded-xl space-y-2 bg-muted/20">
            <p className="text-xs text-muted-foreground">Escribe el cambio. La IA lo aplica y regenera el estado financiero.</p>
            <div className="flex gap-2">
              <input type="text" value={texto} onChange={e => setTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !regenerando) regenerar(item) }}
                placeholder="Ej: Mueve los aportes de nómina a fiscales" disabled={regenerando}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <button onClick={() => regenerar(item)} disabled={regenerando || !texto.trim()}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-light transition-colors disabled:opacity-50">
                {regenerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Agregar mes */}
        {modoMes && item.regenerable && (
          <div className="p-3 border border-border rounded-xl space-y-2 bg-emerald-500/5">
            <p className="text-xs text-muted-foreground">
              Sube el balance del mes nuevo. Se agrega a este estado financiero (con su fecha)
              sin re-subir los meses anteriores.
            </p>
            <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed border-emerald-400/50 text-sm font-medium text-emerald-700 cursor-pointer hover:bg-emerald-500/10 transition-colors ${subiendoMes ? 'opacity-50 pointer-events-none' : ''}`}>
              {subiendoMes ? <><Loader2 className="w-4 h-4 animate-spin" /> Agregando el mes...</> : <><Upload className="w-4 h-4" /> Subir balance del mes nuevo (.xlsx)</>}
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) agregarMes(item, f) }} />
            </label>
          </div>
        )}
      </div>
    )
  }

  // ── LISTA ──
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <FileText className="w-3.5 h-3.5" /> Estados financieros anteriores ({items.length})
      </p>
      {items.map(item => (
        <button key={item.id} onClick={() => { setAbierto(item); setModoEditar(false); setModoMes(false) }}
          className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-left">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-muted rounded-lg"><FileText className="w-4 h-4 text-muted-foreground" /></div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {item.label ? `Período ${item.label}` : 'Estado financiero'}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {new Date(item.creado_en).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
      ))}
    </div>
  )
}