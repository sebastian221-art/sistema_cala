'use client'

// Página: Editar datos del cliente
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const editClientSchema = z.object({
  nit: z.string().min(8, 'NIT inválido (mínimo 8 caracteres)'),
  razon_social: z.string().min(2, 'Razón social requerida'),
  tipo: z.enum(['persona_natural', 'persona_juridica']),
  actividad_economica: z.string().optional(),
  codigo_ciiu: z.string().optional(),
  direccion: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefono: z.string().optional(),
  whatsapp: z.string().optional(),
  activo: z.boolean().optional(),
  contador_id: z.string().uuid().optional(),
})

type EditClientFormData = z.infer<typeof editClientSchema>

interface Contador {
  id: string
  nombre: string
  apellido: string
  email: string
}

export default function EditarClientePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [contadores, setContadores] = useState<Contador[]>([])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditClientFormData>({
    resolver: zodResolver(editClientSchema),
  })

  // Cargar perfil + datos del cliente al montar
  useEffect(() => {
    const loadAll = async () => {
      try {
        const [profileRes, clientRes] = await Promise.all([
          fetch('/api/auth/profile'),
          fetch(`/api/clients/${id}`),
        ])

        const { data: profile } = await profileRes.json()
        const adminFlag = profile?.role === 'administrador'
        setIsAdmin(adminFlag)

        if (!clientRes.ok) throw new Error('Cliente no encontrado')
        const { data } = await clientRes.json()
        reset({
          nit: data.nit ?? '',
          razon_social: data.razon_social ?? '',
          tipo: data.tipo ?? 'persona_juridica',
          actividad_economica: data.actividad_economica ?? '',
          codigo_ciiu: data.codigo_ciiu ?? '',
          direccion: data.direccion ?? '',
          email: data.email ?? '',
          telefono: data.telefono ?? '',
          whatsapp: data.whatsapp ?? '',
          activo: data.activo ?? true,
          contador_id: data.contador_id ?? '',
        })

        // Cargar lista de contadores solo si es admin
        if (adminFlag) {
          const contRes = await fetch('/api/contadores')
          if (contRes.ok) {
            const { data: contData } = await contRes.json()
            setContadores(contData ?? [])
          }
        }
      } catch {
        toast.error('No se pudo cargar el cliente')
        router.push('/clientes')
      } finally {
        setIsFetching(false)
      }
    }
    loadAll()
  }, [id, reset, router])

  const onSubmit = async (data: EditClientFormData) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          email: data.email || null,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error ?? 'Error al actualizar')
      }

      toast.success('Cliente actualizado correctamente')
      router.push(`/clientes/${id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar')
    } finally {
      setIsLoading(false)
    }
  }

  if (isFetching) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/clientes/${id}`}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Volver al cliente"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Editar Cliente</h1>
          <p className="text-muted-foreground mt-1">Modifica los datos del cliente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-foreground mb-4">Información del Cliente</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* NIT */}
            <div>
              <label htmlFor="nit" className="block text-sm font-medium text-foreground mb-2">
                NIT / RUT <span className="text-danger">*</span>
              </label>
              <input
                id="nit"
                {...register('nit')}
                className={cn(
                  'w-full px-4 py-3 rounded-xl border bg-background text-foreground font-mono',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  errors.nit ? 'border-danger' : 'border-border'
                )}
                placeholder="900123456-7"
              />
              {errors.nit && (
                <p className="mt-1.5 text-xs text-danger">{errors.nit.message}</p>
              )}
            </div>

            {/* Razón Social */}
            <div>
              <label htmlFor="razon_social" className="block text-sm font-medium text-foreground mb-2">
                Razón Social / Nombre <span className="text-danger">*</span>
              </label>
              <input
                id="razon_social"
                {...register('razon_social')}
                className={cn(
                  'w-full px-4 py-3 rounded-xl border bg-background text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  errors.razon_social ? 'border-danger' : 'border-border'
                )}
                placeholder="Empresa S.A.S."
              />
              {errors.razon_social && (
                <p className="mt-1.5 text-xs text-danger">{errors.razon_social.message}</p>
              )}
            </div>

            {/* Tipo de contribuyente */}
            <div>
              <label htmlFor="tipo" className="block text-sm font-medium text-foreground mb-2">
                Tipo de Contribuyente <span className="text-danger">*</span>
              </label>
              <select
                id="tipo"
                {...register('tipo')}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="persona_juridica">Persona Jurídica</option>
                <option value="persona_natural">Persona Natural</option>
              </select>
            </div>

            {/* Código CIIU */}
            <div>
              <label htmlFor="codigo_ciiu" className="block text-sm font-medium text-foreground mb-2">
                Código CIIU
              </label>
              <input
                id="codigo_ciiu"
                {...register('codigo_ciiu')}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                placeholder="6201"
              />
            </div>

            {/* Actividad Económica */}
            <div className="md:col-span-2">
              <label htmlFor="actividad_economica" className="block text-sm font-medium text-foreground mb-2">
                Actividad Económica
              </label>
              <input
                id="actividad_economica"
                {...register('actividad_economica')}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Desarrollo de software a medida"
              />
            </div>

            {/* Dirección */}
            <div className="md:col-span-2">
              <label htmlFor="direccion" className="block text-sm font-medium text-foreground mb-2">
                Dirección Fiscal
              </label>
              <input
                id="direccion"
                {...register('direccion')}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Calle 123 # 45-67, Bogotá, D.C."
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                {...register('email')}
                className={cn(
                  'w-full px-4 py-3 rounded-xl border bg-background text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  errors.email ? 'border-danger' : 'border-border'
                )}
                placeholder="contacto@empresa.com"
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-danger">{errors.email.message}</p>
              )}
            </div>

            {/* Teléfono */}
            <div>
              <label htmlFor="telefono" className="block text-sm font-medium text-foreground mb-2">
                Teléfono
              </label>
              <input
                id="telefono"
                {...register('telefono')}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="+57 300 123 4567"
              />
            </div>

            {/* WhatsApp */}
            <div>
              <label htmlFor="whatsapp" className="block text-sm font-medium text-foreground mb-2">
                WhatsApp (para recordatorios)
              </label>
              <input
                id="whatsapp"
                {...register('whatsapp')}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="+57 300 123 4567"
              />
            </div>

            {/* Estado activo */}
            <div className="flex items-center gap-3">
              <input
                id="activo"
                type="checkbox"
                {...register('activo')}
                className="w-4 h-4 rounded border-border text-primary focus:ring-ring"
              />
              <label htmlFor="activo" className="text-sm font-medium text-foreground">
                Cliente activo
              </label>
            </div>
          </div>
        </section>

        {/* Sección contador — solo admins */}
        {isAdmin && (
          <section className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold text-foreground mb-1">Contador Asignado</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Solo los administradores pueden reasignar el contador responsable de este cliente.
            </p>
            <div>
              <label htmlFor="contador_id" className="block text-sm font-medium text-foreground mb-2">
                Contador
              </label>
              <select
                id="contador_id"
                {...register('contador_id')}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Seleccionar contador —</option>
                {contadores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido} ({c.email})
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* Botones */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/clientes/${id}`}
            className="px-6 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              'flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-medium',
              'hover:bg-primary-light transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" aria-hidden="true" />
            )}
            {isLoading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
