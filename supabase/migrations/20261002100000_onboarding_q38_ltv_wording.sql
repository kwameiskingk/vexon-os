-- 2 Oct 2026 (Daniel): question 38 of the client onboarding form asks for average
-- LTV in GBP for a 50-500 headcount client. Same question id (client_12m_value),
-- so existing responses and the Close push keep mapping. Safe to run twice.
UPDATE public.forms f
SET schema = jsonb_set(f.schema, ARRAY['questions', (q.idx - 1)::text, 'title'],
      to_jsonb('What is the average LTV (lifetime value) in GBP for a new client that is between 50 - 500 employee headcount?'::text))
FROM (
  SELECT f2.id, t.idx FROM public.forms f2,
    jsonb_array_elements(f2.schema->'questions') WITH ORDINALITY AS t(q, idx)
  WHERE f2.slug = 'client-onboarding' AND t.q->>'id' = 'client_12m_value'
) q
WHERE f.id = q.id;

UPDATE public.forms f
SET published_schema = jsonb_set(f.published_schema, ARRAY['questions', (q.idx - 1)::text, 'title'],
      to_jsonb('What is the average LTV (lifetime value) in GBP for a new client that is between 50 - 500 employee headcount?'::text))
FROM (
  SELECT f2.id, t.idx FROM public.forms f2,
    jsonb_array_elements(f2.published_schema->'questions') WITH ORDINALITY AS t(q, idx)
  WHERE f2.slug = 'client-onboarding' AND t.q->>'id' = 'client_12m_value'
) q
WHERE f.id = q.id AND f.published_schema IS NOT NULL;
