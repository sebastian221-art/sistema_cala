'use client'

// Página: Crear nuevo cliente con carga de RUT
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { RutUploader } from '@/components/clients/RutUploader'
import { ExtractedRutData, TipoImpuesto, TipoContribuyente } from '@/types'
import { getTipoImpuestoLabel, cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ArrowLeft, Save, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const TIPOS_IMPUESTO: TipoImpuesto[] = [
  'IVA_BIMESTRAL', 'IVA_CUATRIMESTRAL', 'IVA_ANUAL',
  'RETENCION_FUENTE_MENSUAL', 'RENTA_ANUAL', 'RENTA_BIMESTRAL_ANTICIPO',
  'ICA_BIMESTRAL', 'ICA_TRIMESTRAL', 'ICA_ANUAL',
  'EXOGENA_ANUAL', 'RETENCION_ICA_BIMESTRAL', 'PATRIMONIO_ANUAL', 'GMF', 'OTROS',
]

const clientSchema = z.object({
  nit: z.string().min(8, 'NIT inválido (mínimo 8 caracteres)'),
  razon_social: z.string().min(2, 'Razón social requerida'),
  tipo: z.enum(['persona_natural', 'persona_juridica']),
  actividad_economica: z.string().optional(),
  codigo_ciiu: z.string().optional(),
  direccion: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefono: z.string().optional(),
  whatsapp: z.string().optional(),
})

type ClientFormData = z.infer<typeof clientSchema>

interface ObligacionSeleccionada {
  tipo_impuesto: TipoImpuesto
  periodicidad: string
  regimen?: string
  notas?: string
}

interface Contador {
  id: string
  nombre: string
  apellido: string
  email: string
}

export default function NuevoClientePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [rutProcessed, setRutProcessed] = useState(false)
  const [obligaciones, setObligaciones] = useState<ObligacionSeleccionada[]>([])
  const [showAddObligation, setShowAddObligation] = useState(false)
  const [newObligation, setNewObligation] = useState<ObligacionSeleccionada>({
    tipo_impuesto: 'IVA_BIMESTRAL',
    periodicidad: 'bimestral',
  })
  const [isAdmin, setIsAdmin] = useState(false)
  const [contadores, setContadores] = useState<Contador[]>([])
  const [selectedContadorId, setSelectedContadorId] = useState<string>('current')

  useEffect(() => {
    const supabase = createClient()
    const loadUserInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role === 'administrador') {
        setIsAdmin(true)
        const res = await fetch('/api/admin/users')
        if (res.ok) {
          const { data: users } = await res.json()
          const lista = (users as Contador[]).filter((u: { role?: string } & Contador) => u.role === 'contador')
          setContadores(lista)
        }
      }
    }
    loadUserInfo()
  }, [])

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      tipo: 'persona_juridica',
    },
  })

  // Callback cuando el RUT es procesado
  const handleRutDataExtracted = (data: ExtractedRutData) => {
    if (data.nit) setValue('nit', data.nit)
    if (data.razon_social) setValue('razon_social', data.razon_social)
    if (data.tipo_contribuyente) setValue('tipo', data.tipo_contribuyente as TipoContribuyente)
    if (data.actividad_economica) setValue('actividad_economica', data.actividad_economica)
    if (data.codigo_ciiu) setValue('codigo_ciiu', data.codigo_ciiu)
    if (data.direccion) setValue('direccion', data.direccion)
    if (data.email) setValue('email', data.email)
    if (data.telefono) setValue('telefono', data.telefono)

    // Auto-seleccionar obligaciones detectadas en el RUT
    if (data.responsabilidades && data.responsabilidades.length > 0) {
      const obligacionesDetectadas: ObligacionSeleccionada[] = []

      data.responsabilidades.forEach((resp) => {
        const respUpper = resp.toUpperCase()
        if (respUpper.includes('IVA') || respUpper.includes('RESPONSABLE')) {
          obligacionesDetectadas.push({
            tipo_impuesto: 'IVA_BIMESTRAL',
            periodicidad: 'bimestral',
            notas: 'Detectado en RUT',
          })
        }
        if (respUpper.includes('RETENCI') && !respUpper.includes('ICA')) {
          obligacionesDetectadas.push({
            tipo_impuesto: 'RETENCION_FUENTE_MENSUAL',
            periodicidad: 'mensual',
            notas: 'Detectado en RUT',
          })
        }
        if (respUpper.includes('ICA')) {
          obligacionesDetectadas.push({
            tipo_impuesto: 'ICA_BIMESTRAL',
            periodicidad: 'bimestral',
            notas: 'Detectado en RUT',
          })
        }
      })

      if (obligacionesDetectadas.length > 0) {
        setObligaciones(obligacionesDetectadas)
      }
    }

    setRutProcessed(true)
    toast.success('Datos del RUT cargados. Revisa y completa la información.')
  }

  const addObligation = () => {
    const duplicate = obligaciones.find(
      (o) => o.tipo_impuesto === newObligation.tipo_impuesto
    )
    if (duplicate) {
      toast.error('Ya existe esa obligación. Edítala o elimínala primero.')
      return
    }
    setObligaciones([...obligaciones, { ...newObligation }])
    setShowAddObligation(false)
    setNewObligation({ tipo_impuesto: 'IVA_BIMESTRAL', periodicidad: 'bimestral' })
  }

  const removeObligation = (index: number) => {
    setObligaciones(obligaciones.filter((_, i) => i !== index))
  }

  const onSubmit = async (data: ClientFormData) => {
    setIsLoading(true)
    try {
      // 1. Crear el cliente
      const clientRes = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          email: data.email || null,
          contador_id: selectedContadorId,
        }),
      })

      if (!clientRes.ok) {
        const errorData = await clientRes.json()
        throw new Error(errorData.error ?? 'Error al crear cliente')
      }

      const { data: newClient } = await clientRes.json()

      // 2. Crear las obligaciones tributarias
      if (obligaciones.length > 0) {
        for (const ob of obligaciones) {
          await fetch(`/api/clients/${newClient.id}/tax-obligations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...ob,
              fecha_inicio: new Date().toISOString().split('T')[0],
            }),
          })
        }
      }

      toast.success('Cliente creado exitosamente')
      router.push(`/clientes/${newClient.id}`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al guardar'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/clientes"
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Volver a clientes"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Nuevo Cliente
          </h1>
          <p className="text-muted-foreground mt-1">
            Sube el RUT o ingresa los datos manualmente
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* PASO 1: Subir RUT */}
        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-foreground mb-1">
            Paso 1: Cargar RUT (Opcional)
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Sube el RUT del cliente para extraer automáticamente sus datos con IA
          </p>
          <RutUploader onDataExtracted={handleRutDataExtracted} />
          {rutProcessed && (
            <p className="mt-3 text-sm text-success font-medium">
              ✓ Datos extraídos del RUT. Revisa y completa el formulario.
            </p>
          )}
        </section>

        {/* PASO 2: Datos del cliente */}
        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-foreground mb-4">
            Paso 2: Información del Cliente
          </h2>

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
                aria-describedby={errors.nit ? 'nit-error' : undefined}
              />
              {errors.nit && (
                <p id="nit-error" className="mt-1.5 text-xs text-danger" role="alert">
                  {errors.nit.message}
                </p>
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
                <p className="mt-1.5 text-xs text-danger" role="alert">
                  {errors.razon_social.message}
                </p>
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
                <p className="mt-1.5 text-xs text-danger" role="alert">
                  {errors.email.message}
                </p>
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

            {/* Contador asignado — solo visible para administradores */}
            {isAdmin && (
              <div className="md:col-span-2">
                <label htmlFor="contador_id" className="block text-sm font-medium text-foreground mb-2">
                  Contador asignado <span className="text-danger">*</span>
                </label>
                <select
                  id="contador_id"
                  value={selectedContadorId}
                  onChange={(e) => setSelectedContadorId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="current">— Sin asignar (me asigno yo) —</option>
                  {contadores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} {c.apellido} ({c.email})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Selecciona el contador responsable de este cliente
                </p>
              </div>
            )}
          </div>
        </section>

        {/* PASO 3: Obligaciones tributarias */}
        <section className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-foreground">
                Paso 3: Obligaciones Tributarias
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Selecciona las obligaciones tributarias del cliente
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddObligation(true)}
              className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Agregar
            </button>
          </div>

          {/* Lista de obligaciones */}
          {obligaciones.length > 0 ? (
            <div className="space-y-2">
              {obligaciones.map((ob, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-xl"
                >
                  <div>
                    <p className="font-medium text-sm text-foreground">
                      {getTipoImpuestoLabel(ob.tipo_impuesto)}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {ob.periodicidad} {ob.notas ? `• ${ob.notas}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeObligation(index)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                    aria-label={`Eliminar obligación ${getTipoImpuestoLabel(ob.tipo_impuesto)}`}
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay obligaciones configuradas. Agrega al menos una.
            </p>
          )}

          {/* Formulario para agregar obligación */}
          {showAddObligation && (
            <div className="mt-4 p-4 bg-muted/30 rounded-xl border border-border space-y-3">
              <h3 className="font-medium text-sm text-foreground">Nueva Obligación</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Tipo de Impuesto
                  </label>
                  <select
                    value={newObligation.tipo_impuesto}
                    onChange={(e) => setNewObligation({ ...newObligation, tipo_impuesto: e.target.value as TipoImpuesto })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {TIPOS_IMPUESTO.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {getTipoImpuestoLabel(tipo)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Periodicidad
                  </label>
                  <select
                    value={newObligation.periodicidad}
                    onChange={(e) => setNewObligation({ ...newObligation, periodicidad: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="bimestral">Bimestral</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="cuatrimestral">Cuatrimestral</option>
                    <option value="semestral">Semestral</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddObligation(false)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={addObligation}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary-light transition-colors"
                >
                  Agregar
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Botones de acción */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/clientes"
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
            <Save className="w-4 h-4" aria-hidden="true" />
            {isLoading ? 'Guardando...' : 'Guardar Cliente'}
          </button>
        </div>
      </form>
    </div>
  )
}
