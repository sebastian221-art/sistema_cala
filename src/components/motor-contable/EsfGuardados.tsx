'use client'
// src/components/motor-contable/EsfGuardados.tsx
// Lista los ESF guardados de un cliente: descargar, BORRAR y EDITAR CON IA (regenerar).

import { useState, useEffect } from 'react'
import { Download, FileText, Loader2, Clock, Trash2, Sparkles, Send, X, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'

interface EsfItem {
  id: string
  nombre_empresa: string | null
  label: string | null
  creado_en: string
  regenerable?: boolean
}

export function EsfGuardados({ nit, empresa }: { nit: string; empresa: string }) {
  const [items, setItems]     = useState<EsfItem[]>([])
  const [loading, setLoading] = useState(true)
  const [bajando, setBajando] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)   // id en edición
  const [texto, setTexto]       = useState('')
  const [regenerando, setRegenerando] = useState(false)
  const [agregando, setAgregando]     = useState<string | null>(null)  // id al que se agrega mes
  const [subiendoMes, setSubiendoMes] = useState(false)

  const cargar = () => {
    setLoading(true)
    fetch(`/api/esf?nit=${encodeURIComponent(nit)}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setItems(d.esfs ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(cargar, [nit])

  const descargarBase64 = (b64: string, item: { nombre_empresa: string | null; label: string | null }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ESF_${(item.nombre_empresa ?? empresa).replace(/[^a-zA-Z0-9]/g, '_')}_${item.label ?? ''}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }

  const descargar = async (item: EsfItem) => {
    setBajando(item.id)
    try {
      const d = await (await fetch(`/api/esf?id=${item.id}`)).json()
      if (!d.ok || !d.esf?.excel_base64) { toast.error('No se pudo descargar'); return }
      descargarBase64(d.esf.excel_base64, item)
      toast.success('Excel descargado')
    } catch { toast.error('Error al descargar') }
    finally { setBajando(null) }
  }

  const borrar = async (item: EsfItem) => {
    if (!confirm(`¿Borrar el estado financiero ${item.label ?? ''}? Esta acción no se puede deshacer.`)) return
    setBorrando(item.id)
    try {
      const d = await (await fetch(`/api/esf?id=${item.id}`, { method: 'DELETE' })).json()
      if (!d.ok) { toast.error('No se pudo borrar'); return }
      toast.success('Estado financiero borrado')
      setItems(prev => prev.filter(x => x.id !== item.id))
    } catch { toast.error('Error al borrar') }
    finally { setBorrando(null) }
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
      toast.success('Estado financiero regenerado con el cambio y descargado')
      setEditando(null); setTexto(''); cargar()
    } catch { toast.error('Error al regenerar') }
    finally { setRegenerando(false) }
  }

  // ── #3: agregar un mes nuevo al ESF (sin re-subir todo) ──
  const agregarMes = async (item: EsfItem, file: File) => {
    setSubiendoMes(true)
    try {
      const base64 = btoa(new Uint8Array(await file.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), ''))
      const d = await (await fetch('/api/esf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'regenerar', id: item.id, guardar_nuevo: true,
          balances_extra: [{ nombre: file.name, base64 }],
        }),
      })).json()
      if (!d.ok) { toast.error(d.error ?? 'No se pudo agregar el mes'); return }
      descargarBase64(d.excel_base64, item)
      const nuevoPer = d.periodos?.[d.periodos.length - 1]
      toast.success(`Mes agregado${nuevoPer ? ` (${nuevoPer.mes}/${nuevoPer.anio})` : ''} y estado financiero actualizado`)
      setAgregando(null); cargar()
    } catch { toast.error('Error al agregar el mes') }
    finally { setSubiendoMes(false) }
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

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <FileText className="w-3.5 h-3.5" /> Estados financieros anteriores ({items.length})
      </p>
      {items.map((item, idx) => (
        <div key={item.id} className="rounded-xl border border-border">
          <div className="flex items-center justify-between gap-3 p-3">
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
            <div className="flex items-center gap-1">
              <button onClick={() => descargar(item)} disabled={bajando === item.id}
                title="Descargar"
                className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50">
                {bajando === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
              {item.regenerable && idx === 0 && (
                <button onClick={() => setAgregando(agregando === item.id ? null : item.id)}
                  title="Agregar mes"
                  className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors">
                  {agregando === item.id ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
              )}
              {item.regenerable && (
                <button onClick={() => { setEditando(editando === item.id ? null : item.id); setTexto('') }}
                  title="Editar con IA"
                  className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium bg-muted text-foreground hover:bg-muted/70 transition-colors">
                  {editando === item.id ? <X className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </button>
              )}
              <button onClick={() => borrar(item)} disabled={borrando === item.id}
                title="Borrar"
                className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                {borrando === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Chat de edición con IA */}
          {editando === item.id && (
            <div className="border-t border-border p-3 space-y-2 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Escribe el cambio que necesitas. La IA lo aplica y regenera el estado financiero.
              </p>
              <div className="flex gap-2">
                <input type="text" value={texto} onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !regenerando) regenerar(item) }}
                  placeholder="Ej: Mueve los aportes de nómina a fiscales"
                  disabled={regenerando}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <button onClick={() => regenerar(item)} disabled={regenerando || !texto.trim()}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-light transition-colors disabled:opacity-50">
                  {regenerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* #3: agregar un mes nuevo */}
          {agregando === item.id && (
            <div className="border-t border-border p-3 space-y-2 bg-emerald-500/5">
              <p className="text-xs text-muted-foreground">
                Sube el balance del mes nuevo. El sistema lo agrega a este estado financiero
                (con su fecha) sin que tengas que volver a subir los meses anteriores.
              </p>
              <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed border-emerald-400/50 text-sm font-medium text-emerald-700 cursor-pointer hover:bg-emerald-500/10 transition-colors ${subiendoMes ? 'opacity-50 pointer-events-none' : ''}`}>
                {subiendoMes ? <><Loader2 className="w-4 h-4 animate-spin" /> Agregando el mes...</> : <><Upload className="w-4 h-4" /> Subir balance del mes nuevo (.xlsx)</>}
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) agregarMes(item, f) }} />
              </label>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}