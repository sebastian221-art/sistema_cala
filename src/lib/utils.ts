// Utilidades generales del sistema
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isBefore, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

// Combinar clases de Tailwind de forma segura
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatear moneda colombiana COP
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Formatear número con separadores de miles
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value)
}

// Formatear porcentaje
export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`
}

// Parsear fecha de texto evitando desplazamiento UTC→local
function parseFecha(date: string | Date): Date {
  if (date instanceof Date) return date
  // Si es solo fecha (YYYY-MM-DD), fijar al mediodía UTC para evitar desfase de zona horaria
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00Z') : new Date(date)
}

// Formatear fecha en español
export function formatDate(date: string | Date): string {
  return format(parseFecha(date), 'dd/MM/yyyy')
}

// Formatear fecha con hora
export function formatDateTime(date: string | Date): string {
  return format(parseFecha(date), "dd/MM/yyyy 'a las' HH:mm", { locale: es })
}

// Tiempo relativo en español
export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(parseFecha(date), { addSuffix: true, locale: es })
}

// Calcular estado de vencimiento
export function getVencimientoStatus(fechaVencimiento: string): 'vencido' | 'urgente' | 'proximo' | 'al_dia' {
  const fecha = parseFecha(fechaVencimiento)
  const hoy = new Date()

  if (isBefore(fecha, hoy)) return 'vencido'
  if (isBefore(fecha, addDays(hoy, 3))) return 'urgente'
  if (isBefore(fecha, addDays(hoy, 15))) return 'proximo'
  return 'al_dia'
}

// Obtener color de semáforo financiero
export function getSemaforoColor(semaforo: 'verde' | 'amarillo' | 'rojo'): string {
  const colores = {
    verde: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
    amarillo: 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30',
    rojo: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30',
  }
  return colores[semaforo]
}

// Etiqueta legible para tipo de impuesto
export function getTipoImpuestoLabel(tipo: string): string {
  const labels: Record<string, string> = {
    IVA_BIMESTRAL: 'IVA Bimestral',
    IVA_CUATRIMESTRAL: 'IVA Cuatrimestral',
    IVA_ANUAL: 'IVA Anual',
    RETENCION_FUENTE_MENSUAL: 'Retención en la Fuente',
    RENTA_ANUAL: 'Renta Anual',
    RENTA_BIMESTRAL_ANTICIPO: 'Renta (Anticipo Bimestral)',
    ICA_BIMESTRAL: 'ICA Bimestral',
    ICA_TRIMESTRAL: 'ICA Trimestral',
    ICA_ANUAL: 'ICA Anual',
    EXOGENA_ANUAL: 'Información Exógena',
    RETENCION_ICA_BIMESTRAL: 'Retención ICA',
    PATRIMONIO_ANUAL: 'Impuesto al Patrimonio',
    GMF: 'GMF (4x1000)',
    OTROS: 'Otras Obligaciones',
  }
  return labels[tipo] ?? tipo
}

// Abreviar números grandes
export function abbreviateNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }
  return value.toString()
}

// Sanitizar texto antes de enviar a IA
export function sanitizeForAI(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Quitar HTML
    .replace(/[^\w\s.,;:¡!¿?áéíóúÁÉÍÓÚñÑ\-()]/g, '') // Solo caracteres seguros
    .trim()
    .slice(0, 4000) // Límite de tamaño
}

// Obtener iniciales de un nombre
export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

// Validar NIT colombiano
export function validateNIT(nit: string): boolean {
  const cleaned = nit.replace(/[^0-9]/g, '')
  return cleaned.length >= 8 && cleaned.length <= 10
}

// Formatear NIT con guión y dígito verificador
export function formatNIT(nit: string): string {
  const cleaned = nit.replace(/[^0-9-]/g, '')
  if (cleaned.includes('-')) return cleaned
  if (cleaned.length > 1) {
    return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`
  }
  return cleaned
}
