'use client'

// src/app/(dashboard)/consolidacion-iva/page.tsx
import { useState, useRef, useCallback } from 'react'
import {
  Upload,
  FileSpreadsheet,
  FileArchive,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  Info,
  Calculator,
  X,
} from 'lucide-react'

type Estado = 'idle' | 'procesando' | 'listo' | 'error'

interface Resumen {
  total_filas: number
  excluidas: number
  con_xml: number
  asumidas: number
}

export default function ConsolidacionIvaPage() {
  const [listado, setListado] = useState<File | null>(null)
  const [xmls, setXmls] = useState<File | null>(null)
  const [estado, setEstado] = useState<Estado>('idle')
  const [error, setError] = useState('')
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [excelBlob, setExcelBlob] = useState<Blob | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const listadoRef = useRef<HTMLInputElement>(null)
  const xmlRef = useRef<HTMLInputElement>(null)

  // ─── Manejo de archivos ────────────────────────────────────────────────

  const setListadoFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('El listado de la DIAN debe ser un archivo .xlsx')
      return
    }
    setListado(file)
    setEstado('idle')
    setError('')
    setResumen(null)
    setExcelBlob(null)
  }

  const setXmlFile = (file: File) => {
    const n = file.name.toLowerCase()
    if (!n.endsWith('.zip') && !n.endsWith('.xml')) {
      setError('Los XML deben venir en un .zip (o un .xml suelto)')
      return
    }
    setXmls(file)
    setError('')
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setListadoFile(file)
  }, [])

  // ─── Procesar ──────────────────────────────────────────────────────────

  const procesar = async () => {
    if (!listado) return
    setEstado('procesando')
    setError('')
    setResumen(null)

    try {
      const fd = new FormData()
      fd.append('listado', listado)
      if (xmls) fd.append('xmls', xmls)

      const res = await fetch('/api/consolidacion-iva', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'No se pudo procesar el archivo.')
      }

      const r = res.headers.get('X-Resumen')
      if (r) setResumen(JSON.parse(atob(r)))

      setExcelBlob(await res.blob())
      setEstado('listo')
    } catch (e: any) {
      setError(e?.message ?? 'Error inesperado.')
      setEstado('error')
    }
  }

  const descargar = () => {
    if (!excelBlob) return
    const url = URL.createObjectURL(excelBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'consolidacion_iva.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const reiniciar = () => {
    setListado(null)
    setXmls(null)
    setEstado('idle')
    setError('')
    setResumen(null)
    setExcelBlob(null)
  }

  // descarga automática al quedar listo
  if (estado === 'listo' && excelBlob) {
    // (se dispara una sola vez por el cambio de estado)
  }

  // ─── UI ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Calculator className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Consolidación de IVA
          </h1>
          <p className="text-sm text-muted-foreground">
            Genera ventas, compras y el acumulado del periodo a partir del listado
            de la DIAN, con el IVA discriminado al 19%, 5% y exento.
          </p>
        </div>
      </div>

      {/* Nota informativa */}
      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
        <p>
          Sube el <strong>listado de la DIAN</strong> (token dian). Para
          discriminar el IVA de forma exacta, adjunta también los{' '}
          <strong>XML en un .zip</strong>. Sin los XML, el sistema asume 19% y lo
          marca en la columna <em>Origen</em>.
        </p>
      </div>

      {/* Zona de carga: listado (obligatorio) */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => listadoRef.current?.click()}
        className={[
          'cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
          isDragging
            ? 'border-accent bg-accent/5'
            : 'border-border bg-card hover:border-accent/60 hover:bg-accent/5',
        ].join(' ')}
      >
        <input
          ref={listadoRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setListadoFile(e.target.files[0])}
        />
        {listado ? (
          <FileChip
            icon={<FileSpreadsheet className="h-5 w-5 text-emerald-600" />}
            name={listado.name}
            onRemove={(e) => { e.stopPropagation(); setListado(null); setEstado('idle') }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
              <Upload className="h-6 w-6 text-accent" />
            </div>
            <p className="font-medium text-foreground">
              Arrastra el listado de la DIAN aquí
            </p>
            <p className="text-xs text-muted-foreground">
              o haz clic para seleccionar — formato .xlsx
            </p>
          </div>
        )}
      </div>

      {/* Carga secundaria: XML (opcional) */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <FileArchive className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              XML de facturas <span className="text-muted-foreground">(opcional)</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {xmls ? xmls.name : 'Para discriminar IVA real — .zip'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {xmls && (
            <button
              onClick={() => setXmls(null)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Quitar XML"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => xmlRef.current?.click()}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {xmls ? 'Cambiar' : 'Adjuntar'}
          </button>
          <input
            ref={xmlRef}
            type="file"
            accept=".zip,.xml"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && setXmlFile(e.target.files[0])}
          />
        </div>
      </div>

      {/* Error */}
      {estado === 'error' && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <p>{error}</p>
        </div>
      )}

      {/* Resultado */}
      {estado === 'listo' && resumen && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="mb-4 flex items-center gap-2 text-emerald-800">
            <CheckCircle className="h-5 w-5" />
            <p className="font-semibold">Consolidación generada</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Documentos" value={resumen.total_filas} />
            <Stat label="IVA real (XML)" value={resumen.con_xml} tone="emerald" />
            <Stat label="Asumido 19%" value={resumen.asumidas} tone="amber" />
            <Stat label="Excluidos" value={resumen.excluidas} />
          </div>
          <button
            onClick={descargar}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Download className="h-4 w-4" />
            Descargar Excel de nuevo
          </button>
        </div>
      )}

      {/* Acciones */}
      <div className="flex items-center gap-3">
        <button
          onClick={procesar}
          disabled={!listado || estado === 'procesando'}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-primary-dark transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {estado === 'procesando' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando…
            </>
          ) : (
            <>
              <Calculator className="h-4 w-4" />
              Generar consolidación
            </>
          )}
        </button>
        {(listado || xmls) && estado !== 'procesando' && (
          <button
            onClick={reiniciar}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────

function FileChip({
  icon,
  name,
  onRemove,
}: {
  icon: React.ReactNode
  name: string
  onRemove: (e: React.MouseEvent) => void
}) {
  return (
    <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
      </div>
      <button
        onClick={onRemove}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Quitar archivo"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'emerald' | 'amber'
}) {
  const color =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
      ? 'text-amber-700'
      : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}