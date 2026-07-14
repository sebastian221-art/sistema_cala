-- Migración: agregar política RLS DELETE para administradores en tax_calendar
-- Corrige el problema de duplicados al reimportar el calendario
-- Ejecutar en: Supabase Dashboard → SQL Editor

CREATE POLICY "tax_calendar_delete_admin" ON tax_calendar
  FOR DELETE USING (get_user_role() = 'administrador');
