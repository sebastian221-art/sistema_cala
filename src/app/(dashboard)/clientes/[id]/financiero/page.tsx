'use client'

// src/app/(dashboard)/clientes/[id]/financiero/page.tsx — v4.0
// FIX: selectores de período para trimestre/semestre/año (periodoValor correcto)
// FIX: reset de periodoValor al cambiar periodoTipo
// NEW: edición inline de período de estados ya subidos (PUT endpoint)

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ESFStatementView }    from '@/components/financial/ESFStatementView'
import { FinancialDashboard }  from '@/components/financial/FinancialDashboard'
import { FinancialComparison } from '@/components/financial/FinancialComparison'
import { FinancialEditor }     from '@/components/financial/FinancialEditor'
import { InsightsPanel }       from '@/components/ai/InsightsPanel'
import {
  ArrowLeft, FileSpreadsheet, Loader2, CheckCircle2,
  BarChart2, Table2, GitCompareArrows, Trash2, Pencil, X, Save, Edit3,
} from 'lucide-react'
import Link     from 'next/link'
import { cn }   from '@/lib/utils'
import { toast } from 'sonner'

interface PageProps { params: { id: string } }

const MESES = [
  '','Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

/** Valor predeterminado de periodoValor según el tipo seleccionado */
function defaultPeriodoValor(tipo: string): number {
  if (tipo === 'mes')      return new Date().getMonth() + 1
  if (tipo === 'trimestre') return Math.ceil((new Date().getMonth() + 1) / 3)
  if (tipo === 'semestre')  return new Date().getMonth() < 6 ? 1 : 2
  return 1 // 'año'
}

/** Etiqueta legible de un estado financiero */
function periodoLabelFromRecord(s: any): string {
  if (s.nombre_archivo) return s.nombre_archivo.replace(/\.(xlsx?|csv)$/i, '')
  if (s.periodo_tipo === 'mes') return `${MESES[s.periodo_valor] ?? s.periodo_valor} ${s.año}`
  if (s.periodo_tipo === 'trimestre') return `T${s.periodo_valor} ${s.año}`
  if (s.periodo_tipo === 'semestre')  return `S${s.periodo_valor} ${s.año}`
  return `Anual ${s.año}`
}

export default function FinancieroPage({ params }: PageProps) {
  const { id: clientId } = params
  const router      = useRouter()
  const queryClient = useQueryClient()

  const [uploading, setUploading] = useState(false)
  const [deleting,  setDeleting]  = useState<string | null>(null)
  const [view, setView] = useState<'tabla' | 'dashboard' | 'comparacion' | 'editor'>('tabla')
  const [formData, setFormData] = useState({
    periodoTipo:  'mes',
    periodoValor: new Date().getMonth() + 1,
    año:          new Date().getFullYear(),
  })

  // Estado del modal de edición
  const [editKey,  setEditKey]  = useState<string | null>(null)   // nombre_archivo o periodoValor/año
  const [editForm, setEditForm] = useState({ periodoTipo: 'mes', periodoValor: 1, año: new Date().getFullYear() })
  const [saving,   setSaving]   = useState(false)

  // ── Query central ─────────────────────────────────────────────────────
  const { data: statements = [], refetch, isLoading } = useQuery({
    queryKey: ['financial-statements-list', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/financial`)
      if (!res.ok) return []
      const { data } = await res.json()
      return data ?? []
    },
    staleTime: 0,
  })

  // ── Helpers de form ────────────────────────────────────────────────────
  const setPeriodoTipo = (tipo: string) =>
    setFormData(p => ({ ...p, periodoTipo: tipo, periodoValor: defaultPeriodoValor(tipo) }))

  const periodoLabel = () => {
    if (formData.periodoTipo === 'mes')       return `${MESES[formData.periodoValor] ?? formData.periodoValor} ${formData.año}`
    if (formData.periodoTipo === 'trimestre') return `T${formData.periodoValor} — ${formData.año}`
    if (formData.periodoTipo === 'semestre')  return `S${formData.periodoValor} — ${formData.año}`
    return `Anual — ${formData.año}`
  }

  // ── Subir archivo ─────────────────────────────────────────────────────
  const handleFileUpload = async (e: { target: HTMLInputElement }) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('periodo_tipo',  formData.periodoTipo)
      fd.append('periodo_valor', String(formData.periodoValor))
      fd.append('año',           String(formData.año))

      const res = await fetch(`/api/clients/${clientId}/financial`, { method: 'POST', body: fd })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'Error') }

      const { message, hojas, empresa, tipo_entidad } = await res.json()
      toast.success(message ?? 'Cargado')
      if (empresa)      toast.info(`Empresa: ${empresa}`)
      if (tipo_entidad) toast.info(`Tipo: ${tipo_entidad}`)
      if (hojas?.length) toast.success(`Hojas: ${hojas.join(', ')}`)

      queryClient.removeQueries({ queryKey: ['financial-statements-list', clientId] })
      queryClient.removeQueries({ queryKey: ['financial-statements', clientId] })
      await refetch()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setUploading(false); e.target.value = ''
    }
  }

  // ── Eliminar estado ───────────────────────────────────────────────────
  const handleEliminar = useCallback(async (
    nombreArchivo: string | null, periodoValor: number, año: number
  ) => {
    const label = nombreArchivo
      ? nombreArchivo.replace(/\.(xlsx?|csv)$/i, '')
      : `${MESES[periodoValor] ?? periodoValor} ${año}`

    if (!confirm(`¿Eliminar "${label}"?\nSe eliminarán todas sus hojas (ESF, ERI, NOTAS).`)) return

    const idsAEliminar = (statements as any[])
      .filter((s: any) => nombreArchivo
        ? s.nombre_archivo === nombreArchivo
        : s.periodo_valor === periodoValor && s.año === año
      ).map((s: any) => s.id)

    if (!idsAEliminar.length) return
    const key = nombreArchivo ?? `${periodoValor}/${año}`
    setDeleting(key)

    // Actualización optimista: eliminar inmediatamente del cache local
    const snapshotAnterior = queryClient.getQueryData(['financial-statements-list', clientId])
    queryClient.setQueryData(['financial-statements-list', clientId], (old: any[]) =>
      (old ?? []).filter((s: any) => !idsAEliminar.includes(s.id))
    )

    try {
      const resultados = await Promise.all(
        idsAEliminar.map(id =>
          fetch(`/api/clients/${clientId}/financial?statementId=${id}`, { method: 'DELETE' })
            .then(r => r.ok)
        )
      )
      const eliminados = resultados.filter(Boolean).length
      if (eliminados === 0) throw new Error('No se pudo eliminar el estado financiero')

      toast.success(`"${label}" eliminado (${eliminados} hojas)`)
      queryClient.removeQueries({ queryKey: ['financial-statements', clientId] })
      queryClient.removeQueries({ queryKey: ['ai-insights', clientId] })
      // No llamar invalidateQueries ni router.refresh() aquí para evitar la
      // condición de carrera en que Supabase aún no propagó los DELETEs y el
      // re-fetch trae de vuelta los registros eliminados.
      // La actualización optimista (setQueryData) ya mantiene el estado correcto.
    } catch {
      // Revertir actualización optimista si hubo error
      queryClient.setQueryData(['financial-statements-list', clientId], snapshotAnterior)
      toast.error('Error al eliminar. El estado financiero no fue eliminado.')
    } finally {
      setDeleting(null)
    }
  }, [statements, clientId, queryClient])

  // ── Abrir modal de edición ─────────────────────────────────────────────
  const handleOpenEdit = useCallback((s: any) => {
    const key = s.nombre_archivo ?? `${s.periodo_valor}/${s.año}`
    setEditKey(key)
    setEditForm({
      periodoTipo:  s.periodo_tipo  ?? 'mes',
      periodoValor: s.periodo_valor ?? 1,
      año:          s.año           ?? new Date().getFullYear(),
    })
  }, [])

  // ── Guardar edición ────────────────────────────────────────────────────
  const handleSaveEdit = useCallback(async () => {
    if (!editKey) return
    setSaving(true)
    try {
      // Obtener el nombre_archivo del grupo siendo editado
      const grupo = (statements as any[]).find((s: any) =>
        (s.nombre_archivo ?? `${s.periodo_valor}/${s.año}`) === editKey
      )
      const nombre_archivo = grupo?.nombre_archivo ?? null

      const body: Record<string, unknown> = {
        periodo_tipo:  editForm.periodoTipo,
        periodo_valor: editForm.periodoValor,
        año:           editForm.año,
      }
      if (nombre_archivo) body.nombre_archivo = nombre_archivo
      else {
        // Sin nombre de archivo → necesitamos los IDs del grupo
        const idsGrupo = (statements as any[])
          .filter((s: any) => s.nombre_archivo === null && s.periodo_valor === grupo?.periodo_valor && s.año === grupo?.año)
          .map((s: any) => s.id)
        body.statement_ids = idsGrupo
      }

      const res = await fetch(`/api/clients/${clientId}/financial`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'Error') }
      toast.success('Período actualizado correctamente')
      setEditKey(null)

      queryClient.removeQueries({ queryKey: ['financial-statements-list', clientId] })
      queryClient.removeQueries({ queryKey: ['financial-statements', clientId] })
      await refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }, [editKey, editForm, statements, clientId, queryClient, refetch])

  // ── Grupos de períodos únicos para la lista ────────────────────────────
  const periodosUnicos = Array.from(
    new Map((statements as any[]).map((s: any) => [
      s.nombre_archivo
        ? s.nombre_archivo
        : `${s.periodo_valor}/${s.año}`,
      s,
    ])).values()
  ) as any[]

  // Usar ERI para Insights (tiene ingresos/utilidades) o ESF como fallback
  const eriStmt = (statements as any[]).find((s: any) => s.hoja === 'ERI' || (!s.hoja && s.tipo === 'pyg'))
  const esfStmt = (statements as any[]).find((s: any) => s.hoja === 'ESF' || (!s.hoja && s.tipo === 'balance'))
  const insightId = eriStmt?.id ?? esfStmt?.id

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/clientes/${clientId}`}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Estados Financieros</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Excel del Motor Contable CALA · PN y PJ · ESF + ERI + NOTAS automático
          </p>
        </div>
      </div>

      {/* Sección de subida */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <p className="text-sm font-semibold text-foreground">Subir nuevo estado financiero</p>

        <div className="flex flex-wrap gap-3">
          {/* Tipo de período */}
          <select value={formData.periodoTipo}
            onChange={e => setPeriodoTipo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="mes">Mensual</option>
            <option value="trimestre">Trimestral</option>
            <option value="semestre">Semestral</option>
            <option value="año">Anual</option>
          </select>

          {/* Valor del período — selector según tipo */}
          {formData.periodoTipo === 'mes' && (
            <select value={formData.periodoValor}
              onChange={e => setFormData(p => ({ ...p, periodoValor: parseInt(e.target.value) }))}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          )}
          {formData.periodoTipo === 'trimestre' && (
            <select value={formData.periodoValor}
              onChange={e => setFormData(p => ({ ...p, periodoValor: parseInt(e.target.value) }))}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value={1}>T1 — Ene/Feb/Mar</option>
              <option value={2}>T2 — Abr/May/Jun</option>
              <option value={3}>T3 — Jul/Ago/Sep</option>
              <option value={4}>T4 — Oct/Nov/Dic</option>
            </select>
          )}
          {formData.periodoTipo === 'semestre' && (
            <select value={formData.periodoValor}
              onChange={e => setFormData(p => ({ ...p, periodoValor: parseInt(e.target.value) }))}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value={1}>S1 — Ene/Jun</option>
              <option value={2}>S2 — Jul/Dic</option>
            </select>
          )}
          {/* Para 'año' no se necesita selector de valor (periodoValor siempre 1) */}

          <select value={formData.año}
            onChange={e => setFormData(p => ({ ...p, año: parseInt(e.target.value) }))}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <label className={cn(
          'flex items-center gap-4 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all',
          uploading ? 'border-primary/50 bg-primary/5 cursor-not-allowed' : 'border-border hover:border-primary/50 hover:bg-muted/30'
        )}>
          {uploading ? (
            <><Loader2 className="w-6 h-6 text-primary animate-spin flex-shrink-0" /><span className="text-sm font-medium text-foreground">Procesando...</span></>
          ) : (
            <><FileSpreadsheet className="w-6 h-6 text-primary flex-shrink-0" /><div>
              <p className="text-sm font-medium text-foreground">Subir Excel — {periodoLabel()}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Formato Motor Contable · ESF + ERI + NOTAS · PN y PJ</p>
            </div></>
          )}
          <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={uploading} className="hidden" />
        </label>

        {/* Estados cargados */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />Cargando...
          </div>
        ) : periodosUnicos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Estados cargados ({periodosUnicos.length}):</p>
            <div className="flex flex-col gap-1.5">
              {periodosUnicos.map((s: any, i: number) => {
                const label = periodoLabelFromRecord(s)
                const key   = s.nombre_archivo ?? `${s.periodo_valor}/${s.año}`
                const isDeleting = deleting === key
                const isEditing  = editKey  === key
                const numHojas = (statements as any[]).filter((x: any) =>
                  s.nombre_archivo ? x.nombre_archivo === s.nombre_archivo : (x.periodo_valor === s.periodo_valor && x.año === s.año)
                ).length

                return (
                  <div key={i} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="text-xs font-medium text-foreground truncate">{label}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{numHojas} hojas</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Botón editar */}
                        <button onClick={() => isEditing ? setEditKey(null) : handleOpenEdit(s)}
                          disabled={!!deleting || saving}
                          title={isEditing ? 'Cancelar edición' : 'Editar período'}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40">
                          {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                        </button>
                        {/* Botón eliminar */}
                        <button onClick={() => handleEliminar(s.nombre_archivo, s.periodo_valor, s.año)}
                          disabled={!!deleting || saving} title="Eliminar"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Panel de edición inline */}
                    {isEditing && (
                      <div className="ml-4 p-3 bg-muted/40 border border-border rounded-lg space-y-2">
                        <p className="text-xs font-semibold text-foreground">Editar período de "{label}"</p>
                        <div className="flex flex-wrap gap-2">
                          {/* Tipo de período */}
                          <select value={editForm.periodoTipo}
                            onChange={e => setEditForm(p => ({
                              ...p,
                              periodoTipo: e.target.value,
                              periodoValor: defaultPeriodoValor(e.target.value),
                            }))}
                            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                            <option value="mes">Mensual</option>
                            <option value="trimestre">Trimestral</option>
                            <option value="semestre">Semestral</option>
                            <option value="año">Anual</option>
                          </select>

                          {/* Valor según tipo */}
                          {editForm.periodoTipo === 'mes' && (
                            <select value={editForm.periodoValor}
                              onChange={e => setEditForm(p => ({ ...p, periodoValor: parseInt(e.target.value) }))}
                              className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                              {MESES.slice(1).map((m, idx) => <option key={idx + 1} value={idx + 1}>{m}</option>)}
                            </select>
                          )}
                          {editForm.periodoTipo === 'trimestre' && (
                            <select value={editForm.periodoValor}
                              onChange={e => setEditForm(p => ({ ...p, periodoValor: parseInt(e.target.value) }))}
                              className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value={1}>T1 — Ene/Feb/Mar</option>
                              <option value={2}>T2 — Abr/May/Jun</option>
                              <option value={3}>T3 — Jul/Ago/Sep</option>
                              <option value={4}>T4 — Oct/Nov/Dic</option>
                            </select>
                          )}
                          {editForm.periodoTipo === 'semestre' && (
                            <select value={editForm.periodoValor}
                              onChange={e => setEditForm(p => ({ ...p, periodoValor: parseInt(e.target.value) }))}
                              className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                              <option value={1}>S1 — Ene/Jun</option>
                              <option value={2}>S2 — Jul/Dic</option>
                            </select>
                          )}

                          {/* Año */}
                          <select value={editForm.año}
                            onChange={e => setEditForm(p => ({ ...p, año: parseInt(e.target.value) }))}
                            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                            {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                          </select>

                          {/* Guardar */}
                          <button onClick={handleSaveEdit} disabled={saving}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary-light transition-colors disabled:opacity-50">
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            {saving ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button onClick={() => setEditKey(null)} disabled={saving}
                            className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted transition-colors disabled:opacity-50">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* Selector de vista */}
      {statements.length > 0 && (
        <div className="flex gap-1 bg-muted/30 p-1 rounded-xl w-fit">
          {[
            { id: 'tabla',       label: 'Tabla',       Icon: Table2 },
            { id: 'dashboard',   label: 'Dashboard',   Icon: BarChart2 },
            { id: 'comparacion', label: 'Comparación', Icon: GitCompareArrows },
            { id: 'editor',      label: 'Editar Valores', Icon: Edit3 },
          ].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setView(id as any)}
              className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors',
                view === id
                  ? id === 'editor'
                    ? 'bg-amber-100 text-amber-700 shadow-sm'
                    : 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground')}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      )}

      {/* Vistas */}
      {view === 'tabla' && (
        <section><ESFStatementView statements={statements as any[]} /></section>
      )}

      {view === 'dashboard' && (
        <>
          <section>
            <h2 className="font-semibold text-foreground mb-4">Dashboard Financiero</h2>
            <FinancialDashboard clientId={clientId} statements={statements as any[]} />
          </section>
          <InsightsPanel clientId={clientId} statementId={insightId} />
        </>
      )}

      {view === 'comparacion' && (
        <section><FinancialComparison statements={statements as any[]} /></section>
      )}

      {view === 'editor' && (
        <section className="bg-card border border-border rounded-xl p-5">
          <FinancialEditor
            clientId={clientId}
            statements={statements as any[]}
            onClose={() => setView('tabla')}
            onSaved={async () => {
              queryClient.removeQueries({ queryKey: ['financial-statements-list', clientId] })
              queryClient.removeQueries({ queryKey: ['financial-statements', clientId] })
              await refetch()
            }}
          />
        </section>
      )}
    </div>
  )
}
