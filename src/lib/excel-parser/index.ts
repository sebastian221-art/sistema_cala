// Módulo de parseo de estados financieros en Excel (SheetJS)
// Detecta automáticamente balance general, P&G y flujo de caja

import { ProcessedFinancialData, FinancialStatementType } from '@/types'

// Tipos internos para SheetJS
interface SheetRow {
  [key: string]: string | number | undefined
}

// Detectar tipo de estado financiero según palabras clave
function detectStatementType(headers: string[], data: SheetRow[]): FinancialStatementType {
  const allText = [...headers, ...data.flatMap((row) => Object.values(row).map(String))]
    .join(' ')
    .toLowerCase()

  if (allText.includes('activo') && allText.includes('pasivo')) {
    return 'balance'
  }
  if (
    allText.includes('ingreso') &&
    (allText.includes('utilidad') || allText.includes('gasto'))
  ) {
    return 'pyg'
  }
  if (allText.includes('flujo') || allText.includes('efectivo')) {
    return 'flujo'
  }

  return 'pyg' // Por defecto, estado de resultados
}

// Encontrar valor numérico en una fila por nombre de cuenta
function findValueByKeyword(data: SheetRow[], keywords: string[]): number {
  for (const row of data) {
    const rowText = Object.values(row).join(' ').toLowerCase()
    if (keywords.some((kw) => rowText.includes(kw.toLowerCase()))) {
      // Buscar el primer valor numérico en la fila
      for (const val of Object.values(row)) {
        if (typeof val === 'number' && !isNaN(val) && Math.abs(val) > 0) {
          return val
        }
      }
    }
  }
  return 0
}

// Normalizar datos de Balance General
function normalizeBalance(data: SheetRow[]): Partial<ProcessedFinancialData> {
  return {
    activos_corrientes: findValueByKeyword(data, ['activo corriente', 'activos corrientes', 'total activo corriente']),
    activos_no_corrientes: findValueByKeyword(data, ['activo no corriente', 'activos fijos', 'propiedad planta']),
    total_activos: findValueByKeyword(data, ['total activo', 'total activos']),
    pasivos_corrientes: findValueByKeyword(data, ['pasivo corriente', 'pasivos corrientes']),
    pasivos_no_corrientes: findValueByKeyword(data, ['pasivo no corriente', 'deuda largo plazo']),
    total_pasivos: findValueByKeyword(data, ['total pasivo', 'total pasivos']),
    patrimonio: findValueByKeyword(data, ['patrimonio', 'capital', 'patrimonio neto']),
  }
}

// Normalizar datos de Estado de Resultados (P&G)
function normalizePyG(data: SheetRow[]): Partial<ProcessedFinancialData> {
  const ingresos = findValueByKeyword(data, ['ingresos', 'ventas', 'ingresos operacionales'])
  const costoVentas = findValueByKeyword(data, ['costo de venta', 'costo ventas', 'costos'])
  const utilidadBruta = ingresos - costoVentas

  return {
    ingresos,
    costo_ventas: costoVentas,
    utilidad_bruta: utilidadBruta > 0 ? utilidadBruta : findValueByKeyword(data, ['utilidad bruta', 'ganancia bruta']),
    gastos_operacionales: findValueByKeyword(data, ['gastos operacionales', 'gastos de administración', 'gastos de ventas']),
    utilidad_operacional: findValueByKeyword(data, ['utilidad operacional', 'ebit', 'resultado operacional']),
    ingresos_no_operacionales: findValueByKeyword(data, ['ingresos no operacionales', 'otros ingresos']),
    gastos_no_operacionales: findValueByKeyword(data, ['gastos no operacionales', 'gastos financieros', 'intereses']),
    utilidad_antes_impuestos: findValueByKeyword(data, ['utilidad antes de impuesto', 'uai', 'ebt']),
    impuesto_renta: findValueByKeyword(data, ['impuesto de renta', 'gasto por impuesto', 'impuesto a las ganancias']),
    utilidad_neta: findValueByKeyword(data, ['utilidad neta', 'ganancia neta', 'resultado del ejercicio']),
  }
}

// Normalizar datos de Flujo de Caja
function normalizeFlujo(data: SheetRow[]): Partial<ProcessedFinancialData> {
  return {
    flujo_operacional: findValueByKeyword(data, ['flujo operacional', 'actividades de operación', 'flujo de operación']),
    flujo_inversion: findValueByKeyword(data, ['flujo de inversión', 'actividades de inversión']),
    flujo_financiacion: findValueByKeyword(data, ['flujo de financiación', 'actividades de financiación']),
    flujo_neto: findValueByKeyword(data, ['flujo neto', 'variación neta', 'aumento o disminución']),
  }
}

// Función principal: parsear archivo Excel
export async function parseExcelFile(buffer: Buffer): Promise<{
  tipo: FinancialStatementType
  rawData: SheetRow[]
  processedData: ProcessedFinancialData
  lineItems: Array<{
    categoria: string
    subcategoria?: string
    nombre_cuenta: string
    valor: number
    orden: number
  }>
}> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  // Tomar la primera hoja
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  // Convertir a JSON
  const rawData: SheetRow[] = XLSX.utils.sheet_to_json(sheet, {
    defval: 0,
    blankrows: false,
  }) as SheetRow[]

  if (rawData.length === 0) {
    throw new Error('El archivo Excel está vacío o no tiene datos válidos')
  }

  // Obtener headers
  const headers = Object.keys(rawData[0] ?? {})

  // Detectar tipo de estado
  const tipo = detectStatementType(headers, rawData)

  // Normalizar datos según tipo
  let processedData: ProcessedFinancialData = {}
  if (tipo === 'balance') {
    processedData = normalizeBalance(rawData) as ProcessedFinancialData
  } else if (tipo === 'pyg') {
    processedData = normalizePyG(rawData) as ProcessedFinancialData
  } else {
    processedData = normalizeFlujo(rawData) as ProcessedFinancialData
  }

  // Crear line items desde los datos raw
  const lineItems = rawData.slice(0, 100).flatMap((row, index) => {
    const entries: Array<{
      categoria: string
      nombre_cuenta: string
      valor: number
      orden: number
    }> = []

    const values = Object.entries(row)
    let nombreCuenta = ''

    for (const [, val] of values) {
      if (typeof val === 'string' && val.length > 2) {
        nombreCuenta = val
      } else if (typeof val === 'number' && val !== 0 && nombreCuenta) {
        entries.push({
          categoria: tipo === 'balance' ? 'balance' : tipo === 'pyg' ? 'resultados' : 'flujo',
          nombre_cuenta: nombreCuenta,
          valor: val,
          orden: index,
        })
      }
    }

    return entries
  })

  return {
    tipo,
    rawData: rawData.slice(0, 50), // Limitar datos raw almacenados
    processedData,
    lineItems: lineItems.slice(0, 50),
  }
}
