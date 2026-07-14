'use client'
// src/components/motor-contable/PreviewConChat.tsx
// ════════════════════════════════════════════════════════════════════════
// PASO 3 del flujo. Muestra:
//   - Resumen de cifras clave del estado financiero generado
//   - Botón de descarga del Excel SIEMPRE visible
//   - Chat de corrección: el contador escribe ajustes → IA corrige el perfil
//     → se regenera el Excel
//   - Botón "Confirmar estado financiero" → guarda el perfil definitivo
// ════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import {
  Download, CheckCircle2, Building2, Send, Loader2,
  Sparkles, AlertTriangle, MessageSquare, Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { ResultadoAPI } from '@/app/(dashboard)/motor-contable/page'
import type { EstructuraCliente } from '@/lib/motor-contable/extraerEstructura'
import type { PerfilCliente } from '@/lib/perfiles/calcularSimilitud'

interface MensajeChat {
  rol: 'contador' | 'sistema'
  texto: string
}

interface Props {
  resultado:   ResultadoAPI
  estructura:  EstructuraCliente
  perfil:      PerfilCliente
  empresa:     string
  nit:         string
  prefijos:    string[]
  // Regenera el Excel con un perfil corregido (lo provee la página)
  onRegenerar: (perfilCorregido: PerfilCliente) => Promise<ResultadoAPI | null>
  // Guarda el perfil definitivo
  onConfirmar: (perfilFinal: PerfilCliente) => Promise<void>
}

function fmtCOP(n: number): string {
  if (!n || Math.round(n) === 0) return '$0'
  return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n))}`
}

// Heurística simple: ¿la corrección es sobre un NÚMERO o sobre una REGLA?
function pareceCorreccionDeNumero(texto: string): boolean {
  const t = texto.toLowerCase()
  const señalesNumero = [
    'el total', 'el valor', 'la cifra', 'el monto', 'el saldo',
    'está mal el', 'el número', 'suma mal', 'no cuadra el',
  ]
  return señalesNumero.some(s => t.includes(s))
}

export function PreviewConChat({
  resultado: resultadoInicial, estructura, perfil: perfilInicial,
  empresa, nit, prefijos, onRegenerar, onConfirmar,
}: Props) {

  const [resultado, setResultado] = useState<ResultadoAPI>(resultadoInicial)
  const [perfil,    setPerfil]    = useState<PerfilCliente>(perfilInicial)
  const [mensajes,  setMensajes]  = useState<MensajeChat[]>([])
  const [entrada,   setEntrada]   = useState('')
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [confirmado,  setConfirmado]  = useState(false)
  const [descargando, setDescargando] = useState(false)

  const { resumen, periodos } = resultado

  // ── Descargar Excel ────────────────────────────────────────────────────
  const handleDescargar = () => {
    if (!resultado.excel_base64) { toast.error('No hay Excel generado'); return }
    setDescargando(true)
    try {
      const bytes = Uint8Array.from(atob(resultado.excel_base64), c => c.charCodeAt(0))
      const blob  = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href = url
      const p = periodos[periodos.length - 1]
      a.download = `ESF_${empresa.replace(/[^a-zA-Z0-9]/g, '_')}_${p?.label ?? ''}_${p?.anio ?? ''}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel descargado')
    } catch {
      toast.error('Error al descargar')
    } finally {
      setDescargando(false)
    }
  }

  // ── Enviar corrección ──────────────────────────────────────────────────
  const handleCorregir = async () => {
    const texto = entrada.trim()
    if (!texto) return

    setMensajes(prev => [...prev, { rol: 'contador', texto }])
    setEntrada('')

    // Si parece corrección de un número, avisar que revise el balance fuente
    if (pareceCorreccionDeNumero(texto)) {
      setMensajes(prev => [...prev, {
        rol: 'sistema',
        texto: 'Ese valor viene directamente del balance de Siigo, no de una regla del sistema. Si el número está mal, revisa el balance fuente y vuelve a subirlo. Si lo que quieres es cambiar cómo se organiza o agrupa la información, descríbelo de otra forma.',
      }])
      return
    }

    setCorrigiendo(true)
    try {
      // 1. Pedir a la IA el perfil corregido
      const res = await fetch('/api/perfiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'corregir',
          estructura,
          perfil,
          correccion: texto,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMensajes(prev => [...prev, { rol: 'sistema', texto: 'No pude procesar la corrección. Intenta describirla de otra forma.' }])
        return
      }

      const perfilCorregido: PerfilCliente = data.perfil

      // 2. Regenerar el Excel con el perfil corregido
      const nuevoResultado = await onRegenerar(perfilCorregido)
      if (!nuevoResultado) {
        setMensajes(prev => [...prev, { rol: 'sistema', texto: 'Apliqué la corrección al perfil pero hubo un problema regenerando el Excel.' }])
        setPerfil(perfilCorregido)
        return
      }

      setPerfil(perfilCorregido)
      setResultado(nuevoResultado)
      setMensajes(prev => [...prev, {
        rol: 'sistema',
        texto: 'Listo, apliqué el cambio y regeneré el estado financiero. Revisa el resumen y descarga el Excel para confirmar que quedó bien.',
      }])
    } catch {
      setMensajes(prev => [...prev, { rol: 'sistema', texto: 'Error de conexión al aplicar la corrección.' }])
    } finally {
      setCorrigiendo(false)
    }
  }

  // ── Confirmar estado financiero ────────────────────────────────────────
  const handleConfirmar = async () => {
    setConfirmando(true)
    try {
      await onConfirmar(perfil)
      setConfirmado(true)
      toast.success('Estado financiero confirmado y perfil guardado')
    } catch {
      toast.error('Error al guardar el perfil')
    } finally {
      setConfirmando(false)
    }
  }

  const warns = resultado.advertencias.filter(a => a.startsWith('⚠'))

  return (
    <div className="space-y-5">

      {/* Header empresa + descarga */}
      <div className="flex items-start justify-between gap-4 p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground">{empresa}</p>
            <p className="text-xs text-muted-foreground">NIT {nit}</p>
            <p className="text-xs text-primary font-medium mt-0.5">
              {periodos.length} período{periodos.length !== 1 ? 's' : ''} ·{' '}
              {resumen?.cuadra ? '✓ Balance cuadra' : '⚠ Revisar descuadre'}
            </p>
          </div>
        </div>
        <button
          onClick={handleDescargar}
          disabled={descargando}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-light transition-colors disabled:opacity-60"
        >
          {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Descargar Excel
        </button>
      </div>

      {/* Resumen de cifras clave */}
      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Activo',    valor: resumen.totalActivo },
            { label: 'Total Pasivo',    valor: resumen.totalPasivo },
            { label: 'Patrimonio',      valor: resumen.totalPatrimonio },
            { label: 'Ingresos (mes)',  valor: resumen.eriMes.ingresos },
            { label: 'Costos (mes)',    valor: resumen.eriMes.costos },
            { label: 'Resultado (mes)', valor: resumen.eriMes.resultado },
          ].map(item => (
            <div key={item.label} className="p-3 rounded-xl border border-border bg-card">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="font-mono font-semibold text-foreground mt-0.5">{fmtCOP(item.valor)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Advertencias */}
      {warns.length > 0 && (
        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-1">
          {warns.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}

      {/* Chat de corrección */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
          <MessageSquare className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">¿Hay algo que corregir?</p>
        </div>

        {/* Mensajes */}
        {mensajes.length > 0 && (
          <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
            {mensajes.map((m, i) => (
              <div key={i} className={cn('flex', m.rol === 'contador' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] px-3 py-2 rounded-xl text-sm',
                  m.rol === 'contador'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                )}>
                  {m.rol === 'sistema' && <Sparkles className="w-3.5 h-3.5 inline mr-1 text-primary" />}
                  {m.texto}
                </div>
              </div>
            ))}
            {corrigiendo && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-xl bg-muted text-foreground text-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Aplicando corrección y regenerando...
                </div>
              </div>
            )}
          </div>
        )}

        {/* Entrada */}
        <div className="flex gap-2 p-3 border-t border-border">
          <input
            type="text"
            value={entrada}
            onChange={e => setEntrada(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !corrigiendo) handleCorregir() }}
            placeholder="Ej: Hospedaje debe ir antes que Lavandería"
            disabled={corrigiendo}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={handleCorregir}
            disabled={corrigiendo || !entrada.trim()}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-light transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Confirmar */}
      <button
        onClick={handleConfirmar}
        disabled={confirmando || confirmado}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-colors',
          confirmado
            ? 'bg-emerald-600 text-white'
            : 'bg-emerald-600 text-white hover:bg-emerald-700',
          'disabled:opacity-60'
        )}
      >
        {confirmando ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
        ) : confirmado ? (
          <><CheckCircle2 className="w-4 h-4" /> Estado financiero confirmado</>
        ) : (
          <><Save className="w-4 h-4" /> Confirmar estado financiero</>
        )}
      </button>
      {!confirmado && (
        <p className="text-xs text-muted-foreground text-center -mt-2">
          Al confirmar, se guarda el perfil de este cliente para los próximos meses.
        </p>
      )}
    </div>
  )
}