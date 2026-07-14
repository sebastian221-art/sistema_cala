// Página: Calendario tributario — filtrado por clientes del contador o NIT propio del cliente
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TaxCalendarView } from '@/components/tax/TaxCalendarView'
import { CalendarioSeedButton } from '@/components/tax/CalendarioSeedButton'
import { CalendarioExportButton } from '@/components/tax/CalendarioExportButton'
import { TaxCalendarEntry } from '@/types'

export const metadata = {
  title: 'Calendario Tributario | CALA ASOCIADOS',
}

/**
 * Extrae el último dígito del NIT (sin dígito de verificación).
 * Ejemplos:
 *   "901360819-7" → "9"  (con guion: tomar antes del guion)
 *   "9013608197"  → "9"  (sin guion, 10 dígitos: el último es verificación, se descarta)
 *   "900123456"   → "6"  (9 dígitos: sin dígito de verificación)
 */
function nitLastDigit(nit: string): string {
  const sinVerif = nit.split('-')[0].replace(/\D/g, '')
  // Si no hay guion y tiene 10+ dígitos, el último es el dígito de verificación → descartarlo
  const actualNit = !nit.includes('-') && sinVerif.length >= 10 ? sinVerif.slice(0, -1) : sinVerif
  return actualNit.slice(-1)
}

/**
 * Extrae los últimos dos dígitos del NIT (sin dígito de verificación), con cero a la izquierda.
 * Ejemplos:
 *   "901360819-7" → "19"
 *   "9013608197"  → "19"  (sin guion, descarta dígito de verificación)
 */
function nitLastTwo(nit: string): string {
  const sinVerif = nit.split('-')[0].replace(/\D/g, '')
  const actualNit = !nit.includes('-') && sinVerif.length >= 10 ? sinVerif.slice(0, -1) : sinVerif
  return actualNit.slice(-2).padStart(2, '0')
}

/**
 * Verifica si un NIT aplica para una entrada del calendario.
 * digitos_nit puede ser:
 *   - NULL          → aplica a todos
 *   - '9'           → último dígito del NIT
 *   - '01-05'       → últimos dos dígitos en el rango [01,05]
 */
function nitMatchesDigitos(nit: string, digitos: string | null): boolean {
  if (!digitos) return true

  // Dígito único (ej: '0', '1', ..., '9')
  if (/^\d$/.test(digitos)) {
    return nitLastDigit(nit) === digitos
  }

  // Rango de dos dígitos (ej: '01-05', '96-00')
  const rangeMatch = digitos.match(/^(\d{1,2})-(\d{1,2})$/)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10)
    const end = parseInt(rangeMatch[2], 10)
    const val = parseInt(nitLastTwo(nit), 10)
    // Manejo especial para rangos que cruzan el 00 (ej: '96-00')
    if (end < start) {
      return val >= start || val <= end
    }
    return val >= start && val <= end
  }

  return false
}

export default async function CalendarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const currentYear = new Date().getFullYear()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'cliente'
  const isAdmin = role === 'administrador'
  const isContador = role === 'contador'
  const isCliente = role === 'cliente'

  // ── Obtener todos los eventos del año ───────────────────────────────────
  const fetchEventos = async (año: number) => {
    const { data } = await supabase
      .from('tax_calendar')
      .select('*')
      .eq('año', año)
      .order('fecha_vencimiento')
    return (data ?? []) as TaxCalendarEntry[]
  }

  let todosEventos = await fetchEventos(currentYear)
  let añoMostrado = currentYear

  if (todosEventos.length === 0) {
    todosEventos = await fetchEventos(currentYear - 1)
    if (todosEventos.length > 0) añoMostrado = currentYear - 1
  }

  let eventos: TaxCalendarEntry[] = todosEventos
  let infoSubtitulo = ''

  // ── Filtrado para CONTADOR ───────────────────────────────────────────────
  if (isContador) {
    // Traer clientes del contador con sus NITs y obligaciones activas
    const { data: clientesConObl } = await supabase
      .from('tax_obligations')
      .select(`
        tipo_impuesto,
        clients!inner(nit, razon_social, contador_id)
      `)
      .eq('clients.contador_id', user.id)
      .eq('activo', true)

    if (clientesConObl && clientesConObl.length > 0) {
      // Construir set de pares (tipo_impuesto, nit, razon_social)
      const pares: Array<{ tipo: string; nit: string; nombre: string }> = clientesConObl.map((o) => ({
        tipo: o.tipo_impuesto,
        nit: (o.clients as { nit: string; razon_social: string }).nit,
        nombre: (o.clients as { nit: string; razon_social: string }).razon_social,
      }))

      const tiposUnicos = [...new Set(pares.map((p) => p.tipo))]

      // Filtrar y enriquecer eventos con los clientes que aplican
      eventos = todosEventos
        .filter((evento) => {
          if (!tiposUnicos.includes(evento.tipo_impuesto)) return false
          if (!evento.digitos_nit) return true
          return pares.some(
            (p) => p.tipo === evento.tipo_impuesto && nitMatchesDigitos(p.nit, evento.digitos_nit ?? null)
          )
        })
        .map((evento) => {
          const clientesAplican = pares
            .filter(
              (p) =>
                p.tipo === evento.tipo_impuesto &&
                nitMatchesDigitos(p.nit, evento.digitos_nit ?? null)
            )
            .map((p) => p.nombre)
          return { ...evento, clientes_aplicables: clientesAplican }
        })

      const numClientes = new Set(pares.map((p) => p.nit)).size
      infoSubtitulo = `${numClientes} cliente(s) · ${tiposUnicos.length} tipo(s) de impuesto`
    } else {
      // Sin clientes con obligaciones → mostrar calendario completo como referencia
      infoSubtitulo = 'Aún no tienes clientes con obligaciones tributarias asignadas'
    }
  }

  // ── Filtrado para CLIENTE ────────────────────────────────────────────────
  if (isCliente) {
    // Buscar el registro de cliente vinculado a este usuario
    const { data: clienteData } = await supabase
      .from('clients')
      .select('nit, tax_obligations(tipo_impuesto, activo)')
      .eq('profile_id', user.id)
      .single()

    if (clienteData) {
      const nit = clienteData.nit
      const obligaciones = (clienteData.tax_obligations ?? []) as { tipo_impuesto: string; activo: boolean }[]
      const tiposActivos = obligaciones.filter((o) => o.activo).map((o) => o.tipo_impuesto)

      if (tiposActivos.length > 0) {
        eventos = todosEventos.filter((evento) => {
          if (!tiposActivos.includes(evento.tipo_impuesto)) return false
          return nitMatchesDigitos(nit, evento.digitos_nit)
        })
        const lastDigit = nitLastDigit(nit)
        infoSubtitulo = `NIT ${nit} · último dígito: ${lastDigit}`
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Calendario Tributario {añoMostrado}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? `Fechas de vencimiento DIAN Colombia — Boletín CALA ASOCIADOS ${currentYear}`
              : isContador
              ? 'Vencimientos tributarios de tus clientes asignados'
              : 'Tus fechas de vencimiento tributario'}
          </p>
          {infoSubtitulo && (
            <p className="mt-1 text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-1.5 inline-block">
              {infoSubtitulo}
            </p>
          )}
          {añoMostrado !== currentYear && (
            <p className="mt-2 text-sm text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 inline-block">
              Mostrando datos del año {añoMostrado}. Usa el botón para importar el calendario {currentYear}.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <CalendarioExportButton eventos={eventos} año={añoMostrado} />
          {isAdmin && <CalendarioSeedButton año={currentYear} />}
        </div>
      </div>

      <TaxCalendarView eventos={eventos} año={añoMostrado} isAdmin={isAdmin} />
    </div>
  )
}
