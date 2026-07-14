// Página: Seguimiento de Declaraciones Tributarias (Kanban)
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DeclarationsKanban } from '@/components/declarations/DeclarationsKanban'

export const metadata = {
  title: 'Declaraciones | CALA ASOCIADOS',
}

export default async function DeclaracionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = (profile?.role ?? 'cliente') as 'administrador' | 'contador' | 'cliente'

  let clients: Array<{ id: string; razon_social: string; nit: string }> = []

  if (userRole !== 'cliente') {
    let query = supabase
      .from('clients')
      .select('id, razon_social, nit')
      .eq('activo', true)
      .order('razon_social')

    if (userRole === 'contador') {
      query = query.eq('contador_id', user.id)
    }

    const { data } = await query
    clients = data ?? []
  }

  return (
    <DeclarationsKanban
      userRole={userRole}
      clients={clients}
    />
  )
}
