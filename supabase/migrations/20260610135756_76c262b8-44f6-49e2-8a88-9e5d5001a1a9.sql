
-- Deduplicate dev_roles by name (repoint targets first), then drop company columns + enum.
WITH ranked AS (
  SELECT id, name, created_at,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at, id) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY name ORDER BY created_at, id) AS keep_id
  FROM public.dev_roles
)
UPDATE public.dev_role_targets t
SET role_id = r.keep_id
FROM ranked r
WHERE t.role_id = r.id AND r.rn > 1;

DELETE FROM public.dev_roles
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at, id) AS rn
    FROM public.dev_roles
  ) x WHERE rn > 1
);

ALTER TABLE public.dev_mandates DROP COLUMN IF EXISTS company;
ALTER TABLE public.dev_roles DROP COLUMN IF EXISTS company;
ALTER TABLE public.dev_role_targets DROP COLUMN IF EXISTS company;
ALTER TABLE public.dev_projects DROP COLUMN IF EXISTS company;

DROP TYPE IF EXISTS public.dev_company;
