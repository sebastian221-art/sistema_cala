'use client'

/**
 * FinancialEditor — Editor tipo hoja de cálculo para estados financieros CALA.
 * Permite editar valores individuales de ESF / ERI / NOTAS, registra cambios
 * con trazabilidad en audit_logs y recomputa los KPIs al guardar.
 */

import React, { useState, useMemo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Save, X, AlertTriangle, CheckCircle2, Loader2,
  ChevronDown, ChevronRight, History, Edit3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface FinancialRow {
  cuenta:  string
  nota?:   number
  valores: Record<string, number>
}

interface RawSheetData {
  empresa?:  string
  periodos:  string[]
  filas:     FinancialRow[]
}

interface StatementRecord {
  id:             string
  hoja?:          string | null
  tipo:           string
  nombre_archivo?: string | null
  periodo_tipo:   string
  periodo_valor:  number
  año:            number
  raw_data_json?: unknown
}

interface FinancialEditorProps {
  clientId:   string
  statements: StatementRecord[]
  onClose:    () => void
  onSaved?:   () => void
}

type ChangeMap = Map<string, { original: number; current: number }>

const HOJA_ORDER = ['ESF', 'ERI', 'NOTAS ESF', 'NOTAS ERI', 'NOTAS ER']
const HOJA_LABELS: Record<string, string> = {
  'ESF':       'Estado de Situación Financiera',
  'ERI':       'Estado de Resultados',
  'NOTAS ESF': 'Notas — ESF',
  'NOTAS ERI': 'Notas — ERI',
  'NOTAS ER':  'Notas — ERI (PJ)',
}

function normHoja(h?: string | null): string {
  if (!h) return ''
  if (h === 'NOTAS ER') return 'NOTAS ERI'
  return h
}

function formatNum(v: number): string {
  if (v === 0) return '0'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v)
}

// ── Celda editable ────────────────────────────────────────────────────────
interface EditableCellProps {
  value:    number
  changed:  boolean
  onCommit: (newVal: number) => void
}

function EditableCell({ value, changed, onCommit }: EditableCellProps) {
  const [editing, setEditing]   = useState(false)
  const [draft,   setDraft]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    // Always use integer (round) to avoid float precision artifacts
    const intVal = Math.round(value)
    setDraft(intVal === 0 ? '' : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(intVal))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = () => {
    // Colombian format: dots are thousands separators, comma is decimal separator
    // Remove dots (thousands), replace comma with dot (decimal), then parse
    const raw = draft.replace(/\./g, '').replace(',', '.').trim()
    const n   = parseFloat(raw)
    if (!isNaN(n)) onCommit(Math.round(n))
    setEditing(false)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit() }
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className="w-full text-right px-2 py-0.5 border border-primary rounded text-xs tabular-nums bg-primary/5 focus:outline-none"
      />
    )
  }

  return (
    <button
      onClick={startEdit}
      className={cn(
        'w-full text-right px-2 py-0.5 rounded text-xs tabular-nums group',
        'hover:bg-primary/10 transition-colors cursor-pointer',
        changed && 'text-amber-600 font-semibold bg-amber-50',
        !changed && 'text-foreground'
      )}
      title="Clic para editar"
    >
      {formatNum(value)}
      <Edit3 className="w-2.5 h-2.5 inline ml-1 opacity-0 group-hover:opacity-50" />
    </button>
  )
}

// ── Tabla de una hoja ─────────────────────────────────────────────────────
interface SheetEditorProps {
  data:      RawSheetData
  statementId: string
  changes:   ChangeMap
  onChange:  (cuenta: string, periodo: string, newVal: number) => void
}

function SheetEditor({ data, statementId: _id, changes, onChange }: SheetEditorProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const periodos = useMemo(() => data.periodos.slice(0, 6), [data.periodos])

  const sections = useMemo(() => {
    const groups: { title: string; rows: (FinancialRow & { _sec: string })[] }[] = []
    let cur: typeof groups[0] | null = null
    for (const fila of data.filas) {
      const parts = fila.cuenta.split(' / ')
      const sec   = parts.length >= 2 ? parts[0].trim() : ''
      const name  = parts.length >= 2 ? parts.slice(1).join(' / ').trim() : fila.cuenta
      if (!cur || cur.title !== sec) { cur = { title: sec, rows: [] }; groups.push(cur) }
      cur.rows.push({ ...fila, cuenta: name, _sec: sec })
    }
    return groups
  }, [data.filas])

  if (!data.filas || data.filas.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">Sin datos para editar.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className="px-4 py-2 text-left font-semibold text-foreground w-full">Concepto</th>
            <th className="px-2 py-2 text-center font-semibold text-muted-foreground w-12">Nota</th>
            {periodos.map((p, i) => (
              <th key={i} className={cn(
                'px-3 py-2 text-right font-semibold min-w-28',
                i === 0 ? 'text-primary' : 'text-muted-foreground'
              )}>{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec, si) => {
            const isOpen = collapsed[sec.title] !== true
            return (
              <React.Fragment key={si}>
                {sec.title && (
                  <tr className="bg-muted/20 cursor-pointer hover:bg-muted/30"
                    onClick={() => setCollapsed(p => ({ ...p, [sec.title]: isOpen }))}>
                    <td colSpan={2 + periodos.length} className="px-4 py-1.5">
                      <div className="flex items-center gap-2">
                        {isOpen
                          ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground" />
                          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="font-semibold text-foreground uppercase tracking-wide text-xs">{sec.title}</span>
                      </div>
                    </td>
                  </tr>
                )}
                {isOpen && sec.rows.map((fila, ri) => {
                  const isTotal = fila.cuenta.toLowerCase().includes('total')
                  const fullKey = sec.title ? `${sec.title} / ${fila.cuenta}` : fila.cuenta
                  const hasVals = periodos.some(p => (fila.valores[p] ?? 0) !== 0)
                  if (!hasVals && !isTotal) return null

                  return (
                    <tr key={`${si}-${ri}`}
                      className={cn('border-b border-border/40', isTotal && 'bg-primary/5')}>
                      <td className={cn(
                        'px-4 py-1 text-foreground',
                        !isTotal && 'text-muted-foreground pl-8',
                        isTotal && 'font-semibold'
                      )}>{fila.cuenta}</td>
                      <td className="px-2 py-1 text-center text-muted-foreground">{fila.nota ?? ''}</td>
                      {periodos.map((p, pi) => {
                        const changeKey = `${fullKey}||${p}`
                        const changed = changes.has(changeKey)
                        const currentVal = changed
                          ? changes.get(changeKey)!.current
                          : (fila.valores[p] ?? 0)
                        return (
                          <td key={pi} className={cn('px-1 py-0.5',
                            pi === 0 ? '' : 'opacity-60')}>
                            <EditableCell
                              value={currentVal}
                              changed={changed}
                              onCommit={newVal => onChange(fullKey, p, newVal)}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────
export function FinancialEditor({ clientId, statements, onClose, onSaved }: FinancialEditorProps) {
  const queryClient = useQueryClient()

  // Agrupar por archivo
  const groups = useMemo(() => {
    const map = new Map<string, StatementRecord[]>()
    for (const s of statements) {
      const key = s.nombre_archivo ?? `${s.periodo_valor}/${s.año}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return map
  }, [statements])

  const groupKeys = useMemo(() => Array.from(groups.keys()), [groups])
  const [activeGroup, setActiveGroup] = useState(groupKeys[0] ?? '')
  const [activeHoja,  setActiveHoja]  = useState('ESF')
  const [saving, setSaving]           = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // Cambios por statementId → changeKey → {original, current}
  const [changesMap, setChangesMap] = useState<Map<string, ChangeMap>>(new Map())

  const sheetsForGroup = useMemo(() => {
    const stmts = groups.get(activeGroup) ?? []
    return HOJA_ORDER
      .map(h => stmts.find(s => normHoja(s.hoja) === h || s.hoja === h))
      .filter(Boolean) as StatementRecord[]
  }, [groups, activeGroup])

  const availableTabs = useMemo(
    () => HOJA_ORDER.filter(h => sheetsForGroup.some(s => normHoja(s.hoja) === h || s.hoja === h)),
    [sheetsForGroup]
  )

  // Asegurarse que activeHoja sea válida
  React.useEffect(() => {
    if (!availableTabs.includes(activeHoja) && availableTabs.length > 0) {
      setActiveHoja(availableTabs[0])
    }
  }, [availableTabs, activeHoja])

  const activeStatement = sheetsForGroup.find(
    s => normHoja(s.hoja) === activeHoja || s.hoja === activeHoja
  )
  const rawData = activeStatement?.raw_data_json as RawSheetData | null
  const stmtId  = activeStatement?.id ?? ''

  const changesForSheet: ChangeMap = changesMap.get(stmtId) ?? new Map()

  const totalChanges = useMemo(() => {
    let total = 0
    for (const m of changesMap.values()) total += m.size
    return total
  }, [changesMap])

  const handleChange = useCallback((cuenta: string, periodo: string, newVal: number) => {
    if (!stmtId || !rawData) return
    const changeKey = `${cuenta}||${periodo}`

    setChangesMap(prev => {
      const next = new Map(prev)
      const sheetChanges: ChangeMap = new Map(next.get(stmtId) ?? [])

      // Obtener valor original de la BD
      const fila = rawData.filas.find(f => {
        const parts = f.cuenta.split(' / ')
        const name  = parts.length >= 2 ? parts.slice(1).join(' / ').trim() : f.cuenta
        const sec   = parts.length >= 2 ? parts[0].trim() : ''
        const fullKey = sec ? `${sec} / ${name}` : name
        return fullKey === cuenta || f.cuenta === cuenta
      })
      const original = fila?.valores[periodo] ?? 0

      if (newVal === original) {
        // Revertir al original → eliminar del mapa de cambios
        sheetChanges.delete(changeKey)
      } else {
        const existing = sheetChanges.get(changeKey)
        sheetChanges.set(changeKey, {
          original: existing?.original ?? original,
          current:  newVal,
        })
      }

      next.set(stmtId, sheetChanges)
      return next
    })
  }, [stmtId, rawData])

  const handleSave = useCallback(async () => {
    if (totalChanges === 0) {
      toast.info('No hay cambios para guardar')
      return
    }

    setSaving(true)
    try {
      let totalSaved = 0

      for (const [statementId, sheetChanges] of changesMap.entries()) {
        if (sheetChanges.size === 0) continue

        const stmt = statements.find(s => s.id === statementId)
        if (!stmt) continue

        const rawD = stmt.raw_data_json as RawSheetData | null
        if (!rawD) continue

        const periodo = rawD.periodos[0] ?? ''

        // Construir filas actualizadas con los cambios
        const filasActualizadas = rawD.filas.map(fila => {
          const parts   = fila.cuenta.split(' / ')
          const sec     = parts.length >= 2 ? parts[0].trim() : ''
          const name    = parts.length >= 2 ? parts.slice(1).join(' / ').trim() : fila.cuenta
          const fullKey = sec ? `${sec} / ${name}` : name

          const newValores = { ...fila.valores }
          for (const p of rawD.periodos) {
            const ck = `${fullKey}||${p}`
            if (sheetChanges.has(ck)) {
              newValores[p] = sheetChanges.get(ck)!.current
            }
          }
          return { ...fila, valores: newValores }
        })

        const res = await fetch(`/api/clients/${clientId}/financial`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statementId, filas: filasActualizadas, periodo }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? 'Error al guardar')
        }
        const data = await res.json()
        totalSaved += data.cambios ?? 0
      }

      toast.success(`${totalSaved} valor(es) guardado(s) con trazabilidad`)
      setChangesMap(new Map())

      // Invalidar cache
      queryClient.removeQueries({ queryKey: ['financial-statements-list', clientId] })
      queryClient.removeQueries({ queryKey: ['financial-statements', clientId] })
      queryClient.removeQueries({ queryKey: ['ai-insights', clientId] })
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }, [changesMap, statements, clientId, queryClient, onSaved, totalChanges])

  const handleDiscardAll = () => {
    if (!confirm('¿Descartar todos los cambios no guardados?')) return
    setChangesMap(new Map())
  }

  return (
    <div className="space-y-4">
      {/* Header del editor */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-xl">
            <Edit3 className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Editor de Valores Financieros</h2>
            <p className="text-xs text-muted-foreground">
              Clic en cualquier celda numérica para editarla · Los cambios se registran con trazabilidad
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalChanges > 0 && (
            <>
              <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                {totalChanges} cambio(s) sin guardar
              </span>
              <button onClick={handleDiscardAll} disabled={saving}
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50">
                Descartar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </>
          )}
          {totalChanges === 0 && (
            <span className="flex items-center gap-1.5 text-xs text-success font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />Sin cambios pendientes
            </span>
          )}
          <button onClick={() => setShowHistory(v => !v)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Historial de cambios">
            <History className="w-4 h-4" />
          </button>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Aviso de instrucciones */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Modo edición:</strong> Haz clic en cualquier celda numérica para cambiar su valor.
          Presiona <kbd className="px-1 bg-amber-100 rounded">Enter</kbd> o <kbd className="px-1 bg-amber-100 rounded">Tab</kbd> para confirmar.
          Las celdas en <span className="text-amber-600 font-semibold">ámbar</span> tienen cambios sin guardar.
          Cada cambio queda registrado con fecha, usuario y valores anterior/nuevo.
        </div>
      </div>

      {/* Selector de grupo (si hay varios archivos) */}
      {groupKeys.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {groupKeys.map(k => (
            <button key={k} onClick={() => setActiveGroup(k)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                activeGroup === k
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-foreground hover:bg-muted')}>
              {k}
            </button>
          ))}
        </div>
      )}

      {/* Tabs de hojas */}
      {availableTabs.length > 0 && (
        <div className="flex gap-1 bg-muted/30 p-1 rounded-xl w-fit">
          {availableTabs.map(h => {
            const s = sheetsForGroup.find(s2 => normHoja(s2.hoja) === h || s2.hoja === h)
            const hasChanges = s && (changesMap.get(s.id)?.size ?? 0) > 0
            return (
              <button key={h} onClick={() => setActiveHoja(h)}
                className={cn(
                  'relative px-4 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeHoja === h ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}>
                {h}
                {hasChanges && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Editor de la hoja activa */}
      {rawData && rawData.filas?.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-foreground">
              {HOJA_LABELS[activeHoja] ?? activeHoja}
              {rawData.empresa && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">· {rawData.empresa}</span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              {rawData.periodos.length} período(s) · {rawData.filas.length} líneas
            </p>
          </div>
          <SheetEditor
            data={rawData}
            statementId={stmtId}
            changes={changesForSheet}
            onChange={handleChange}
          />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm">Sin datos para editar en esta hoja</p>
        </div>
      )}

      {/* Resumen de cambios actuales */}
      {totalChanges > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-amber-700 mb-2">
            Cambios pendientes de guardar ({totalChanges}):
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {Array.from(changesMap.entries()).flatMap(([sid, map]) => {
              const s = statements.find(x => x.id === sid)
              const hLabel = s?.hoja ?? 'Hoja'
              return Array.from(map.entries()).map(([ck, { original, current }]) => {
                const [cuenta, periodo] = ck.split('||')
                return (
                  <div key={ck} className="flex items-center gap-2 text-xs text-amber-700">
                    <span className="font-medium">[{hLabel}]</span>
                    <span className="truncate flex-1">{cuenta.split(' / ').slice(-1)[0]}</span>
                    <span className="text-muted-foreground">{periodo}:</span>
                    <span className="line-through opacity-60">{formatNum(original)}</span>
                    <span>→</span>
                    <span className="font-semibold">{formatNum(current)}</span>
                  </div>
                )
              })
            })}
          </div>
        </div>
      )}
    </div>
  )
}
