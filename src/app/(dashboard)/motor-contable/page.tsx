'use client'
// src/app/(dashboard)/motor-contable/page.tsx v5.0
// Flujo nuevo de 3 pasos:
//   1. Cargar balances (cliente nuevo o existente)
//   2. Perfil del cliente (IA / similitud / guardado)
//   3. Preview + chat de corrección + confirmar

import { useState } from 'react'
import { UploadPanel }       from '@/components/motor-contable/UploadPanel'
import { SelectorCliente }   from '@/components/motor-contable/SelectorCliente'
import type { ClienteGuardado } from '@/components/motor-contable/SelectorCliente'
import { PerfilStep }        from '@/components/motor-contable/PerfilStep'
import { PreviewConChat }    from '@/components/motor-contable/PreviewConChat'
import { FileSpreadsheet, Sparkles, FileUp, Settings2, Eye, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { EstructuraCliente } from '@/lib/motor-contable/extraerEstructura'
import type { PerfilCliente } from '@/lib/perfiles/calcularSimilitud'

type Step = 'select' | 'upload' | 'perfil' | 'preview'

// ── Tipos del resultado (sin cambios respecto a la versión anterior) ──────
export interface PeriodoResumen {
  mes: number; anio: number; label: string; fechaCorte: string
  totalActivo: number; totalPasivo: number; totalPatrimonio: number
  cuadra: boolean; advertencias: string[]
}
export interface ResumenMotor {
  periodo: string; fechaCorte: string
  totalActivo: number; activoCorriente: number; activoNoCorriente: number
  caja: number; bancos: number; cxc: number; inventario: number; ppye: number
  totalPasivo: number; pasivoCorriente: number; pasivoNoCorriente: number
  proveedores: number; obligFinancieras: number
  totalPatrimonio: number; capitalSocial: number; resultadoEjercicio: number
  diferencia: number; cuadra: boolean
  eriMes: { ingresos: number; costos: number; gastos: number; resultado: number }
  texto: string
}
export interface ResultadoAPI {
  ok: boolean; empresa: string; nit: string
  periodos: PeriodoResumen[]; resumen: ResumenMotor
  advertencias: string[]; excel_base64: string
}

// Datos que se llevan del paso 1 al paso 2
interface DatosEstructura {
  empresa: string
  nit: string
  estructura: EstructuraCliente
  archivos: File[]   // los balances subidos, para regenerar en pasos siguientes
}

export default function MotorContablePage() {
  const [step, setStep] = useState<Step>('select')

  // cliente existente seleccionado (si aplica)
  const [clienteExistente, setClienteExistente] = useState<ClienteGuardado | null>(null)
  const [perfilGuardado,   setPerfilGuardado]   = useState<PerfilCliente | null>(null)

  // datos de estructura (paso 1 → 2)
  const [datos, setDatos] = useState<DatosEstructura | null>(null)

  // perfil confirmado en paso 2
  const [perfilActivo, setPerfilActivo] = useState<PerfilCliente | null>(null)

  // resultado del motor (paso 3)
  const [resultado, setResultado] = useState<ResultadoAPI | null>(null)

  // ── Navegación inicial ─────────────────────────────────────────────────
  const irClienteNuevo = () => {
    setClienteExistente(null)
    setPerfilGuardado(null)
    setStep('upload')
  }

  const irClienteExistente = async (cliente: ClienteGuardado) => {
    setClienteExistente(cliente)
    // Traer su perfil guardado
    try {
      const res = await fetch(`/api/perfiles?nit=${encodeURIComponent(cliente.nit)}`)
      const data = await res.json()
      setPerfilGuardado(data.perfilExistente?.perfil_json ?? null)
    } catch {
      setPerfilGuardado(null)
    }
    setStep('upload')
  }

  // ── Paso 1 → 2: el UploadPanel ya extrajo la estructura ────────────────
  const handleEstructura = (d: DatosEstructura) => {
    setDatos(d)
    setStep('perfil')
  }

  // ── Paso 2 → 3: perfil listo, generar Excel ────────────────────────────
  const handlePerfilListo = async (perfil: PerfilCliente, _instrucciones: string) => {
    if (!datos) return
    setPerfilActivo(perfil)
    const r = await generarExcel(datos.archivos, perfil)
    if (r) {
      setResultado(r)
      setStep('preview')
    }
  }

  // ── Generar Excel llamando al motor con el perfil ──────────────────────
  const generarExcel = async (archivos: File[], perfil: PerfilCliente): Promise<ResultadoAPI | null> => {
    try {
      const fd = new FormData()
      fd.append('balance', archivos[0])
      const adicionales = archivos.slice(1)
      adicionales.forEach((f, i) => fd.append(`balance_adicional_${i}`, f))
      if (adicionales.length > 0) fd.append('num_adicionales', String(adicionales.length))
      // El perfil viaja como JSON para que el motor lo aplique
      fd.append('perfil_json', JSON.stringify(perfil))

      const res = await fetch('/api/motor-contable', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Error generando el estado financiero')
        return null
      }
      return data as ResultadoAPI
    } catch {
      toast.error('Error de conexión con el motor')
      return null
    }
  }

  // ── Regenerar (desde el chat de corrección) ────────────────────────────
  const handleRegenerar = async (perfilCorregido: PerfilCliente): Promise<ResultadoAPI | null> => {
    if (!datos) return null
    setPerfilActivo(perfilCorregido)
    return await generarExcel(datos.archivos, perfilCorregido)
  }

  // ── Confirmar estado financiero: guardar perfil ────────────────────────
  const handleConfirmar = async (perfilFinal: PerfilCliente) => {
    if (!datos) return
    const res = await fetch('/api/perfiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'guardar',
        nit: datos.nit,
        nombre_empresa: datos.empresa,
        perfil: perfilFinal,
        instrucciones: perfilFinal.notasEspeciales,
        prefijos: datos.estructura.prefijosPresentes,
      }),
    })
    if (!res.ok) throw new Error('Error al guardar')
  }

  const handleReset = () => {
    setStep('select')
    setClienteExistente(null)
    setPerfilGuardado(null)
    setDatos(null)
    setPerfilActivo(null)
    setResultado(null)
  }

  // ── Stepper ────────────────────────────────────────────────────────────
  const PASOS = [
    { id: 'select',  label: 'Cliente',  icon: FileUp },
    { id: 'perfil',  label: 'Perfil',   icon: Settings2 },
    { id: 'preview', label: 'Revisar',  icon: Eye },
  ]
  const pasoActualIdx = step === 'upload' ? 0
    : step === 'select' ? 0
    : step === 'perfil' ? 1
    : 2

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <FileSpreadsheet className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Motor Contable</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Balance de prueba → Estado financiero con perfil inteligente
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-full">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">Siigo · PUC · IA</span>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-3">
        {PASOS.map((p, idx) => {
          const isActive = idx === pasoActualIdx
          const isDone   = idx < pasoActualIdx
          return (
            <div key={p.id} className="flex items-center gap-3">
              {idx > 0 && (
                <div className={cn('h-px w-8 transition-colors', isDone || isActive ? 'bg-primary' : 'bg-border')} />
              )}
              <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                isActive ? 'bg-primary text-primary-foreground shadow-sm'
                : isDone  ? 'text-primary'
                          : 'text-muted-foreground bg-muted/50'
              )}>
                <p.icon className="w-3.5 h-3.5" />
                {p.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Contenido */}
      <div className="bg-card border border-border rounded-2xl p-6">

        {/* PASO 1a — Selección de cliente */}
        {step === 'select' && (
          <>
            <div className="mb-5">
              <h2 className="font-semibold text-foreground">¿Cliente nuevo o existente?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Si es nuevo, la IA aprende cómo manejarlo. Si ya existe, usa su perfil guardado.
              </p>
            </div>
            <SelectorCliente onNuevo={irClienteNuevo} onExistente={irClienteExistente} />
          </>
        )}

        {/* PASO 1b — Subir balances */}
        {step === 'upload' && (
          <>
            <div className="flex items-center gap-2 mb-5">
              <button onClick={handleReset}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" /> Volver
              </button>
            </div>
            <div className="mb-5">
              <h2 className="font-semibold text-foreground">
                {clienteExistente ? `Nuevo balance de ${clienteExistente.nombre_empresa}` : 'Cargar balances'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Sube uno o varios balances de prueba por tercero exportados desde Siigo.
              </p>
            </div>
            <UploadPanel onEstructura={handleEstructura} />
          </>
        )}

        {/* PASO 2 — Perfil */}
        {step === 'perfil' && datos && (
          <>
            <div className="flex items-center gap-2 mb-5">
              <button onClick={() => setStep('upload')}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" /> Volver
              </button>
            </div>
            <PerfilStep
              empresa={datos.empresa}
              nit={datos.nit}
              estructura={datos.estructura}
              perfilExistente={perfilGuardado}
              onPerfilListo={handlePerfilListo}
            />
          </>
        )}

        {/* PASO 3 — Preview con chat */}
        {step === 'preview' && resultado && datos && perfilActivo && (
          <>
            <div className="flex items-center gap-2 mb-5">
              <button onClick={handleReset}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" /> Procesar otro cliente
              </button>
            </div>
            <PreviewConChat
              resultado={resultado}
              estructura={datos.estructura}
              perfil={perfilActivo}
              empresa={datos.empresa}
              nit={datos.nit}
              prefijos={datos.estructura.prefijosPresentes}
              onRegenerar={handleRegenerar}
              onConfirmar={handleConfirmar}
            />
          </>
        )}
      </div>
    </div>
  )
}