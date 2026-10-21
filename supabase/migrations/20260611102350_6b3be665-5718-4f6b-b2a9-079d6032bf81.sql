
-- Rename milestone titles for vacancy/terms_sent across all campaigns
UPDATE campaign_milestones SET title = 'Vacancies in Play' WHERE type = 'vacancy' AND title IN ('Vacancies Taken On','Vacancy Taken','Vacancy Taken On');
UPDATE campaign_milestones SET title = 'Terms Sent' WHERE type = 'terms_sent' AND title IN ('Terms Requested','Terms Requested + Callback');

-- Week 5 of Q2 Tester Campaign: exceeded (2/1)
UPDATE campaign_weekly_goals SET published_achieved = 2 WHERE id = 'ebe8a151-bd55-4dc3-8f6e-fb94bdd93487';

-- Convert demo meeting job_roles to objects with salary so the client modal can render salaries
UPDATE meetings SET job_roles = '[{"title":"Senior Backend Engineer","salary":110000,"currency":"GBP"},{"title":"Engineering Manager","salary":130000,"currency":"GBP"}]'::jsonb WHERE company_name = 'Acme Talent Group';
UPDATE meetings SET job_roles = '[{"title":"Senior Mechanical Engineer","salary":75000,"currency":"GBP"},{"title":"Project Engineer","salary":65000,"currency":"GBP"},{"title":"Design Engineer","salary":58000,"currency":"GBP"}]'::jsonb WHERE company_name = 'Pinnacle Engineering';
UPDATE meetings SET job_roles = '[{"title":"Senior Wealth Manager","salary":95000,"currency":"GBP"},{"title":"Paraplanner","salary":52000,"currency":"GBP"}]'::jsonb WHERE company_name = 'Ashdown Wealth Partners';
UPDATE meetings SET job_roles = '[{"title":"General Manager","salary":75000,"currency":"GBP"},{"title":"Head Chef","salary":62000,"currency":"GBP"}]'::jsonb WHERE company_name = 'Lakeside Hospitality Group';

-- Ashdown: store terms_fees as clean plain text (was raw JSON string)
UPDATE meetings SET terms_fees = 'Standard placement fee: 22% of first-year base salary. Rebate scheme: 100% within 4 weeks, 50% within 8 weeks, 25% within 12 weeks. Invoice on offer acceptance, payable on candidate start date. Net 14 days. Exclusive 4-week engagement on Senior Wealth Manager role.' WHERE company_name = 'Ashdown Wealth Partners';
