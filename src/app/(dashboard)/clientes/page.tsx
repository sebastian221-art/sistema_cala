// Página: Lista de clientes con filtros y paginación
import { ClientsTable } from '@/components/clients/ClientsTable'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'

export const metadata = {
  title: 'Clientes | CALA ASOCIADOS',
}

export default async function ClientesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const canCreate = profile?.role === 'contador' || profile?.role === 'administrador'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Gestión de Clientes
          </h1>
          <p className="text-muted-foreground mt-1">
            Administra tus clientes y sus obligaciones tributarias
          </p>
        </div>

        {canCreate && (
          <Link
            href="/clientes/nuevo"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary-light transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            Nuevo Cliente
          </Link>
        )}
      </div>

      <ClientsTable userId={user.id} userRole={profile?.role ?? 'cliente'} />
    </div>
  )
}
