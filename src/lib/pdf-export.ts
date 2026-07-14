// Utilidades para exportar reportes a PDF - CALA ASOCIADOS
// Usa jsPDF + jspdf-autotable (solo en cliente)

export interface CalendarEntry {
  tipo_impuesto: string
  mes: number
  dia_vencimiento: number
  fecha_vencimiento: string
  digitos_nit?: string
  descripcion?: string
  clientes_aplicables?: string[]
}

export interface ClientObligationRow {
  razon_social: string
  nit: string
  tipo_impuesto: string
  periodicidad: string
  fecha_vencimiento?: string
}

const MESES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

function getHeader() {
  const now = new Date()
  return `CALA ASOCIADOS | Generado: ${now.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`
}

// Colores corporativos CALA
const COLORS = {
  primary: [30, 58, 138] as [number, number, number],       // azul oscuro
  accent: [234, 179, 8] as [number, number, number],         // amarillo dorado
  light: [239, 246, 255] as [number, number, number],        // azul muy claro
  white: [255, 255, 255] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  dark: [17, 24, 39] as [number, number, number],
}

// ─── Exportar Calendario Tributario ───────────────────────────────────────

export async function exportCalendarioTributarioPDF(
  entries: CalendarEntry[],
  año: number,
  mes?: number
) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Encabezado
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, 297, 28, 'F')

  doc.setTextColor(...COLORS.white)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('CALENDARIO TRIBUTARIO', 14, 12)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const titulo = mes ? `${MESES[mes]} ${año}` : `Año ${año}`
  doc.text(titulo, 14, 20)
  doc.text(getHeader(), 297 - 14, 20, { align: 'right' })

  // Tabla principal
  const rows = entries.map(e => [
    e.tipo_impuesto.replace(/_/g, ' '),
    MESES[e.mes] ?? String(e.mes),
    String(e.dia_vencimiento),
    e.fecha_vencimiento
      ? new Date(e.fecha_vencimiento + 'T00:00').toLocaleDateString('es-CO')
      : '-',
    e.digitos_nit ?? 'Todos',
    e.descripcion ?? '-',
  ])

  autoTable(doc, {
    startY: 34,
    head: [['Tipo de Impuesto', 'Mes', 'Día', 'Fecha Vencimiento', 'Dígitos NIT', 'Descripción']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: COLORS.dark,
    },
    alternateRowStyles: {
      fillColor: COLORS.light,
    },
    styles: {
      cellPadding: 3,
      lineColor: [200, 210, 230],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      3: { fontStyle: 'bold' },
    },
  })

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.gray)
    doc.text(`Página ${i} de ${pageCount}`, 297 - 14, 205, { align: 'right' })
    doc.text('CALA ASOCIADOS - Sistema de Gestión Contable', 14, 205)
  }

  doc.save(`calendario-tributario-${año}${mes ? `-${MESES[mes]}` : ''}.pdf`)
}

// ─── Exportar Obligaciones de un Cliente ──────────────────────────────────

export async function exportClientObligacionesPDF(
  clientName: string,
  clientNit: string,
  obligations: Array<{
    tipo_impuesto: string
    periodicidad: string
    regimen?: string
    fecha_inicio: string
    activo: boolean
    notas?: string
  }>,
  upcomingDates: Array<{
    tipo_impuesto: string
    fecha_vencimiento: string
  }>
) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Encabezado
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, 210, 35, 'F')

  // Banda amarilla decorativa
  doc.setFillColor(...COLORS.accent)
  doc.rect(0, 35, 210, 2, 'F')

  doc.setTextColor(...COLORS.white)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('RESUMEN DE OBLIGACIONES TRIBUTARIAS', 14, 14)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Cliente: ${clientName}`, 14, 22)
  doc.text(`NIT: ${clientNit}`, 14, 29)
  doc.text(getHeader(), 210 - 14, 29, { align: 'right' })

  // Obligaciones activas
  doc.setTextColor(...COLORS.dark)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Obligaciones Tributarias Activas', 14, 47)

  const obligRows = obligations
    .filter(o => o.activo)
    .map(o => [
      o.tipo_impuesto.replace(/_/g, ' '),
      o.periodicidad.toUpperCase(),
      o.regimen ?? '-',
      new Date(o.fecha_inicio).toLocaleDateString('es-CO'),
      o.notas ?? '-',
    ])

  autoTable(doc, {
    startY: 52,
    head: [['Tipo Impuesto', 'Periodicidad', 'Régimen', 'Inicio', 'Notas']],
    body: obligRows,
    theme: 'striped',
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: COLORS.light },
    styles: { cellPadding: 3 },
  })

  // Próximos vencimientos
  if (upcomingDates.length > 0) {
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text('Próximos Vencimientos (30 días)', 14, finalY + 12)

    const dateRows = upcomingDates.map(d => [
      d.tipo_impuesto.replace(/_/g, ' '),
      new Date(d.fecha_vencimiento + 'T00:00').toLocaleDateString('es-CO', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      }),
    ])

    autoTable(doc, {
      startY: finalY + 17,
      head: [['Obligación', 'Fecha de Vencimiento']],
      body: dateRows,
      theme: 'grid',
      headStyles: {
        fillColor: COLORS.accent,
        textColor: COLORS.dark,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: { fontSize: 8, fontStyle: 'bold' },
      styles: { cellPadding: 3 },
    })
  }

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.gray)
    doc.text(`Página ${i} de ${pageCount}`, 210 - 14, 290, { align: 'right' })
    doc.text('CALA ASOCIADOS - Documento confidencial', 14, 290)
  }

  doc.save(`obligaciones-${clientNit}-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ─── Exportar Reporte General ─────────────────────────────────────────────

export async function exportReporteGeneralPDF(data: {
  totalClientes: number
  obligacionesActivas: number
  estadosFinancieros: number
  topObligaciones: Array<[string, number]>
  clientesPorTipo: { persona_juridica: number; persona_natural: number }
}) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Encabezado
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, 210, 35, 'F')
  doc.setFillColor(...COLORS.accent)
  doc.rect(0, 35, 210, 2, 'F')

  doc.setTextColor(...COLORS.white)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('REPORTE EJECUTIVO DEL SISTEMA', 14, 15)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(getHeader(), 210 - 14, 29, { align: 'right' })

  // KPIs
  const kpis = [
    ['Total Clientes Activos', String(data.totalClientes)],
    ['Obligaciones Tributarias Activas', String(data.obligacionesActivas)],
    ['Estados Financieros Registrados', String(data.estadosFinancieros)],
    ['Personas Jurídicas', String(data.clientesPorTipo.persona_juridica)],
    ['Personas Naturales', String(data.clientesPorTipo.persona_natural)],
  ]

  autoTable(doc, {
    startY: 45,
    head: [['Indicador', 'Valor']],
    body: kpis,
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: 'bold' },
    bodyStyles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'center', fontStyle: 'bold', fontSize: 12 } },
    styles: { cellPadding: 4 },
  })

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.dark)
  doc.text('Obligaciones más Comunes', 14, y1 + 14)

  autoTable(doc, {
    startY: y1 + 19,
    head: [['Tipo de Impuesto', 'Nro. Clientes']],
    body: data.topObligaciones.map(([tipo, count]) => [tipo.replace(/_/g, ' '), String(count)]),
    theme: 'striped',
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: COLORS.light },
    columnStyles: { 1: { halign: 'center', fontStyle: 'bold' } },
    styles: { cellPadding: 3 },
  })

  // Footer
  doc.setFontSize(7)
  doc.setTextColor(...COLORS.gray)
  doc.text('CALA ASOCIADOS - Reporte confidencial generado automáticamente', 14, 290)
  doc.text(new Date().toLocaleString('es-CO'), 210 - 14, 290, { align: 'right' })

  doc.save(`reporte-ejecutivo-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ─── Exportar Dashboard Financiero ───────────────────────────────────────────
// Genera un PDF estructurado con KPIs, tendencias e indicadores financieros

export interface DashboardExportData {
  clienteNombre?: string
  periodoReciente?: string
  kpis: {
    ingresos:       number
    utilidadNeta:   number
    utilidadBruta:  number
    ebitdaEst:      number
    totalActivos:   number
    patrimonio:     number
    capitalTrabajo: number
    margenNeto:     number
  }
  trendData: Array<{
    name:     string
    ingresos: number
    gastos:   number
    utilidad: number
    utilOper: number
  }>
  esfTrendData: Array<{
    name:       string
    activos:    number
    pasivos:    number
    patrimonio: number
  }>
  composicionActivos: Array<{ name: string; value: number }>
  composicionPasivos: Array<{ name: string; value: number }>
  indicadores: {
    razon_corriente:     number
    prueba_acida:        number
    nivel_endeudamiento: number
    roa:                 number
    roe:                 number
    margen_bruto:        number
    margen_operacional:  number
    margen_neto:         number
    capital_trabajo:     number
    ebitda_est:          number
  } | null
  radarData: Array<{ subject: string; value: number }>
}

function fmtNum(v: number): string {
  if (v === 0) return '$0'
  const abs = Math.abs(v)
  const prefix = v < 0 ? '-' : ''
  if (abs >= 1e9) return `${prefix}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${prefix}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${prefix}$${(abs / 1e3).toFixed(0)}K`
  return `${prefix}$${abs.toFixed(0)}`
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '' : ''}${v.toFixed(2)}%`
}

export async function exportDashboardPDF(data: DashboardExportData) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const MARGIN = 14

  // ── Página 1: Portada + KPIs + Indicadores ──────────────────────────────
  // Encabezado
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, W, 38, 'F')
  doc.setFillColor(...COLORS.accent)
  doc.rect(0, 38, W, 2, 'F')

  doc.setTextColor(...COLORS.white)
  doc.setFontSize(17)
  doc.setFont('helvetica', 'bold')
  doc.text('ANÁLISIS FINANCIERO', MARGIN, 14)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  if (data.clienteNombre) doc.text(data.clienteNombre, MARGIN, 22)
  if (data.periodoReciente) doc.text(`Período más reciente: ${data.periodoReciente}`, MARGIN, 29)
  doc.text(getHeader(), W - MARGIN, 29, { align: 'right' })

  // ── Sección KPIs ────────────────────────────────────────────────────────
  let y = 48
  doc.setTextColor(...COLORS.dark)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumen de Resultados — Período más reciente', MARGIN, y)
  y += 6

  const kpiRows = [
    ['Ingresos Totales',    fmtNum(data.kpis.ingresos),       'Capital de Trabajo',  fmtNum(data.kpis.capitalTrabajo)],
    ['Utilidad Neta',       fmtNum(data.kpis.utilidadNeta),   'Margen Neto',         fmtPct(data.kpis.margenNeto)],
    ['Utilidad Bruta',      fmtNum(data.kpis.utilidadBruta),  'Total Activos',       fmtNum(data.kpis.totalActivos)],
    ['EBITDA Estimado',     fmtNum(data.kpis.ebitdaEst),      'Patrimonio',          fmtNum(data.kpis.patrimonio)],
  ]

  autoTable(doc, {
    startY: y,
    body: kpiRows,
    theme: 'grid',
    bodyStyles: { fontSize: 9, textColor: COLORS.dark },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 48, fillColor: COLORS.light },
      1: { halign: 'right', fontStyle: 'bold', cellWidth: 42 },
      2: { fontStyle: 'bold', cellWidth: 48, fillColor: COLORS.light },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 42 },
    },
    styles: { cellPadding: 3 },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // ── Sección Indicadores ────────────────────────────────────────────────
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.dark)
  doc.text('Indicadores Financieros Clave', MARGIN, y)
  y += 6

  if (data.indicadores) {
    const ind = data.indicadores
    const indRows = [
      ['Razón Corriente',      `${ind.razon_corriente.toFixed(2)}x`,   '≥ 1.5', ind.razon_corriente    >= 1.5 ? 'OK' : 'REVISAR', 'Liquidez a corto plazo'],
      ['Prueba Ácida',         `${ind.prueba_acida.toFixed(2)}x`,      '≥ 1.0', ind.prueba_acida       >= 1.0 ? 'OK' : 'REVISAR', 'Sin inventarios'],
      ['Endeudamiento',        fmtPct(ind.nivel_endeudamiento),        '< 60%', ind.nivel_endeudamiento < 60  ? 'OK' : 'REVISAR', 'Pasivos / Activos'],
      ['ROA',                  fmtPct(ind.roa),                        '> 5%',  ind.roa                > 5   ? 'OK' : 'REVISAR', 'Retorno sobre Activos'],
      ['ROE',                  fmtPct(ind.roe),                        '> 10%', ind.roe                > 10  ? 'OK' : 'REVISAR', 'Retorno sobre Patrimonio'],
      ['Margen Bruto',         fmtPct(ind.margen_bruto),               '> 30%', ind.margen_bruto       > 30  ? 'OK' : 'REVISAR', 'Ganancia sobre ventas'],
      ['Margen Operacional',   fmtPct(ind.margen_operacional),         '> 10%', ind.margen_operacional > 10  ? 'OK' : 'REVISAR', 'Antes de imp. e intereses'],
      ['Margen Neto',          fmtPct(ind.margen_neto),                '> 5%',  ind.margen_neto        > 5   ? 'OK' : 'REVISAR', 'Utilidad / Ingresos'],
    ]

    autoTable(doc, {
      startY: y,
      head: [['Indicador', 'Valor', 'Meta', 'Estado', 'Descripción']],
      body: indRows,
      theme: 'striped',
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: COLORS.dark },
      alternateRowStyles: { fillColor: COLORS.light },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 42 },
        1: { halign: 'right', fontStyle: 'bold', cellWidth: 26 },
        2: { halign: 'center', cellWidth: 18 },
        3: {
          halign: 'center', fontStyle: 'bold', cellWidth: 22,
        },
        4: { fontSize: 7, cellWidth: 62 },
      },
      styles: { cellPadding: 2.5 },
      didParseCell(hookData) {
        if (hookData.column.index === 3 && hookData.section === 'body') {
          const v = String(hookData.cell.raw)
          hookData.cell.styles.textColor = v === 'OK' ? [22, 163, 74] : [220, 38, 38]
        }
      },
    })
  }

  // ── Página 2: Tendencias ────────────────────────────────────────────────
  if (data.trendData.length > 0) {
    doc.addPage()

    doc.setFillColor(...COLORS.primary)
    doc.rect(0, 0, W, 16, 'F')
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Análisis de Tendencias — Estado de Resultados', MARGIN, 11)

    y = 24

    // Ingresos vs Gastos
    doc.setTextColor(...COLORS.dark)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Ingresos vs Gastos por Período', MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Evolución de ingresos totales frente a gastos operacionales. Un margen positivo indica rentabilidad operativa.', MARGIN, y + 5)
    y += 10

    autoTable(doc, {
      startY: y,
      head: [['Período', 'Ingresos', 'Gastos', 'Utilidad Neta', 'Util. Operacional', 'Margen Neto']],
      body: data.trendData.map(d => [
        d.name,
        fmtNum(d.ingresos),
        fmtNum(d.gastos),
        fmtNum(d.utilidad),
        fmtNum(d.utilOper),
        d.ingresos > 0 ? fmtPct((d.utilidad / d.ingresos) * 100) : '—',
      ]),
      theme: 'grid',
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: COLORS.light },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      styles: { cellPadding: 2.5 },
      didParseCell(hookData) {
        if (hookData.column.index === 3 && hookData.section === 'body') {
          const row = data.trendData[hookData.row.index]
          if (row) hookData.cell.styles.textColor = row.utilidad >= 0 ? [22, 163, 74] : [220, 38, 38]
        }
      },
    })

    y = (doc as any).lastAutoTable.finalY + 10

    if (data.esfTrendData.length > 0) {
      // Estructura Financiera
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.dark)
      doc.text('Estructura Financiera — Balance General por Período', MARGIN, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text('Evolución de activos, pasivos y patrimonio. Patrimonio = Activos − Pasivos.', MARGIN, y + 5)
      y += 10

      autoTable(doc, {
        startY: y,
        head: [['Período', 'Total Activos', 'Total Pasivos', 'Patrimonio', 'Endeudamiento']],
        body: data.esfTrendData.map(d => [
          d.name,
          fmtNum(d.activos),
          fmtNum(d.pasivos),
          fmtNum(d.patrimonio),
          d.activos > 0 ? fmtPct((d.pasivos / d.activos) * 100) : '—',
        ]),
        theme: 'grid',
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: COLORS.light },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right', fontStyle: 'bold' },
          4: { halign: 'right' },
        },
        styles: { cellPadding: 2.5 },
        didParseCell(hookData) {
          if (hookData.column.index === 3 && hookData.section === 'body') {
            const row = data.esfTrendData[hookData.row.index]
            if (row) hookData.cell.styles.textColor = row.patrimonio >= 0 ? [22, 163, 74] : [220, 38, 38]
          }
        },
      })
    }
  }

  // ── Página 3: Composición de activos/pasivos + Radar ───────────────────
  if (data.composicionActivos.length > 0 || data.composicionPasivos.length > 0) {
    doc.addPage()

    doc.setFillColor(...COLORS.primary)
    doc.rect(0, 0, W, 16, 'F')
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Composición del Activo y Estructura de Financiación', MARGIN, 11)

    y = 24
    const totalActivos = data.composicionActivos.reduce((s, d) => s + d.value, 0)
    const totalFinanc  = data.composicionPasivos.reduce((s, d) => s + d.value, 0)

    const leftTable: string[][] = data.composicionActivos.map(d => [
      d.name,
      fmtNum(d.value),
      totalActivos > 0 ? fmtPct((d.value / totalActivos) * 100) : '—',
    ])
    leftTable.push(['TOTAL ACTIVOS', fmtNum(totalActivos), '100%'])

    const rightTable: string[][] = data.composicionPasivos.map(d => [
      d.name,
      fmtNum(d.value),
      totalFinanc > 0 ? fmtPct((d.value / totalFinanc) * 100) : '—',
    ])
    rightTable.push(['TOTAL', fmtNum(totalFinanc), '100%'])

    // Columna izquierda
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text('Composición del Activo', MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('Distribución corriente / no corriente', MARGIN, y + 4)

    autoTable(doc, {
      startY: y + 7,
      head: [['Componente', 'Valor', '%']],
      body: leftTable,
      theme: 'striped',
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: COLORS.light },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { halign: 'right', cellWidth: 30 },
        2: { halign: 'right', fontStyle: 'bold', cellWidth: 20 },
      },
      tableWidth: 112,
      margin: { left: MARGIN },
      styles: { cellPadding: 2 },
    })

    const midY = (doc as any).lastAutoTable.finalY + 10

    // Columna derecha
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text('Estructura de Financiación', W / 2 + 2, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('Pasivos corrientes · otros pasivos · patrimonio', W / 2 + 2, y + 4)

    autoTable(doc, {
      startY: y + 7,
      head: [['Componente', 'Valor', '%']],
      body: rightTable,
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38] as [number,number,number], textColor: COLORS.white, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [255, 242, 242] as [number,number,number] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 55 },
        1: { halign: 'right', cellWidth: 28 },
        2: { halign: 'right', fontStyle: 'bold', cellWidth: 18 },
      },
      tableWidth: 103,
      margin: { left: W / 2 + 2 },
      styles: { cellPadding: 2 },
    })

    y = Math.max(midY, (doc as any).lastAutoTable.finalY) + 10

    // Radar de indicadores
    if (data.radarData.length > 0) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.dark)
      doc.text('Radar de Indicadores de Salud Financiera (0–100)', MARGIN, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text('Valores más altos = mejor desempeño. Liquidez y Solvencia normalizados a escala 100.', MARGIN, y + 5)
      y += 10

      autoTable(doc, {
        startY: y,
        head: [['Dimensión', 'Puntaje / 100', 'Interpretación']],
        body: data.radarData.map(d => [
          d.subject,
          `${d.value.toFixed(1)} / 100`,
          d.value >= 70 ? 'Muy bueno' : d.value >= 50 ? 'Aceptable' : d.value >= 30 ? 'Por mejorar' : 'Crítico',
        ]),
        theme: 'grid',
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: COLORS.light },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 55 },
          1: { halign: 'center', fontStyle: 'bold', cellWidth: 35 },
          2: { halign: 'center', cellWidth: 40 },
        },
        styles: { cellPadding: 3 },
        didParseCell(hookData) {
          if (hookData.column.index === 1 && hookData.section === 'body') {
            const row = data.radarData[hookData.row.index]
            if (row) {
              hookData.cell.styles.textColor =
                row.value >= 70 ? [22, 163, 74] :
                row.value >= 50 ? [234, 179, 8] :
                [220, 38, 38]
            }
          }
        },
      })
    }
  }

  // ── Footer en todas las páginas ────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.gray)
    doc.text(`Página ${i} de ${pageCount}`, W - MARGIN, 290, { align: 'right' })
    doc.text('CALA ASOCIADOS · NIT 800.089.091-5 · Documento confidencial', MARGIN, 290)
    // Línea separadora footer
    doc.setDrawColor(...COLORS.gray)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, 286, W - MARGIN, 286)
  }

  const fecha = new Date().toISOString().split('T')[0]
  doc.save(`dashboard-financiero-${fecha}.pdf`)
}
