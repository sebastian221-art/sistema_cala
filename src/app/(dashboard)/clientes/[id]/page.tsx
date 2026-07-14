// Página de perfil completo del cliente
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, TrendingUp, MessageSquare, Calendar, Upload, Pencil, FolderOpen, CheckSquare } from 'lucide-react'
import { formatNIT, formatDate } from '@/lib/utils'
import { TaxTypeBadge } from '@/components/tax/ObligationBadge'
import { FinancialDashboard } from '@/components/financial/FinancialDashboard'
import { InsightsPanel } from '@/components/ai/InsightsPanel'
import { TasksPanel } from '@/components/tasks/TasksPanel'
import { ClientObligacionesPDFButton } from '@/components/clients/ClientObligacionesPDFButton'
import { DeclarationsKanban } from '@/components/declarations/DeclarationsKanban'

type PageParams = { params: Promise<{ id: string }> }

export default async function ClientProfilePage({ params }: PageParams) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Obtener datos completos del cliente
  const { data: client, error } = await supabase
    .from('clients')
    .select(`
      *,
      contador:profiles!clients_contador_id_fkey(nombre, apellido, email, telefono),
      tax_obligations(*),
      rut_files(id, uploaded_at, version)
    `)
    .eq('id', id)
    .single()

  if (error || !client) notFound()

  const obligacionesActivas = (client.tax_obligations ?? []).filter(
    (o: { activo: boolean }) => o.activo
  )

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/clientes"
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mt-1"
          aria-label="Volver a clientes"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-display font-bold text-foreground">
              {client.razon_social}
            </h1>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                client.activo
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {client.activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p className="text-muted-foreground font-mono mt-1">
            NIT: {formatNIT(client.nit)}
          </p>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <Link
            href={`/clientes/${id}/editar`}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl text-sm hover:bg-muted transition-colors"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
            Editar
          </Link>
          <Link
            href={`/clientes/${id}/documentos`}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl text-sm hover:bg-muted transition-colors"
          >
            <FolderOpen className="w-4 h-4" aria-hidden="true" />
            Documentos
          </Link>
          <Link
            href={`/clientes/${id}/financiero`}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl text-sm hover:bg-muted transition-colors"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            Subir Estado
          </Link>
          <Link
            href={`/clientes/${id}/mensajes`}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl text-sm hover:bg-muted transition-colors"
          >
            <MessageSquare className="w-4 h-4" aria-hidden="true" />
            Mensajes
          </Link>
          <Link
            href={`/chatbot?client=${id}`}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary-light transition-colors"
          >
            <MessageSquare className="w-4 h-4" aria-hidden="true" />
            Consultar IA
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda: Info del cliente */}
        <div className="space-y-5">
          {/* Información básica */}
          <section className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-foreground mb-4">Información General</h2>
            <dl className="space-y-3">
              {[
                { label: 'Tipo', value: client.tipo?.replace('_', ' ') ?? '—' },
                { label: 'CIIU', value: client.codigo_ciiu ?? '—' },
                { label: 'Actividad', value: client.actividad_economica ?? '—' },
                { label: 'Dirección', value: client.direccion ?? '—' },
                { label: 'Email', value: client.email ?? '—' },
                { label: 'Teléfono', value: client.telefono ?? '—' },
                { label: 'WhatsApp', value: client.whatsapp ?? '—' },
                { label: 'Desde', value: formatDate(client.created_at) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="text-sm text-foreground mt-0.5 capitalize">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Contador asignado */}
          {client.contador && (
            <section className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-semibold text-foreground mb-3">Contador Asignado</h2>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary text-sm font-bold">
                  {(client.contador as { nombre?: string; apellido?: string })?.nombre?.[0]}
                </div>
                <div>
                  <p className="font-medium text-sm text-foreground">
                    {(client.contador as { nombre?: string; apellido?: string })?.nombre}{' '}
                    {(client.contador as { nombre?: string; apellido?: string })?.apellido}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(client.contador as { email?: string })?.email}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* RUT */}
          <section className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground">Documentos RUT</h2>
              <Link
                href={`/clientes/${id}/documentos`}
                className="text-xs text-primary hover:underline"
              >
                Gestionar
              </Link>
            </div>
            {client.rut_files?.length > 0 ? (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                <FileText className="w-5 h-5 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    RUT versión {client.rut_files[0].version}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Actualizado: {formatDate(client.rut_files[0].uploaded_at)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin RUT cargado</p>
            )}
          </section>
        </div>

        {/* Columna derecha: Obligaciones + Dashboard */}
        <div className="lg:col-span-2 space-y-6">
          {/* Obligaciones tributarias */}
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" aria-hidden="true" />
                Obligaciones Tributarias ({obligacionesActivas.length})
              </h2>
              <Link
                href={`/clientes/${id}/editar`}
                className="text-xs text-primary hover:underline"
              >
                Gestionar
              </Link>
            </div>

            {obligacionesActivas.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                Sin obligaciones configuradas
              </div>
            ) : (
              <div className="divide-y divide-border">
                {obligacionesActivas.map((ob: {
                  id: string
                  tipo_impuesto: string
                  periodicidad: string
                  regimen?: string
                  notas?: string
                }) => (
                  <div key={ob.id} className="flex items-center gap-4 px-5 py-3">
                    <TaxTypeBadge tipoImpuesto={ob.tipo_impuesto} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground capitalize">
                        {ob.periodicidad}
                        {ob.regimen ? ` · ${ob.regimen}` : ''}
                      </p>
                    </div>
                    {ob.notas && (
                      <p className="text-xs text-muted-foreground truncate max-w-32">
                        {ob.notas}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Dashboard financiero */}
          <section>
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" aria-hidden="true" />
              Análisis Financiero
            </h2>
            <FinancialDashboard clientId={id} />
          </section>

          {/* Panel de Insights IA */}
          <InsightsPanel clientId={id} clientName={client.razon_social} />

          {/* Declaraciones del cliente - Vista Kanban */}
          <section className="bg-card border border-border rounded-xl p-5">
            <DeclarationsKanban
              userRole="contador"
              clients={[{ id: client.id, razon_social: client.razon_social, nit: client.nit }]}
              initialClientId={id}
            />
          </section>

          {/* Tareas del cliente */}
          <section className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" aria-hidden="true" />
                Tareas y Pendientes
              </h2>
              <div className="flex items-center gap-2">
                <ClientObligacionesPDFButton
                  clientName={client.razon_social}
                  clientNit={client.nit}
                  obligations={obligacionesActivas}
                />
              </div>
            </div>
            <TasksPanel
              userRole="contador"
              clients={[{ id: client.id, razon_social: client.razon_social, nit: client.nit }]}
              initialClientId={id}
              compact
            />
          </section>
        </div>
      </div>
    </div>
  )
}
