ALTER TABLE public.pre_disco_research ALTER COLUMN company_name DROP NOT NULL;
ALTER TABLE public.pre_disco_research ALTER COLUMN company_name SET DEFAULT NULL;