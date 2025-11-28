-- Add deleted_at column to professionals table for soft-delete support
ALTER TABLE professionals 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for soft-delete queries (partial index for better performance)
CREATE INDEX IF NOT EXISTS idx_professionals_deleted_at 
ON professionals(deleted_at) WHERE deleted_at IS NULL;

-- Add is_active column to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for active client queries (partial index for better performance)
CREATE INDEX IF NOT EXISTS idx_clients_is_active 
ON clients(is_active) WHERE is_active = true;