'use client'

// Tarjeta de KPI ejecutivo reutilizable
import { cn, abbreviateNumber } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: number | string
  prefix?: string
  suffix?: string
  change?: number // porcentaje de cambio vs periodo anterior
  changeLabel?: string
  icon?: React.ElementType
  iconColor?: string
  format?: 'currency' | 'number' | 'percent' | 'text'
  loading?: boolean
  className?: string
}

export function KpiCard({
  title,
  value,
  prefix,
  suffix,
  change,
  changeLabel = 'vs mes anterior',
  icon: Icon,
  iconColor = 'text-primary',
  format = 'number',
  loading = false,
  className,
}: KpiCardProps) {
  const formattedValue = () => {
    if (typeof value === 'string') return value
    if (format === 'currency') {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        notation: 'compact',
      }).format(value)
    }
    if (format === 'percent') return `${value.toFixed(1)}%`
    return abbreviateNumber(value)
  }

  const isPositive = change !== undefined && change > 0
  const isNegative = change !== undefined && change < 0
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus

  if (loading) {
    return (
      <div className={cn('kpi-card', className)} aria-busy="true">
        <div className="skeleton h-4 w-24 mb-3" />
        <div className="skeleton h-8 w-32 mb-2" />
        <div className="skeleton h-3 w-20" />
      </div>
    )
  }

  return (
    <div className={cn('kpi-card group', className)} role="region" aria-label={title}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {Icon && (
          <div
            className={cn(
              'p-2 rounded-lg bg-muted group-hover:scale-110 transition-transform',
              iconColor
            )}
            aria-hidden="true"
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <p className="text-2xl font-mono font-bold text-foreground tabular-nums">
        {prefix && <span className="text-lg text-muted-foreground">{prefix}</span>}
        {formattedValue()}
        {suffix && <span className="text-lg text-muted-foreground ml-1">{suffix}</span>}
      </p>

      {change !== undefined && (
        <div
          className={cn(
            'flex items-center gap-1.5 mt-2 text-xs font-medium',
            isPositive && 'text-success',
            isNegative && 'text-danger',
            !isPositive && !isNegative && 'text-muted-foreground'
          )}
          aria-label={`Cambio: ${change > 0 ? '+' : ''}${change.toFixed(1)}% ${changeLabel}`}
        >
          <TrendIcon className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {change > 0 ? '+' : ''}
            {change.toFixed(1)}% {changeLabel}
          </span>
        </div>
      )}
    </div>
  )
}
