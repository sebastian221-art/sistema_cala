'use client'

// src/components/financial/FinancialDashboard.tsx — v3.0
// Rediseño completo: más KPIs, selector de períodos, gráficas mejoradas y exportación PDF

import React, { useState, useMemo, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart, LabelList,
} from 'recharts'
import { KpiCard }                          from '@/components/ui/KpiCard'
import { formatCurrency, formatPercent }    from '@/lib/utils'
import { ProcessedFinancialData, FinancialIndicators } from '@/types'
import { TrendingUp, TrendingDown, DollarSign, BarChart2, Printer, FileDown, Filter, Building2, Percent } from 'lucide-react'
import { createClient }                     from '@/lib/supabase/client'
import { cn }                               from '@/lib/utils'

interface FinancialDashboardProps {
  clientId:    string
  statements?: any[]
}

const COLORS  = ['#1a4731', '#52b788', '#40916c', '#2d6a4f', '#74c69d', '#b7e4c7', '#95d5b2']
const MESES   = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function calcularIndicadores(data: ProcessedFinancialData): FinancialIndicators & {
  capital_trabajo?: number; prueba_acida?: number; ebitda_est?: number
} {
  const {
    activos_corrientes = 0, pasivos_corrientes = 0,
    total_activos = 0, total_pasivos = 0,
    patrimonio = 0, ingresos = 0,
    utilidad_neta = 0, utilidad_bruta = 0, utilidad_operacional = 0,
    inventarios = 0,
  } = data

  return {
    razon_corriente:     pasivos_corrientes > 0 ? activos_corrientes / pasivos_corrientes : 0,
    nivel_endeudamiento: total_activos > 0 ? (total_pasivos / total_activos) * 100 : 0,
    roa:                 total_activos > 0 ? (utilidad_neta  / total_activos)  * 100 : 0,
    roe:                 patrimonio    > 0 ? (utilidad_neta  / patrimonio)     * 100 : 0,
    margen_bruto:        ingresos > 0 ? (utilidad_bruta       / ingresos) * 100 : 0,
    margen_operacional:  ingresos > 0 ? (utilidad_operacional / ingresos) * 100 : 0,
    margen_neto:         ingresos > 0 ? (utilidad_neta        / ingresos) * 100 : 0,
    capital_trabajo:     activos_corrientes - pasivos_corrientes,
    prueba_acida:        pasivos_corrientes > 0
      ? (activos_corrientes - inventarios) / pasivos_corrientes
      : 0,
    ebitda_est: utilidad_operacional * 1.15, // Estimación conservadora EBITDA
  }
}

const fmtM = (v: number) =>
  v === 0 ? '$0'
  : Math.abs(v) >= 1e9 ? `$${(v/1e9).toFixed(1)}B`
  : Math.abs(v) >= 1e6 ? `$${(v/1e6).toFixed(1)}M`
  : `$${(v/1e3).toFixed(0)}K`

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}:</span>
          <span className="font-mono font-semibold">{fmtM(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

export function FinancialDashboard({ clientId, statements: statementsProp }: FinancialDashboardProps) {
  const supabase = createClient()
  const printRef = useRef<HTMLDivElement>(null)

  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set())
  const [showPeriodFilter, setShowPeriodFilter] = useState(false)

  const { data: statementsQuery, isLoading } = useQuery({
    queryKey: ['financial-statements', clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('financial_statements')
        .select('*')
        .eq('client_id', clientId)
        .order('año',          { ascending: true })
        .order('periodo_valor',{ ascending: true })
        .limit(24)
      return data ?? []
    },
    enabled: !statementsProp,
    staleTime: 0,
  })

  const allStatements = statementsProp ?? statementsQuery ?? []

  // ERI y ESF separados
  const eriAll = allStatements.filter(
    (s: any) => (s.hoja === 'ERI' || (!s.hoja && s.tipo === 'pyg')) && s.processed_data_json
  )
  const esfAll = allStatements.filter(
    (s: any) => (s.hoja === 'ESF' || (!s.hoja && s.tipo === 'balance')) && s.processed_data_json
  )

  // Etiqueta de período
  const periodoLabel = useCallback((s: any) => {
    if (s.periodo_tipo === 'mes')
      return `${MESES[s.periodo_valor] ?? s.periodo_valor}/${String(s.año).slice(-2)}`
    if (s.periodo_tipo === 'trimestre') return `T${s.periodo_valor}/${String(s.año).slice(-2)}`
    if (s.periodo_tipo === 'semestre')  return `S${s.periodo_valor}/${String(s.año).slice(-2)}`
    return `${s.año}`
  }, [])

  // Períodos disponibles para el filtro
  const periodosDisponibles = useMemo(() =>
    eriAll.map((s: any) => periodoLabel(s)),
    [eriAll, periodoLabel]
  )

  // Filtrar períodos según selección
  const eriStatements = useMemo(() =>
    selectedPeriods.size === 0
      ? eriAll
      : eriAll.filter((s: any) => selectedPeriods.has(periodoLabel(s))),
    [eriAll, selectedPeriods, periodoLabel]
  )
  const esfStatements = useMemo(() =>
    selectedPeriods.size === 0
      ? esfAll
      : esfAll.filter((s: any) => selectedPeriods.has(periodoLabel(s))),
    [esfAll, selectedPeriods, periodoLabel]
  )

  const togglePeriod = (p: string) =>
    setSelectedPeriods(prev => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })

  // Datos para gráficas
  const trendData = eriStatements.map((s: any) => {
    const p = s.processed_data_json as ProcessedFinancialData
    return {
      name:      periodoLabel(s),
      ingresos:  p?.ingresos             ?? 0,
      gastos:    (p?.costo_ventas ?? 0)  + (p?.gastos_operacionales ?? 0),
      utilidad:  p?.utilidad_neta        ?? 0,
      utilOper:  p?.utilidad_operacional ?? 0,
    }
  })

  const esfTrendData = esfStatements.map((s: any) => {
    const p = s.processed_data_json as ProcessedFinancialData
    return {
      name:      periodoLabel(s),
      activos:   p?.total_activos  ?? 0,
      pasivos:   p?.total_pasivos  ?? 0,
      patrimonio: p?.patrimonio    ?? 0,
    }
  })

  const ultimoBalance = esfStatements.at(-1)
  const ultimoPyG     = eriStatements.at(-1)

  const composicionActivos = ultimoBalance ? [
    { name: 'Activos Corrientes',    value: (ultimoBalance.processed_data_json as ProcessedFinancialData)?.activos_corrientes    ?? 0 },
    { name: 'Activos No Corrientes', value: (ultimoBalance.processed_data_json as ProcessedFinancialData)?.activos_no_corrientes ?? 0 },
  ].filter(d => d.value > 0) : []

  const composicionPasivos = ultimoBalance ? [
    { name: 'Pasivos Corrientes',    value: (ultimoBalance.processed_data_json as ProcessedFinancialData)?.pasivos_corrientes    ?? 0 },
    { name: 'Patrimonio',            value: (ultimoBalance.processed_data_json as ProcessedFinancialData)?.patrimonio            ?? 0 },
    { name: 'Otros Pasivos',         value: Math.max(
      ((ultimoBalance.processed_data_json as ProcessedFinancialData)?.total_pasivos ?? 0) -
      ((ultimoBalance.processed_data_json as ProcessedFinancialData)?.pasivos_corrientes ?? 0), 0
    )},
  ].filter(d => d.value > 0) : []

  const indicadores = ultimoPyG ? calcularIndicadores({
    ...(ultimoPyG.processed_data_json     as ProcessedFinancialData),
    ...(ultimoBalance?.processed_data_json as ProcessedFinancialData | undefined),
  }) : null

  const radarData = indicadores ? [
    { subject: 'Margen Bruto', value: Math.min(Math.max(indicadores.margen_bruto ?? 0, 0), 100) },
    { subject: 'Margen Neto',  value: Math.min(Math.max(indicadores.margen_neto  ?? 0, 0), 100) },
    { subject: 'ROA',          value: Math.min(Math.max(indicadores.roa          ?? 0, 0), 100) },
    { subject: 'ROE',          value: Math.min(Math.max(indicadores.roe          ?? 0, 0), 100) },
    { subject: 'Liquidez',     value: Math.min((indicadores.razon_corriente      ?? 0) * 33, 100) },
    { subject: 'Solvencia',    value: Math.max(100 - (indicadores.nivel_endeudamiento ?? 0), 0) },
  ] : []

  const handlePrint = () => window.print()

  if (isLoading && !statementsProp) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!allStatements || allStatements.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Sin estados financieros</h3>
        <p className="text-muted-foreground text-sm">
          Sube el primer estado financiero para ver el análisis
        </p>
      </div>
    )
  }

  const latestPyG = ultimoPyG?.processed_data_json as ProcessedFinancialData | undefined
  const latestESF = ultimoBalance?.processed_data_json as ProcessedFinancialData | undefined

  return (
    <>
      {/* Estilos de impresión */}
      <style>{`
        @media print {
          /*
           * Usamos A4 horizontal (~1122px ancho lógico).
           * Eso activa los breakpoints lg: de Tailwind, por lo que las grillas
           * 2-col de gráficas y 4-col de KPIs funcionan sin overrides extra.
           * NO tocamos las dimensiones de los SVG de Recharts para que los
           * gráficos circulares no se corten ni las etiquetas se monten.
           */
          @page { margin: 10mm 10mm; size: A4 landscape; }

          /* Mostrar solo el dashboard */
          body * { visibility: hidden !important; }
          #financial-dashboard-print,
          #financial-dashboard-print * { visibility: visible !important; }
          #financial-dashboard-print {
            position: absolute; left: 0; top: 0; width: 100%;
            font-size: 9px; color: #111;
          }

          /* Ocultar controles */
          .no-print { display: none !important; }

          /* Reducir espaciado vertical entre secciones */
          #financial-dashboard-print .space-y-6 > * + * {
            margin-top: 10px !important;
          }

          /* Cada card: sin cortes internos, padding compacto */
          #financial-dashboard-print .bg-card {
            box-sizing: border-box !important;
            page-break-inside: avoid;
            break-inside: avoid;
            border: 1px solid #ccc !important;
            border-radius: 4px !important;
            padding: 8px 10px !important;
          }

          /* Tablas internas sin cortes */
          #financial-dashboard-print table {
            page-break-inside: avoid;
            break-inside: avoid;
            width: 100%;
            font-size: 8px;
          }
          #financial-dashboard-print th,
          #financial-dashboard-print td {
            padding: 2px 4px !important;
          }

          /* Mostrar las descripciones debajo de cada gráfica */
          #financial-dashboard-print .chart-print-only {
            display: block !important;
          }
          /* Ocultar las tablas de datos (la gráfica ya es visible) */
          #financial-dashboard-print .chart-print-only table {
            display: none !important;
          }
        }
      `}</style>

      <div className="space-y-6" id="financial-dashboard-print" ref={printRef}>
        {/* Barra de controles */}
        <div className="flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            {/* Filtro de períodos */}
            <div className="relative">
              <button
                onClick={() => setShowPeriodFilter(v => !v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                  selectedPeriods.size > 0
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                <Filter className="w-3.5 h-3.5" />
                {selectedPeriods.size > 0
                  ? `${selectedPeriods.size} período(s) filtrado(s)`
                  : 'Todos los períodos'}
              </button>
              {showPeriodFilter && (
                <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-xl shadow-lg p-3 z-10 min-w-40">
                  <p className="text-xs font-semibold text-foreground mb-2">Filtrar períodos</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                      <input type="checkbox"
                        checked={selectedPeriods.size === 0}
                        onChange={() => setSelectedPeriods(new Set())}
                        className="rounded"
                      />
                      Todos
                    </label>
                    {periodosDisponibles.map(p => (
                      <label key={p} className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                        <input type="checkbox"
                          checked={selectedPeriods.has(p)}
                          onChange={() => togglePeriod(p)}
                          className="rounded"
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setShowPeriodFilter(false)}
              className="hidden"
              id="close-period-filter"
            />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-xl text-xs font-medium hover:bg-muted transition-colors text-foreground">
              <Printer className="w-3.5 h-3.5" />
              Imprimir / PDF
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:bg-primary-light transition-colors">
              <FileDown className="w-3.5 h-3.5" />
              Exportar presentación
            </button>
          </div>
        </div>

        {/* ── KPIs principales ── */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Resultados — Período más reciente
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Ingresos Totales"
              value={latestPyG?.ingresos ?? 0}
              format="currency" icon={DollarSign} />
            <KpiCard title="Utilidad Neta"
              value={latestPyG?.utilidad_neta ?? 0}
              format="currency" icon={TrendingUp}
              iconColor={(latestPyG?.utilidad_neta ?? 0) >= 0 ? 'text-success' : 'text-danger'} />
            <KpiCard title="Utilidad Bruta"
              value={latestPyG?.utilidad_bruta ?? 0}
              format="currency" icon={BarChart2} />
            <KpiCard title="EBITDA Estimado"
              value={indicadores?.ebitda_est ?? 0}
              format="currency" icon={TrendingUp}
              iconColor={(indicadores?.ebitda_est ?? 0) >= 0 ? 'text-success' : 'text-danger'} />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Balance — Período más reciente
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Total Activos"
              value={latestESF?.total_activos ?? 0}
              format="currency" icon={Building2} />
            <KpiCard title="Patrimonio"
              value={latestESF?.patrimonio ?? 0}
              format="currency" icon={TrendingUp}
              iconColor={(latestESF?.patrimonio ?? 0) >= 0 ? 'text-success' : 'text-danger'} />
            <KpiCard title="Capital de Trabajo"
              value={indicadores?.capital_trabajo ?? 0}
              format="currency" icon={DollarSign}
              iconColor={(indicadores?.capital_trabajo ?? 0) >= 0 ? 'text-success' : 'text-danger'} />
            <KpiCard title="Margen Neto"
              value={parseFloat((indicadores?.margen_neto ?? 0).toFixed(2))}
              format="percent" icon={Percent} />
          </div>
        </div>

        {/* ── Gráficas de tendencia ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {trendData.length >= 1 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-1">Ingresos vs Gastos</h3>
              <p className="text-xs text-muted-foreground mb-4">Evolución por período</p>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendData} margin={{ top: 28, right: 8, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="gIngresos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#1a4731" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#1a4731" stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="gGastos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#e63946" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#e63946" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtM} tick={{ fontSize: 11 }} width={56} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="ingresos" stroke="#1a4731" fill="url(#gIngresos)" name="Ingresos" strokeWidth={2} dot={{ r: 3 }}>
                    <LabelList dataKey="ingresos" position="top" formatter={fmtM} style={{ fontSize: '9px', fill: '#1a4731', fontWeight: 600 }} />
                  </Area>
                  <Area type="monotone" dataKey="gastos"   stroke="#e63946" fill="url(#gGastos)"   name="Gastos"   strokeWidth={2} dot={{ r: 3 }}>
                    <LabelList dataKey="gastos" position="insideTop" offset={-14} formatter={fmtM} style={{ fontSize: '9px', fill: '#e63946', fontWeight: 600 }} />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
              {/* Explicación y tabla de datos — solo en impresión/PDF */}
              <div className="chart-print-only hidden mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  <strong>Descripción:</strong> Evolución de ingresos totales (verde) versus gastos operacionales (rojo) por período. Un margen positivo sostenido indica operaciones rentables.
                </p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 pr-2 text-muted-foreground font-semibold">Período</th>
                      <th className="text-right py-1 pr-2 text-muted-foreground font-semibold">Ingresos</th>
                      <th className="text-right py-1 pr-2 text-muted-foreground font-semibold">Gastos</th>
                      <th className="text-right py-1 text-muted-foreground font-semibold">Utilidad Neta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendData.map((d, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1 pr-2 font-medium">{d.name}</td>
                        <td className="text-right py-1 pr-2 font-mono">{fmtM(d.ingresos)}</td>
                        <td className="text-right py-1 pr-2 font-mono">{fmtM(d.gastos)}</td>
                        <td className={cn('text-right py-1 font-mono font-semibold', d.utilidad >= 0 ? 'text-green-700' : 'text-red-600')}>{fmtM(d.utilidad)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {trendData.length >= 1 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-1">Desglose de Resultados</h3>
              <p className="text-xs text-muted-foreground mb-4">Utilidad neta (barras) vs utilidad operacional (línea)</p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trendData} margin={{ top: 28, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtM} tick={{ fontSize: 11 }} width={56} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="utilidad" name="Utilidad Neta" fill="#52b788" radius={[4,4,0,0]}>
                    <LabelList dataKey="utilidad" position="top" formatter={fmtM} style={{ fontSize: '9px', fill: '#2d6a4f', fontWeight: 600 }} />
                  </Bar>
                  <Line dataKey="utilOper" name="Utilidad Oper." stroke="#1a4731" strokeWidth={2} dot={{ r: 3 }} type="monotone">
                    <LabelList dataKey="utilOper" position="insideTopRight" offset={8} formatter={fmtM} style={{ fontSize: '9px', fill: '#1a4731', fontWeight: 600 }} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
              {/* Explicación — solo en impresión/PDF */}
              <div className="chart-print-only hidden mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  <strong>Descripción:</strong> Las barras muestran la utilidad neta (después de impuestos e intereses). La línea muestra la utilidad operacional. La diferencia entre ambas refleja la carga financiera y tributaria.
                </p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 pr-2 text-muted-foreground font-semibold">Período</th>
                      <th className="text-right py-1 pr-2 text-muted-foreground font-semibold">Utilidad Neta</th>
                      <th className="text-right py-1 text-muted-foreground font-semibold">Utilidad Operacional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendData.map((d, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1 pr-2 font-medium">{d.name}</td>
                        <td className={cn('text-right py-1 pr-2 font-mono font-semibold', d.utilidad >= 0 ? 'text-green-700' : 'text-red-600')}>{fmtM(d.utilidad)}</td>
                        <td className={cn('text-right py-1 font-mono', d.utilOper >= 0 ? 'text-green-700' : 'text-red-600')}>{fmtM(d.utilOper)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {esfTrendData.length >= 1 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-1">Estructura Financiera</h3>
              <p className="text-xs text-muted-foreground mb-4">Activos · Pasivos · Patrimonio</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={esfTrendData} margin={{ top: 28, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtM} tick={{ fontSize: 11 }} width={56} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="activos"    name="Activos"    fill="#1a4731" radius={[4,4,0,0]}>
                    <LabelList dataKey="activos"    position="top" formatter={fmtM} style={{ fontSize: '8px', fill: '#1a4731', fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="pasivos"    name="Pasivos"    fill="#e63946" radius={[4,4,0,0]}>
                    <LabelList dataKey="pasivos"    position="top" formatter={fmtM} style={{ fontSize: '8px', fill: '#e63946', fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="patrimonio" name="Patrimonio" fill="#52b788" radius={[4,4,0,0]}>
                    <LabelList dataKey="patrimonio" position="top" formatter={fmtM} style={{ fontSize: '8px', fill: '#2d6a4f', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Explicación — solo en impresión/PDF */}
              <div className="chart-print-only hidden mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  <strong>Descripción:</strong> Evolución del balance general por período. Activos = Pasivos + Patrimonio. Un patrimonio creciente indica solidez financiera.
                </p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 pr-2 text-muted-foreground font-semibold">Período</th>
                      <th className="text-right py-1 pr-2 text-muted-foreground font-semibold">Total Activos</th>
                      <th className="text-right py-1 pr-2 text-muted-foreground font-semibold">Total Pasivos</th>
                      <th className="text-right py-1 text-muted-foreground font-semibold">Patrimonio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {esfTrendData.map((d, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1 pr-2 font-medium">{d.name}</td>
                        <td className="text-right py-1 pr-2 font-mono">{fmtM(d.activos)}</td>
                        <td className="text-right py-1 pr-2 font-mono">{fmtM(d.pasivos)}</td>
                        <td className={cn('text-right py-1 font-mono font-semibold', d.patrimonio >= 0 ? 'text-green-700' : 'text-red-600')}>{fmtM(d.patrimonio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {composicionActivos.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-1">Composición del Activo</h3>
              <p className="text-xs text-muted-foreground mb-4">Distribución corriente / no corriente</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={composicionActivos} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    paddingAngle={3} dataKey="value" labelLine={false}>
                    {composicionActivos.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => fmtM(v as number)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              {/* Explicación — solo en impresión/PDF */}
              <div className="chart-print-only hidden mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  <strong>Descripción:</strong> Distribución de los activos totales entre corrientes (liquidez a corto plazo: caja, inventarios, cartera) y no corrientes (inversiones a largo plazo: propiedades, maquinaria).
                </p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 pr-2 text-muted-foreground font-semibold">Componente</th>
                      <th className="text-right py-1 pr-2 text-muted-foreground font-semibold">Valor</th>
                      <th className="text-right py-1 text-muted-foreground font-semibold">Participación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {composicionActivos.map((d, i) => {
                      const total = composicionActivos.reduce((s, x) => s + x.value, 0)
                      return (
                        <tr key={i} className="border-b border-border/30">
                          <td className="py-1 pr-2 font-medium">{d.name}</td>
                          <td className="text-right py-1 pr-2 font-mono">{fmtM(d.value)}</td>
                          <td className="text-right py-1 font-mono font-semibold">{total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {composicionPasivos.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-1">Estructura de Financiación</h3>
              <p className="text-xs text-muted-foreground mb-4">Pasivos corrientes · Otros pasivos · Patrimonio</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={composicionPasivos} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    paddingAngle={3} dataKey="value" labelLine={false}>
                    {composicionPasivos.map((_: any, i: number) => (
                      <Cell key={i} fill={['#e63946','#ff6b6b','#52b788'][i % 3]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => fmtM(v as number)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              {/* Explicación — solo en impresión/PDF */}
              <div className="chart-print-only hidden mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  <strong>Descripción:</strong> Muestra cómo se financian los activos de la empresa. Una mayor proporción de patrimonio (verde) indica menor dependencia de deuda externa y mayor solidez financiera.
                </p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 pr-2 text-muted-foreground font-semibold">Componente</th>
                      <th className="text-right py-1 pr-2 text-muted-foreground font-semibold">Valor</th>
                      <th className="text-right py-1 text-muted-foreground font-semibold">Participación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {composicionPasivos.map((d, i) => {
                      const total = composicionPasivos.reduce((s, x) => s + x.value, 0)
                      return (
                        <tr key={i} className="border-b border-border/30">
                          <td className="py-1 pr-2 font-medium">{d.name}</td>
                          <td className="text-right py-1 pr-2 font-mono">{fmtM(d.value)}</td>
                          <td className="text-right py-1 font-mono font-semibold">{total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {radarData.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-1">Radar de Indicadores Clave</h3>
              <p className="text-xs text-muted-foreground mb-4">Salud financiera multidimensional (0–100)</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgb(var(--border))" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="Indicadores" dataKey="value" stroke="#1a4731" fill="#52b788" fillOpacity={0.4} />
                  <Tooltip formatter={(v: unknown) => `${(v as number).toFixed(1)}`} />
                </RadarChart>
              </ResponsiveContainer>
              {/* Explicación — solo en impresión/PDF */}
              <div className="chart-print-only hidden mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  <strong>Descripción:</strong> Perfil de salud financiera en escala 0–100. Valores más cercanos al borde exterior indican mejor desempeño. Liquidez y Solvencia se normalizan a 100; márgenes y retornos se muestran en porcentaje.
                </p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 pr-2 text-muted-foreground font-semibold">Indicador</th>
                      <th className="text-right py-1 text-muted-foreground font-semibold">Puntaje / 100</th>
                    </tr>
                  </thead>
                  <tbody>
                    {radarData.map((d, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1 pr-2 font-medium">{d.subject}</td>
                        <td className={cn('text-right py-1 font-mono font-semibold', d.value >= 50 ? 'text-green-700' : 'text-orange-600')}>{d.value.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Tabla de indicadores ── */}
        {indicadores && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Indicadores Financieros Completos</h3>
              <span className="text-xs text-muted-foreground">
                Período más reciente: {ultimoPyG ? periodoLabel(ultimoPyG) : '—'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 divide-border">
              {[
                { label: 'Razón Corriente',      value: (indicadores.razon_corriente   ?? 0).toFixed(2) + 'x', meta: '≥ 1.5', ok: (indicadores.razon_corriente    ?? 0) >= 1.5,  hint: 'Liquidez a corto plazo' },
                { label: 'Prueba Ácida',          value: (indicadores.prueba_acida      ?? 0).toFixed(2) + 'x', meta: '≥ 1.0', ok: (indicadores.prueba_acida       ?? 0) >= 1.0,  hint: 'Sin inventarios' },
                { label: 'Endeudamiento',         value: formatPercent(indicadores.nivel_endeudamiento ?? 0),   meta: '< 60%', ok: (indicadores.nivel_endeudamiento ?? 0) <  60,   hint: 'Pasivos / Activos' },
                { label: 'ROA',                   value: formatPercent(indicadores.roa          ?? 0),          meta: '> 5%',  ok: (indicadores.roa                ?? 0) >   5,   hint: 'Retorno sobre Activos' },
                { label: 'ROE',                   value: formatPercent(indicadores.roe          ?? 0),          meta: '> 10%', ok: (indicadores.roe                ?? 0) >  10,   hint: 'Retorno sobre Patrimonio' },
                { label: 'Margen Bruto',          value: formatPercent(indicadores.margen_bruto       ?? 0),    meta: '> 30%', ok: (indicadores.margen_bruto       ?? 0) >  30,   hint: 'Ganancia sobre ventas' },
                { label: 'Margen Operacional',    value: formatPercent(indicadores.margen_operacional ?? 0),    meta: '> 10%', ok: (indicadores.margen_operacional  ?? 0) >  10,   hint: 'Antes de imp. e intereses' },
                { label: 'Margen Neto',           value: formatPercent(indicadores.margen_neto        ?? 0),    meta: '> 5%',  ok: (indicadores.margen_neto        ?? 0) >   5,   hint: 'Utilidad / Ingresos' },
              ].map(ind => (
                <div key={ind.label} className="p-4 border border-border/30">
                  <p className="text-xs text-muted-foreground">{ind.label}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{ind.hint}</p>
                  <p className="text-xl font-mono font-bold text-foreground mt-1">{ind.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', ind.ok ? 'bg-success' : 'bg-warning')} />
                    <p className={cn('text-xs', ind.ok ? 'text-success' : 'text-warning')}>
                      Meta: {ind.meta}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Capital de trabajo y EBITDA ── */}
        {indicadores && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs text-muted-foreground mb-1">Capital de Trabajo Neto</p>
              <p className={cn('text-2xl font-mono font-bold',
                (indicadores.capital_trabajo ?? 0) >= 0 ? 'text-success' : 'text-danger')}>
                {fmtM(indicadores.capital_trabajo ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {(indicadores.capital_trabajo ?? 0) >= 0 ? '✓ Positivo — buena liquidez' : '⚠ Negativo — revisar pasivos corrientes'}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs text-muted-foreground mb-1">EBITDA Estimado</p>
              <p className={cn('text-2xl font-mono font-bold',
                (indicadores.ebitda_est ?? 0) >= 0 ? 'text-success' : 'text-danger')}>
                {fmtM(indicadores.ebitda_est ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Utilidad operacional × 1.15</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs text-muted-foreground mb-1">Deuda / Patrimonio</p>
              <p className={cn('text-2xl font-mono font-bold',
                ((latestESF?.total_pasivos ?? 0) / Math.max(latestESF?.patrimonio ?? 1, 1)) < 1.5
                  ? 'text-success' : 'text-warning')}>
                {((latestESF?.total_pasivos ?? 0) / Math.max(latestESF?.patrimonio ?? 1, 1)).toFixed(2)}x
              </p>
              <p className="text-xs text-muted-foreground mt-1">Meta: {'< 1.5x'}</p>
            </div>
          </div>
        )}

        {/* Footer de impresión */}
        <div className="chart-print-only hidden mt-8 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            CALA ASOCIADOS · NIT 800.089.091-5 · San Gil, Santander · {new Date().toLocaleDateString('es-CO')}
          </p>
        </div>
      </div>
    </>
  )
}
