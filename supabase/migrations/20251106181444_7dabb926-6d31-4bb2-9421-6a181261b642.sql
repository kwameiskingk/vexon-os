-- Add team_network_member column to sales_discovery_logs table
ALTER TABLE sales_discovery_logs 
ADD COLUMN team_network_member boolean DEFAULT false;