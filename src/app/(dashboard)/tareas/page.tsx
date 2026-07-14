// Página: Gestión de Tareas y Pendientes
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TasksPanel } from '@/components/tasks/TasksPanel'

export const metadata = {
  title: 'Tareas | CALA ASOCIADOS',
}

export default async function TareasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = profile?.role ?? 'cliente'

  // Cargar clientes y contadores para el formulario
  let clients: Array<{ id: string; razon_social: string; nit: string }> = []
  let contadores: Array<{ id: string; nombre: string; apellido: string }> = []

  if (userRole !== 'cliente') {
    const clientsQuery = supabase
      .from('clients')
      .select('id, razon_social, nit')
      .eq('activo', true)
      .order('razon_social')

    if (userRole === 'contador') {
      clientsQuery.eq('contador_id', user.id)
    }

    const [clientsRes, contadoresRes] = await Promise.all([
      clientsQuery,
      userRole === 'administrador'
        ? supabase
            .from('profiles')
            .select('id, nombre, apellido')
            .eq('role', 'contador')
            .eq('activo', true)
            .order('nombre')
        : Promise.resolve({ data: [] }),
    ])

    clients = clientsRes.data ?? []
    contadores = (contadoresRes as { data: typeof contadores | null }).data ?? []
  }

  return (
    <TasksPanel
      userRole={userRole as 'administrador' | 'contador' | 'cliente'}
      clients={clients}
      contadores={contadores}
    />
  )
}
