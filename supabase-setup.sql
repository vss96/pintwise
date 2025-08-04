-- Supabase setup for Pintwise application
-- Run this SQL in your Supabase SQL Editor to create the required table

-- Create the pint_entries table
CREATE TABLE IF NOT EXISTS pint_entries (
    id BIGSERIAL PRIMARY KEY,
    debtor TEXT NOT NULL,
    creditor TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(10,2) DEFAULT 1.0,
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_paid TIMESTAMPTZ,
    status TEXT DEFAULT 'pending'
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pint_entries_status ON pint_entries(status);
CREATE INDEX IF NOT EXISTS idx_pint_entries_debtor ON pint_entries(debtor);
CREATE INDEX IF NOT EXISTS idx_pint_entries_creditor ON pint_entries(creditor);
CREATE INDEX IF NOT EXISTS idx_pint_entries_date_created ON pint_entries(date_created);

-- Enable Row Level Security (RLS)
ALTER TABLE pint_entries ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for now
-- You can make this more restrictive later if you add authentication
CREATE POLICY "Allow all operations on pint_entries" ON pint_entries
    FOR ALL USING (true);

-- Insert some sample data for testing (optional)
INSERT INTO pint_entries (debtor, creditor, description, amount) VALUES
    ('Alice', 'Bob', 'Lost a bet', 1.0),
    ('Bob', 'Charlie', 'Birthday drinks', 2.0),
    ('Charlie', 'Alice', 'Pub quiz celebration', 1.0)
ON CONFLICT DO NOTHING;
