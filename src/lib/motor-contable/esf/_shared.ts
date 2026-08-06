// src/lib/motor-contable/esf/_shared.ts
// ─────────────────────────────────────────────────────────────
// Constantes y helpers COMPARTIDOS por las hojas del generador nuevo.
// Copiados EXACTOS del generarESF.ts original para no cambiar la apariencia.
// Cada hoja nueva importa de aquí en vez de redefinir colores/estilos.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'

// Colores (idénticos al objeto C del original)
export const C = {
  VERDE_HEADER : 'FF00B050',  // Headers ACTIVO, PASIVO, PATRIMONIO
  ROJO_PERIODO : 'FF903032',  // Columnas año corriente
  AZUL_TOTAL   : 'FF2F75B6',  // Totales principales
  GRIS_SUBTOTAL: 'FFF2F2F2',  // Totales intermedios
  BLANCO       : 'FFFFFFFF',
  NEGRO        : 'FF000000',
  GRIS_TEXTO   : 'FF595959',
  AZUL_LINK    : 'FF0070C0',  // Números de nota
} as const

export const FMT_PESOS = '#,##0;(#,##0);"-"'
export const FMT_PCT   = '0.0%'

// Relleno sólido
export const solid = (argb: string): ExcelJS.Fill =>
  ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

// Fuente (por defecto Arial 9 negro, como la mayoría de hojas; el nombre es
// configurable porque algunas notas usan Calibri).
export const font = (
  bold = false,
  argb: string = C.NEGRO,
  size = 9,
  italic = false,
  name: 'Arial' | 'Calibri' = 'Arial',
): Partial<ExcelJS.Font> => ({ name, bold, italic, color: { argb }, size })

// Alineaciones
export const alnC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
export const alnL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
export const alnR: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }

// Borde fino en las 4 caras
export const bordeThin: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: C.NEGRO } },
  bottom: { style: 'thin', color: { argb: C.NEGRO } },
  left:   { style: 'thin', color: { argb: C.NEGRO } },
  right:  { style: 'thin', color: { argb: C.NEGRO } },
}