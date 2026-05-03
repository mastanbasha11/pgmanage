-- PGManage database initialisation script
-- Run once against a fresh PostgreSQL 16 instance before running Alembic migrations.
-- Usage: psql -U postgres -f scripts/init-db.sql

-- Create application database
CREATE DATABASE pgmanage
  ENCODING 'UTF8'
  LC_COLLATE 'en_US.utf8'
  LC_CTYPE 'en_US.utf8'
  TEMPLATE template0;

-- Create application user
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pgmanage') THEN
    CREATE ROLE pgmanage WITH LOGIN PASSWORD 'pgmanage_dev_only';
  END IF;
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE pgmanage TO pgmanage;

\connect pgmanage

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- fast ILIKE search on tenant names/phones

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO pgmanage;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO pgmanage;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO pgmanage;

-- Platform admin user (used by super admin panel only)
-- This user has NO access to any org schema
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pgmanage_readonly') THEN
    CREATE ROLE pgmanage_readonly WITH LOGIN PASSWORD 'readonly_dev_only';
  END IF;
END
$$;
GRANT CONNECT ON DATABASE pgmanage TO pgmanage_readonly;
GRANT USAGE ON SCHEMA public TO pgmanage_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pgmanage_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO pgmanage_readonly;

\echo 'Database initialisation complete. Run: alembic upgrade head'
