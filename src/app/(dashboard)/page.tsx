// src/app/(dashboard)/page.tsx
// Dashboard principal de CALA — accesos, guía, estadísticas e historial
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  FileSpreadsheet,
  Receipt,
  Calculator,
  Users,
  Building2,
  Library,
  ArrowRight,
  Clock,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const PAGINAS = [
  {
    href: '/motor-contable',
    titulo: 'Motor Contable',
    icon: FileSpreadsheet,
    resumen: 'Genera el Estado de Situación Financiera (ESF) completo.',
    guia: [
      'Sube el balance de prueba (Siigo o World Office)',
      'La IA arma un perfil de configuración del cliente',
      'Descarga el ESF con sus 19 hojas, siempre cuadrado',
    ],
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
  },
  {
    href: '/formulario-1647',
    titulo: 'Formulario 1647',
    icon: Receipt,
    resumen: 'Información exógena de pagos a terceros (Concepto A070).',
    guia: [
      'Sube el auxiliar por tercero',
      'Excluye automáticamente los registros solo débito',
      'Marca los NIT que empiezan en 44444 como extranjeros',
    ],
    color: 'text-blue-600',
    bg: 'bg-blue-500/10',
  },
  {
    href: '/consolidacion-iva',
    titulo: 'Consolidación IVA',
    icon: Calculator,
    resumen: 'Consolida facturas electrónicas de la DIAN en XML.',
    guia: [
      'Sube los XML de la DIAN (UBL 2.1)',
      'Discrimina el IVA por tarifa e invierte las notas crédito',
      'Genera un Excel con el consolidado por tercero',
    ],
    color: 'text-violet-600',
    bg: 'bg-violet-500/10',
  },
]

export default async function DashboardPage() {
  const supabase = await createClient()

  // Estadísticas (en paralelo)
  const [perfilesRes, casosRes, usuariosRes, recientesRes] = await Promise.all([
    supabase.from('perfiles_cliente').select('nit', { count: 'exact', head: true }),
    supabase.from('casos_tipo').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('activo', true),
    supabase
      .from('perfiles_cliente')
      .select('nit, nombre_empresa, actualizado_en')
      .order('actualizado_en', { ascending: false })
      .limit(6),
  ])

  const totalPerfiles = perfilesRes.count ?? 0
  const totalCasos    = casosRes.count ?? 0
  const totalUsuarios = usuariosRes.count ?? 0
  const recientes     = recientesRes.data ?? []

  const stats = [
    {
      label: 'Clientes configurados',
      valor: totalPerfiles,
      icon: Building2,
      detalle: 'Perfiles guardados',
    },
    {
      label: 'Casos tipo',
      valor: totalCasos,
      icon: Library,
      detalle: 'Plantillas reutilizables',
    },
    {
      label: 'Usuarios activos',
      valor: totalUsuarios,
      icon: Users,
      detalle: 'Con acceso al sistema',
    },
  ]

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Encabezado */}
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground">
          Panel de CALA Asociados
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Automatización de estados financieros y obligaciones tributarias.
        </p>
      </div>

      {/* Estadísticas */}
      <section className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className="bg-card border border-border rounded-xl p-5 flex items-start gap-4"
            >
              <div className="p-2.5 rounded-lg bg-accent/15 flex-shrink-0">
                <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold text-foreground leading-tight">
                  {s.valor}
                </p>
                <p className="text-sm font-medium text-foreground truncate">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.detalle}</p>
              </div>
            </div>
          )
        })}
      </section>

      {/* Accesos rápidos + guía */}
      <section>
        <h3 className="font-semibold text-foreground mb-4">Módulos del sistema</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {PAGINAS.map((p) => {
            const Icon = p.icon
            return (
              <Link
                key={p.href}
                href={p.href}
                className="group bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all flex flex-col"
              >
                <div className={`p-2.5 rounded-lg ${p.bg} w-fit mb-3`}>
                  <Icon className={`w-5 h-5 ${p.color}`} aria-hidden="true" />
                </div>

                <h4 className="font-semibold text-foreground mb-1">{p.titulo}</h4>
                <p className="text-sm text-muted-foreground mb-4">{p.resumen}</p>

                <ul className="space-y-1.5 mb-4 flex-1">
                  {p.guia.map((paso, i) => (
                    <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-muted text-foreground/70 flex items-center justify-center text-[10px] font-semibold mt-0.5">
                        {i + 1}
                      </span>
                      <span>{paso}</span>
                    </li>
                  ))}
                </ul>

                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
                  Abrir
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Historial: últimos clientes procesados */}
      <section>
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          Últimos clientes configurados
        </h3>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {recientes.length === 0 ? (
            <div className="p-10 text-center">
              <Building2
                className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3"
                aria-hidden="true"
              />
              <p className="text-muted-foreground text-sm">
                Aún no hay clientes configurados.
              </p>
              <Link
                href="/motor-contable"
                className="inline-flex items-center gap-1 text-sm text-primary font-medium mt-2 hover:underline"
              >
                Generar el primer ESF
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recientes.map((c) => (
                <div
                  key={c.nit}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {c.nombre_empresa || 'Sin nombre'}
                    </p>
                    <p className="text-xs text-muted-foreground">NIT {c.nit}</p>
                  </div>
                  <p className="text-xs text-muted-foreground flex-shrink-0">
                    {c.actualizado_en
                      ? new Date(c.actualizado_en).toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}