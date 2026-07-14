'use client'

// src/app/(dashboard)/formulario-1647/page.tsx
import { useState, useRef, useCallback } from 'react'
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  Info,
  X,
} from 'lucide-react'

type Estado = 'idle' | 'procesando' | 'listo' | 'error'

export default function Formulario1647Page() {
  const [archivo, setArchivo]             = useState<File | null>(null)
  const [estado, setEstado]               = useState<Estado>('idle')
  const [error, setError]                 = useState<string>('')
  const [totalRegistros, setTotalRegistros] = useState<number>(0)
  const [excelBlob, setExcelBlob]         = useState<Blob | null>(null)
  const [isDragging, setIsDragging]       = useState(false)
  const inputRef                          = useRef<HTMLInputElement>(null)

  // ─── Manejo de archivo ───────────────────────────────────────────────────

  const handleFile = (file: File) => {
    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.xls') && !ext.endsWith('.xlsx')) {
      setError('Solo se aceptan archivos .xls o .xlsx (exportado de Siigo/World Office)')
      return
    }
    setArchivo(file)
    setEstado('idle')
    setError('')
    setExcelBlob(null)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [])

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => setIsDragging(false)

  const limpiar = () => {
    setArchivo(null)
    setEstado('idle')
    setError('')
    setExcelBlob(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // ─── Generar 1647 ────────────────────────────────────────────────────────

  const generarFormulario = async () => {
    if (!archivo) return

    setEstado('procesando')
    setError('')
    setExcelBlob(null)

    try {
      const form = new FormData()
      form.append('auxiliar', archivo)

      const res = await fetch('/api/formulario-1647', {
        method: 'POST',
        body: form,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Error ${res.status}`)
      }

      const registros = parseInt(res.headers.get('X-Total-Registros') || '0')
      const blob = await res.blob()

      setExcelBlob(blob)
      setTotalRegistros(registros)
      setEstado('listo')
    } catch (err: any) {
      setEstado('error')
      setError(err.message || 'Error desconocido al generar el formulario')
    }
  }

  // ─── Descargar ────────────────────────────────────────────────────────────

  const descargar = () => {
    if (!excelBlob) return
    const url  = URL.createObjectURL(excelBlob)
    const link = document.createElement('a')
    link.href  = url
    link.download = `Formulario_1647_${new Date().getFullYear()}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          Formulario 1647
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Genera automáticamente el reporte de{' '}
          <strong>Ingresos recibidos para terceros</strong> a partir del
          auxiliar contable exportado de Siigo o World Office.
        </p>
      </div>

      {/* ── Info DIAN ───────────────────────────────────────────────────── */}
      <div className="flex gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <p className="font-semibold">Concepto A070 — Código 169 Colombia</p>
          <p>
            El archivo debe ser el <strong>Auxiliar de movimientos</strong> exportado
            del software contable (columnas: ano, mes, dia, cuenta, tercero, debito,
            credito, nit, tipdoc…).
          </p>
        </div>
      </div>

      {/* ── Zona de carga ────────────────────────────────────────────────── */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !archivo && inputRef.current?.click()}
        className={`
          relative rounded-2xl border-2 border-dashed transition-all duration-200
          flex flex-col items-center justify-center p-10 gap-4 text-center
          ${!archivo ? 'cursor-pointer' : ''}
          ${isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : archivo
            ? 'border-green-400 bg-green-50 dark:bg-green-950/20'
            : 'border-border hover:border-primary/50 hover:bg-muted/30'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          onChange={onFileChange}
          className="hidden"
        />

        {!archivo ? (
          <>
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Upload className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                Arrastra el AUXILIAR aquí o haz clic para seleccionarlo
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Archivos .xls o .xlsx exportados de Siigo / World Office
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <FileSpreadsheet className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{archivo.name}</p>
              <p className="text-sm text-muted-foreground">
                {(archivo.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); limpiar() }}
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </>
        )}
      </div>

      {/* ── Acciones ─────────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          onClick={generarFormulario}
          disabled={!archivo || estado === 'procesando'}
          className="
            flex-1 flex items-center justify-center gap-2
            px-6 py-3 rounded-xl font-semibold text-sm transition-all
            bg-primary text-primary-foreground
            hover:opacity-90 active:scale-95
            disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100
          "
        >
          {estado === 'procesando' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <FileSpreadsheet className="w-4 h-4" />
              Generar Formulario 1647
            </>
          )}
        </button>

        {estado === 'listo' && excelBlob && (
          <button
            onClick={descargar}
            className="
              flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm
              bg-green-600 text-white hover:bg-green-700 active:scale-95 transition-all
            "
          >
            <Download className="w-4 h-4" />
            Descargar Excel
          </button>
        )}
      </div>

      {/* ── Estado: éxito ────────────────────────────────────────────────── */}
      {estado === 'listo' && (
        <div className="flex gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-800 dark:text-green-300">
            <p className="font-semibold">Formulario generado correctamente</p>
            <p className="mt-0.5">
              Se procesaron{' '}
              <strong>{totalRegistros.toLocaleString('es-CO')}</strong>{' '}
              registros. Haz clic en <strong>Descargar Excel</strong> para
              obtener el archivo listo para importar a la DIAN.
            </p>
          </div>
        </div>
      )}

      {/* ── Estado: error ────────────────────────────────────────────────── */}
      {estado === 'error' && error && (
        <div className="flex gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800 dark:text-red-300">
            <p className="font-semibold">Error al generar el formulario</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Guía de columnas ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-sm text-foreground mb-3">
          ¿Qué información se completa automáticamente?
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-muted-foreground">
          {[
            ['C', 'NIT del pagador (quien generó el ingreso)'],
            ['E – I', 'Apellidos, nombres o razón social del pagador'],
            ['K', 'Valor total recibido por ese pagador (acumulado)'],
            ['L', 'Valor transferido a cada tercero receptor'],
            ['O', 'NIT del tercero receptor del pago'],
            ['P – T', 'Apellidos, nombres o razón social del receptor'],
            ['W', 'Código de departamento del receptor'],
            ['X', 'Código de municipio del receptor'],
          ].map(([col, desc]) => (
            <div key={col} className="flex gap-2">
              <span className="font-mono font-bold text-primary w-10 flex-shrink-0">
                {col}
              </span>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}