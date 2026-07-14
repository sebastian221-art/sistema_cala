'use client'

// src/components/ai/InsightsPanel.tsx — v2.0
// FIX: muestra el insight devuelto directamente por la mutación (sin esperar refetch)
// FIX: refetch usa el activeStatementId correcto al momento del onSuccess
// FIX: selector de statements filtra solo ESF/ERI (no hojas de notas)

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Brain, TrendingUp, TrendingDown, Shield, Lightbulb,
  RefreshCw, AlertTriangle, CheckCircle, XCircle,
} from 'lucide-react'
import { cn, getSemaforoColor } from '@/lib/utils'
import { createClient }         from '@/lib/supabase/client'
import { toast }                from 'sonner'

interface InsightsPanelProps {
  clientId:     string
  statementId?: string
  clientName?:  string
}

interface SemaforoDetalle {
  liquidez?:      'verde' | 'amarillo' | 'rojo'
  endeudamiento?: 'verde' | 'amarillo' | 'rojo'
  rentabilidad?:  'verde' | 'amarillo' | 'rojo'
  eficiencia?:    'verde' | 'amarillo' | 'rojo'
}

interface AIInsightData {
  tendencias:             string[]
  fortalezas:             string[]
  riesgos:                string[]
  recomendaciones:        string[]
  semaforo?:              'verde' | 'amarillo' | 'rojo'
  semaforo_detalle?:      SemaforoDetalle
  resumen_ejecutivo?:     string
  alertas_fiscales?:      string[]
  indicadores_calculados?: Record<string, number>
}

const SemaforoIcon = ({ semaforo }: { semaforo: 'verde' | 'amarillo' | 'rojo' }) => {
  const icons = { verde: CheckCircle, amarillo: AlertTriangle, rojo: XCircle }
  const Icon = icons[semaforo]
  return <Icon className={cn('w-5 h-5', getSemaforoColor(semaforo).split(' ')[0])} />
}

export function InsightsPanel({ clientId, statementId: initialStatementId }: InsightsPanelProps) {
  const supabase      = createClient()
  const queryClient   = useQueryClient()
  const [selectedId, setSelectedId] = useState<string>(initialStatementId ?? '')
  // Insight local mostrado inmediatamente tras el analyze (sin esperar BD)
  const [localInsight, setLocalInsight] = useState<AIInsightData | null>(null)

  const activeId = selectedId || initialStatementId || ''

  // Statements para el selector — filtrar solo ESF y ERI
  const { data: statements } = useQuery({
    queryKey: ['financial-statements-list', clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('financial_statements')
        .select('id, año, periodo_tipo, periodo_valor, hoja, tipo')
        .eq('client_id', clientId)
        .order('año',          { ascending: false })
        .order('periodo_valor',{ ascending: false })
      return (data ?? []).filter((s: any) =>
        s.hoja === 'ESF' || s.hoja === 'ERI' ||
        s.tipo === 'balance' || s.tipo === 'pyg'
      )
    },
  })

  // Insight guardado en BD
  const { data: savedInsight, refetch: refetchInsight } = useQuery({
    queryKey: ['ai-insights', clientId, activeId],
    queryFn: async () => {
      if (!activeId) return null
      const { data } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('client_id', clientId)
        .eq('statement_id', activeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data ?? null
    },
    enabled: !!activeId,
  })

  // Mutación para generar análisis
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!activeId) throw new Error('Selecciona un estado financiero para analizar')

      const res = await fetch('/api/ai/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ statementId: activeId, clientId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al analizar')
      }
      return res.json()
    },
    onSuccess: (response) => {
      // Mostrar inmediatamente los datos de la respuesta
      if (response?.data) {
        setLocalInsight(response.data as AIInsightData)
      }
      toast.success('Análisis IA completado')
      // Invalidar cache para que el query también se actualice
      queryClient.invalidateQueries({ queryKey: ['ai-insights', clientId, activeId] })
      refetchInsight()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Limpiar insight local cuando cambia el statement seleccionado
  const handleSelectStatement = (id: string) => {
    setSelectedId(id)
    setLocalInsight(null)
  }

  // Usar insight local (recién generado) o el guardado en BD
  const insightRaw = localInsight
    ? { ...localInsight }
    : savedInsight
    ? {
        tendencias:              savedInsight.tendencias        ?? [],
        fortalezas:              savedInsight.fortalezas        ?? [],
        riesgos:                 savedInsight.riesgos           ?? [],
        recomendaciones:         savedInsight.recomendaciones   ?? [],
        semaforo:                savedInsight.semaforo,
        semaforo_detalle:       (savedInsight as any).semaforo_detalle,
        resumen_ejecutivo:      (savedInsight as any).resumen_ejecutivo,
        alertas_fiscales:       (savedInsight as any).alertas_fiscales,
        indicadores_calculados: (savedInsight as any).indicadores_calculados,
      }
    : null

  const insight: AIInsightData | null = insightRaw

  const mesesLabel = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Insights IA</h3>
            <p className="text-xs text-muted-foreground">Análisis con Groq · Llama 3.3</p>
          </div>
        </div>
        <button
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending || !activeId}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50"
        >
          {analyzeMutation.isPending
            ? <><RefreshCw className="w-4 h-4 animate-spin" />Analizando...</>
            : <><Brain className="w-4 h-4" />Analizar</>}
        </button>
      </div>

      {/* Selector de estado financiero */}
      {statements && statements.length > 0 && (
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Estado financiero a analizar
          </label>
          <select value={activeId} onChange={e => handleSelectStatement(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Seleccionar estado financiero...</option>
            {statements.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.año} · {s.periodo_tipo === 'mes'
                  ? mesesLabel[s.periodo_valor]
                  : s.periodo_tipo === 'trimestre'
                  ? `T${s.periodo_valor}`
                  : s.periodo_tipo === 'semestre'
                  ? `S${s.periodo_valor}`
                  : 'Anual'}
                {s.hoja ? ` · ${s.hoja}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Contenido */}
      {analyzeMutation.isPending ? (
        <div className="p-8 text-center">
          <Brain className="w-10 h-10 text-primary animate-pulse mx-auto mb-3" />
          <p className="font-medium text-foreground">Analizando estados financieros...</p>
          <p className="text-sm text-muted-foreground mt-1">Groq · Llama 3.3 está procesando los datos</p>
        </div>
      ) : !insight ? (
        <div className="p-8 text-center">
          <Brain className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium text-foreground">Sin análisis generado</p>
          <p className="text-sm text-muted-foreground mt-1">
            {activeId
              ? 'Haz clic en "Analizar" para generar insights con IA'
              : 'Selecciona un estado financiero arriba y haz clic en "Analizar"'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {/* Semáforo general */}
          {insight.semaforo && (
            <div className={cn('flex items-center gap-3 px-5 py-3',
              insight.semaforo === 'verde'   ? 'bg-green-500/10'  :
              insight.semaforo === 'amarillo'? 'bg-yellow-500/10' : 'bg-red-500/10')}>
              <SemaforoIcon semaforo={insight.semaforo} />
              <p className="text-sm font-semibold text-foreground capitalize">
                Salud financiera: {insight.semaforo === 'verde' ? 'Buena' : insight.semaforo === 'amarillo' ? 'Moderada' : 'Crítica'}
              </p>
            </div>
          )}

          {/* Resumen ejecutivo */}
          {insight.resumen_ejecutivo && (
            <section className="p-5 bg-primary/5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
                <Brain className="w-4 h-4 text-primary" />Resumen Ejecutivo
              </h4>
              <p className="text-sm text-foreground leading-relaxed">{insight.resumen_ejecutivo}</p>
            </section>
          )}

          {/* Semáforo por dimensión */}
          {insight.semaforo_detalle && Object.keys(insight.semaforo_detalle).length > 0 && (
            <section className="p-5">
              <h4 className="text-sm font-semibold text-foreground mb-3">Semáforo por Dimensión</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(Object.entries(insight.semaforo_detalle) as [string, 'verde'|'amarillo'|'rojo'][]).map(([dim, sem]) => (
                  <div key={dim} className={cn('rounded-xl p-3 text-center', getSemaforoColor(sem))}>
                    <SemaforoIcon semaforo={sem} />
                    <p className="text-xs font-medium mt-1 capitalize">{dim}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tendencias */}
          {insight.tendencias.length > 0 && (
            <section className="p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />Tendencias
              </h4>
              <ul className="space-y-2">
                {insight.tendencias.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Fortalezas */}
          {insight.fortalezas.length > 0 && (
            <section className="p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                <Shield className="w-4 h-4 text-success" />Fortalezas
              </h4>
              <ul className="space-y-2">
                {insight.fortalezas.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Riesgos */}
          {insight.riesgos.length > 0 && (
            <section className="p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                <TrendingDown className="w-4 h-4 text-danger" />Riesgos
              </h4>
              <ul className="space-y-2">
                {insight.riesgos.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <AlertTriangle className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Alertas fiscales */}
          {insight.alertas_fiscales && insight.alertas_fiscales.length > 0 && (
            <section className="p-5 bg-yellow-500/5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                <AlertTriangle className="w-4 h-4 text-warning" />Alertas Fiscales
              </h4>
              <ul className="space-y-2">
                {insight.alertas_fiscales.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0 mt-1.5" />
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Recomendaciones */}
          {insight.recomendaciones.length > 0 && (
            <section className="p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                <Lightbulb className="w-4 h-4 text-primary" />Recomendaciones
              </h4>
              <ul className="space-y-2">
                {insight.recomendaciones.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}