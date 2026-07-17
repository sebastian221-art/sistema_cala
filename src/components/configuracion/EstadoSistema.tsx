'use client'

// Estado de los servicios que usa CALA + guía rápida de cada módulo.
// IMPORTANTE: nunca se muestran las API keys, solo si están configuradas.
import { useState, useEffect } from 'react'
import {
  Database,
  Sparkles,
  FileSpreadsheet,
  Receipt,
  Calculator,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Servicio {
  nombre: string
  descripcion: string
  paraQueSirve: string
  icon: React.ElementType
  conectado: boolean | null
}

const MODULOS = [
  {
    nombre: 'Motor Contable',
    ruta: '/motor-contable',
    icon: FileSpreadsheet,
    queHace:
      'Genera el Estado de Situación Financiera (ESF) completo a partir de los balances de prueba. Lee formatos Siigo y World Office, clasifica las cuentas según el PUC colombiano y produce un Excel de 19 hojas con el ESF, el ERI, las notas y los indicadores.',
    comoSeUsa:
      'Seleccionas el cliente, subes uno o varios balances (un archivo por mes), la IA genera un perfil de configuración, y descargas el Excel. Puedes darle instrucciones en español para ajustar cómo se clasifican las cuentas.',
  },
  {
    nombre: 'Formulario 1647',
    ruta: '/formulario-1647',
    icon: Receipt,
    queHace:
      'Arma el reporte de información exógena Formulario 1647 (Concepto A070) para la DIAN, a partir de los auxiliares contables.',
    comoSeUsa:
      'Subes el archivo auxiliar (Siigo o World Office). El sistema excluye los registros que solo tienen débito y trata los NIT que empiezan en 44444 como empresas del exterior.',
  },
  {
    nombre: 'Consolidación IVA',
    ruta: '/consolidacion-iva',
    icon: Calculator,
    queHace:
      'Consolida las facturas electrónicas XML de la DIAN, discrimina el IVA por tarifa y genera un Excel con el resumen para la declaración.',
    comoSeUsa:
      'Subes los XML descargados del portal de la DIAN. El sistema los lee (formato UBL 2.1), invierte el signo de las notas crédito y arma las hojas de consolidación.',
  },
]

export function EstadoSistema() {
  const [servicios, setServicios] = useState<Servicio[]>([
    {
      nombre: 'Supabase',
      descripcion: 'Base de datos y autenticación',
      paraQueSirve:
        'Guarda los usuarios del sistema, los perfiles de configuración de cada cliente y maneja el inicio de sesión.',
      icon: Database,
      conectado: null,
    },
    {
      nombre: 'Groq (IA)',
      descripcion: 'Generación de perfiles de configuración',
      paraQueSirve:
        'Lee tus instrucciones en español y genera el perfil JSON que le dice al motor cómo clasificar las cuentas. La IA nunca calcula números — solo configura.',
      icon: Sparkles,
      conectado: null,
    },
  ])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetch('/api/admin/estado')
      .then((r) => r.json())
      .then((json) => {
        setServicios((prev) =>
          prev.map((s) => ({
            ...s,
            conectado:
              s.nombre === 'Supabase' ? json.supabase : json.groq,
          }))
        )
      })
      .catch(() => {
        setServicios((prev) => prev.map((s) => ({ ...s, conectado: false })))
      })
      .finally(() => setCargando(false))
  }, [])

  return (
    <div className="space-y-6">
      {/* Servicios */}
      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-1">Servicios del Sistema</h2>
        <p className="text-xs text-muted-foreground mb-5">
          Por seguridad, las claves de acceso nunca se muestran aquí. Solo se indica si están configuradas.
        </p>

        <div className="space-y-3">
          {servicios.map((s) => {
            const Icon = s.icon
            return (
              <div
                key={s.nombre}
                className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/20"
              >
                <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-foreground">{s.nombre}</p>
                    {cargando || s.conectado === null ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    ) : s.conectado ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-red-500">
                        <XCircle className="w-3.5 h-3.5" /> Sin configurar
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{s.descripcion}</p>
                  <p className="text-xs text-muted-foreground/80 leading-relaxed">
                    {s.paraQueSirve}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Guía de módulos */}
      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-1">Guía Rápida de Módulos</h2>
        <p className="text-xs text-muted-foreground mb-5">
          Qué hace cada página del sistema y cómo se usa.
        </p>

        <div className="space-y-4">
          {MODULOS.map((m) => {
            const Icon = m.icon
            return (
              <div key={m.ruta} className="p-4 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-md bg-accent/20 text-primary-dark">
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <p className="font-medium text-foreground text-sm">{m.nombre}</p>
                  <code className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {m.ruta}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  <span className="font-medium text-foreground/80">Qué hace: </span>
                  {m.queHace}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground/80">Cómo se usa: </span>
                  {m.comoSeUsa}
                </p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}