// src/app/(dashboard)/configuracion/page.tsx
// Configuración del sistema: usuarios, conexiones y clientes configurados
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UsuariosPanel } from '@/components/configuracion/UsuariosPanel'
import { EstadoSistema } from '@/components/configuracion/EstadoSistema'
import { Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Solo el administrador entra aquí (el middleware ya lo protege,
  // pero se valida de nuevo por seguridad)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'administrador') {
    redirect('/?error=sin_permisos')
  }

  // Perfiles de cliente guardados
  const { data: perfiles } = await supabase
    .from('perfiles_cliente')
    .select('nit, nombre_empresa, instrucciones_contador, actualizado_en')
    .order('actualizado_en', { ascending: false })

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground">
          Configuración del sistema
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Usuarios, conexiones y clientes configurados.
        </p>
      </div>

      {/* Estado de las conexiones */}
      <EstadoSistema />

      {/* Gestión de usuarios */}
      <UsuariosPanel miId={user.id} />

      {/* Clientes configurados */}
      <section className="bg-card border border-border rounded-xl">
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" aria-hidden="true" />
            Clientes configurados
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Perfiles guardados que el Motor Contable reutiliza automáticamente.
          </p>
        </div>

        {!perfiles || perfiles.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            Aún no hay clientes configurados. Se crean al generar un ESF.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {perfiles.map((p) => (
              <div key={p.nit} className="px-5 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.nombre_empresa || 'Sin nombre'}
                    </p>
                    <p className="text-xs text-muted-foreground">NIT {p.nit}</p>
                  </div>
                  <p className="text-xs text-muted-foreground flex-shrink-0">
                    {p.actualizado_en
                      ? new Date(p.actualizado_en).toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
                {p.instrucciones_contador && (
                  <p className="text-xs text-muted-foreground/80 mt-1.5 italic line-clamp-2">
                    &ldquo;{p.instrucciones_contador}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}