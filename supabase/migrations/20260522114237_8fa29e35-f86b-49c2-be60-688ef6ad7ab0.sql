CREATE TABLE public.setter_useful_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'acquisition',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.setter_useful_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active useful links"
ON public.setter_useful_links FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Dev can insert useful links"
ON public.setter_useful_links FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Dev can update useful links"
ON public.setter_useful_links FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Dev can delete useful links"
ON public.setter_useful_links FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'dev'));

CREATE TRIGGER update_setter_useful_links_updated_at
BEFORE UPDATE ON public.setter_useful_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();