-- ============================================================
-- Storage Setup para Unisol - Bucket de manuales originales
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

-- 1) Crear bucket "manuales-originales" si no existe
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manuales-originales',
  'manuales-originales',
  true,
  52428800, -- 50 MB por archivo
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'application/msword'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Policy de lectura publica (Postgres no soporta IF NOT EXISTS en policies, asi que dropeamos primero)
drop policy if exists "Publica lectura de manuales originales" on storage.objects;
create policy "Publica lectura de manuales originales"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'manuales-originales');

-- 3) Insercion: la hace SIEMPRE el server con service_role (no necesita policy abierta).
