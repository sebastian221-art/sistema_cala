'use client'

// src/app/(dashboard)/consolidacion-iva/page.tsx
// Flujo de 2 pasos: 1) subir listado → preview editable  2) generar Excel
import { useState, useRef, useCallback, useMemo } from 'react'
import {
  Upload, FileSpreadsheet, Download, CheckCircle, AlertCircle,
  Loader2, Info, Calculator, X, ArrowLeft,
} from 'lucide-react'

type Estado = 'idle' | 'analizando' | 'revision' | 'generando' | 'listo' | 'error'

interface FacturaPreview {
  cufe: string
  hoja: string
  tipo: string
  fecha: string
  nit_proveedor: string
  nombre_proveedor: string
  iva_dian: number
  total_dian: number
  es_nc: boolean
  tarifa: number
  origen: string
}

const TARIFAS = [
  { valor: 19, label: '19%' },
  { valor: 5, label: '5%' },
  { valor: 0, label: 'Exento' },
]

const money = (n: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n)

export default function ConsolidacionIvaPage() {
  const [listado, setListado] = useState<File | null>(null)
  const [estado, setEstado] = useState<Estado>('idle')
  const [error, setError] = useState('')
  const [facturas, setFacturas] = useState<FacturaPreview[]>([])
  const [excelBlob, setExcelBlob] = useState<Blob | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [otroValor, setOtroValor] = useState<Record<string, string>>({})

  const listadoRef = useRef<HTMLInputElement>(null)

  const setListadoFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('El listado de la DIAN debe ser un archivo .xlsx')
      return
    }
    setListado(file)
    setEstado('idle')
    setError('')
    setFacturas([])
    setExcelBlob(null)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setListadoFile(file)
  }, [])

  // ── Paso 1: subir → preview ──
  const analizar = async () => {
    if (!listado) return
    setEstado('analizando')
    setError('')
    try {
      const fd = new FormData()
      fd.append('action', 'preview')
      fd.append('listado', listado)
      const res = await fetch('/api/consolidacion-iva', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'No se pudo leer el listado.')
      }
      const data = await res.json()
      setFacturas(data.facturas ?? [])
      setEstado('revision')
    } catch (e: any) {
      setError(e?.message ?? 'Error inesperado.')
      setEstado('error')
    }
  }

  // ── Cambiar la tarifa de una factura ──
  const cambiarTarifa = (cufe: string, tarifa: number) => {
    setFacturas((prev) =>
      prev.map((f) => (f.cufe === cufe ? { ...f, tarifa, origen: 'editado' } : f))
    )
  }

  const aplicarOtro = (cufe: string) => {
    const v = parseFloat(otroValor[cufe])
    if (!isNaN(v) && v >= 0 && v <= 100) cambiarTarifa(cufe, v)
  }

  // ── Paso 2: generar Excel ──
  const generar = async () => {
    if (!listado) return
    setEstado('generando')
    setError('')
    try {
      const decisiones: Record<string, number> = {}
      for (const f of facturas) decisiones[f.cufe] = f.tarifa

      const fd = new FormData()
      fd.append('action', 'generar')
      fd.append('listado', listado)
      fd.append('decisiones', JSON.stringify(decisiones))

      const res = await fetch('/api/consolidacion-iva', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'No se pudo generar el Excel.')
      }
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

  const reset = () => {
    setListado(null)
    setEstado('idle')
    setError('')
    setFacturas([])
    setExcelBlob(null)
  }

  // Resumen de cuántas hay por tarifa
  const resumen = useMemo(() => {
    const r = { total: facturas.length, t19: 0, t5: 0, exento: 0, otro: 0, presuntas: 0 }
    for (const f of facturas) {
      if (f.tarifa === 19) r.t19++
      else if (f.tarifa === 5) r.t5++
      else if (f.tarifa === 0) r.exento++
      else r.otro++
      if (f.origen === 'presunto') r.presuntas++
    }
    return r
  }, [facturas])

  return (
    <div className="max-w-6xl space-y-6">
      {/* Encabezado */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Calculator className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-display font-semibold text-foreground">
            Consolidación de IVA
          </h1>
          <p className="text-sm text-muted-foreground">
            Sube el listado de la DIAN, revisa las tarifas y genera el consolidado.
          </p>
        </div>
      </div>

      {/* ─── PASO 1: subir ─── */}
      {(estado === 'idle' || estado === 'analizando' || estado === 'error') && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => listadoRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
          >
            <input
              ref={listadoRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setListadoFile(e.target.files[0])}
            />
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            {listado ? (
              <div className="flex items-center justify-center gap-2 text-foreground">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{listado.name}</span>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  Arrastra el listado de la DIAN aquí
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  o haz clic para seleccionar (.xlsx del token DIAN)
                </p>
              </>
            )}
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              El sistema asume 19% por defecto. En el siguiente paso podrás revisar
              cada factura y cambiar la tarifa de las que sean 5%, exentas u otra.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 rounded-lg p-3">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            onClick={analizar}
            disabled={!listado || estado === 'analizando'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {estado === 'analizando' && <Loader2 className="w-4 h-4 animate-spin" />}
            {estado === 'analizando' ? 'Analizando...' : 'Analizar facturas'}
          </button>
        </>
      )}

      {/* ─── PASO 2: revisión de tarifas ─── */}
      {estado === 'revision' && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Facturas', val: resumen.total, color: 'text-foreground' },
              { label: '19%', val: resumen.t19, color: 'text-blue-500' },
              { label: '5%', val: resumen.t5, color: 'text-green-500' },
              { label: 'Exento', val: resumen.exento, color: 'text-amber-500' },
              { label: 'Por revisar', val: resumen.presuntas, color: 'text-red-500' },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-lg p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {resumen.presuntas > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-lg p-3">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                <strong>{resumen.presuntas} facturas</strong> están asumidas al 19%.
                Revísalas y cambia la tarifa de las que correspondan antes de generar.
              </p>
            </div>
          )}

          {/* Tabla editable */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Proveedor</th>
                    <th className="px-3 py-2 font-medium text-right">IVA DIAN</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                    <th className="px-3 py-2 font-medium text-center">Tarifa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {facturas.map((f) => {
                    const esOtro = ![19, 5, 0].includes(f.tarifa)
                    return (
                      <tr
                        key={f.cufe}
                        className={`hover:bg-muted/30 ${f.es_nc ? 'text-red-500' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <span className="text-xs">
                            {f.hoja}
                            {f.es_nc && ' (NC)'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground truncate max-w-48">
                            {f.nombre_proveedor}
                          </p>
                          <p className="text-xs text-muted-foreground">{f.nit_proveedor}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(f.iva_dian)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(f.total_dian)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            {TARIFAS.map((t) => (
                              <button
                                key={t.valor}
                                onClick={() => cambiarTarifa(f.cufe, t.valor)}
                                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                  f.tarifa === t.valor
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                            {/* Otro % */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                placeholder="otro"
                                value={otroValor[f.cufe] ?? (esOtro ? String(f.tarifa) : '')}
                                onChange={(e) =>
                                  setOtroValor((p) => ({ ...p, [f.cufe]: e.target.value }))
                                }
                                onBlur={() => aplicarOtro(f.cufe)}
                                onKeyDown={(e) => e.key === 'Enter' && aplicarOtro(f.cufe)}
                                className={`w-14 px-1.5 py-1 rounded text-xs border text-center ${
                                  esOtro
                                    ? 'border-primary bg-primary/10 text-primary font-medium'
                                    : 'border-border bg-background text-foreground'
                                }`}
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>
            <button
              onClick={generar}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary-light transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Generar consolidado
            </button>
          </div>
        </>
      )}

      {/* ─── GENERANDO ─── */}
      {estado === 'generando' && (
        <div className="flex items-center gap-3 text-muted-foreground py-10 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Generando el consolidado...
        </div>
      )}

      {/* ─── LISTO ─── */}
      {estado === 'listo' && (
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto">
            <CheckCircle className="w-7 h-7" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Consolidado generado</p>
            <p className="text-sm text-muted-foreground mt-1">
              El Excel está listo con las tarifas que confirmaste.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={descargar}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary-light transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Excel
            </button>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors text-sm"
            >
              Nuevo consolidado
            </button>
          </div>
        </div>
      )}
    </div>
  )
}