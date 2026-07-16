"""
Org schema provisioning — called on signup to create all tables
in the new org_{uuid} schema.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_org_schema_name


DEFAULT_EXPENSE_CATEGORIES = [
    {"name": "Groceries", "icon_name": "shopping-cart", "sort_order": 1},
    {"name": "Vegetables", "icon_name": "leaf", "sort_order": 2},
    {"name": "Electricity", "icon_name": "zap", "sort_order": 3},
    {"name": "Water", "icon_name": "droplets", "sort_order": 4},
    {"name": "Maintenance", "icon_name": "wrench", "sort_order": 5},
    {"name": "Salary", "icon_name": "user", "sort_order": 6},
    {"name": "Internet", "icon_name": "wifi", "sort_order": 7},
    {"name": "Cleaning", "icon_name": "sparkles", "sort_order": 8},
    {"name": "Miscellaneous", "icon_name": "package", "sort_order": 9},
]


async def provision_org_schema(org_id: UUID, db: AsyncSession) -> str:
    """
    Create all operational tables in org_{uuid} schema.
    Called once on organisation signup.
    """
    schema = get_org_schema_name(org_id)

    # Create enum types (created once globally)
    enum_types = [
        # MARKETING = lead/onboarding-focused rep. Can add + work leads, do
        # tenant check-ins, view vacant beds; NO financial totals, NO settings,
        # NO ROI/dashboard money widgets.
        ("user_role_enum", "'OWNER','PARTNER','PROPERTY_MANAGER','SUPERVISOR','MARKETING','TENANT'"),
        ("room_status_enum", "'ACTIVE','INACTIVE','UNDER_MAINTENANCE'"),
        ("bed_status_enum", "'VACANT','OCCUPIED','RESERVED','MAINTENANCE'"),
        ("id_type_enum", "'AADHAR','PASSPORT','DRIVING_LICENSE','OTHER'"),
        ("tenant_status_enum", "'ACTIVE','CHECKED_OUT','RESERVED'"),
        ("payment_type_enum", "'RENT','ADVANCE','DEPOSIT','FOOD','OTHER_CHARGE','REFUND','POWER'"),
        ("payment_mode_enum", "'CASH','UPI','BANK_TRANSFER','CARD','CHEQUE'"),
        ("rent_status_enum", "'PAID','PARTIAL','UNPAID','WAIVED'"),
        ("expense_approval_enum", "'PENDING','APPROVED','REJECTED'"),
        ("lead_source_enum", "'META_AD','INSTAGRAM','REFERRAL','WALKIN','JUSTDIAL','WEBSITE','OTHER'"),
        # BOOKED sits between NEGOTIATING and CONVERTED: rep received an
        # advance payment, tenant hasn't physically moved in yet. Actual
        # tenant-record creation flips the status to CONVERTED.
        ("lead_status_enum", "'NEW','CONTACTED','SITE_VISITED','NEGOTIATING','BOOKED','CONVERTED','LOST'"),
        ("lead_activity_type_enum", "'NOTE','CALL','VISIT','WA_MESSAGE'"),
        ("announcement_target_enum", "'ALL_TENANTS','FLOOR','ROOM','INDIVIDUAL'"),
        ("announcement_status_enum", "'DRAFT','SCHEDULED','SENT','FAILED'"),
        ("complaint_category_enum", "'MAINTENANCE','CLEANLINESS','NOISE','FOOD','SECURITY','OTHER'"),
        ("complaint_status_enum", "'OPEN','IN_PROGRESS','RESOLVED','CLOSED'"),
        ("notif_recipient_type_enum", "'TENANT','USER'"),
        ("notif_channel_enum", "'WHATSAPP','EMAIL','PUSH','SMS'"),
        ("notif_status_enum", "'SENT','FAILED','PENDING'"),
        ("audit_action_enum", "'INSERT','UPDATE','DELETE'"),
        ("booking_kind_enum", "'DAILY','ADVANCE'"),
        ("vehicle_type_enum", "'NONE','TWO_WHEELER','FOUR_WHEELER'"),
        ("team_role_enum", "'OWNER','MANAGER','COLLECTOR'"),
        (
            "inbox_event_kind_enum",
            "'COMPLAINT_NEW','COMPLAINT_REOPENED','NOTICE_GIVEN','KYC_UPDATED','FEEDBACK','OTHER'",
        ),
    ]

    for type_name, values in enum_types:
        await db.execute(
            text(f"DO $$ BEGIN CREATE TYPE {type_name} AS ENUM ({values}); EXCEPTION WHEN duplicate_object THEN null; END $$")
        )
    # If the enum was created by an older provisioning run, CREATE TYPE
    # above is a no-op and any new values silently never appear. Backfill
    # them with idempotent ADD VALUE IF NOT EXISTS.
    await db.execute(text("ALTER TYPE payment_type_enum ADD VALUE IF NOT EXISTS 'POWER'"))
    await db.execute(text(
        "ALTER TYPE lead_status_enum ADD VALUE IF NOT EXISTS 'BOOKED' AFTER 'NEGOTIATING'"
    ))
    await db.execute(text(
        "ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'MARKETING'"
    ))
    await db.commit()

    # All DDL for org schema tables
    ddl_statements = [
        f"""CREATE TABLE IF NOT EXISTS "{schema}".users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            name VARCHAR(200) NOT NULL,
            phone VARCHAR(20) NOT NULL UNIQUE,
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
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".properties (
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
            settlement_day INTEGER NOT NULL DEFAULT 10,
            whatsapp_phone_number_id VARCHAR(100),
            whatsapp_access_token_secret_arn VARCHAR(500),
            whatsapp_access_token TEXT,  -- plaintext fallback when no Secrets Manager
            whatsapp_number VARCHAR(20),
            upi_vpa VARCHAR(100),        -- UPI handle for {{5}} in rent_reminder
            -- Optional Meta template overrides; NULL → use defaults in notification_service.TEMPLATES.
            wa_rent_reminder_template_name VARCHAR(200),
            wa_rent_reminder_template_language VARCHAR(20),
            wa_rent_reminder_template_params JSONB,
            wa_rent_overdue_template_name VARCHAR(200),
            wa_rent_overdue_template_language VARCHAR(20),
            wa_rent_overdue_template_params JSONB,
            wa_rent_reminder_template_body TEXT,
            wa_rent_overdue_template_body TEXT,
            -- ROI payback plan (all optional; set via ROI page).
            -- Break-even model:
            --   G × P_grace + (T − G) × P_regular = investment
            --   P_regular = P_grace − lessor_rent
            -- so we only need investment + target + grace + lessor_rent to
            -- solve for both period profits.
            roi_investment_paise BIGINT,
            roi_target_months INTEGER,
            roi_grace_months INTEGER,
            roi_lessor_rent_paise BIGINT,
            roi_plan_start_date DATE,
            roi_lease_term_months INTEGER,
            roi_annual_rent_hike_pct NUMERIC(5,2),
            -- Per-year hike ladder for uneven year-over-year increases
            -- (e.g. 5%/5%/6% for a 3-year lease). Index i = hike from
            -- year (i+1) → year (i+2). Length ≈ lease_years-1. NULL →
            -- fall back to the flat roi_annual_rent_hike_pct above.
            roi_annual_hikes JSONB,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".billing_periods (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE,
            period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
            period_year INTEGER NOT NULL,
            close_date DATE,
            opening_balance_paise BIGINT NOT NULL DEFAULT 0,
            closed_at TIMESTAMPTZ,
            closed_by UUID,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_billing_period_pmy UNIQUE (property_id, period_month, period_year)
        )""",
        # Per-property team roster: owners get share_pct; managers + collectors
        # populate the Paid To / Paid By dropdowns. Kept separate from `users`
        # (which are staff logins) — some collectors don't have logins.
        # See [[project-team-roster]].
        # Per-month actual profit override for the ROI payback tracker.
        # If a row exists for (property, year, month), the payback tracker
        # uses this figure verbatim instead of computing net income from
        # payments − expenses. Used when the owner joined PGManage mid-cycle
        # and needs to backfill history their books already know.
        f"""CREATE TABLE IF NOT EXISTS "{schema}".payback_monthly_actual (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE,
            period_year INTEGER NOT NULL,
            period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
            actual_profit_paise BIGINT NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_payback_actual_pmy UNIQUE (property_id, period_year, period_month)
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".property_team (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE,
            name VARCHAR(200) NOT NULL,
            phone VARCHAR(20),
            role team_role_enum NOT NULL,
            share_pct NUMERIC(5,2) CHECK (share_pct >= 0 AND share_pct <= 100),
            capital_paise BIGINT CHECK (capital_paise >= 0),
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".room_types (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            capacity INTEGER NOT NULL DEFAULT 1,
            monthly_base_rent_paise INTEGER NOT NULL DEFAULT 0,
            amenities_json JSONB NOT NULL DEFAULT '[]',
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".floors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE,
            floor_number INTEGER NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".rooms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            floor_id UUID NOT NULL REFERENCES "{schema}".floors(id) ON DELETE CASCADE,
            property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE,
            org_id UUID NOT NULL,
            room_number VARCHAR(20) NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            room_type_id UUID REFERENCES "{schema}".room_types(id),
            capacity INTEGER NOT NULL DEFAULT 1,
            monthly_base_rent_paise INTEGER NOT NULL DEFAULT 0,
            amenities_json JSONB NOT NULL DEFAULT '[]',
            status room_status_enum NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".beds (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            room_id UUID NOT NULL REFERENCES "{schema}".rooms(id) ON DELETE CASCADE,
            property_id UUID NOT NULL,
            bed_label VARCHAR(20) NOT NULL,
            status bed_status_enum NOT NULL DEFAULT 'VACANT',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".tenants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID NOT NULL REFERENCES "{schema}".properties(id),
            bed_id UUID REFERENCES "{schema}".beds(id),
            name VARCHAR(200) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            email VARCHAR(255),
            id_type id_type_enum NOT NULL DEFAULT 'AADHAR',
            id_number VARCHAR(50) NOT NULL,
            id_photo_url TEXT, id_photo_s3_key TEXT,
            profile_photo_url TEXT, profile_photo_s3_key TEXT,
            emergency_contact_name VARCHAR(200) NOT NULL,
            emergency_contact_phone VARCHAR(20) NOT NULL,
            emergency_contact_relation VARCHAR(50) NOT NULL,
            occupation VARCHAR(200), employer_name VARCHAR(200),
            hometown VARCHAR(200), permanent_address TEXT,
            move_in_date DATE NOT NULL,
            expected_move_out_date DATE, actual_move_out_date DATE,
            notice_given_date DATE,
            status tenant_status_enum NOT NULL DEFAULT 'ACTIVE',
            vehicle_type vehicle_type_enum NOT NULL DEFAULT 'NONE',
            vehicle_registration VARCHAR(20),
            notes TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            is_deleted BOOLEAN NOT NULL DEFAULT false,
            CONSTRAINT uq_tenant_phone_property UNIQUE (phone, property_id)
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".rent_plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES "{schema}".tenants(id),
            property_id UUID NOT NULL,
            monthly_rent_paise INTEGER NOT NULL,
            security_deposit_paise INTEGER NOT NULL DEFAULT 0,
            advance_paid_paise INTEGER NOT NULL DEFAULT 0,
            non_refundable_advance_paise INTEGER NOT NULL DEFAULT 0,
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
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID NOT NULL,
            tenant_id UUID REFERENCES "{schema}".tenants(id),
            amount_paise INTEGER NOT NULL,
            discount_paise INTEGER NOT NULL DEFAULT 0,
            for_days INTEGER,
            payment_type payment_type_enum NOT NULL,
            payment_mode payment_mode_enum NOT NULL DEFAULT 'CASH',
            reference_number VARCHAR(200), upi_id VARCHAR(100),
            paid_to VARCHAR(255),
            for_month INTEGER, for_year INTEGER,
            collected_by UUID,
            collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            receipt_url TEXT, receipt_s3_key TEXT,
            notes TEXT,
            idempotency_key VARCHAR(100) UNIQUE,
            is_deleted BOOLEAN NOT NULL DEFAULT false,
            deleted_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".rent_ledger_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES "{schema}".tenants(id),
            property_id UUID NOT NULL,
            month INTEGER NOT NULL, year INTEGER NOT NULL,
            amount_due_paise INTEGER NOT NULL,
            amount_paid_paise INTEGER NOT NULL DEFAULT 0,
            discount_paise INTEGER NOT NULL DEFAULT 0,
            status rent_status_enum NOT NULL DEFAULT 'UNPAID',
            due_date DATE NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_ledger_tenant_month_year UNIQUE (tenant_id, month, year)
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".expense_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            icon_name VARCHAR(50) NOT NULL DEFAULT 'receipt',
            is_default BOOLEAN NOT NULL DEFAULT false,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".expenses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL, property_id UUID NOT NULL,
            category_id UUID NOT NULL REFERENCES "{schema}".expense_categories(id),
            amount_paise INTEGER NOT NULL,
            description TEXT, vendor_name VARCHAR(200),
            paid_by VARCHAR(255),
            purchased_by UUID, purchase_date DATE NOT NULL,
            bill_photo_url TEXT, bill_photo_s3_key TEXT,
            receipt_path VARCHAR(500),
            payment_mode payment_mode_enum NOT NULL DEFAULT 'CASH',
            reference_number VARCHAR(200),
            approval_status expense_approval_enum NOT NULL DEFAULT 'PENDING',
            approved_by UUID, approved_at TIMESTAMPTZ,
            rejection_reason TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            is_deleted BOOLEAN NOT NULL DEFAULT false
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".leads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL, property_id UUID NOT NULL,
            name VARCHAR(200) NOT NULL, phone VARCHAR(20) NOT NULL,
            email VARCHAR(255),
            whatsapp_number VARCHAR(20),
            source lead_source_enum NOT NULL DEFAULT 'OTHER',
            source_campaign_name VARCHAR(200),
            interested_room_type VARCHAR(100), interested_bed_count INTEGER,
            budget_min_paise INTEGER, budget_max_paise INTEGER,
            expected_move_in_date DATE,
            status lead_status_enum NOT NULL DEFAULT 'NEW',
            lost_reason TEXT, assigned_to UUID, notes TEXT,
            last_contacted_at TIMESTAMPTZ, next_followup_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            converted_tenant_id UUID,
            -- Rep or owner who first entered this lead (nullable so
            -- webhook-created leads work without an actor).
            created_by UUID,
            -- Advance payment received at BOOKED status. Just a snapshot on
            -- the lead — the actual payment row will still go into the
            -- payments table once the tenant record exists.
            advance_paise BIGINT,
            advance_paid_at TIMESTAMPTZ,
            -- Ad-attribution columns for future Meta webhook wiring.
            -- source_campaign_name already exists above; these fill the
            -- rest of the ad identity.
            source_ad_id VARCHAR(200),
            source_adset_name VARCHAR(200),
            is_deleted BOOLEAN NOT NULL DEFAULT false
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".lead_activities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            lead_id UUID NOT NULL REFERENCES "{schema}".leads(id) ON DELETE CASCADE,
            activity_type lead_activity_type_enum NOT NULL,
            notes TEXT, scheduled_at TIMESTAMPTZ, done_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".announcements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL, property_id UUID NOT NULL,
            title VARCHAR(200) NOT NULL, body TEXT NOT NULL,
            target_type announcement_target_enum NOT NULL DEFAULT 'ALL_TENANTS',
            target_ids UUID[], channels TEXT[] NOT NULL DEFAULT '{{}}',
            scheduled_at TIMESTAMPTZ, sent_at TIMESTAMPTZ,
            status announcement_status_enum NOT NULL DEFAULT 'DRAFT',
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".complaints (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL, property_id UUID NOT NULL, org_id UUID NOT NULL,
            category complaint_category_enum NOT NULL, description TEXT NOT NULL,
            photo_url TEXT, photo_s3_key TEXT,
            status complaint_status_enum NOT NULL DEFAULT 'OPEN',
            assigned_to UUID, response_note TEXT, resolved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".notification_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL, property_id UUID,
            recipient_type notif_recipient_type_enum NOT NULL,
            recipient_id UUID NOT NULL,
            channel notif_channel_enum NOT NULL,
            template_name VARCHAR(100) NOT NULL, message_body TEXT NOT NULL,
            status notif_status_enum NOT NULL DEFAULT 'PENDING',
            external_message_id VARCHAR(200), error_message TEXT,
            recipient_phone VARCHAR(20), rendered_message TEXT,
            delivery_status VARCHAR(20), delivered_at TIMESTAMPTZ,
            sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL, property_id UUID,
            actor_id UUID NOT NULL, actor_role VARCHAR(50) NOT NULL,
            action audit_action_enum NOT NULL,
            table_name VARCHAR(100) NOT NULL, record_id UUID NOT NULL,
            old_values JSONB, new_values JSONB, ip_address VARCHAR(45),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        # High-level semantic activity feed (audit dashboard + tenant timeline).
        # Distinct from audit_log above, which stores low-level row diffs.
        f"""CREATE TABLE IF NOT EXISTS "{schema}".activity_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            actor_user_id UUID, actor_role VARCHAR(20),
            actor_name VARCHAR(200), actor_ip VARCHAR(45),
            event_type VARCHAR(80) NOT NULL, event_category VARCHAR(40) NOT NULL,
            description TEXT NOT NULL,
            entity_type VARCHAR(40), entity_id UUID, entity_name VARCHAR(200),
            property_id UUID, property_name VARCHAR(200),
            tenant_id UUID,
            metadata JSONB DEFAULT '{{}}'
        )""",
        f'CREATE INDEX IF NOT EXISTS idx_activity_log_actor_user_id ON "{schema}".activity_log(actor_user_id, created_at DESC)',
        f'CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_id ON "{schema}".activity_log(tenant_id, created_at DESC)',
        f'CREATE INDEX IF NOT EXISTS idx_activity_log_event_type ON "{schema}".activity_log(event_type, created_at DESC)',
        f'CREATE INDEX IF NOT EXISTS idx_activity_log_event_category ON "{schema}".activity_log(event_category, created_at DESC)',
        f'CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON "{schema}".activity_log(created_at DESC)',
        # Bookings (daily stays + advance/future bookings). Mirrors migrations 007/008.
        # Weekly menu uploads (per property). One active row per
        # (property, week_start_date) — enforced by the partial unique
        # index below. See migration 021 for full notes.
        f"""CREATE TABLE IF NOT EXISTS "{schema}".menu_uploads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID NOT NULL REFERENCES "{schema}".properties(id),
            week_start_date DATE NOT NULL,
            s3_key TEXT NOT NULL,
            content_type VARCHAR(100) NOT NULL,
            original_filename TEXT,
            title VARCHAR(200),
            is_active BOOLEAN NOT NULL DEFAULT true,
            uploaded_by UUID,
            uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE UNIQUE INDEX IF NOT EXISTS menu_uploads_active_uk
            ON "{schema}".menu_uploads(property_id, week_start_date)
            WHERE is_active = true""",
        # Unified inbox feed of tenant-initiated events. See migration 022.
        f"""CREATE TABLE IF NOT EXISTS "{schema}".tenant_inbox_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID,
            tenant_id UUID,
            kind inbox_event_kind_enum NOT NULL,
            summary VARCHAR(500) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            deep_link VARCHAR(300),
            read_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        f"""CREATE INDEX IF NOT EXISTS tenant_inbox_events_unread_idx
            ON "{schema}".tenant_inbox_events(created_at DESC)
            WHERE read_at IS NULL""",
        f"""CREATE TABLE IF NOT EXISTS "{schema}".bookings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL,
            property_id UUID NOT NULL REFERENCES "{schema}".properties(id) ON DELETE CASCADE,
            guest_name TEXT NOT NULL,
            guest_phone TEXT,
            room_label TEXT NOT NULL,
            kind booking_kind_enum NOT NULL,
            amount_paise INTEGER NOT NULL,
            check_in_date DATE NOT NULL,
            check_out_date DATE,
            payment_mode payment_mode_enum NOT NULL DEFAULT 'CASH',
            reference_number TEXT,
            collected_at DATE NOT NULL,
            collected_by UUID,
            paid_to TEXT,
            notes TEXT,
            is_deleted BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
    ]

    for stmt in ddl_statements:
        await db.execute(text(stmt))

    await db.commit()
    return schema
