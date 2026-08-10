'use client'
// src/components/motor-contable/UploadPanel.tsx v6.0
// CAMBIO v6: si el balance no trae NIT/empresa (caso SIESA), pide esos datos
// a la contadora antes de continuar, y los manda al backend. Así el cliente
// se guarda igual que con Siigo/World Office.

import { useState, useRef, useCallback } from 'react'
import {
  Upload, FileSpreadsheet, X, ChevronRight,
  Loader2, AlertTriangle, Plus, Layers, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { EstructuraCliente } from '@/lib/motor-contable/extraerEstructura'

interface DatosEstructura {
  empresa: string
  nit: string
  estructura: EstructuraCliente
  archivos: File[]
}

interface Props {
  onEstructura: (datos: DatosEstructura) => void
}

export function UploadPanel({ onEstructura }: Props) {
  const [files,    setFiles]    = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [warns,    setWarns]    = useState<string[]>([])

  // ── v6: estado para pedir NIT/empresa cuando el balance no los trae ──
  const [pideDatos,     setPideDatos]     = useState(false)
  const [empresaManual, setEmpresaManual] = useState('')
  const [nitManual,     setNitManual]     = useState('')
  const [dataPendiente, setDataPendiente] = useState<any>(null)

  const refPrincipal = useRef<HTMLInputElement>(null)
  const refAdicional = useRef<HTMLInputElement>(null)

  const validarExcel = (f: File): boolean => {
    if (f.name.match(/\.xlsx?$/i)) return true
    toast.error('Solo se aceptan archivos Excel (.xlsx, .xls)')
    return false
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(validarExcel)
    if (dropped.length === 0) return
    if (dropped.length === 1 && files.length === 0) {
      setFiles([dropped[0]])
    } else {
      setFiles(prev => {
        const nombres = new Set(prev.map(f => f.name))
        return [...prev, ...dropped.filter(f => !nombres.has(f.name))]
      })
    }
  }, [files])

  const agregarPrincipal = (f: File) => {
    if (!validarExcel(f)) return
    if (files.length === 0) setFiles([f])
    else setFiles(prev => [f, ...prev.slice(1)])
  }

  const agregarAdicionales = (nuevos: FileList | null) => {
    if (!nuevos) return
    const validos = Array.from(nuevos).filter(validarExcel)
    setFiles(prev => {
      const nombres = new Set(prev.map(f => f.name))
      return [...prev, ...validos.filter(f => !nombres.has(f.name))]
    })
  }

  const quitarArchivo = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Arma el FormData (reutilizable) ──
  const buildFormData = (conManuales: boolean) => {
    const fd = new FormData()
    fd.append('balance', files[0])
    const adicionales = files.slice(1)
    adicionales.forEach((f, i) => fd.append(`balance_adicional_${i}`, f))
    if (adicionales.length > 0) fd.append('num_adicionales', String(adicionales.length))
    if (conManuales) {
      fd.append('nit_manual', nitManual.trim())
      fd.append('empresa_manual', empresaManual.trim())
    }
    return fd
  }

  // ── Procesar: extraer estructura ──
  const handleProcess = async () => {
    if (files.length === 0) return
    setLoading(true)
    setWarns([])

    try {
      const res  = await fetch('/api/motor-contable/estructura', { method: 'POST', body: buildFormData(false) })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        const msg = data.error ?? 'Error al leer el balance'
        toast.error(msg)
        setWarns([msg])
        return
      }

      setWarns(data.advertencias ?? [])

      // v6: ¿el balance no trajo NIT/empresa? (SIESA) → pedir a la contadora
      if (data.requiereDatos) {
        setDataPendiente(data)
        setEmpresaManual(data.empresaGenerica ? '' : (data.empresa ?? ''))
        setNitManual(data.sinNit ? '' : (data.nit ?? ''))
        setPideDatos(true)
        toast.info('Este balance no trae NIT. Complétalo para continuar.')
        return
      }

      toast.success(`Balance leído — ${data.empresa}`)
      onEstructura({
        empresa:    data.empresa,
        nit:        data.nit,
        estructura: data.estructura,
        archivos:   files,
      })
    } catch (err) {
      const msg = 'Error de conexión. Verifica que el servidor esté corriendo.'
      toast.error(msg)
      setWarns([msg])
      console.error('[UploadPanel]', err)
    } finally {
      setLoading(false)
    }
  }

  // ── v6: continuar tras escribir NIT/empresa manualmente ──
  const handleConfirmarDatos = async () => {
    if (nitManual.trim().length < 6 || empresaManual.trim().length === 0) return
    setLoading(true)
    try {
      // Re-llamar con los datos manuales para que la respuesta ya venga completa
      const res  = await fetch('/api/motor-contable/estructura', { method: 'POST', body: buildFormData(true) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Error al leer el balance')
        return
      }
      toast.success(`Balance leído — ${data.empresa}`)
      onEstructura({
        empresa:    data.empresa || empresaManual.trim(),
        nit:        data.nit     || nitManual.trim(),
        estructura: data.estructura ?? dataPendiente?.estructura,
        archivos:   files,
      })
    } catch {
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const archivoPrincipal = files[0] ?? null
  const archivosExtra    = files.slice(1)
  const nitValido = nitManual.trim().length >= 6
  const datosOk   = nitValido && empresaManual.trim().length > 0

  // ── v6: pantalla de completar NIT/empresa ──
  if (pideDatos) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Building2 className="w-5 h-5" />
            <p className="font-semibold">Completa los datos del cliente</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Este balance (formato SIESA) no incluye el NIT ni el nombre de la empresa.
            Escríbelos para poder guardar el cliente.
          </p>

          <label className="block text-sm font-medium text-foreground">
            Nombre de la empresa
            <input
              type="text"
              value={empresaManual}
              onChange={e => setEmpresaManual(e.target.value)}
              placeholder="Ej: FASHION BRANDS GROUP S.A.S."
              className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <label className="block text-sm font-medium text-foreground">
            NIT del cliente <span className="text-red-500">*</span>
            <input
              type="text"
              value={nitManual}
              onChange={e => setNitManual(e.target.value)}
              placeholder="Ej: 901437355-4"
              className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {!nitValido && nitManual.length > 0 && (
              <span className="text-xs text-red-500">El NIT parece muy corto.</span>
            )}
          </label>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setPideDatos(false); setDataPendiente(null) }}
            className="px-4 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Volver
          </button>
          <button
            onClick={handleConfirmarDatos}
            disabled={!datosOk || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-light transition-colors disabled:opacity-50"
          >
            {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>) : (<>Confirmar y continuar <ChevronRight className="w-4 h-4" /></>)}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Zona drop — balance principal */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !archivoPrincipal && refPrincipal.current?.click()}
        className={cn(
          'relative border-2 border-dashed rounded-2xl transition-all duration-200',
          'flex flex-col items-center justify-center gap-3 p-8',
          dragging ? 'border-primary bg-primary/5 scale-[1.01]'
            : archivoPrincipal ? 'border-primary/40 bg-primary/5 cursor-default'
            : 'border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer'
        )}
      >
        <input ref={refPrincipal} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) agregarPrincipal(f) }} />

        {archivoPrincipal ? (
          <div className="flex items-center gap-3 w-full max-w-md">
            <FileSpreadsheet className="w-8 h-8 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{archivoPrincipal.name}</p>
              <p className="text-xs text-muted-foreground">
                {(archivoPrincipal.size / 1024).toFixed(0)} KB · balance principal
              </p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); quitarArchivo(0) }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="p-3 bg-primary/10 rounded-2xl">
              <Upload className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">Arrastra el balance aquí</p>
              <p className="text-sm text-muted-foreground">o haz clic para seleccionar (.xlsx)</p>
            </div>
          </>
        )}
      </div>

      {/* Balances adicionales (multi-período) */}
      {archivoPrincipal && (
        <div className="space-y-2">
          {archivosExtra.map((f, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20">
              <Layers className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">período adicional</p>
              </div>
              <button onClick={() => quitarArchivo(i + 1)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          <input ref={refAdicional} type="file" accept=".xlsx,.xls" multiple className="hidden"
            onChange={e => agregarAdicionales(e.target.files)} />
          <button onClick={() => refAdicional.current?.click()}
            className="flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary/5 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Agregar otro mes (multi-período)
          </button>
        </div>
      )}

      {/* Advertencias */}
      {warns.length > 0 && (
        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-1">
          {warns.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}

      {/* Botón continuar */}
      <button
        onClick={handleProcess}
        disabled={files.length === 0 || loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-light transition-colors disabled:opacity-50"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Leyendo balance...</>
        ) : (
          <>Continuar al perfil <ChevronRight className="w-4 h-4" /></>
        )}
      </button>
    </div>
  )
}