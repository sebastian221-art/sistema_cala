// Página: Chat web con AsistenteConta
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChatInterface } from '@/components/chatbot/ChatInterface'
import { Info } from 'lucide-react'

export const metadata = {
  title: 'AsistenteConta | CALA ASOCIADOS',
}

type PageProps = {
  searchParams: Promise<{ client?: string }>
}

export default async function ChatbotPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { client: clientId } = await searchParams

  // Si viene un clientId en la URL, cargar los datos del cliente para el contexto
  let clientContext: {
    id: string
    razon_social: string
    nit: string
    actividad_economica?: string
    obligaciones?: string[]
  } | undefined = undefined

  if (clientId) {
    const { data: clientData } = await supabase
      .from('clients')
      .select(`
        id, razon_social, nit, actividad_economica,
        tax_obligations(tipo_impuesto, activo)
      `)
      .eq('id', clientId)
      .single()

    if (clientData) {
      const obligacionesActivas = (clientData.tax_obligations ?? [])
        .filter((o: { activo: boolean }) => o.activo)
        .map((o: { tipo_impuesto: string }) => o.tipo_impuesto)

      clientContext = {
        id: clientData.id,
        razon_social: clientData.razon_social,
        nit: clientData.nit,
        actividad_economica: clientData.actividad_economica ?? undefined,
        obligaciones: obligacionesActivas,
      }
    }
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">
      {/* Aviso informativo */}
      <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm">
          <p className="font-medium text-foreground">
            AsistenteConta - IA Contable
            {clientContext && (
              <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-normal">
                Contexto: {clientContext.razon_social}
              </span>
            )}
          </p>
          <p className="text-muted-foreground mt-0.5">
            {clientContext
              ? `Consulta sobre ${clientContext.razon_social} (NIT: ${clientContext.nit}). Para preguntas sobre otros clientes, usa el botón "Consultar IA" desde su perfil.`
              : 'Consulta sobre impuestos colombianos, fechas DIAN, conceptos contables y NIIF. Para consultar sobre un cliente específico, accede desde su perfil.'}
          </p>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0">
        <ChatInterface userId={user.id} clientContext={clientContext} />
      </div>
    </div>
  )
}
