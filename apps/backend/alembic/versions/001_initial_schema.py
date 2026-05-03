"""Initial schema: public platform tables + org schema template

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def create_enums():
    """Create PostgreSQL enum types (idempotent via DO block)."""
    enums = [
        ("user_role_enum", "OWNER,PARTNER,PROPERTY_MANAGER,SUPERVISOR,TENANT"),
        ("room_status_enum", "ACTIVE,INACTIVE,UNDER_MAINTENANCE"),
        ("bed_status_enum", "VACANT,OCCUPIED,RESERVED,MAINTENANCE"),
        ("id_type_enum", "AADHAR,PASSPORT,DRIVING_LICENSE,OTHER"),
        ("tenant_status_enum", "ACTIVE,CHECKED_OUT,RESERVED"),
        ("payment_type_enum", "RENT,ADVANCE,DEPOSIT,FOOD,OTHER_CHARGE,REFUND"),
        ("payment_mode_enum", "CASH,UPI,BANK_TRANSFER,CARD,CHEQUE"),
        ("rent_status_enum", "PAID,PARTIAL,UNPAID,WAIVED"),
        ("expense_approval_enum", "PENDING,APPROVED,REJECTED"),
        ("lead_source_enum", "META_AD,INSTAGRAM,REFERRAL,WALKIN,JUSTDIAL,OTHER"),
        ("lead_status_enum", "NEW,CONTACTED,SITE_VISITED,NEGOTIATING,CONVERTED,LOST"),
        ("lead_activity_type_enum", "NOTE,CALL,VISIT,WA_MESSAGE"),
        ("announcement_target_enum", "ALL_TENANTS,FLOOR,ROOM,INDIVIDUAL"),
        ("announcement_status_enum", "DRAFT,SCHEDULED,SENT,FAILED"),
        ("complaint_category_enum", "MAINTENANCE,CLEANLINESS,NOISE,FOOD,SECURITY,OTHER"),
        ("complaint_status_enum", "OPEN,IN_PROGRESS,RESOLVED,CLOSED"),
        ("notif_recipient_type_enum", "TENANT,USER"),
        ("notif_channel_enum", "WHATSAPP,EMAIL,PUSH,SMS"),
        ("notif_status_enum", "SENT,FAILED,PENDING"),
        ("audit_action_enum", "INSERT,UPDATE,DELETE"),
    ]
    for type_name, values in enums:
        quoted = ",".join(f"'{v}'" for v in values.split(","))
        op.execute(f"""
            DO $$ BEGIN
                CREATE TYPE {type_name} AS ENUM ({quoted});
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """)


def create_public_schema_tables():
    """Create platform-level tables in the public schema."""

    # subscription_plans
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.subscription_plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            max_properties INTEGER NOT NULL DEFAULT 1,
            max_tenants_per_property INTEGER NOT NULL DEFAULT 50,
            price_monthly_paise INTEGER NOT NULL DEFAULT 0,
            features_json JSONB NOT NULL DEFAULT '{}',
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # organisations
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.organisations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(200) NOT NULL,
            slug VARCHAR(100) NOT NULL UNIQUE,
            owner_email VARCHAR(255) NOT NULL,
            owner_phone VARCHAR(20) NOT NULL,
            plan_id UUID REFERENCES public.subscription_plans(id),
            plan_expires_at TIMESTAMPTZ,
            trial_ends_at TIMESTAMPTZ,
            whatsapp_number VARCHAR(20),
            whatsapp_phone_number_id VARCHAR(100),
            whatsapp_access_token_secret_arn VARCHAR(500),
            razorpay_key_id VARCHAR(100),
            stripe_customer_id VARCHAR(100),
            stripe_subscription_id VARCHAR(100),
            meta_webhook_secret VARCHAR(200),
            schema_name VARCHAR(100) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_org_slug ON public.organisations(slug)")

    # platform_users (super admins)
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.platform_users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(200) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_superadmin BOOLEAN NOT NULL DEFAULT true,
            is_active BOOLEAN NOT NULL DEFAULT true,
            last_login_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)


def create_org_schema_tables(schema: str):
    """Create all operational tables in an org schema."""

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            name VARCHAR(200) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            email VARCHAR(255),
            password_hash TEXT,
            role user_role_enum NOT NULL DEFAULT 'SUPERVISOR',
            property_access UUID[],
            invite_token VARCHAR(100) UNIQUE,
            invite_token_used BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            last_login_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.properties (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            name VARCHAR(200) NOT NULL,
            address_line1 VARCHAR(300) NOT NULL,
            address_line2 VARCHAR(300),
            city VARCHAR(100) NOT NULL,
            state VARCHAR(100) NOT NULL,
            pincode VARCHAR(10) NOT NULL,
            google_maps_url TEXT,
            amenities_json JSONB NOT NULL DEFAULT '[]',
            logo_url TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.room_types (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id UUID NOT NULL REFERENCES {schema}.properties(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            capacity INTEGER NOT NULL DEFAULT 1,
            monthly_base_rent_paise INTEGER NOT NULL DEFAULT 0,
            amenities_json JSONB NOT NULL DEFAULT '[]',
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.floors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id UUID NOT NULL REFERENCES {schema}.properties(id) ON DELETE CASCADE,
            floor_number INTEGER NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.rooms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            floor_id UUID NOT NULL REFERENCES {schema}.floors(id) ON DELETE CASCADE,
            property_id UUID NOT NULL REFERENCES {schema}.properties(id) ON DELETE CASCADE,
            org_id UUID NOT NULL,
            room_number VARCHAR(20) NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            room_type_id UUID REFERENCES {schema}.room_types(id),
            capacity INTEGER NOT NULL DEFAULT 1,
            monthly_base_rent_paise INTEGER NOT NULL DEFAULT 0,
            amenities_json JSONB NOT NULL DEFAULT '[]',
            status room_status_enum NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.beds (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            room_id UUID NOT NULL REFERENCES {schema}.rooms(id) ON DELETE CASCADE,
            property_id UUID NOT NULL,
            bed_label VARCHAR(20) NOT NULL,
            status bed_status_enum NOT NULL DEFAULT 'VACANT',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.tenants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID NOT NULL REFERENCES {schema}.properties(id),
            bed_id UUID REFERENCES {schema}.beds(id),
            name VARCHAR(200) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            email VARCHAR(255),
            id_type id_type_enum NOT NULL DEFAULT 'AADHAR',
            id_number VARCHAR(50) NOT NULL,
            id_photo_url TEXT,
            id_photo_s3_key TEXT,
            profile_photo_url TEXT,
            profile_photo_s3_key TEXT,
            emergency_contact_name VARCHAR(200) NOT NULL,
            emergency_contact_phone VARCHAR(20) NOT NULL,
            emergency_contact_relation VARCHAR(50) NOT NULL,
            occupation VARCHAR(200),
            employer_name VARCHAR(200),
            hometown VARCHAR(200),
            permanent_address TEXT,
            move_in_date DATE NOT NULL,
            expected_move_out_date DATE,
            actual_move_out_date DATE,
            status tenant_status_enum NOT NULL DEFAULT 'ACTIVE',
            notes TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            is_deleted BOOLEAN NOT NULL DEFAULT false,
            CONSTRAINT uq_tenant_phone_property UNIQUE (phone, property_id)
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.rent_plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES {schema}.tenants(id),
            property_id UUID NOT NULL,
            monthly_rent_paise INTEGER NOT NULL,
            security_deposit_paise INTEGER NOT NULL DEFAULT 0,
            advance_paid_paise INTEGER NOT NULL DEFAULT 0,
            discount_amount_paise INTEGER NOT NULL DEFAULT 0,
            discount_reason TEXT,
            food_included BOOLEAN NOT NULL DEFAULT false,
            food_charges_paise INTEGER NOT NULL DEFAULT 0,
            other_charges_json JSONB NOT NULL DEFAULT '[]',
            billing_day INTEGER NOT NULL DEFAULT 1,
            effective_from DATE NOT NULL,
            effective_to DATE,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID NOT NULL,
            tenant_id UUID NOT NULL REFERENCES {schema}.tenants(id),
            amount_paise INTEGER NOT NULL,
            payment_type payment_type_enum NOT NULL,
            payment_mode payment_mode_enum NOT NULL DEFAULT 'CASH',
            reference_number VARCHAR(200),
            upi_id VARCHAR(100),
            for_month INTEGER,
            for_year INTEGER,
            collected_by UUID,
            collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            receipt_url TEXT,
            receipt_s3_key TEXT,
            notes TEXT,
            idempotency_key VARCHAR(100) UNIQUE,
            is_deleted BOOLEAN NOT NULL DEFAULT false,
            deleted_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.rent_ledger_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES {schema}.tenants(id),
            property_id UUID NOT NULL,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            amount_due_paise INTEGER NOT NULL,
            amount_paid_paise INTEGER NOT NULL DEFAULT 0,
            status rent_status_enum NOT NULL DEFAULT 'UNPAID',
            due_date DATE NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ledger_tenant_month_year UNIQUE (tenant_id, month, year)
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.expense_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id UUID NOT NULL REFERENCES {schema}.properties(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            icon_name VARCHAR(50) NOT NULL DEFAULT 'receipt',
            is_default BOOLEAN NOT NULL DEFAULT false,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.expenses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID NOT NULL,
            category_id UUID NOT NULL REFERENCES {schema}.expense_categories(id),
            amount_paise INTEGER NOT NULL,
            description TEXT,
            vendor_name VARCHAR(200),
            purchased_by UUID,
            purchase_date DATE NOT NULL,
            bill_photo_url TEXT,
            bill_photo_s3_key TEXT,
            payment_mode payment_mode_enum NOT NULL DEFAULT 'CASH',
            reference_number VARCHAR(200),
            approval_status expense_approval_enum NOT NULL DEFAULT 'PENDING',
            approved_by UUID,
            approved_at TIMESTAMPTZ,
            rejection_reason TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            is_deleted BOOLEAN NOT NULL DEFAULT false
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.leads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID NOT NULL,
            name VARCHAR(200) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            whatsapp_number VARCHAR(20),
            source lead_source_enum NOT NULL DEFAULT 'OTHER',
            source_campaign_name VARCHAR(200),
            interested_room_type VARCHAR(100),
            interested_bed_count INTEGER,
            budget_min_paise INTEGER,
            budget_max_paise INTEGER,
            expected_move_in_date DATE,
            status lead_status_enum NOT NULL DEFAULT 'NEW',
            lost_reason TEXT,
            assigned_to UUID,
            notes TEXT,
            last_contacted_at TIMESTAMPTZ,
            next_followup_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            converted_tenant_id UUID,
            is_deleted BOOLEAN NOT NULL DEFAULT false
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.lead_activities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            lead_id UUID NOT NULL REFERENCES {schema}.leads(id) ON DELETE CASCADE,
            activity_type lead_activity_type_enum NOT NULL,
            notes TEXT,
            scheduled_at TIMESTAMPTZ,
            done_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.announcements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID NOT NULL,
            title VARCHAR(200) NOT NULL,
            body TEXT NOT NULL,
            target_type announcement_target_enum NOT NULL DEFAULT 'ALL_TENANTS',
            target_ids UUID[],
            channels TEXT[] NOT NULL DEFAULT '{{}}',
            scheduled_at TIMESTAMPTZ,
            sent_at TIMESTAMPTZ,
            status announcement_status_enum NOT NULL DEFAULT 'DRAFT',
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.complaints (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL,
            property_id UUID NOT NULL,
            org_id UUID NOT NULL,
            category complaint_category_enum NOT NULL,
            description TEXT NOT NULL,
            photo_url TEXT,
            photo_s3_key TEXT,
            status complaint_status_enum NOT NULL DEFAULT 'OPEN',
            assigned_to UUID,
            response_note TEXT,
            resolved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.notification_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID,
            recipient_type notif_recipient_type_enum NOT NULL,
            recipient_id UUID NOT NULL,
            channel notif_channel_enum NOT NULL,
            template_name VARCHAR(100) NOT NULL,
            message_body TEXT NOT NULL,
            status notif_status_enum NOT NULL DEFAULT 'PENDING',
            external_message_id VARCHAR(200),
            error_message TEXT,
            sent_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID,
            actor_id UUID NOT NULL,
            actor_role VARCHAR(50) NOT NULL,
            action audit_action_enum NOT NULL,
            table_name VARCHAR(100) NOT NULL,
            record_id UUID NOT NULL,
            old_values JSONB,
            new_values JSONB,
            ip_address VARCHAR(45),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # Indexes
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{schema.replace('.','_')}_tenants_property ON {schema}.tenants(property_id, status)")
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{schema.replace('.','_')}_payments_period ON {schema}.payments(property_id, for_year, for_month)")
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{schema.replace('.','_')}_ledger_period ON {schema}.rent_ledger_entries(property_id, year, month)")
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{schema.replace('.','_')}_expenses_date ON {schema}.expenses(property_id, purchase_date)")


def seed_subscription_plans():
    """Insert default subscription plans."""
    op.execute("""
        INSERT INTO public.subscription_plans (name, max_properties, max_tenants_per_property, price_monthly_paise, features_json, is_active)
        VALUES
            ('Starter', 1, 50, 99900, '{"reports": "basic", "whatsapp": true, "leads": false}', true),
            ('Growth', 5, 200, 249900, '{"reports": "full", "whatsapp": true, "leads": true, "bulk_import": true}', true),
            ('Enterprise', 999, 9999, 0, '{"reports": "full", "whatsapp": true, "leads": true, "bulk_import": true, "white_label": true, "api_access": true}', true)
        ON CONFLICT DO NOTHING
    """)


def upgrade() -> None:
    create_enums()
    create_public_schema_tables()
    seed_subscription_plans()
    # Org schemas are created dynamically on signup via provision_org_schema()


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.platform_users CASCADE")
    op.execute("DROP TABLE IF EXISTS public.organisations CASCADE")
    op.execute("DROP TABLE IF EXISTS public.subscription_plans CASCADE")
