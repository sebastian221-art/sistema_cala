'use client'

// Badge de estado para obligaciones tributarias
import { cn, getVencimientoStatus } from '@/lib/utils'
import { AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react'

interface ObligationsBadgeProps {
  fechaVencimiento: string
  className?: string
  showIcon?: boolean
}

const STATUS_CONFIG = {
  vencido: {
    label: 'Vencido',
    className: 'badge-vencido',
    icon: XCircle,
    iconClass: 'text-red-500',
  },
  urgente: {
    label: 'Urgente',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    icon: AlertTriangle,
    iconClass: 'text-orange-500',
  },
  proximo: {
    label: 'Próximo',
    className: 'badge-proximo',
    icon: Clock,
    iconClass: 'text-amber-500',
  },
  al_dia: {
    label: 'Al día',
    className: 'badge-al-dia',
    icon: CheckCircle,
    iconClass: 'text-green-500',
  },
}

export function ObligationsBadge({
  fechaVencimiento,
  className,
  showIcon = true,
}: ObligationsBadgeProps) {
  const status = getVencimientoStatus(fechaVencimiento)
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        config.className,
        className
      )}
      role="status"
      aria-label={`Estado: ${config.label}`}
    >
      {showIcon && <Icon className={cn('w-3.5 h-3.5', config.iconClass)} aria-hidden="true" />}
      {config.label}
    </span>
  )
}

// Badge para tipo de impuesto con color por categoría
interface TaxTypeBadgeProps {
  tipoImpuesto: string
  className?: string
}

const TAX_COLORS: Record<string, string> = {
  IVA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  RETENCION: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  RENTA: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  ICA: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  EXOGENA: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  PATRIMONIO: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  GMF: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  OTROS: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
}

export function TaxTypeBadge({ tipoImpuesto, className }: TaxTypeBadgeProps) {
  const prefix = tipoImpuesto.split('_')[0]
  const colorClass = TAX_COLORS[prefix] ?? TAX_COLORS.OTROS
  const label = tipoImpuesto.replace(/_/g, ' ')

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
        colorClass,
        className
      )}
    >
      {label}
    </span>
  )
}
