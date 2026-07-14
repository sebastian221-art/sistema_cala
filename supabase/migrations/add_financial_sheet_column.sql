-- Agregar columna 'hoja' a financial_statements para identificar la hoja de Excel
-- Permite distinguir ESF / ERI / NOTAS ESF / NOTAS ERI del mismo archivo

ALTER TABLE financial_statements
  ADD COLUMN IF NOT EXISTS hoja TEXT;

-- Agregar columna 'nombre_archivo' para rastrear el archivo fuente
ALTER TABLE financial_statements
  ADD COLUMN IF NOT EXISTS nombre_archivo TEXT;

-- Comentario: los valores esperados de 'hoja' son:
-- 'ESF'       → Estado de Situación Financiera (tipo = 'balance')
-- 'ERI'       → Estado de Resultados Integrales (tipo = 'pyg')
-- 'NOTAS ESF' → Notas al Estado de Situación Financiera (tipo = 'balance')
-- 'NOTAS ERI' → Notas al Estado de Resultados (tipo = 'pyg')
