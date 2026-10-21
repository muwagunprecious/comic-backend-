-- Slum Art Foundation - Largest Collaborative Comic Book Project
-- Database Schema for PostgreSQL / Supabase / Neon / Supabase DB

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_reference VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  date_of_birth DATE,
  comic_format VARCHAR(20) NOT NULL CHECK (comic_format IN ('digital', 'physical')),
  physical_fulfilment VARCHAR(20) CHECK (physical_fulfilment IN ('delivery', 'pickup')),
  delivery_address TEXT,
  delivery_instructions TEXT,
  privacy_consent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  payment_reference VARCHAR(100) UNIQUE NOT NULL,
  gateway VARCHAR(30) NOT NULL DEFAULT 'paystack',
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 1000),
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  payment_status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'successful', 'failed', 'cancelled')),
  gateway_transaction_id VARCHAR(150),
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fulfilment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  fulfilment_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (fulfilment_status IN ('pending', 'processing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled')),
  delivery_fee NUMERIC(10, 2) DEFAULT 0.00,
  collection_location TEXT,
  tracking_reference VARCHAR(150),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed default campaign configuration
INSERT INTO campaign_settings (key, value) VALUES
('general', '{
  "campaign_name": "Largest Collaborative Comic Book Project",
  "organization": "Slum Art Foundation",
  "min_donation_ngn": 1000,
  "popup_enabled": true,
  "popup_trigger": "first_visit",
  "pickup_location": "Slum Art Foundation Hub, Lagos, Nigeria (Exact address and collection schedule will be confirmed via SMS/Phone)",
  "contact_email": "info@slumart.org",
  "contact_phone": "+234 800 SLUM ART",
  "lead_artist": "Adetunwase Adenle (4X Guinness World Record Holder)",
  "cause": "PET Bottle School & Playground Construction across African Schools"
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Index for fast reference lookups
CREATE INDEX IF NOT EXISTS idx_reg_reference ON registrations(registration_reference);
CREATE INDEX IF NOT EXISTS idx_pay_reference ON payments(payment_reference);
CREATE INDEX IF NOT EXISTS idx_pay_status ON payments(payment_status);
