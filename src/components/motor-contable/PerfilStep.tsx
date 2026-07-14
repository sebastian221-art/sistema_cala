'use client'
// src/components/motor-contable/PerfilStep.tsx
// ════════════════════════════════════════════════════════════════════════
// PASO 2 del flujo. Tres situaciones:
//   A) Cliente conocido → muestra su perfil guardado, botón continuar.
//   B) Cliente nuevo similar a uno existente → sugiere usar ese perfil.
//   C) Cliente nuevo sin similar → chat de instrucciones → IA genera perfil.
// ════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import {
  Sparkles, Loader2, CheckCircle2, FileText, Lightbulb,
  ArrowRight, Building2, Wand2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { EstructuraCliente } from '@/lib/motor-contable/extraerEstructura'
import type { PerfilCliente, ResultadoSimilitud } from '@/lib/perfiles/calcularSimilitud'

interface Props {
  empresa:        string
  nit:            string
  estructura:     EstructuraCliente
  // Si viene de cliente existente, su perfil ya guardado
  perfilExistente?: PerfilCliente | null
  // Cuando el perfil queda listo, se pasa al paso de preview
  onPerfilListo: (perfil: PerfilCliente, instrucciones: string) => void
}

// Resumen legible de un perfil para mostrarlo al contador
function ResumenPerfil({ perfil }: { perfil: PerfilCliente }) {
  const items: string[] = []
  if (perfil.ingresos.mostrarAuxiliares) {
    items.push(`Ingresos: discrimina sub-categorías en ${perfil.ingresos.subcuentasConAuxiliar.join(', ') || 'las subcuentas con auxiliares'}`)
  } else {
    items.push('Ingresos: muestra terceros directamente (sin sub-categorías)')
  }
  items.push(`Costos: grupos ${perfil.costos.prefijos.join(', ')}${perfil.costos.agruparPorSubcuenta ? ' agrupados por subcuenta' : ''}`)
  items.push(`Gastos: grupos ${perfil.gastos.prefijos.join(', ')}`)
  if (perfil.terceros.excluirDebitoSinCredito) items.push('Excluye movimientos con débito sin crédito')
  if (perfil.terceros.nitExtranjerosPatron) items.push(`NITs que empiezan en ${perfil.terceros.nitExtranjerosPatron} = extranjeros`)

  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
          {t}
        </li>
      ))}
      {perfil.notasEspeciales && (
        <li className="flex items-start gap-2 text-sm text-muted-foreground italic mt-2 pt-2 border-t border-border/50">
          <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {perfil.notasEspeciales}
        </li>
      )}
    </ul>
  )
}

export function PerfilStep({ empresa, nit, estructura, perfilExistente, onPerfilListo }: Props) {
  // Estados del flujo
  const [instrucciones, setInstrucciones] = useState('')
  const [perfil,        setPerfil]        = useState<PerfilCliente | null>(perfilExistente ?? null)
  const [similares,     setSimilares]     = useState<ResultadoSimilitud[]>([])
  const [generando,     setGenerando]     = useState(false)
  const [casos,         setCasos]         = useState<any[]>([])

  const esConocido = !!perfilExistente

  // Al montar (si es cliente nuevo), buscar casos similares
  useEffect(() => {
    if (esConocido) return
    fetch(`/api/perfiles?nit=${encodeURIComponent(nit)}`)
      .then(r => r.json())
      .then(data => {
        if (data.casos) setCasos(data.casos)
      })
      .catch(() => {})
  }, [nit, esConocido])

  // ── Generar perfil con IA ──────────────────────────────────────────────
  const handleGenerar = async () => {
    setGenerando(true)
    try {
      const res = await fetch('/api/perfiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'generar',
          estructura,
          instrucciones,
          casos,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Error generando el perfil')
        return
      }
      setPerfil(data.perfil)
      setSimilares(data.similares ?? [])
      toast.success('Perfil generado. Revísalo antes de continuar.')
    } catch {
      toast.error('Error de conexión al generar el perfil')
    } finally {
      setGenerando(false)
    }
  }

  // ── Usar un caso similar directamente ──────────────────────────────────
  const handleUsarSimilar = (s: ResultadoSimilitud) => {
    setPerfil(s.caso.perfil_json)
    toast.success(`Perfil de "${s.caso.nombre}" aplicado. Revísalo.`)
  }

  // ── SITUACIÓN A: cliente conocido ──────────────────────────────────────
  if (esConocido && perfil) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-foreground">{empresa}</p>
            <p className="text-sm text-muted-foreground">
              Cliente conocido — usando el perfil guardado
            </p>
          </div>
        </div>

        <div className="p-4 bg-muted/30 border border-border rounded-xl">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Reglas guardadas
          </p>
          <ResumenPerfil perfil={perfil} />
        </div>

        <button
          onClick={() => onPerfilListo(perfil, perfil.notasEspeciales)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-light transition-colors"
        >
          Continuar con este perfil <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // ── SITUACIÓN B y C: cliente nuevo ─────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <Building2 className="w-5 h-5 text-primary flex-shrink-0" />
        <div>
          <p className="font-semibold text-foreground">{empresa}</p>
          <p className="text-sm text-muted-foreground">NIT {nit} · Cliente nuevo</p>
        </div>
      </div>

      {/* Casos similares detectados (situación B) — solo antes de generar */}
      {!perfil && similares.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            Encontramos clientes parecidos
          </p>
          {similares.slice(0, 3).map((s, i) => (
            <button
              key={i}
              onClick={() => handleUsarSimilar(s)}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
            >
              <div>
                <p className="font-medium text-foreground text-sm">{s.caso.nombre}</p>
                <p className="text-xs text-muted-foreground">{s.razon}</p>
              </div>
              <span className="text-xs font-semibold text-primary">Usar este →</span>
            </button>
          ))}
        </div>
      )}

      {/* Chat de instrucciones (situación C) */}
      {!perfil && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
              <Wand2 className="w-4 h-4 text-primary" />
              Instrucciones para este cliente
            </span>
            <textarea
              value={instrucciones}
              onChange={e => setInstrucciones(e.target.value)}
              rows={4}
              placeholder="Ej: En la cuenta de Servicios, mostrar primero Hospedaje, Lavandería, etc. y dentro de cada uno los terceros. Los costos van agrupados por subcuenta."
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Describe en español cómo quieres que se organice el estado financiero.
            Puedes dejarlo vacío para usar la configuración estándar.
          </p>

          <button
            onClick={handleGenerar}
            disabled={generando}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-light transition-colors disabled:opacity-60"
          >
            {generando ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generando perfil con IA...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generar perfil con IA</>
            )}
          </button>
        </div>
      )}

      {/* Perfil generado — revisar y confirmar */}
      {perfil && (
        <div className="space-y-4">
          <div className="p-4 bg-muted/30 border border-border rounded-xl">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Perfil propuesto
            </p>
            <ResumenPerfil perfil={perfil} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setPerfil(null) }}
              className="px-4 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Volver a editar
            </button>
            <button
              onClick={() => onPerfilListo(perfil, instrucciones)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-light transition-colors"
            >
              Confirmar y generar Excel <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}