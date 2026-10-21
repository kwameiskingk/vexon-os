
-- Drop and recreate category check to include recognition and career
ALTER TABLE public.achievement_definitions DROP CONSTRAINT achievement_definitions_category_check;
ALTER TABLE public.achievement_definitions ADD CONSTRAINT achievement_definitions_category_check 
  CHECK (category = ANY (ARRAY['streak', 'quantity', 'quality', 'improvement', 'milestone', 'recognition', 'career']));

-- Now insert the missing achievements
-- Setter of the Day (bronze)
INSERT INTO public.achievement_definitions (key, name, description, icon, color, category, tier, target_role, sort_order, criteria, is_active, is_permanent)
VALUES ('setter_of_the_day', 'Setter of the Day', 'Book the most meetings in your department today', 'star', 'orange', 'recognition', 'bronze', 'setter', 200, '{"type": "top_performer_daily"}', true, false)
ON CONFLICT (key) DO NOTHING;

-- Setter of the Week (silver) - update existing
UPDATE public.achievement_definitions SET tier = 'silver', sort_order = 201, category = 'recognition' WHERE key = 'setter_of_the_week';

-- Setter of the Month (gold)
INSERT INTO public.achievement_definitions (key, name, description, icon, color, category, tier, target_role, sort_order, criteria, is_active, is_permanent)
VALUES ('setter_of_the_month', 'Setter of the Month', 'Book the most meetings in your department this month', 'trophy', 'gold', 'recognition', 'gold', 'setter', 202, '{"type": "top_performer_monthly"}', true, false)
ON CONFLICT (key) DO NOTHING;

-- Remove Rising Star
UPDATE public.achievement_definitions SET is_active = false WHERE key = 'rising_star';

-- Bronze dial achievement (500 dials/week)
INSERT INTO public.achievement_definitions (key, name, description, icon, color, category, tier, target_role, sort_order, criteria, is_active)
VALUES ('dial_grinder_bronze', 'Dial Starter', 'Hit 500 dials in a week', 'phone', 'orange', 'quantity', 'bronze', 'setter', 70, '{"type": "weekly_dials", "target": 500}', true)
ON CONFLICT (key) DO NOTHING;

-- Reliability Pro tiers
UPDATE public.achievement_definitions SET tier = 'bronze', sort_order = 130, criteria = '{"type": "show_rate", "target": 70, "min_meetings": 5}'::jsonb, description = 'Achieve 70% show rate in a month' WHERE key = 'reliability_pro';

INSERT INTO public.achievement_definitions (key, name, description, icon, color, category, tier, target_role, sort_order, criteria, is_active)
VALUES 
  ('reliability_pro_silver', 'Reliability Pro', 'Achieve 80% show rate in a month', 'shield', 'slate', 'quality', 'silver', 'setter', 131, '{"type": "show_rate", "target": 80, "min_meetings": 5}', true),
  ('reliability_pro_gold', 'Reliability Pro', 'Achieve 90% show rate in a month', 'shield', 'gold', 'quality', 'gold', 'setter', 132, '{"type": "show_rate", "target": 90, "min_meetings": 5}', true)
ON CONFLICT (key) DO NOTHING;

-- Client Champion tiers (career category)
UPDATE public.achievement_definitions SET category = 'career', tier = 'bronze', criteria = '{"type": "client_testimonials", "target": 1}'::jsonb, description = 'Secure 1 client testimonial' WHERE key = 'client_champion';

INSERT INTO public.achievement_definitions (key, name, description, icon, color, category, tier, target_role, sort_order, criteria, is_active, is_permanent)
VALUES 
  ('client_champion_silver', 'Client Champion', 'Secure 2 client testimonials', 'heart', 'purple', 'career', 'silver', 'setter', 301, '{"type": "client_testimonials", "target": 2}', true, true),
  ('client_champion_gold', 'Client Champion', 'Secure 3 client testimonials', 'heart', 'gold', 'career', 'gold', 'setter', 302, '{"type": "client_testimonials", "target": 3}', true, true)
ON CONFLICT (key) DO NOTHING;
