// src/lib/motor-contable/extraerEstructura.ts
// ════════════════════════════════════════════════════════════════════════
// Extrae un RESUMEN compacto de la estructura de cuentas de un balance,
// SIN números crudos. Esto es lo que se le pasa a la IA para que entienda
// cómo está organizado el cliente y proponga un perfil.
// ════════════════════════════════════════════════════════════════════════

import type { BalanceParseado } from './parser'

export interface CuentaEstructura {
  codigo: string
  nombre: string
}

export interface SubcuentaConHijos {
  codigo: string          // subcuenta 6 dígitos, ej "418001"
  nombre: string          // ej "Servicios"
  auxiliares: CuentaEstructura[]  // hijos de 8 dígitos
}

export interface EstructuraCliente {
  // Prefijos PUC presentes (2 dígitos): "11","13","41","61", etc.
  prefijosPresentes: string[]
  // Subcuentas de ingresos (41/42) con sus auxiliares (8 dígitos)
  subcuentasConHijos: SubcuentaConHijos[]
  // Resumen booleano para la IA
  resumen: {
    tieneIngresosOperacionales: boolean
    tieneIngresosNoOperacionales: boolean
    tieneCostos: boolean
    tieneGastos: boolean
    ingresosTienenAuxiliares: boolean
  }
}

// Normaliza un código (quita ".0" de floats)
function norm(codigo: string | number): string {
  return String(codigo).replace(/\.0*$/, '').replace(/\.\d+$/, '').trim()
}

export function extraerEstructura(balance: BalanceParseado): EstructuraCliente {
  // Prefijos de 2 dígitos presentes
  const prefijosSet = new Set<string>()
  for (const c of balance.cuentas) {
    if (c.esBasura) continue
    const cod = norm(c.codigo)
    if (cod.length >= 2) prefijosSet.add(cod.slice(0, 2))
  }
  const prefijosPresentes = [...prefijosSet].sort()

  // Subcuentas de ingresos (41/42) con sus auxiliares de 8 dígitos
  const subcuentasConHijos: SubcuentaConHijos[] = []
  const subcuentas4 = balance.subcuentas.filter(c => {
    const cod = norm(c.codigo)
    return (cod.startsWith('41') || cod.startsWith('42')) && cod.length === 6 && !c.esBasura
  })

  for (const sc of subcuentas4) {
    const scCod = norm(sc.codigo)
    const auxiliares = balance.auxiliares
      .filter(a => {
        const cod = norm(a.codigo)
        return cod.length === 8 && cod.startsWith(scCod) && !a.esBasura
      })
      // deduplicar por código
      .reduce<CuentaEstructura[]>((acc, a) => {
        const cod = norm(a.codigo)
        if (!acc.some(x => x.codigo === cod)) acc.push({ codigo: cod, nombre: a.nombre })
        return acc
      }, [])
      .sort((a, b) => a.codigo.localeCompare(b.codigo))

    subcuentasConHijos.push({ codigo: scCod, nombre: sc.nombre, auxiliares })
  }

  const ingresosTienenAuxiliares = subcuentasConHijos.some(s => s.auxiliares.length > 0)

  return {
    prefijosPresentes,
    subcuentasConHijos,
    resumen: {
      tieneIngresosOperacionales:   prefijosPresentes.includes('41'),
      tieneIngresosNoOperacionales: prefijosPresentes.includes('42'),
      tieneCostos:  prefijosPresentes.includes('61') || prefijosPresentes.includes('62') || prefijosPresentes.includes('71'),
      tieneGastos:  prefijosPresentes.includes('51') || prefijosPresentes.includes('52') || prefijosPresentes.includes('53'),
      ingresosTienenAuxiliares,
    },
  }
}

// Convierte la estructura a texto legible para el prompt de la IA
export function estructuraATexto(est: EstructuraCliente): string {
  const NOMBRES_GRUPO: Record<string, string> = {
    '11': 'Disponible (caja/bancos)', '12': 'Inversiones', '13': 'Cuentas por cobrar',
    '14': 'Inventarios', '15': 'Propiedad planta y equipo', '16': 'Intangibles',
    '21': 'Obligaciones financieras', '22': 'Proveedores', '23': 'Cuentas por pagar',
    '24': 'Impuestos', '25': 'Beneficios a empleados', '26': 'Provisiones',
    '31': 'Capital social', '33': 'Reservas',
    '41': 'Ingresos operacionales', '42': 'Ingresos no operacionales',
    '51': 'Gastos administración', '52': 'Gastos de ventas', '53': 'Gastos no operacionales',
    '61': 'Costo de ventas', '62': 'Compras', '71': 'Costos de producción',
  }

  const lineas: string[] = []
  lineas.push('GRUPOS PUC PRESENTES:')
  for (const p of est.prefijosPresentes) {
    const nombre = NOMBRES_GRUPO[p]
    if (nombre) lineas.push(`  ${p} — ${nombre}`)
  }

  if (est.subcuentasConHijos.length > 0) {
    lineas.push('')
    lineas.push('SUBCUENTAS DE INGRESOS Y SUS SUB-CATEGORÍAS (auxiliares):')
    for (const sc of est.subcuentasConHijos) {
      lineas.push(`  ${sc.codigo} — ${sc.nombre}`)
      for (const aux of sc.auxiliares) {
        lineas.push(`      ${aux.codigo} — ${aux.nombre}`)
      }
    }
  }

  return lineas.join('\n')
}