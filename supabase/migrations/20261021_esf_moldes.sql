-- ════════════════════════════════════════════════════════════════════════
-- ESF por molde: la contadora sube su ESF histórico, el sistema lo aprende
-- y cada mes solo agrega la columna nueva. Una fila por versión del ESF.
-- Ejecutar en Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.esf_moldes (
  id             uuid primary key default gen_random_uuid(),
  nit            text not null,
  nombre_empresa text,
  anio           int,
  mes            int,
  label          text,
  origen         text not null default 'aprendido',   -- 'aprendido' | 'extendido'
  archivo_path   text not null,                        -- ruta en el bucket esf-moldes
  molde_json     jsonb,                                -- molde aprendido (reglas por celda)
  reporte_json   jsonb,                                -- reporte de cruce / revisión
  creado_por     uuid references auth.users(id),
  creado_en      timestamptz not null default now()
);

create index if not exists esf_moldes_nit_idx on public.esf_moldes (nit, anio desc, mes desc, creado_en desc);

alter table public.esf_moldes enable row level security;

drop policy if exists "esf_moldes_select" on public.esf_moldes;
create policy "esf_moldes_select" on public.esf_moldes
  for select to authenticated using (true);

drop policy if exists "esf_moldes_insert" on public.esf_moldes;
create policy "esf_moldes_insert" on public.esf_moldes
  for insert to authenticated with check (true);

drop policy if exists "esf_moldes_delete" on public.esf_moldes;
create policy "esf_moldes_delete" on public.esf_moldes
  for delete to authenticated using (true);

-- Bucket privado para los Excel (pesan varios MB; no van en la tabla)
insert into storage.buckets (id, name, public)
values ('esf-moldes', 'esf-moldes', false)
on conflict (id) do nothing;

-- El API usa el service role para leer/escribir el bucket, así que no hacen
-- falta políticas de storage para usuarios. Si prefieres acceso directo desde
-- el cliente, agrega políticas sobre storage.objects para bucket_id = 'esf-moldes'.