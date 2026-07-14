// Hook personalizado para gestión de clientes
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Client, ClientFormData, PaginatedResponse } from '@/types'
import { toast } from 'sonner'

interface UseClientsParams {
  page?: number
  search?: string
  activo?: boolean | null
}

export function useClients({ page = 1, search = '', activo }: UseClientsParams = {}) {
  const queryClient = useQueryClient()

  // Obtener lista de clientes
  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery<PaginatedResponse<Client>>({
    queryKey: ['clients', page, search, activo],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '25',
        ...(search && { search }),
        ...(activo !== null && activo !== undefined && { activo: activo.toString() }),
      })
      const res = await fetch(`/api/clients?${params}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error ?? 'Error al cargar clientes')
      }
      return res.json()
    },
  })

  // Crear cliente
  const createClient = useMutation({
    mutationFn: async (clientData: ClientFormData) => {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error ?? 'Error al crear cliente')
      }
      const { data } = await res.json()
      return data as Client
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente creado exitosamente')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Actualizar cliente
  const updateClient = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: Partial<ClientFormData>
    }) => {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error ?? 'Error al actualizar cliente')
      }
      const { data: updated } = await res.json()
      return updated as Client
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente actualizado correctamente')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Desactivar cliente
  const deactivateClient = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error ?? 'Error al desactivar cliente')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente desactivado')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  return {
    clients: data?.data ?? [],
    total: data?.total ?? 0,
    totalPages: data?.total_pages ?? 1,
    isLoading,
    isError,
    error,
    createClient,
    updateClient,
    deactivateClient,
  }
}

// Hook para obtener un cliente por ID
export function useClient(id: string) {
  return useQuery<Client>({
    queryKey: ['client', id],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${id}`)
      if (!res.ok) throw new Error('Cliente no encontrado')
      const { data } = await res.json()
      return data
    },
    enabled: !!id,
  })
}
