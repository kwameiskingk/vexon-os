-- Grant Elena access to the new Ops Command workspace
INSERT INTO public.user_capabilities (user_id, capability)
VALUES ('916e451a-9e25-4e27-89ab-a5f3374d81ac', 'can_view_ops_command')
ON CONFLICT DO NOTHING;