-- Discovery call qualification, 22 Sep 2026 (Marcus, morning goal-setting call
-- + his WhatsApp list).
--
-- Out: the total-addressable-market question ("more than 1,000 companies in
-- your sector") and the start-timeline question. Both stop being asked; their
-- columns stay so historic meetings still read correctly.
--
-- In, as qualification: capacity for another 5-10 workable vacancies a month
-- (a "no" means they are not a qualified lead) and whether the agency is
-- industry led or candidate led.
--
-- In, as information gathering: these three never disqualify anyone, they just
-- tell the AE what they are walking into.

alter table public.meetings
  add column if not exists capacity_5_10 boolean,
  add column if not exists agency_led text,
  add column if not exists vacancies_from_new_clients_last_month text,
  add column if not exists bd_bottleneck text,
  add column if not exists target_job_titles text;

comment on column public.meetings.capacity_5_10 is
  'Could they take on another 5-10 workable vacancies each month? false = not a qualified lead (Marcus, 17 + 22 Sep 2026).';
comment on column public.meetings.agency_led is
  'Industry led (all roles in one industry) or candidate led (one role across industries).';

-- The public discovery-call booking form. Matched by slug so this is safe to
-- re-run; the client-specific events keep their own (empty) question lists.
update public.booking_event_types
set questions = '[
  {"id":"q-revenue","type":"dropdown","required":true,
   "label":"Roughly what was your revenue in the last 12 months?",
   "options":["Under £300,000","£300,000-£1 million","£1 million-£5 million","£5 million-£10 million","£10 million+"]},
  {"id":"q-dm","type":"yes_no","required":true,"options":[],
   "label":"Are you the only decision maker in the company?"},
  {"id":"q-capacity","type":"yes_no","required":true,"options":[],
   "label":"Could you take on an additional 5 to 10 workable vacancies each month?"},
  {"id":"q-led","type":"dropdown","required":true,
   "label":"Do you place all types of roles within one industry, or one type of role across lots of industries?",
   "options":["All types of roles within one industry","One type of role across lots of industries","Both"]},
  {"id":"q-vacancies-last-month","type":"short_text","required":false,"options":[],
   "label":"How many vacancies from new clients did you get last month?"},
  {"id":"q-bottleneck","type":"long_text","required":false,"options":[],
   "label":"What, in your opinion, is your biggest bottleneck with business development currently?"},
  {"id":"q-job-titles","type":"short_text","required":false,"options":[],
   "label":"What type of job titles would you like to get vacancies for?"}
]'::jsonb
where slug = 'discovery-call-with-recruitment-revenue';

select slug, jsonb_array_length(questions) as questions
from public.booking_event_types
where slug = 'discovery-call-with-recruitment-revenue';
