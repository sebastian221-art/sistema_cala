// Dashboard principal - vista diferenciada por rol
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UserRole } from '@/types'
import { AdminDashboard } from '@/components/dashboard/AdminDashboard'
import { ContadorDashboard } from '@/components/dashboard/ContadorDashboard'
import { ClienteDashboard } from '@/components/dashboard/ClienteDashboard'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, nombre')
    .eq('id', user.id)
    .single()

  const role = profile?.role as UserRole

  // Mostrar dashboard según rol
  if (role === 'administrador') {
    return <AdminDashboard userId={user.id} />
  }

  if (role === 'contador') {
    return <ContadorDashboard userId={user.id} />
  }

  return <ClienteDashboard userId={user.id} />
}
