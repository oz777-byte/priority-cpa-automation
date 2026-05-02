-- =====================================================================
-- Storage bucket for invoice PDFs (private; signed URLs only).
--
-- Path convention: <company_id>/<uuid>.pdf
-- Application access: through service_role admin client (bypasses RLS).
-- The policy below is defense-in-depth for any direct user-token access.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoice-pdfs',
  'invoice-pdfs',
  false,
  10 * 1024 * 1024,
  array['application/pdf']
)
on conflict (id) do nothing;

-- Authenticated users can read PDFs of companies in their firm(s).
drop policy if exists "tenant users read invoice pdfs" on storage.objects;
create policy "tenant users read invoice pdfs"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'invoice-pdfs'
  and (storage.foldername(name))[1] in (
    select c.id::text
      from companies c
      join user_firms uf on uf.firm_id = c.firm_id
     where uf.user_id = auth.uid()
  )
);

-- All writes (insert/update/delete) go through the service_role client.
-- Block anonymous access.
drop policy if exists "block anon write" on storage.objects;
create policy "block anon write"
on storage.objects
for all
to anon
using (false)
with check (false);
