'use client'
// src/components/motor-contable/EsfGuardados.tsx
// Lista los ESF guardados de un cliente y permite re-descargarlos.
// Se usa dentro de PerfilStep (situación: cliente conocido).

import { useState, useEffect } from 'react'
import { Download, FileText, Loader2, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface EsfItem {
  id: string
  nit: string
  nombre_empresa: string | null
  label: string | null
  mes: number | null
  anio: number | null
  creado_en: string
}

export function EsfGuardados({ nit, empresa }: { nit: string; empresa: string }) {
  const [items, setItems]     = useState<EsfItem[]>([])
  const [loading, setLoading] = useState(true)
  const [bajando, setBajando] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/esf?nit=${encodeURIComponent(nit)}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setItems(d.esfs ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [nit])

  const descargar = async (item: EsfItem) => {
    setBajando(item.id)
    try {
      const r = await fetch(`/api/esf?id=${item.id}`)
      const d = await r.json()
      if (!d.ok || !d.esf?.excel_base64) { toast.error('No se pudo descargar'); return }
      const bytes = Uint8Array.from(atob(d.esf.excel_base64), c => c.charCodeAt(0))
      const blob  = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href = url
      a.download = `ESF_${(item.nombre_empresa ?? empresa).replace(/[^a-zA-Z0-9]/g, '_')}_${item.label ?? ''}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel descargado')
    } catch {
      toast.error('Error al descargar')
    } finally {
      setBajando(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando estados financieros...
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Este cliente aún no tiene estados financieros guardados. Genera uno y confírmalo para verlo aquí.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <FileText className="w-3.5 h-3.5" /> Estados financieros anteriores ({items.length})
      </p>
      {items.map(item => (
        <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-primary/40 transition-colors">
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
          <button
            onClick={() => descargar(item)}
            disabled={bajando === item.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {bajando === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Descargar
          </button>
        </div>
      ))}
    </div>
  )
}