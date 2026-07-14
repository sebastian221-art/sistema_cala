'use client'

// Tabla de clientes con búsqueda, filtros y paginación
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Building2,
  User,
  ExternalLink,
  Pencil,
  Trash2,
} from 'lucide-react'
import { cn, formatNIT, getInitials } from '@/lib/utils'
import { TaxTypeBadge } from '@/components/tax/ObligationBadge'
import { Client } from '@/types'
import { toast } from 'sonner'

interface ClientsTableProps {
  userId: string
  userRole: string
}

export function ClientsTable({ userId, userRole }: ClientsTableProps) {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterActivo, setFilterActivo] = useState<string>('')
  

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clients', page, search, filterActivo, userId],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '25',
        ...(search && { search }),
        ...(filterActivo && { activo: filterActivo }),
      })
      const res = await fetch(`/api/clients?${params}`)
      if (!res.ok) throw new Error('Error al cargar clientes')
      return res.json()
    },
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handleDeactivate = async (clientId: string, razonSocial: string) => {
    if (!confirm(`¿Desactivar al cliente "${razonSocial}"?`)) return

    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al desactivar')
      toast.success('Cliente desactivado correctamente')
      refetch()
    } catch {
      toast.error('Error al desactivar el cliente')
    }
  }

  const clients: Client[] = data?.data ?? []
  const totalPages: number = data?.total_pages ?? 1
  const total: number = data?.total ?? 0

  return (
    <div className="space-y-4">
      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Buscar por nombre o NIT..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Buscar clientes"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary-light transition-colors"
          >
            Buscar
          </button>
        </form>

        {/* Filtro por estado */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <select
            value={filterActivo}
            onChange={(e) => {
              setFilterActivo(e.target.value)
              setPage(1)
            }}
            className="text-sm rounded-xl border border-border bg-background text-foreground px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filtrar por estado"
          >
            <option value="">Todos los estados</option>
            <option value="true">Solo activos</option>
            <option value="false">Solo inactivos</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-14 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-muted-foreground">
            Error al cargar los clientes. Intenta de nuevo.
          </div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" aria-hidden="true" />
            <p className="text-muted-foreground font-medium">
              {search ? 'No se encontraron clientes con ese criterio' : 'Aún no tienes clientes registrados'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table" aria-label="Lista de clientes">
              <thead>
                <tr>
                  <th scope="col" className="text-left">Cliente</th>
                  <th scope="col" className="text-left">NIT</th>
                  <th scope="col" className="text-left hidden md:table-cell">Actividad</th>
                  <th scope="col" className="text-left hidden lg:table-cell">Obligaciones</th>
                  <th scope="col" className="text-left hidden sm:table-cell">Estado</th>
                  <th scope="col" className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((client) => {
                  const obligacionesActivas = (client.tax_obligations ?? []).filter(
                    (o: { activo: boolean }) => o.activo
                  )

                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/clientes/${client.id}`)}
                    >
                      {/* Nombre */}
                      <td>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary text-xs font-bold"
                            aria-hidden="true"
                          >
                            {getInitials(client.razon_social)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate max-w-48">
                              {client.razon_social}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                              {client.tipo === 'persona_natural' ? (
                                <User className="w-3 h-3" aria-hidden="true" />
                              ) : (
                                <Building2 className="w-3 h-3" aria-hidden="true" />
                              )}
                              {client.tipo.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* NIT */}
                      <td>
                        <span className="font-mono text-sm">{formatNIT(client.nit)}</span>
                      </td>

                      {/* Actividad */}
                      <td className="hidden md:table-cell">
                        <p className="text-sm text-muted-foreground truncate max-w-48">
                          {client.codigo_ciiu
                            ? `${client.codigo_ciiu} - ${client.actividad_economica ?? ''}`
                            : client.actividad_economica ?? '—'}
                        </p>
                      </td>

                      {/* Obligaciones */}
                      <td className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1 max-w-48">
                          {obligacionesActivas.slice(0, 2).map((ob: { id: string; tipo_impuesto: string }) => (
                            <TaxTypeBadge key={ob.id} tipoImpuesto={ob.tipo_impuesto} />
                          ))}
                          {obligacionesActivas.length > 2 && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-muted text-muted-foreground">
                              +{obligacionesActivas.length - 2}
                            </span>
                          )}
                          {obligacionesActivas.length === 0 && (
                            <span className="text-xs text-muted-foreground">Sin obligaciones</span>
                          )}
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="hidden sm:table-cell">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
                            client.activo
                              ? 'badge-al-dia'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          )}
                        >
                          {client.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td>
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => router.push(`/clientes/${client.id}`)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            aria-label={`Ver detalles de ${client.razon_social}`}
                          >
                            <ExternalLink className="w-4 h-4" aria-hidden="true" />
                          </button>

                          {(userRole === 'contador' || userRole === 'administrador') && (
                            <button
                              onClick={() => router.push(`/clientes/${client.id}/editar`)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              aria-label={`Editar ${client.razon_social}`}
                            >
                              <Pencil className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}

                          {userRole === 'administrador' && client.activo && (
                            <button
                              onClick={() => handleDeactivate(client.id, client.razon_social)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                              aria-label={`Desactivar ${client.razon_social}`}
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {!isLoading && clients.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Mostrando {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} de {total} clientes
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <span className="text-sm font-medium px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Página siguiente"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
