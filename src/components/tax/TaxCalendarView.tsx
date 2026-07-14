'use client'

// Calendario tributario visual con eventos por mes
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar, Filter, Pencil, Check, X } from 'lucide-react'
import { cn, getTipoImpuestoLabel } from '@/lib/utils'
import { TaxCalendarEntry } from '@/types'
import { TaxTypeBadge } from './ObligationBadge'
import { toast } from 'sonner'

interface TaxCalendarViewProps {
  eventos: TaxCalendarEntry[]
  año: number
  isAdmin?: boolean
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const COLORES_IMPUESTO: Record<string, string> = {
  IVA: 'bg-blue-500',
  RETENCION: 'bg-purple-500',
  RENTA: 'bg-indigo-500',
  ICA: 'bg-teal-500',
  EXOGENA: 'bg-cyan-500',
  PATRIMONIO: 'bg-violet-500',
  GMF: 'bg-pink-500',
  OTROS: 'bg-gray-500',
}

function getColorImpuesto(tipo: string): string {
  const prefix = tipo.split('_')[0]
  return COLORES_IMPUESTO[prefix] ?? 'bg-gray-500'
}

export function TaxCalendarView({ eventos, año, isAdmin = false }: TaxCalendarViewProps) {
  const [mesActual, setMesActual] = useState(new Date().getMonth()) // 0-indexed
  const [filtroTipo, setFiltroTipo] = useState<string>('')
  const [vistaGrid, setVistaGrid] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFecha, setEditFecha] = useState('')
  const [localEventos, setLocalEventos] = useState<TaxCalendarEntry[]>(eventos)
  const [isSaving, setIsSaving] = useState(false)

  const startEdit = (evento: TaxCalendarEntry) => {
    setEditingId(evento.id)
    setEditFecha(evento.fecha_vencimiento)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditFecha('')
  }

  const saveEdit = async (evento: TaxCalendarEntry) => {
    if (!editFecha || editFecha === evento.fecha_vencimiento) { cancelEdit(); return }
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/calendar/${evento.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_vencimiento: editFecha }),
      })
      const { data, error } = await res.json()
      if (!res.ok) throw new Error(error ?? 'Error al guardar')
      setLocalEventos((prev) => prev.map((e) => e.id === evento.id ? { ...e, ...data } : e))
      toast.success('Fecha actualizada correctamente')
      cancelEdit()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  const eventosFiltrados = localEventos.filter((e) => {
    const mesEvento = new Date(e.fecha_vencimiento + 'T00:00:00').getMonth()
    const coincideMes = mesEvento === mesActual
    const coincideTipo = !filtroTipo || e.tipo_impuesto === filtroTipo
    return coincideMes && coincideTipo
  })

  // Agrupar por semana del mes
  const eventosPorSemana = eventosFiltrados.reduce<Record<number, TaxCalendarEntry[]>>(
    (acc, evento) => {
      const dia = new Date(evento.fecha_vencimiento + 'T12:00:00Z').getDate()
      const semana = Math.ceil(dia / 7)
      if (!acc[semana]) acc[semana] = []
      acc[semana].push(evento)
      return acc
    },
    {}
  )

  // Calcular días del mes para la vista de cuadrícula
  const diasEnMes = new Date(año, mesActual + 1, 0).getDate()
  const primerDiaSemana = new Date(año, mesActual, 1).getDay()
  const dias = Array.from({ length: diasEnMes }, (_, i) => i + 1)

  const getEventosDelDia = (dia: number) =>
    eventosFiltrados.filter(
      (e) => new Date(e.fecha_vencimiento + 'T12:00:00Z').getDate() === dia
    )

  const hoy = new Date()
  const esHoy = (dia: number) =>
    hoy.getFullYear() === año &&
    hoy.getMonth() === mesActual &&
    hoy.getDate() === dia

  const esPasado = (dia: number) => {
    const fecha = new Date(año, mesActual, dia)
    return fecha < hoy && !esHoy(dia)
  }

  // Tipos únicos de impuesto para el filtro
  const tiposDisponibles = Array.from(new Set(localEventos.map((e) => e.tipo_impuesto)))

  return (
    <div className="space-y-5">
      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Navegación de mes */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMesActual((m) => (m === 0 ? 11 : m - 1))}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>

          <h2 className="text-lg font-display font-semibold text-foreground min-w-[180px] text-center">
            {MESES[mesActual]} {año}
          </h2>

          <button
            onClick={() => setMesActual((m) => (m === 11 ? 0 : m + 1))}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Filtros y vista */}
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="text-sm rounded-xl border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filtrar por tipo de impuesto"
          >
            <option value="">Todos los impuestos</option>
            {tiposDisponibles.map((tipo) => (
              <option key={tipo} value={tipo}>
                {getTipoImpuestoLabel(tipo)}
              </option>
            ))}
          </select>

          <div className="flex rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setVistaGrid(true)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                vistaGrid ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
              aria-label="Vista cuadrícula"
            >
              Cuadrícula
            </button>
            <button
              onClick={() => setVistaGrid(false)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                !vistaGrid ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
              aria-label="Vista lista"
            >
              Lista
            </button>
          </div>
        </div>
      </div>

      {/* Resumen del mes */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">
            {eventosFiltrados.length} vencimiento(s) en {MESES[mesActual]}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(
            eventosFiltrados.reduce<Record<string, number>>((acc, e) => {
              const tipo = e.tipo_impuesto.split('_')[0]
              acc[tipo] = (acc[tipo] ?? 0) + 1
              return acc
            }, {})
          ).map(([tipo, count]) => (
            <span
              key={tipo}
              className="text-xs px-2.5 py-1 rounded-full bg-card border border-border text-foreground"
            >
              {tipo}: {count}
            </span>
          ))}
        </div>
      </div>

      {vistaGrid ? (
        /* Vista de cuadrícula del calendario */
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Encabezados de días */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/50">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((dia) => (
              <div
                key={dia}
                className="p-3 text-center text-xs font-semibold text-muted-foreground uppercase"
              >
                {dia}
              </div>
            ))}
          </div>

          {/* Días del mes */}
          <div className="grid grid-cols-7">
            {/* Espacios vacíos al inicio */}
            {Array.from({ length: primerDiaSemana }).map((_, i) => (
              <div key={`empty-${i}`} className="p-2 min-h-[80px] border-b border-r border-border" />
            ))}

            {dias.map((dia) => {
              const eventosDelDia = getEventosDelDia(dia)
              const hoyFlag = esHoy(dia)
              const pasadoFlag = esPasado(dia)

              return (
                <div
                  key={dia}
                  className={cn(
                    'p-2 min-h-[80px] border-b border-r border-border',
                    hoyFlag && 'bg-primary/5',
                    pasadoFlag && 'opacity-50'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex w-7 h-7 items-center justify-center rounded-full text-sm font-medium mb-1',
                      hoyFlag && 'bg-primary text-primary-foreground'
                    )}
                  >
                    {dia}
                  </span>
                  <div className="space-y-1">
                    {eventosDelDia.slice(0, 2).map((evento, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded-md text-white truncate',
                          getColorImpuesto(evento.tipo_impuesto)
                        )}
                        title={[
                          getTipoImpuestoLabel(evento.tipo_impuesto),
                          evento.digitos_nit ? `NIT termina en ${evento.digitos_nit}` : '',
                          evento.clientes_aplicables?.join(', ') ?? '',
                        ].filter(Boolean).join(' · ')}
                      >
                        {evento.tipo_impuesto.split('_')[0]}
                      </div>
                    ))}
                    {eventosDelDia.length > 2 && (
                      <div className="text-xs text-muted-foreground px-1">
                        +{eventosDelDia.length - 2}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Vista de lista */
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {Object.keys(eventosPorSemana).length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" aria-hidden="true" />
              <p className="text-muted-foreground text-sm">
                No hay vencimientos en este mes{filtroTipo ? ' con el filtro seleccionado' : ''}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {Object.entries(eventosPorSemana)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([semana, eventos]) => (
                  <div key={semana}>
                    <div className="px-5 py-2.5 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Semana {semana}
                    </div>
                    {eventos.map((evento) => {
                      const isEditing = editingId === evento.id
                      const fechaDate = new Date(evento.fecha_vencimiento + 'T00:00:00')
                      return (
                        <div
                          key={evento.id}
                          className="group flex items-start gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors"
                        >
                          {/* Fecha */}
                          <div className="flex-shrink-0 w-16 text-center">
                            {isEditing ? (
                              <input
                                type="date"
                                value={editFecha}
                                onChange={(e) => setEditFecha(e.target.value)}
                                className="w-full text-xs px-1 py-1 rounded border border-primary bg-background text-foreground focus:outline-none"
                                autoFocus
                              />
                            ) : (
                              <>
                                <p className="text-2xl font-bold font-mono text-foreground">
                                  {fechaDate.getDate()}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {MESES[fechaDate.getMonth()].slice(0, 3)}
                                </p>
                              </>
                            )}
                          </div>

                          {/* Separador */}
                          <div
                            className={cn(
                              'w-1.5 self-stretch rounded-full flex-shrink-0 mt-1',
                              getColorImpuesto(evento.tipo_impuesto)
                            )}
                            aria-hidden="true"
                          />

                          {/* Contenido */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 flex-wrap">
                              <TaxTypeBadge tipoImpuesto={evento.tipo_impuesto} />
                              {evento.digitos_nit && (
                                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                                  NIT termina en {evento.digitos_nit}
                                </span>
                              )}
                            </div>
                            {evento.descripcion && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {evento.descripcion}
                              </p>
                            )}
                            {evento.clientes_aplicables && evento.clientes_aplicables.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {evento.clientes_aplicables.map((nombre: string, ci: number) => (
                                  <span
                                    key={ci}
                                    className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20"
                                  >
                                    {nombre}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Botones de edición (solo admin) */}
                          {isAdmin && (
                            <div className="flex-shrink-0 flex items-center gap-1">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => saveEdit(evento)}
                                    disabled={isSaving}
                                    className="p-1.5 rounded-lg text-success hover:bg-success/10 transition-colors"
                                    title="Guardar"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                                    title="Cancelar"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => startEdit(evento)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                                  title="Editar fecha"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Leyenda de colores */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Leyenda</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries({
            IVA: 'bg-blue-500',
            RETENCION: 'bg-purple-500',
            RENTA: 'bg-indigo-500',
            ICA: 'bg-teal-500',
            EXOGENA: 'bg-cyan-500',
            PATRIMONIO: 'bg-violet-500',
            GMF: 'bg-pink-500',
          }).map(([tipo, color]) => (
            <div key={tipo} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${color}`} aria-hidden="true" />
              <span className="text-xs text-muted-foreground">{tipo}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
