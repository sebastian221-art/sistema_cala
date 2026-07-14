'use client'

// src/components/financial/ESFStatementView.tsx — v2.2
// FIX: useEffect para actualizar activeHoja cuando sheets cambia (tab ESF no aparecía)
// FIX: acepta 'NOTAS ER' como alias de 'NOTAS ERI'

import React, { useState, useMemo, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'

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
  id:                   string
  hoja?:                string | null
  tipo:                 string
  nombre_archivo?:      string | null
  periodo_tipo:         string
  periodo_valor:        number
  año:                  number
  raw_data_json?:       unknown
  processed_data_json?: unknown
}

interface Props { statements: StatementRecord[] }

function normHoja(h: string): string {
  if (h === 'NOTAS ER') return 'NOTAS ERI'
  return h
}

function formatCOP(v: number): string {
  if (v === 0) return '—'
  const abs = Math.abs(v)
  let s: string
  if      (abs >= 1_000_000_000) s = `${(abs/1_000_000_000).toFixed(1)}B`
  else if (abs >= 1_000_000)     s = `${(abs/1_000_000).toFixed(1)}M`
  else if (abs >= 1_000)         s = `${(abs/1_000).toFixed(0)}K`
  else                           s = String(abs)
  return v < 0 ? `(${s})` : s
}

function formatFull(v: number): string {
  if (v === 0) return '—'
  const f = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(v))
  return v < 0 ? `(${f})` : f
}

const HOJA_LABELS: Record<string, string> = {
  'ESF':       'Estado de Situación Financiera',
  'ERI':       'Estado de Resultados Integrales',
  'NOTAS ESF': 'Notas — Estado de Situación Financiera',
  'NOTAS ERI': 'Notas — Estado de Resultados',
  'NOTAS ER':  'Notas — Estado de Resultados',
}

const HOJA_ORDER = ['ESF', 'ERI', 'NOTAS ESF', 'NOTAS ERI', 'NOTAS ER']

function isTotal(c: string): boolean {
  return c.toLowerCase().includes('total')
}

function SheetTable({ data, hoja }: { data: RawSheetData; hoja: string }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showFull, setShowFull] = useState(false)
  const periodos = useMemo(() => data.periodos.slice(0, 6), [data.periodos])

  const sections = useMemo(() => {
    const groups: { title: string; rows: FinancialRow[] }[] = []
    let cur: typeof groups[0] | null = null
    for (const fila of data.filas) {
      const parts = fila.cuenta.split(' / ')
      if (parts.length >= 2) {
        const sec  = parts[0].trim()
        const name = parts.slice(1).join(' / ').trim()
        if (!cur || cur.title !== sec) { cur = { title: sec, rows: [] }; groups.push(cur) }
        cur.rows.push({ ...fila, cuenta: name })
      } else {
        if (!cur) { cur = { title: '', rows: [] }; groups.push(cur) }
        cur.rows.push(fila)
      }
    }
    return groups
  }, [data.filas])

  const fmt = showFull ? formatFull : formatCOP

  if (!data.filas || data.filas.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-muted-foreground text-sm">Sin datos para esta hoja</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground text-sm">{HOJA_LABELS[hoja] ?? hoja}</h3>
          {data.empresa && <span className="text-xs text-muted-foreground">· {data.empresa}</span>}
        </div>
        <button onClick={() => setShowFull(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground underline">
          {showFull ? 'Ver resumido' : 'Ver cifras completas'}
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-4 py-2.5 text-left font-semibold text-foreground w-full">Concepto</th>
              <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground w-16">Nota</th>
              {periodos.map((p, i) => (
                <th key={i} className={cn('px-4 py-2.5 text-right font-semibold min-w-24',
                  i === 0 ? 'text-primary' : 'text-muted-foreground')}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec, si) => {
              const isOpen = collapsed[sec.title] !== true
              return (
                <React.Fragment key={si}>
                  {sec.title && (
                    <tr className="bg-muted/20 cursor-pointer hover:bg-muted/40"
                      onClick={() => setCollapsed(p => ({ ...p, [sec.title]: isOpen }))}>
                      <td colSpan={2 + periodos.length} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                          <span className="font-semibold text-foreground uppercase tracking-wide text-xs">{sec.title}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {isOpen && sec.rows.map((fila, ri) => {
                    const tot = isTotal(fila.cuenta)
                    const hasVals = periodos.some(p => fila.valores[p] !== undefined && fila.valores[p] !== 0)
                    if (!hasVals && !tot) return null
                    return (
                      <tr key={`${si}-${ri}`}
                        className={cn('border-b border-border/50 hover:bg-muted/10', tot && 'bg-primary/5 font-semibold')}>
                        <td className={cn('px-4 py-1.5 text-foreground', !tot && 'text-muted-foreground pl-8')}>{fila.cuenta}</td>
                        <td className="px-3 py-1.5 text-center text-muted-foreground">{fila.nota ?? ''}</td>
                        {periodos.map((p, pi) => {
                          const v = fila.valores[p]
                          return (
                            <td key={pi} className={cn('px-4 py-1.5 text-right tabular-nums',
                              pi === 0 ? 'text-foreground' : 'text-muted-foreground',
                              typeof v === 'number' && v < 0 && 'text-red-500',
                              tot && 'font-semibold')}>
                              {typeof v === 'number' ? fmt(v) : '—'}
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
    </div>
  )
}

function SheetTabs({ sheets }: { sheets: StatementRecord[] }) {
  const sheetsNorm = useMemo(() =>
    sheets.map(s => ({ ...s, hojaDisplay: s.hoja ? normHoja(s.hoja) : '' })),
    [sheets]
  )

  // FIX: inicializar con el primer tab disponible
  const firstTab = sheetsNorm[0]?.hojaDisplay ?? 'ESF'
  const [activeHoja, setActiveHoja] = useState(firstTab)

  // FIX CRÍTICO: actualizar activeHoja cuando sheets cambia
  // (resuelve el bug donde ESF no se seleccionaba automáticamente)
  useEffect(() => {
    if (sheetsNorm.length > 0) {
      const current = sheetsNorm.find(s => s.hojaDisplay === activeHoja)
      if (!current) {
        // El tab activo ya no existe → cambiar al primero disponible
        setActiveHoja(sheetsNorm[0].hojaDisplay)
      }
    }
  }, [sheetsNorm, activeHoja])

  const tabs = HOJA_ORDER.filter(h => sheetsNorm.some(s => s.hojaDisplay === h))
  const current = sheetsNorm.find(s => s.hojaDisplay === activeHoja) ?? sheetsNorm[0]
  const rawData = current?.raw_data_json as RawSheetData | null

  if (tabs.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-muted/30 p-1 rounded-xl w-fit">
        {tabs.map(h => (
          <button key={h} onClick={() => setActiveHoja(h)}
            className={cn('px-4 py-1.5 rounded-lg text-xs font-medium transition-colors',
              activeHoja === h ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {h}
          </button>
        ))}
      </div>
      {rawData && rawData.filas && rawData.filas.length > 0
        ? <SheetTable data={rawData} hoja={current?.hoja ?? activeHoja} />
        : <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted-foreground text-sm">Sin datos para {activeHoja}</p>
          </div>
      }
    </div>
  )
}

export function ESFStatementView({ statements }: Props) {
  const [activeTab, setActiveTab] = useState('')

  const groups = useMemo(() => {
    const map = new Map<string, StatementRecord[]>()
    for (const s of statements) {
      const key = `${s.nombre_archivo ?? 'Sin nombre'} — ${s.periodo_valor}/${s.año}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return map
  }, [statements])

  const groupKeys = useMemo(() => Array.from(groups.keys()), [groups])
  const selected = activeTab || groupKeys[0] || ''

  // FIX: auto-seleccionar primer grupo cuando llegan datos
  useEffect(() => {
    if (groupKeys.length > 0 && !activeTab) {
      setActiveTab(groupKeys[0])
    }
  }, [groupKeys, activeTab])

  const sheetsForGroup = useMemo(() => {
    const stmts = groups.get(selected) ?? []
    return HOJA_ORDER
      .map(h => stmts.find(s => s.hoja === h))
      .filter(Boolean) as StatementRecord[]
  }, [selected, groups])

  if (statements.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-muted-foreground">Sin estados financieros. Sube un Excel para empezar.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groupKeys.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {groupKeys.map(k => (
            <button key={k} onClick={() => setActiveTab(k)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                selected === k
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-foreground hover:bg-muted')}>
              {k}
            </button>
          ))}
        </div>
      )}
      {sheetsForGroup.length > 0
        ? <SheetTabs sheets={sheetsForGroup} />
        : <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted-foreground text-sm">Sin hojas para este período</p>
          </div>
      }
    </div>
  )
}