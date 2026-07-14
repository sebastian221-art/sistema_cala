'use client'
// src/components/motor-contable/AjustesPanel.tsx v4.0
// Renderiza cada AjusteDetectado según su tipo: numero | select | numero_entero
// ciudad_camara → select de ciudades con preview de cálculo en vivo
// inventario / efectivo / reserva_legal → input numérico
// num_establecimientos → input entero con preview automático

import { useState } from 'react'
import { AlertTriangle, Package, Banknote, Scale, Building2, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EstadosFinancieros, AjustesContador, AjusteDetectado } from '@/lib/motor-contable/types'
import { CIUDADES_CAMARA, calcularCamara } from '@/lib/motor-contable/tarifas-camara'

// ── Íconos por id de ajuste ───────────────────────────────────────────────
const ICONOS: Record<string, React.ElementType> = {
  inventario_ajustado:    Package,
  efectivo_ajustado:      Banknote,
  reserva_legal_ajustada: Scale,
  costo_ventas_ajustado:  Hash,
  ciudad_camara:          Building2,
  num_establecimientos:   Hash,
}

interface Props {
  ef:                EstadosFinancieros
  ajustesDetectados: AjusteDetectado[]
  onConfirmar:       (ajustes: AjustesContador) => void
  onSaltar:          () => void
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.abs(n))
}

export function AjustesPanel({ ef, ajustesDetectados, onConfirmar, onSaltar }: Props) {
  const [valores,  setValores]  = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(false)

  const isPJ = String(ef.tipo_entidad ?? (ef as Record<string,unknown>).tipoEntidad ?? '').toUpperCase() === 'PJ'

  // Valores derivados para el preview
  const ciudadSeleccionada   = valores['ciudad_camara']   || 'bucaramanga'
  const numEstablecimientos  = parseInt(valores['num_establecimientos'] || '1') || 1
  const camara = isPJ ? calcularCamara(ef.total_activo ?? 0, ciudadSeleccionada, numEstablecimientos) : null

  const tieneAjusteCiudad    = ajustesDetectados.some(a => a.id === 'ciudad_camara')
  const tieneAjusteNumEst    = ajustesDetectados.some(a => a.id === 'num_establecimientos')

  const parseValor = (id: string): number | null => {
    const raw = (valores[id] ?? '').replace(/\./g, '').replace(',', '.').trim()
    if (!raw) return null
    const n = parseFloat(raw)
    return isNaN(n) ? null : n
  }

  const handleConfirmar = async () => {
    setLoading(true)
    const ajustes: AjustesContador = {
      inventario_ajustado:    parseValor('inventario_ajustado'),
      efectivo_ajustado:      parseValor('efectivo_ajustado'),
      reserva_legal_ajustada: parseValor('reserva_legal_ajustada'),
      costo_ventas_ajustado:  parseValor('costo_ventas_ajustado'),
      ciudad_camara:          isPJ ? (valores['ciudad_camara'] || 'bucaramanga') : null,
      num_establecimientos:   isPJ ? numEstablecimientos : null,
    }
    await onConfirmar(ajustes)
    setLoading(false)
  }

  // Ajustes que se muestran como campos de entrada (excluir ciudad y num_est que tienen UI especial)
  const ajustesInputs = ajustesDetectados.filter(a =>
    a.id !== 'ciudad_camara' && a.id !== 'num_establecimientos'
  )

  const ingresosOp   = (ef.ingresos_op)   ?? (ef.ingresos_brutos - ef.devoluciones)
  const utilidadNeta = (ef.utilidad_neta) ?? 0

  return (
    <div className="space-y-6">

      {/* Banner resumen ERI */}
      <div className="p-4 bg-card border border-border rounded-xl">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
          ESTADO DE RESULTADOS — CALCULADO DEL BALANCE
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Ingresos operacionales', valor: ingresosOp },
            { label: 'Costo de ventas',         valor: ef.costo_ventas },
            { label: 'Utilidad operacional',    valor: ef.utilidad_operacional ?? 0 },
            { label: 'Resultado neto',          valor: utilidadNeta },
          ].map(({ label, valor }) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-bold text-primary">${fmt(valor)}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          ℹ️ Los ajustes de inventario/efectivo solo afectan el balance (ESF). El ERI se recalcula automáticamente.
        </p>
      </div>

      {/* Ajustes numéricos detectados */}
      {ajustesInputs.map(aj => {
        const Icono = ICONOS[aj.id] ?? AlertTriangle
        const val   = valores[aj.id] ?? ''
        return (
          <div key={aj.id} className="p-4 bg-card border border-border rounded-xl space-y-3">
            <div className="flex items-start gap-3">
              <div className={cn('p-2 rounded-lg flex-shrink-0',
                aj.obligatorio ? 'bg-amber-500/10' : 'bg-blue-500/10')}>
                <Icono className={cn('w-4 h-4', aj.obligatorio ? 'text-amber-600' : 'text-blue-500')} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground text-sm">{aj.label}</p>
                  {aj.obligatorio && (
                    <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-600 rounded-full">
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{aj.descripcion}</p>
                {aj.valorBalance > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Valor en el balance: <strong className="text-foreground">${fmt(aj.valorBalance)}</strong>
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{aj.label}</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder={aj.valorBalance > 0 ? `Ej: ${fmt(aj.valorBalance)}` : 'Ingresa el valor'}
                value={val}
                onChange={e => setValores(prev => ({ ...prev, [aj.id]: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono
                           focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        )
      })}

      {/* Sección Cámara de Comercio — solo para PJ */}
      {isPJ && (tieneAjusteCiudad || tieneAjusteNumEst) && (
        <div className="p-4 bg-card border border-primary/30 rounded-xl space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground text-sm">Cámara de Comercio</p>
                <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">Obligatorio</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Selecciona la ciudad para calcular el valor de renovación de matrícula mercantil 2025.
                Se genera automáticamente en las hojas CAMARA CCIO y SIMULADOR del Excel.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Selector ciudad */}
            {tieneAjusteCiudad && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Ciudad / Cámara de Comercio *
                </label>
                <select
                  value={ciudadSeleccionada}
                  onChange={e => setValores(prev => ({ ...prev, ciudad_camara: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {CIUDADES_CAMARA.map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Número de establecimientos */}
            {tieneAjusteNumEst && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  N° de establecimientos
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={valores['num_establecimientos'] ?? '1'}
                  onChange={e => setValores(prev => ({ ...prev, num_establecimientos: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            )}
          </div>

          {/* Preview del cálculo en vivo */}
          {camara && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
              <p className="text-xs font-bold text-primary uppercase tracking-wide">
                Cálculo estimado 2025 — {camara.ciudad}
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {[
                  { label: 'Activos totales',        valor: `$${fmt(camara.activosTotales)}` },
                  { label: 'Renovación matrícula',   valor: `$${fmt(camara.renovacionMatricula)}` },
                  { label: 'Derecho establecimiento',valor: `$${fmt(camara.derechoEstablecimiento)}` },
                  { label: 'Afiliación',             valor: `$${fmt(camara.afiliacion)}` },
                  { label: 'TOTAL A PAGAR',          valor: `$${fmt(camara.totalPesos)}` },
                  { label: 'En miles',               valor: `${fmt(camara.totalMiles)} miles` },
                ].map(({ label, valor }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-xs text-muted-foreground">{label}:</span>
                    <span className="text-xs font-mono font-medium text-foreground">{valor}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{camara.tramo}</p>
            </div>
          )}
        </div>
      )}

      {/* Botones */}
      <div className="flex gap-3">
        <button
          onClick={onSaltar}
          disabled={loading}
          className="flex-1 px-4 py-3 border border-border rounded-xl text-sm
                     text-muted-foreground hover:text-foreground hover:bg-muted/40
                     transition-colors disabled:opacity-60"
        >
          Usar valores del balance sin ajustar
        </button>
        <button
          onClick={handleConfirmar}
          disabled={loading}
          className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-xl
                     text-sm font-semibold hover:bg-primary-light transition-colors
                     disabled:opacity-60"
        >
          {loading ? '⏳ Procesando...' : 'Aplicar ajustes y generar Excel'}
        </button>
      </div>
    </div>
  )
}