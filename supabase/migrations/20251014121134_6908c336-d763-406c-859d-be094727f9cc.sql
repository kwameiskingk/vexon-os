-- Insert dummy setters (users will be created through auth, this is just for reference)
-- Note: In practice, setters should be created through proper auth signup

-- Insert dummy clients
INSERT INTO public.clients (company_name, contact_name, email, mobile, industry, company_size, country, health_status, company_website)
VALUES 
  ('Acme Recruitment', 'John Smith', 'john@acmerecruitment.com', '+1-555-0101', 'Recruitment', '50-200', 'United States', 'healthy', 'https://acmerecruitment.com'),
  ('Horizon Talent', 'Sarah Johnson', 'sarah@horizontalent.com', '+1-555-0102', 'Talent Acquisition', '200-500', 'Canada', 'low', 'https://horizontalent.com'),
  ('Vertex HR', 'Michael Brown', 'michael@vertexhr.com', '+1-555-0103', 'Human Resources', '20-50', 'United Kingdom', 'healthy', 'https://vertexhr.com')
ON CONFLICT DO NOTHING;

-- Insert dummy meetings (setter_id needs to be replaced with actual setter user ids after creation)
-- For now, we'll add a comment noting this needs to be updated after setters are created
-- These are placeholders that should be updated once you have real setter accounts

-- Insert dummy warm leads (setter_id needs to be replaced with actual setter user ids)
-- These are also placeholders

-- Note: To properly seed setter-related data, you need to:
-- 1. Create setter accounts through the auth signup flow
-- 2. Assign them the 'setter' role via user_roles table
-- 3. Then use their user IDs to create meetings and leads