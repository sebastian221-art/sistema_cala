'use client'

/**
 * Panel de comparación multi-período para estados financieros CALA.
 * Permite comparar ESF o ERI a través de todos los períodos subidos,
 * con filtros por año, semestre, meses o rango personalizado.
 */
import React, { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface FinancialRow {
  cuenta: string
  nota?: number
  valores: Record<string, number>
}

interface RawSheetData {
  empresa: string
  periodos: string[]
  filas: FinancialRow[]
}

interface StatementRecord {
  id: string
  tipo: string
  hoja: string | null
  nombre_archivo: string | null
  periodo_tipo: string
  periodo_valor: number
  año: number
  raw_data_json: RawSheetData | null
  created_at: string
}

interface Props {
  statements: StatementRecord[]
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function formatCOP(v: number): string {
  if (v === 0) return '—'
  const abs = Math.abs(v)
  let formatted: string
  if (abs >= 1_000_000_000) {
    formatted = `${(abs / 1_000_000_000).toFixed(1)}B`
  } else if (abs >= 1_000_000) {
    formatted = `${(abs / 1_000_000).toFixed(1)}M`
  } else if (abs >= 1_000) {
    formatted = `${(abs / 1_000).toFixed(0)}K`
  } else {
    formatted = abs.toFixed(0)
  }
  return v < 0 ? `(${formatted})` : formatted
}

function formatFull(v: number): string {
  if (v === 0) return '—'
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(v))
  return v < 0 ? `(${formatted})` : formatted
}

function periodLabel(s: StatementRecord): string {
  if (s.periodo_tipo === 'mes')       return `${MESES[s.periodo_valor] ?? s.periodo_valor} ${s.año}`
  if (s.periodo_tipo === 'trimestre') return `T${s.periodo_valor}/${s.año}`
  if (s.periodo_tipo === 'semestre')  return `S${s.periodo_valor}/${s.año}`
  return `Anual ${s.año}`
}

type FilterMode = 'todos' | 'año' | 'semestre' | 'trimestre' | 'rango'

export function FinancialComparison({ statements }: Props) {
  const [hojaActiva, setHojaActiva] = useState<'ESF' | 'ERI'>('ESF')
  const [filterMode, setFilterMode] = useState<FilterMode>('todos')
  const [filterAño, setFilterAño] = useState<number>(new Date().getFullYear())
  const [filterSemestre, setFilterSemestre] = useState<1 | 2>(1)
  const [filterTrimestre, setFilterTrimestre] = useState<1 | 2 | 3 | 4>(1)
  const [rangeStart, setRangeStart] = useState<number>(1)
  const [rangeEnd, setRangeEnd] = useState<number>(6)
  const [rangeAño, setRangeAño] = useState<number>(new Date().getFullYear())
  const [showFull, setShowFull] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const años = useMemo(() => {
    const set = new Set(statements.map((s) => s.año))
    return Array.from(set).sort((a, b) => b - a)
  }, [statements])

  // Filtrar statements según modo
  const filteredStatements = useMemo(() => {
    // Base: soportar todos los tipos de período (mes, trimestre, semestre, año)
    const base = statements.filter(
      (s) => s.hoja === hojaActiva && s.raw_data_json
    )

    switch (filterMode) {
      case 'año':
        return base.filter((s) => s.año === filterAño)
      case 'semestre': {
        // Para períodos mensuales, filtrar por meses del semestre
        // Para períodos semestrales, filtrar por numero de semestre
        return base.filter((s) => {
          if (s.año !== filterAño) return false
          if (s.periodo_tipo === 'mes') {
            const meses = filterSemestre === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12]
            return meses.includes(s.periodo_valor)
          }
          if (s.periodo_tipo === 'semestre') return s.periodo_valor === filterSemestre
          if (s.periodo_tipo === 'trimestre') {
            const trims = filterSemestre === 1 ? [1, 2] : [3, 4]
            return trims.includes(s.periodo_valor)
          }
          return true
        })
      }
      case 'trimestre': {
        const mesesMap: Record<number, number[]> = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] }
        return base.filter((s) => {
          if (s.año !== filterAño) return false
          if (s.periodo_tipo === 'mes') {
            return (mesesMap[filterTrimestre] ?? []).includes(s.periodo_valor)
          }
          if (s.periodo_tipo === 'trimestre') return s.periodo_valor === filterTrimestre
          return false
        })
      }
      case 'rango':
        // Rango solo aplica para períodos mensuales
        return base.filter((s) => {
          if (s.periodo_tipo !== 'mes') return false
          const m = s.periodo_valor
          return s.año === rangeAño && m >= rangeStart && m <= rangeEnd
        })
      default:
        return base
    }
  }, [statements, hojaActiva, filterMode, filterAño, filterSemestre, filterTrimestre, rangeStart, rangeEnd, rangeAño])

  // Ordenar por año + período ascendente
  const orderedStatements = useMemo(
    () => [...filteredStatements].sort((a, b) =>
      a.año !== b.año ? a.año - b.año : a.periodo_valor - b.periodo_valor
    ),
    [filteredStatements]
  )

  // Construir tabla comparativa: unir filas por cuenta y mapear valores por período
  const { allCuentas, periodCols } = useMemo(() => {
    const cuentaMap = new Map<string, Record<string, number>>()

    for (const stmt of orderedStatements) {
      const raw = stmt.raw_data_json
      if (!raw) continue
      const colLabel = periodLabel(stmt)

      for (const fila of raw.filas) {
        if (!cuentaMap.has(fila.cuenta)) cuentaMap.set(fila.cuenta, {})
        const row = cuentaMap.get(fila.cuenta)!
        // El valor está bajo raw.periodos[0] key
        const valKey = raw.periodos[0] ?? ''
        row[colLabel] = fila.valores[valKey] ?? 0
      }
    }

    const periodCols = orderedStatements.map(periodLabel)
    return { allCuentas: cuentaMap, periodCols }
  }, [orderedStatements])

  const fmt = showFull ? formatFull : formatCOP

  // Agrupar por sección (antes del '/')
  const sections = useMemo(() => {
    const groups: Array<{ title: string; cuentas: Array<{ key: string; valores: Record<string, number> }> }> = []
    let currentSection = ''
    let currentGroup: typeof groups[0] | null = null

    for (const [cuenta, valores] of allCuentas.entries()) {
      const parts = cuenta.split(' / ')
      const section = parts.length >= 2 ? parts[0].trim() : ''
      const name = parts.length >= 2 ? parts.slice(1).join(' / ').trim() : cuenta

      if (section !== currentSection || currentGroup === null) {
        currentSection = section
        currentGroup = { title: section, cuentas: [] }
        groups.push(currentGroup)
      }
      currentGroup.cuentas.push({ key: name, valores })
    }
    return groups
  }, [allCuentas])

  const isTotal = (c: string) => c.toLowerCase().includes('total')

  if (statements.filter((s) => s.hoja === 'ESF' || s.hoja === 'ERI').length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-muted-foreground text-sm">
          Sube al menos un estado financiero para ver el panel comparativo.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-4">
          {/* Hoja selector */}
          <div className="flex gap-1 bg-muted/30 p-1 rounded-xl">
            {(['ESF', 'ERI'] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHojaActiva(h)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  hojaActiva === h ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {h === 'ESF' ? 'Balance (ESF)' : 'Resultados (ERI)'}
              </button>
            ))}
          </div>

          {/* Modo de filtro */}
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="todos">Todos los períodos</option>
            <option value="año">Por año</option>
            <option value="semestre">Por semestre</option>
            <option value="trimestre">Por trimestre</option>
            <option value="rango">Rango de meses</option>
          </select>

          {/* Controles adicionales según modo */}
          {(filterMode === 'año' || filterMode === 'semestre' || filterMode === 'trimestre') && (
            <select
              value={filterAño}
              onChange={(e) => setFilterAño(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {años.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}

          {filterMode === 'semestre' && (
            <select
              value={filterSemestre}
              onChange={(e) => setFilterSemestre(Number(e.target.value) as 1 | 2)}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value={1}>Semestre 1 (Ene–Jun)</option>
              <option value={2}>Semestre 2 (Jul–Dic)</option>
            </select>
          )}

          {filterMode === 'trimestre' && (
            <select
              value={filterTrimestre}
              onChange={(e) => setFilterTrimestre(Number(e.target.value) as 1|2|3|4)}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value={1}>T1 — Ene/Feb/Mar</option>
              <option value={2}>T2 — Abr/May/Jun</option>
              <option value={3}>T3 — Jul/Ago/Sep</option>
              <option value={4}>T4 — Oct/Nov/Dic</option>
            </select>
          )}

          {filterMode === 'rango' && (
            <>
              <select
                value={rangeAño}
                onChange={(e) => setRangeAño(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {años.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select
                value={rangeStart}
                onChange={(e) => setRangeStart(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {MESES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">a</span>
              <select
                value={rangeEnd}
                onChange={(e) => setRangeEnd(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {MESES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </>
          )}

          <button
            onClick={() => setShowFull((v) => !v)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
          >
            {showFull ? 'Ver abreviado' : 'Ver cifras completas'}
          </button>
        </div>
      </div>

      {orderedStatements.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No hay períodos para el filtro seleccionado. Ajusta los filtros o sube más períodos.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-foreground min-w-[260px]">
                  Concepto
                </th>
                {periodCols.map((col, i) => (
                  <th
                    key={i}
                    className="text-right px-4 py-2.5 font-medium text-primary min-w-[110px]"
                  >
                    {col}
                  </th>
                ))}
                {periodCols.length >= 2 && (
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground min-w-[90px]">
                    Variación
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sections.map((section, si) => {
                const sectionKey = section.title + si
                const isOpen = !collapsed[sectionKey]
                return (
                  <React.Fragment key={si}>
                    {section.title && (
                      <tr
                        className="bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setCollapsed((p) => ({ ...p, [sectionKey]: !p[sectionKey] }))}
                      >
                        <td colSpan={2 + periodCols.length + (periodCols.length >= 2 ? 1 : 0)} className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            {isOpen
                              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                            <span className="font-semibold text-foreground uppercase tracking-wide text-xs">
                              {section.title}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isOpen && section.cuentas.map((item, ri) => {
                      const total = isTotal(item.key)
                      const hasValues = periodCols.some((col) => (item.valores[col] ?? 0) !== 0)
                      if (!hasValues && !total) return null

                      // Calcular variación entre primer y último período
                      const firstVal = item.valores[periodCols[0]] ?? 0
                      const lastVal = item.valores[periodCols[periodCols.length - 1]] ?? 0
                      const variation = firstVal !== 0 ? ((lastVal - firstVal) / Math.abs(firstVal)) * 100 : null

                      return (
                        <tr
                          key={`${si}-${ri}`}
                          className={cn(
                            'border-b border-border/50 hover:bg-muted/10 transition-colors',
                            total && 'bg-primary/5 font-semibold'
                          )}
                        >
                          <td className={cn(
                            'px-4 py-1.5 text-foreground',
                            total ? 'font-semibold' : 'text-muted-foreground pl-8'
                          )}>
                            {item.key}
                          </td>
                          {periodCols.map((col, pi) => {
                            const v = item.valores[col] ?? 0
                            return (
                              <td
                                key={pi}
                                className={cn(
                                  'px-4 py-1.5 text-right tabular-nums text-foreground',
                                  v < 0 && 'text-danger',
                                  total && 'font-semibold'
                                )}
                              >
                                {fmt(v)}
                              </td>
                            )
                          })}
                          {periodCols.length >= 2 && (
                            <td className={cn(
                              'px-4 py-1.5 text-right tabular-nums text-xs',
                              variation === null ? 'text-muted-foreground' :
                                variation > 0 ? 'text-success' : 'text-danger'
                            )}>
                              {variation !== null
                                ? `${variation >= 0 ? '+' : ''}${variation.toFixed(1)}%`
                                : '—'}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {orderedStatements.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {orderedStatements.length} período(s) comparados · {hojaActiva}
        </p>
      )}
    </div>
  )
}
