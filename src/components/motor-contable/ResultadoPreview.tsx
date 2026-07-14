'use client'
// src/components/motor-contable/ResultadoPreview.tsx v1.0
// Muestra el resultado del motor nuevo (ResultadoAPI) y permite descargar el Excel
// Reemplaza completamente a EstadosPreview.tsx

import { useState } from 'react'
import {
  Download, CheckCircle2, AlertTriangle,
  Building2, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { ResultadoAPI } from '@/app/(dashboard)/motor-contable/page'

interface Props {
  resultado: ResultadoAPI
}

function fmt(n: number): string {
  if (!n || Math.round(n) === 0) return '—'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n))
}

function fmtCOP(n: number): string {
  if (!n || Math.round(n) === 0) return '$0'
  return `$${fmt(n)}`
}

// ── Fila de dato individual ───────────────────────────────────────────────
function FilaDato({ label, valor, esTotal, indent = 0, esNegativo = false }: {
  label: string
  valor: number
  esTotal?: boolean
  indent?: number
  esNegativo?: boolean
}) {
  if (!esTotal && Math.round(valor) === 0) return null
  return (
    <div className={cn(
      'flex justify-between items-center py-1.5 border-b border-border/30',
      esTotal && 'border-t-2 border-primary/30 bg-primary/5 rounded px-2 mt-1'
    )} style={{ paddingLeft: `${indent * 16 + (esTotal ? 8 : 4)}px` }}>
      <span className={cn(
        'text-sm',
        esTotal ? 'font-bold text-primary uppercase text-xs tracking-wide' : 'text-foreground'
      )}>
        {label}
      </span>
      <span className={cn(
        'font-mono text-sm tabular-nums',
        esTotal ? 'font-bold text-primary' : esNegativo ? 'text-red-500' : 'text-foreground'
      )}>
        {fmtCOP(valor)}
      </span>
    </div>
  )
}

// ── Tarjeta de período ────────────────────────────────────────────────────
function TarjetaPeriodo({ p }: { p: ResultadoAPI['periodos'][0] }) {
  return (
    <div className={cn(
      'p-3 rounded-xl border text-sm',
      p.cuadra
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : 'bg-amber-500/5 border-amber-500/20'
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-foreground">{p.label} {p.anio}</span>
        <span className={cn(
          'text-xs px-2 py-0.5 rounded-full font-medium',
          p.cuadra
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-amber-500/10 text-amber-600'
        )}>
          {p.cuadra ? '✓ Cuadra' : '⚠ Revisar'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Activo</p>
          <p className="font-mono font-medium">{fmtCOP(p.totalActivo)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Pasivo</p>
          <p className="font-mono font-medium">{fmtCOP(p.totalPasivo)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Patrimonio</p>
          <p className="font-mono font-medium">{fmtCOP(p.totalPatrimonio)}</p>
        </div>
      </div>
      {p.advertencias.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {p.advertencias.map((a, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400">{a}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────
export function ResultadoPreview({ resultado }: Props) {
  const [descargado,  setDescargado]  = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [tabActiva,   setTabActiva]   = useState<'resumen' | 'activo' | 'pasivo' | 'eri' | 'periodos'>('resumen')

  const { empresa, nit, periodos, resumen, advertencias, excel_base64 } = resultado

  const warns = advertencias.filter(a => a.startsWith('⚠'))

  // ── Descargar Excel ────────────────────────────────────────────────────
  const handleDescargar = async () => {
    if (!excel_base64) {
      toast.error('No hay Excel generado')
      return
    }
    setDescargando(true)
    try {
      const bytes = Uint8Array.from(atob(excel_base64), c => c.charCodeAt(0))
      const blob  = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href    = url
      const periodo = periodos[periodos.length - 1]
      a.download = `ESF_${empresa.replace(/[^a-zA-Z0-9]/g, '_')}_${periodo?.label ?? ''}_${periodo?.anio ?? ''}_Tanda1.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setDescargado(true)
      toast.success('Excel descargado correctamente')
    } catch (err) {
      toast.error('Error al descargar el Excel')
      console.error('[ResultadoPreview]', err)
    } finally {
      setDescargando(false)
    }
  }

  // ── Indicador de tendencia ─────────────────────────────────────────────
  const Tendencia = ({ valor }: { valor: number }) => {
    if (valor > 0) return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
    if (valor < 0) return <TrendingDown className="w-3.5 h-3.5 text-red-500" />
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />
  }

  // ── Tabs ───────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'resumen',  label: '📊 Resumen'   },
    { id: 'activo',   label: '🏦 Activo'    },
    { id: 'pasivo',   label: '📋 Pasivo'    },
    { id: 'eri',      label: '📈 ERI'       },
    { id: 'periodos', label: `🗓 Períodos (${periodos.length})` },
  ] as const

  return (
    <div className="space-y-4">

      {/* Header empresa */}
      <div className="flex items-start justify-between gap-4 p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground">{empresa}</p>
            <p className="text-xs text-muted-foreground">NIT {nit}</p>
            <p className="text-xs text-primary font-medium mt-0.5">
              {periodos.length} período{periodos.length !== 1 ? 's' : ''} procesado{periodos.length !== 1 ? 's' : ''} ·{' '}
              {resumen?.cuadra ? '✓ Balance cuadra' : '⚠ Revisar descuadre'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDescargar}
            disabled={descargando || !excel_base64}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors',
              descargado
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-primary text-primary-foreground hover:bg-primary-light',
              'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
          >
            {descargando ? (
              <><span className="animate-spin">⏳</span> Generando...</>
            ) : descargado ? (
              <><CheckCircle2 className="w-4 h-4" /> Descargar de nuevo</>
            ) : (
              <><Download className="w-4 h-4" /> Descargar Tanda 1 (5 hojas)</>
            )}
          </button>
        </div>
      </div>

      {/* Banner post-descarga */}
      {descargado && (
        <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Tanda 1 descargada: CAJA · BANCOS · CXC · INVENTARIO · OTRAS CXC
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Valida que las 5 hojas estén correctas. Si todo está bien, continuamos con Tanda 2.
            </p>
          </div>
        </div>
      )}

      {/* Advertencias */}
      {warns.length > 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1">
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-bold mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Notas del motor
          </div>
          {warns.map((a, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{a}</p>
          ))}
        </div>
      )}

      {/* Tabs de navegación */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTabActiva(tab.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              tabActiva === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido de cada tab */}
      <div className="border border-border rounded-xl overflow-hidden">

        {/* ── RESUMEN ──────────────────────────────────────────────────── */}
        {tabActiva === 'resumen' && resumen && (
          <div className="p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
              Período: {resumen.periodo} · Corte: {resumen.fechaCorte}
            </p>

            {/* Cards de totales */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Activo Total',    valor: resumen.totalActivo,    color: 'blue'  },
                { label: 'Pasivo Total',    valor: resumen.totalPasivo,    color: 'red'   },
                { label: 'Patrimonio',      valor: resumen.totalPatrimonio, color: 'green' },
              ].map(({ label, valor, color }) => (
                <div key={label} className={cn(
                  'p-3 rounded-xl border',
                  color === 'blue'  && 'bg-blue-500/5 border-blue-500/20',
                  color === 'red'   && 'bg-red-500/5 border-red-500/20',
                  color === 'green' && 'bg-emerald-500/5 border-emerald-500/20',
                )}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={cn(
                    'font-mono font-bold text-sm mt-0.5',
                    color === 'blue'  && 'text-blue-600 dark:text-blue-400',
                    color === 'red'   && 'text-red-600 dark:text-red-400',
                    color === 'green' && 'text-emerald-600 dark:text-emerald-400',
                  )}>
                    {fmtCOP(valor)}
                  </p>
                </div>
              ))}
            </div>

            {/* Desglose rápido */}
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Activo</p>
                <div className="space-y-0.5">
                  {[
                    { l: 'Caja',        v: resumen.caja      },
                    { l: 'Bancos',      v: resumen.bancos     },
                    { l: 'CxC',         v: resumen.cxc        },
                    { l: 'Inventario',  v: resumen.inventario },
                    { l: 'PPyE neto',   v: resumen.ppye       },
                  ].filter(x => Math.round(x.v) !== 0).map(({ l, v }) => (
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{l}</span>
                      <span className="font-mono">{fmtCOP(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Pasivo</p>
                <div className="space-y-0.5">
                  {[
                    { l: 'Proveedores',      v: resumen.proveedores      },
                    { l: 'Oblig. financ.',   v: resumen.obligFinancieras },
                    { l: 'Pasivo corriente', v: resumen.pasivoCorriente  },
                    { l: 'Pasivo LP',        v: resumen.pasivoNoCorriente},
                  ].filter(x => Math.round(x.v) !== 0).map(({ l, v }) => (
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{l}</span>
                      <span className="font-mono">{fmtCOP(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Estado de cuadre */}
            <div className={cn(
              'flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium mt-2',
              resumen.cuadra
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            )}>
              {resumen.cuadra
                ? <><CheckCircle2 className="w-4 h-4" /> Activo = Pasivo + Patrimonio ✓</>
                : <><AlertTriangle className="w-4 h-4" /> Descuadre: {fmtCOP(resumen.diferencia)} — revisar clasificación</>
              }
            </div>
          </div>
        )}

        {/* ── ACTIVO ───────────────────────────────────────────────────── */}
        {tabActiva === 'activo' && resumen && (
          <div className="p-4 space-y-1">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
              Activo — {resumen.periodo}
            </p>
            <FilaDato label="Activo Corriente" valor={0} esTotal indent={0} />
            <FilaDato label="Caja" valor={resumen.caja} indent={1} />
            <FilaDato label="Bancos" valor={resumen.bancos} indent={1} />
            <FilaDato label="Cuentas por cobrar (CxC)" valor={resumen.cxc} indent={1} />
            <FilaDato label="Inventarios" valor={resumen.inventario} indent={1} />
            <FilaDato label="TOTAL ACTIVO CORRIENTE" valor={resumen.activoCorriente} esTotal />
            <div className="py-1" />
            <FilaDato label="Activo No Corriente" valor={0} esTotal indent={0} />
            <FilaDato label="Propiedad, planta y equipo (neto)" valor={resumen.ppye} indent={1} />
            <FilaDato label="TOTAL ACTIVO NO CORRIENTE" valor={resumen.activoNoCorriente} esTotal />
            <FilaDato label="TOTAL ACTIVOS" valor={resumen.totalActivo} esTotal />
          </div>
        )}

        {/* ── PASIVO ───────────────────────────────────────────────────── */}
        {tabActiva === 'pasivo' && resumen && (
          <div className="p-4 space-y-1">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
              Pasivo y Patrimonio — {resumen.periodo}
            </p>
            <FilaDato label="Pasivo Corriente" valor={0} esTotal indent={0} />
            <FilaDato label="Proveedores" valor={resumen.proveedores} indent={1} />
            <FilaDato label="Obligaciones financieras LP" valor={resumen.obligFinancieras} indent={1} />
            <FilaDato label="TOTAL PASIVO CORRIENTE" valor={resumen.pasivoCorriente} esTotal />
            <div className="py-1" />
            <FilaDato label="Pasivo No Corriente" valor={0} esTotal indent={0} />
            <FilaDato label="Obligaciones financieras LP" valor={resumen.pasivoNoCorriente} indent={1} />
            <FilaDato label="TOTAL PASIVO NO CORRIENTE" valor={resumen.pasivoNoCorriente} esTotal />
            <FilaDato label="TOTAL PASIVOS" valor={resumen.totalPasivo} esTotal />
            <div className="py-2" />
            <FilaDato label="Patrimonio" valor={0} esTotal indent={0} />
            <FilaDato label="Capital social" valor={resumen.capitalSocial} indent={1} />
            <FilaDato label="Resultado del ejercicio" valor={resumen.resultadoEjercicio} indent={1} />
            <FilaDato label="TOTAL PATRIMONIO" valor={resumen.totalPatrimonio} esTotal />
          </div>
        )}

        {/* ── ERI ──────────────────────────────────────────────────────── */}
        {tabActiva === 'eri' && resumen && (
          <div className="p-4 space-y-1">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
              Estado de Resultados — {resumen.periodo} (mes)
            </p>
            <FilaDato label="Ingresos" valor={resumen.eriMes.ingresos} indent={1} />
            <FilaDato label="(-) Costos" valor={resumen.eriMes.costos} indent={1} />
            <FilaDato
              label="UTILIDAD BRUTA"
              valor={resumen.eriMes.ingresos - resumen.eriMes.costos}
              esTotal
            />
            <div className="py-1" />
            <FilaDato label="(-) Gastos operacionales" valor={resumen.eriMes.gastos} indent={1} />
            <FilaDato
              label="RESULTADO NETO"
              valor={resumen.eriMes.resultado}
              esTotal
              esNegativo={resumen.eriMes.resultado < 0}
            />
            <div className="pt-3">
              <div className={cn(
                'flex items-center gap-2 p-2.5 rounded-lg text-xs',
                resumen.eriMes.resultado >= 0
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-500/10 text-red-700 dark:text-red-400'
              )}>
                <Tendencia valor={resumen.eriMes.resultado} />
                {resumen.eriMes.resultado >= 0
                  ? `Ganancia del período: ${fmtCOP(resumen.eriMes.resultado)}`
                  : `Pérdida del período: ${fmtCOP(Math.abs(resumen.eriMes.resultado))}`
                }
              </div>
            </div>
          </div>
        )}

        {/* ── PERÍODOS ─────────────────────────────────────────────────── */}
        {tabActiva === 'periodos' && (
          <div className="p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
              Períodos procesados — ordenados cronológicamente
            </p>
            {periodos.map(p => (
              <TarjetaPeriodo key={`${p.anio}-${p.mes}`} p={p} />
            ))}
          </div>
        )}
      </div>

      {/* Instrucción próximo paso */}
      <div className="p-3 bg-muted/30 border border-border/60 rounded-xl">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Próximo paso:</strong> Descarga el Excel, abre las 5 hojas
          (CAJA, BANCOS, CXC, INVENTARIO, OTRAS CXC) y verifica que los números coincidan con el balance original.
          Si todo está correcto, dinos y generamos la <strong>Tanda 2</strong>.
        </p>
      </div>
    </div>
  )
}