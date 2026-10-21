
-- Add missing silver tier for dial streaks
INSERT INTO achievement_definitions (key, name, description, icon, color, category, tier, target_role, target_department, is_permanent, reset_period, criteria, is_active, sort_order)
VALUES ('acq_streak_silver', 'Dial Machine', 'Hit your dial target 5 days in a row', 'phone', 'slate', 'streak', 'silver', 'setter', NULL, false, 'monthly', '{"type":"streak","metric":"dials_made","compare_to_target":true,"threshold":5}', true, 8);

-- Add missing silver for weekly dials
INSERT INTO achievement_definitions (key, name, description, icon, color, category, tier, target_role, target_department, is_permanent, reset_period, criteria, is_active, sort_order)
VALUES ('acq_weekly_dials_silver', 'Dial Grinder', 'Make 850+ dials in a week', 'phone-call', 'slate', 'quantity', 'silver', 'setter', NULL, false, 'weekly', '{"type":"cumulative","metric":"dials_made","period":"week","threshold":850}', true, 10);

-- Add missing silver for weekly target
INSERT INTO achievement_definitions (key, name, description, icon, color, category, tier, target_role, target_department, is_permanent, reset_period, criteria, is_active, sort_order)
VALUES ('ful_weekly_target_silver', 'Target Smasher', 'Hit 125% of your weekly meetings target', 'target', 'slate', 'quantity', 'silver', 'setter', 'fulfilment', false, 'weekly', '{"type":"cumulative","metric":"meetings_booked","period":"week","threshold_pct":125}', true, 5);

-- Talk Time Achievements (bronze, silver, gold)
INSERT INTO achievement_definitions (key, name, description, icon, color, category, tier, target_role, target_department, is_permanent, reset_period, criteria, is_active, sort_order)
VALUES 
('talk_time_streak_bronze', 'Talk Time Warrior', 'Hit your 90-min talk time target 3 days in a row', 'activity', 'orange', 'streak', 'bronze', 'setter', NULL, false, 'monthly', '{"type":"streak","metric":"talk_time","compare_to_target":true,"threshold":3}', true, 20),
('talk_time_streak_silver', 'Conversation Pro', 'Hit your 90-min talk time target 5 days in a row', 'activity', 'slate', 'streak', 'silver', 'setter', NULL, false, 'monthly', '{"type":"streak","metric":"talk_time","compare_to_target":true,"threshold":5}', true, 21),
('talk_time_streak_gold', 'Phone Dominator', 'Hit your 90-min talk time target 7 days in a row', 'activity', 'amber', 'streak', 'gold', 'setter', NULL, false, 'monthly', '{"type":"streak","metric":"talk_time","compare_to_target":true,"threshold":7}', true, 22);

-- Client Testimonial Achievement (admin-approved, fulfilment setters)
INSERT INTO achievement_definitions (key, name, description, icon, color, category, tier, target_role, target_department, is_permanent, reset_period, criteria, is_active, sort_order)
VALUES ('client_testimonial', 'Client Champion', 'Secure a client testimonial after booking 3-5 meetings for a client', 'heart', 'rose', 'quality', NULL, 'setter', 'fulfilment', true, NULL, '{"type":"admin_approved","trigger":"client_testimonial","min_meetings_for_client":3}', true, 25);

-- Setter of the Week Achievement (weekly, admin-approved)
INSERT INTO achievement_definitions (key, name, description, icon, color, category, tier, target_role, target_department, is_permanent, reset_period, criteria, is_active, sort_order)
VALUES ('setter_of_the_week', 'Setter of the Week', 'Book the most meetings in your department this week', 'star', 'amber', 'quantity', 'gold', 'setter', NULL, false, 'weekly', '{"type":"admin_approved","trigger":"most_meetings_weekly","scope":"department"}', true, 26);

-- Now reorder all achievements for proper grouping (bronze → silver → gold per family)
-- Meeting streaks: sort 1, 2, 3
UPDATE achievement_definitions SET sort_order = 1 WHERE key = 'ful_streak_bronze';
UPDATE achievement_definitions SET sort_order = 2 WHERE key = 'ful_streak_silver';
UPDATE achievement_definitions SET sort_order = 3 WHERE key = 'ful_streak_gold';

-- Weekly meeting targets: sort 4, 5, 6
UPDATE achievement_definitions SET sort_order = 4 WHERE key = 'ful_weekly_target_bronze';
UPDATE achievement_definitions SET sort_order = 5 WHERE key = 'ful_weekly_target_silver';
UPDATE achievement_definitions SET sort_order = 6 WHERE key = 'ful_weekly_target_gold';

-- Dial streaks: sort 7, 8, 9
UPDATE achievement_definitions SET sort_order = 7 WHERE key = 'acq_streak_bronze';
UPDATE achievement_definitions SET sort_order = 8 WHERE key = 'acq_streak_silver';
UPDATE achievement_definitions SET sort_order = 9 WHERE key = 'acq_streak_gold';

-- Weekly dials: sort 10, 11, 12
UPDATE achievement_definitions SET sort_order = 10 WHERE key = 'acq_weekly_dials_bronze';
UPDATE achievement_definitions SET sort_order = 11 WHERE key = 'acq_weekly_dials_silver';
UPDATE achievement_definitions SET sort_order = 12 WHERE key = 'acq_weekly_dials_gold';

-- Talk time streaks: sort 13, 14, 15
UPDATE achievement_definitions SET sort_order = 13 WHERE key = 'talk_time_streak_bronze';
UPDATE achievement_definitions SET sort_order = 14 WHERE key = 'talk_time_streak_silver';
UPDATE achievement_definitions SET sort_order = 15 WHERE key = 'talk_time_streak_gold';

-- Quality/Other: sort 16+
UPDATE achievement_definitions SET sort_order = 16 WHERE key = 'ful_show_rate';
UPDATE achievement_definitions SET sort_order = 17 WHERE key = 'acq_show_rate';
UPDATE achievement_definitions SET sort_order = 18 WHERE key = 'acq_improvement';
UPDATE achievement_definitions SET sort_order = 19 WHERE key = 'setter_deal_closed_client_won';
UPDATE achievement_definitions SET sort_order = 20 WHERE key = 'client_testimonial';
UPDATE achievement_definitions SET sort_order = 21 WHERE key = 'setter_of_the_week';

-- AE achievements: sort 30+
UPDATE achievement_definitions SET sort_order = 30 WHERE key = 'ae_discovery_king';
UPDATE achievement_definitions SET sort_order = 31 WHERE key = 'ae_closer_elite';
