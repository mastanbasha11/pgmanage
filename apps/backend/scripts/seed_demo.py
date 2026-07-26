"""
Seed a rich, attractive DEMO organisation to showcase the staff app and the
resident portal to prospects — a fully-populated PG that reads like a real,
well-run property.

Idempotent: re-running drops the demo org's schema and rebuilds it from
scratch, so the demo always starts clean. Touches ONLY the demo org (slug
`greenview-demo`) and its demo tenant identities — never any real data.

Run inside the backend container:
    poetry run python -m scripts.seed_demo

Login afterwards:
    Staff app  (app.pgmanage.in) — email  demo@pgmanage.in   password DemoView@2026
    Resident   (my.pgmanage.in)  — phone  +919000000001  (OTP shows on screen)
                                    phone  +919000000002  (all paid — the calm state)
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text

from app.core.database import AsyncSessionLocal, set_schema
from app.core.security import get_password_hash
from app.models.schemas_migration import provision_org_schema

SLUG = "greenview-demo"
OWNER_EMAIL = "demo@pgmanage.in"
OWNER_PASSWORD = "DemoView@2026"
TODAY = date.today()
NOW = datetime.now(timezone.utc)


def u() -> str:
    return str(uuid.uuid4())


def months_back(n: int) -> tuple[int, int]:
    """(month, year) n months before this one."""
    m = TODAY.month - n
    y = TODAY.year
    while m <= 0:
        m += 12
        y -= 1
    return m, y


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # ── 1. reset any existing demo org ─────────────────────────────────────
        prev = (
            await db.execute(
                text("SELECT id, schema_name FROM public.organisations WHERE slug = :s"),
                {"s": SLUG},
            )
        ).fetchone()
        if prev:
            old_id, old_schema = prev
            await db.execute(text(f'DROP SCHEMA IF EXISTS "{old_schema}" CASCADE'))
            await db.execute(
                text("DELETE FROM public.tenant_identity_links WHERE org_id = :o"),
                {"o": str(old_id)},
            )
            await db.execute(text("DELETE FROM public.organisations WHERE id = :o"), {"o": str(old_id)})
            await db.commit()
        # Orphan demo identities (phones we own) — clear so the reset is total.
        await db.execute(
            text("DELETE FROM public.tenant_identity WHERE phone LIKE '+91900000000%'")
        )
        await db.commit()

        # ── 2. org + schema ────────────────────────────────────────────────────
        org_id = u()
        schema = f"org_{org_id.replace('-', '_')}"
        plan_id = (
            await db.execute(
                text("SELECT id FROM public.subscription_plans WHERE is_active = true LIMIT 1")
            )
        ).scalar()
        await db.execute(
            text("""
                INSERT INTO public.organisations
                    (id, name, slug, owner_email, owner_phone, plan_id, schema_name,
                     is_active, approved_at, trial_ends_at, plan_expires_at)
                VALUES
                    (:id, :name, :slug, :email, :phone, :plan, :schema,
                     true, NOW(), :future, :future)
            """),
            {
                "id": org_id, "name": "Greenview Coliving", "slug": SLUG,
                "email": OWNER_EMAIL, "phone": "+919000000000", "plan": plan_id,
                "schema": schema, "future": NOW + timedelta(days=3650),
            },
        )
        await db.commit()
        await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        await db.commit()
        await provision_org_schema(uuid.UUID(org_id), db)
        await set_schema(db, schema)

        async def ins(sql: str, params: dict) -> None:
            await db.execute(text(sql), params)

        # ── 3. staff users ─────────────────────────────────────────────────────
        pw = get_password_hash(OWNER_PASSWORD)
        owner_id, partner_id, sup_id, mkt_id = u(), u(), u(), u()
        await ins(
            """INSERT INTO users (id, org_id, name, phone, email, password_hash, role, is_active)
               VALUES (:id,:org,'Aarav Mehta','+919000000000',:email,:pw,'OWNER',true)""",
            {"id": owner_id, "org": org_id, "email": OWNER_EMAIL, "pw": pw},
        )
        for uid, name, phone, email, role in [
            (partner_id, "Priya Nair", "+919000000010", "priya@greenview.demo", "PARTNER"),
            (sup_id, "Ramesh Kumar", "+919000000011", "ramesh@greenview.demo", "SUPERVISOR"),
            (mkt_id, "Neha Sharma", "+919000000012", "neha@greenview.demo", "MARKETING"),
        ]:
            await ins(
                """INSERT INTO users (id, org_id, name, phone, email, password_hash, role, is_active)
                   VALUES (:id,:org,:name,:phone,:email,:pw,CAST(:role AS user_role_enum),true)""",
                {"id": uid, "org": org_id, "name": name, "phone": phone, "email": email, "pw": pw, "role": role},
            )

        # ── 4. property + floors + room types ──────────────────────────────────
        prop_id = u()
        await ins(
            """INSERT INTO properties (id, org_id, name, address_line1, city, state, pincode, is_active)
               VALUES (:id,:org,'Greenview Coliving','142, 27th Main, HSR Layout','Bengaluru','Karnataka','560102',true)""",
            {"id": prop_id, "org": org_id},
        )
        await ins("UPDATE properties SET settlement_day = 5 WHERE id = :id", {"id": prop_id})

        floors = {}
        for n, name in [(0, "Ground Floor"), (1, "1st Floor"), (2, "2nd Floor"), (3, "3rd Floor")]:
            fid = u()
            floors[n] = fid
            await ins(
                "INSERT INTO floors (id, property_id, floor_number, display_name) VALUES (:id,:pid,:n,:nm)",
                {"id": fid, "pid": prop_id, "n": n, "nm": name},
            )

        # room_number, floor, type label, capacity, monthly rent (paise), has_ac
        ROOMS = [
            ("101", 0, "2-Share AC", 2, 1200000, True),
            ("102", 0, "2-Share AC", 2, 1200000, True),
            ("103", 0, "3-Share AC", 3, 900000, True),
            ("201", 1, "Single AC", 1, 1800000, True),
            ("202", 1, "2-Share AC", 2, 1200000, True),
            ("203", 1, "3-Share AC", 3, 900000, True),
            ("204", 1, "2-Share Non-AC", 2, 900000, False),
            ("301", 2, "2-Share AC", 2, 1200000, True),
            ("302", 2, "3-Share AC", 3, 900000, True),
            ("303", 2, "Single AC", 1, 1800000, True),
        ]
        beds: list[dict] = []  # {id, room, label, rent, type, floor, ac, status}
        for room_no, fl, rtype, cap, rent, ac in ROOMS:
            rid = u()
            await ins(
                """INSERT INTO rooms (id, floor_id, property_id, org_id, room_number, display_name,
                       capacity, monthly_base_rent_paise, has_ac)
                   VALUES (:id,:fid,:pid,:org,:rn,:dn,:cap,:rent,:ac)""",
                {"id": rid, "fid": floors[fl], "pid": prop_id, "org": org_id, "rn": room_no,
                 "dn": f"Room {room_no}", "cap": cap, "rent": rent, "ac": ac},
            )
            for i in range(cap):
                bid = u()
                label = chr(ord("A") + i)
                await ins(
                    "INSERT INTO beds (id, room_id, property_id, bed_label, status) VALUES (:id,:rid,:pid,:l,'VACANT')",
                    {"id": bid, "rid": rid, "pid": prop_id, "l": label},
                )
                beds.append({"id": bid, "room": room_no, "label": label, "rent": rent,
                             "type": rtype, "floor": fl, "ac": ac})

        # ── 5. expense categories ──────────────────────────────────────────────
        cats = {}
        for name, icon in [("Groceries", "shopping-cart"), ("Salaries", "users"),
                           ("Electricity", "zap"), ("Maintenance", "wrench"),
                           ("Gas", "flame"), ("Internet", "wifi"), ("Water", "droplet")]:
            cid = u()
            cats[name] = cid
            await ins(
                """INSERT INTO expense_categories (id, property_id, name, icon_name, is_default, sort_order)
                   VALUES (:id,:pid,:nm,:ic,true,:so)""",
                {"id": cid, "pid": prop_id, "nm": name, "ic": icon, "so": len(cats)},
            )

        # ── 6. tenants + rent plans (fill ~80% of beds) ────────────────────────
        NAMES = [
            ("Rohit Sharma", "Software Engineer", "Infosys"),
            ("Ananya Reddy", "UX Designer", "Freshworks"),
            ("Karthik Iyer", "Student", "Christ University"),
            ("Sneha Patil", "Data Analyst", "Flipkart"),
            ("Vikram Singh", "Sales Manager", "Razorpay"),
            ("Meera Krishnan", "Doctor", "Manipal Hospital"),
            ("Arjun Nair", "Product Manager", "Swiggy"),
            ("Divya Menon", "Student", "IIM Bangalore"),
            ("Rahul Verma", "DevOps Engineer", "PhonePe"),
            ("Pooja Hegde", "Content Writer", "Zerodha"),
            ("Sagar Menon", "Consultant", "Deloitte"),
            ("Nisha Gupta", "HR Executive", "Wipro"),
            ("Sandeep Joshi", "Architect", "Self-employed"),
            ("Kavya Shetty", "Marketing Lead", "Myntra"),
            ("Tarun Bhat", "Student", "PES University"),
            ("Ishita Das", "Accountant", "KPMG"),
        ]
        tenants: list[dict] = []
        for i, (name, occ, emp) in enumerate(NAMES):
            bed = beds[i]  # fill first N beds
            bed["status"] = "OCCUPIED"
            tid = u()
            # First two residents are the portal-demo logins — clean numbers that
            # match the reset-cleanup pattern (+91900000000%). Rest are generated.
            phone = f"+91900000000{i + 1}" if i < 2 else f"+9199000{10000 + i:05d}"
            months_stayed = [11, 9, 8, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1][i]
            move_in = TODAY - timedelta(days=months_stayed * 30 + 4)
            on_notice = i in (4, 11)  # two residents on notice
            notice_date = TODAY - timedelta(days=8) if on_notice else None
            move_out = TODAY + timedelta(days=22) if on_notice else None
            deposit = bed["rent"] * 2
            food = i % 3 == 0
            await ins(
                """INSERT INTO tenants (id, org_id, property_id, bed_id, name, phone, email,
                       id_type, id_number, emergency_contact_name, emergency_contact_phone,
                       emergency_contact_relation, occupation, employer_name, move_in_date,
                       expected_move_out_date, notice_given_date, status)
                   VALUES (:id,:org,:pid,:bed,:name,:phone,:email,'AADHAR',:idn,
                       :ecn,:ecp,'Parent',:occ,:emp,:min,:mout,:ndate,'ACTIVE')""",
                {"id": tid, "org": org_id, "pid": prop_id, "bed": bed["id"], "name": name,
                 "phone": phone, "email": f"{name.split()[0].lower()}@example.com",
                 "idn": f"{4000_0000_0000 + i}", "ecn": name.split()[0] + " (parent)",
                 "ecp": f"+9198000{20000 + i:05d}", "occ": occ, "emp": emp,
                 "min": move_in, "mout": move_out, "ndate": notice_date},
            )
            await ins(
                """INSERT INTO rent_plans (tenant_id, property_id, monthly_rent_paise,
                       security_deposit_paise, advance_paid_paise, food_included, food_charges_paise,
                       billing_day, effective_from, is_active)
                   VALUES (:tid,:pid,:rent,:dep,:adv,:food,:fc,5,:eff,true)""",
                {"tid": tid, "pid": prop_id, "rent": bed["rent"], "dep": deposit,
                 "adv": bed["rent"] if i % 4 == 0 else 0, "food": food,
                 "fc": 250000 if food else 0, "eff": move_in},
            )
            await ins("UPDATE beds SET status='OCCUPIED' WHERE id=:id", {"id": bed["id"]})
            tenants.append({"id": tid, "name": name, "phone": phone, "rent": bed["rent"],
                            "food": food, "deposit": deposit, "bed": bed})

        # A couple of beds RESERVED (advance bookings arriving) for the vacancy view.
        for bed in beds[len(NAMES):len(NAMES) + 2]:
            await ins("UPDATE beds SET status='RESERVED' WHERE id=:id", {"id": bed["id"]})

        # ── 7. rent ledger + payments (3 months) ───────────────────────────────
        # Current month mostly paid (healthy collection); two prior months all paid.
        # Tenant 0 = overdue (rich Pay screen); tenant 1 = fully paid (calm state).
        modes = ["UPI", "UPI", "BANK_TRANSFER", "CASH", "UPI"]
        for mi in range(3):
            month, year = months_back(mi)
            due = date(year, month, 5)
            for ti, t in enumerate(tenants):
                base = t["rent"] + (t["food"] and 250000 or 0)
                if mi == 0:  # current month
                    if ti == 0:
                        paid, status = 0, "UNPAID"           # overdue demo tenant
                    elif ti in (3, 9):
                        paid, status = base // 2, "PARTIAL"  # part-paid
                    elif ti in (6, 13):
                        paid, status = 0, "UNPAID"           # still due
                    else:
                        paid, status = base, "PAID"
                else:
                    paid, status = base, "PAID"
                await ins(
                    """INSERT INTO rent_ledger_entries (tenant_id, property_id, month, year,
                           amount_due_paise, amount_paid_paise, status, due_date)
                       VALUES (:tid,:pid,:m,:y,:due,:paid,CAST(:st AS rent_status_enum),:dd)""",
                    {"tid": t["id"], "pid": prop_id, "m": month, "y": year, "due": base,
                     "paid": paid, "st": status, "dd": due},
                )
                if paid > 0:
                    mode = modes[ti % len(modes)]
                    collected = due + timedelta(days=(ti % 4))
                    online = ti % 5 == 0
                    await ins(
                        """INSERT INTO payments (org_id, property_id, tenant_id, amount_paise,
                               payment_type, payment_mode, reference_number, paid_to,
                               for_month, for_year, collected_at, collected_by, idempotency_key)
                           VALUES (:org,:pid,:tid,:amt,'RENT',CAST(:mode AS payment_mode_enum),
                               :ref,:paidto,:m,:y,:col,:by,:idem)""",
                        {"org": org_id, "pid": prop_id, "tid": t["id"], "amt": paid,
                         "mode": "UPI" if online else mode,
                         "ref": f"rzp_demo{mi}{ti}" if online else f"{mode[:3]}/{year}{month:02d}/{ti:03d}",
                         "paidto": "Online (Razorpay)" if online else "Front desk",
                         "m": month, "y": year, "col": collected, "by": sup_id,
                         "idem": u()},
                    )

        # ── 8. expenses (current month, some pending approval) ─────────────────
        EXP = [
            ("Groceries", 2404600, "chicken, vegetables, rice — weekly", "More Supermarket", "Ramesh", "APPROVED", "UPI"),
            ("Salaries", 1500000, "Cook salary — July", "—", "Aarav", "APPROVED", "BANK_TRANSFER"),
            ("Salaries", 1200000, "Housekeeping staff — July", "—", "Aarav", "APPROVED", "BANK_TRANSFER"),
            ("Electricity", 928400, "BESCOM bill — June", "BESCOM", "Priya", "APPROVED", "UPI"),
            ("Groceries", 335000, "Gas + milk top-up", "Local dairy", "Ramesh", "PENDING", "CASH"),
            ("Maintenance", 312000, "Duplicate keys + plumbing", "MannaSmith", "Ramesh", "PENDING", "CASH"),
            ("Internet", 189900, "ACT Fibernet — July", "ACT", "Priya", "APPROVED", "UPI"),
            ("Water", 240000, "Tanker water — 2 trips", "Sri Sai Tankers", "Ramesh", "APPROVED", "CASH"),
            ("Gas", 220000, "Commercial cylinders x2", "Bharat Gas", "Ramesh", "APPROVED", "UPI"),
            ("Maintenance", 74000, "Ceiling fan replacement 203", "Bajaj", "Priya", "APPROVED", "UPI"),
        ]
        for cat, amt, desc, vendor, paidby, appr, mode in EXP:
            days_ago = hash(desc) % 24
            await ins(
                """INSERT INTO expenses (org_id, property_id, category_id, amount_paise, description,
                       vendor_name, paid_by, purchase_date, payment_mode, approval_status,
                       approved_by, approved_at, created_by)
                   VALUES (:org,:pid,:cat,:amt,:desc,:vendor,:paidby,:pd,
                       CAST(:mode AS payment_mode_enum), CAST(:appr AS expense_approval_enum),
                       :apprby,:apprat,:by)""",
                {"org": org_id, "pid": prop_id, "cat": cats[cat], "amt": amt, "desc": desc,
                 "vendor": vendor, "paidby": paidby, "pd": TODAY - timedelta(days=days_ago),
                 "mode": mode, "appr": appr,
                 "apprby": owner_id if appr == "APPROVED" else None,
                 "apprat": NOW if appr == "APPROVED" else None, "by": sup_id},
            )

        # ── 9. leads (pipeline) ────────────────────────────────────────────────
        LEADS = [
            ("Sudheer Ravi", "WEBSITE", "SITE_VISITED", "2-Share AC", 3),
            ("Anirudh Rao", "INSTAGRAM", "NEW", "2-Share AC", 0),
            ("Satvir Rana", "WEBSITE", "CONTACTED", "Single AC", 0),
            ("Ragul M", "JUSTDIAL", "CONTACTED", "3-Share AC", 5),
            ("Naveen Yadav", "WEBSITE", "NEW", "2-Share AC", 2),
            ("Deepa Suresh", "REFERRAL", "SITE_VISITED", "Single AC", 1),
            ("Farhan Q", "META_AD", "NEW", "3-Share AC", 0),
            ("Bhavana J", "WALKIN", "CONVERTED", "2-Share AC", 12),
            ("Kiran Kumar", "INSTAGRAM", "CONTACTED", "2-Share AC", 4),
            ("Ritika Sen", "WEBSITE", "SITE_VISITED", "Single AC", 2),
            ("Manoj Pillai", "JUSTDIAL", "LOST", "2-Share Non-AC", 20),
            ("Sana Khan", "REFERRAL", "NEW", "3-Share AC", 1),
        ]
        for i, (name, src, st, want, fdays) in enumerate(LEADS):
            created = TODAY - timedelta(days=(i % 15) + 1)
            followup = TODAY + timedelta(days=fdays - 3) if st not in ("CONVERTED", "LOST") else None
            await ins(
                """INSERT INTO leads (org_id, property_id, name, phone, source, status,
                       interested_room_type, budget_min_paise, budget_max_paise,
                       assigned_to, next_followup_at, last_contacted_at, created_by, created_at)
                   VALUES (:org,:pid,:name,:phone,CAST(:src AS lead_source_enum),
                       CAST(:st AS lead_status_enum),:want,:bmin,:bmax,:asg,:fu,:lc,:by,:ca)""",
                {"org": org_id, "pid": prop_id, "name": name,
                 "phone": f"+9197000{30000 + i:05d}", "src": src, "st": st, "want": want,
                 "bmin": 800000, "bmax": 1400000, "asg": mkt_id,
                 "fu": datetime.combine(followup, datetime.min.time()) if followup else None,
                 "lc": NOW - timedelta(days=i % 6), "by": mkt_id,
                 "ca": datetime.combine(created, datetime.min.time())},
            )

        # ── 10. complaints (power tenant Requests + admin inbox) ───────────────
        COMPLAINTS = [
            (0, "MAINTENANCE", "Geyser not heating in the morning", "IN_PROGRESS", "Assigned to Ramesh · plumber visiting"),
            (0, "CLEANLINESS", "Extra pillow and a bedsheet needed", "OPEN", None),
            (3, "MAINTENANCE", "AC not cooling in room 201", "IN_PROGRESS", "Technician booked for tomorrow"),
            (6, "NOISE", "Loud music from common area at night", "RESOLVED", "Spoke to residents, quiet hours reinforced"),
            (9, "FOOD", "Dinner was served late twice this week", "RESOLVED", "Kitchen timing corrected"),
            (2, "SECURITY", "Main gate light is fused", "OPEN", None),
        ]
        for ti, cat, desc, st, note in COMPLAINTS:
            await ins(
                """INSERT INTO complaints (tenant_id, property_id, org_id, category, description,
                       status, assigned_to, response_note, resolved_at, created_at)
                   VALUES (:tid,:pid,:org,CAST(:cat AS complaint_category_enum),:desc,
                       CAST(:st AS complaint_status_enum),:asg,:note,:rat,:ca)""",
                {"tid": tenants[ti]["id"], "pid": prop_id, "org": org_id, "cat": cat, "desc": desc,
                 "st": st, "asg": sup_id if st != "OPEN" else None, "note": note,
                 "rat": NOW if st == "RESOLVED" else None,
                 "ca": NOW - timedelta(days=hash(desc) % 6, hours=hash(cat) % 20)},
            )

        # ── 11. announcements (tenant Notices) ─────────────────────────────────
        for title, body in [
            ("Water tanker cleaning — Sunday 19 July",
             "Overhead tanks will be cleaned between 11 AM and 2 PM. Water supply on floors 2–3 will pause during this window. Please store what you need in the morning."),
            ("Independence Day special dinner 🎉",
             "Join us for a special dinner on 15 August — biryani, dessert and a small get-together in the common area at 8 PM. All residents welcome!"),
        ]:
            await ins(
                """INSERT INTO announcements (org_id, property_id, title, body, target_type,
                       status, sent_at, created_by, created_at)
                   VALUES (:org,:pid,:title,:body,'ALL_TENANTS','SENT',:sent,:by,:ca)""",
                {"org": org_id, "pid": prop_id, "title": title, "body": body,
                 "sent": NOW - timedelta(days=2), "by": owner_id,
                 "ca": NOW - timedelta(days=2)},
            )

        # ── 12. bookings (advance arrivals) ────────────────────────────────────
        for name, room, amt, days in [
            ("Sai Kiran", "104 · A", 450000, 6), ("Bala Venkat", "202 · B", 450000, 6),
            ("Oindrila Das", "301 · B", 200000, 12), ("Deepthi R", "103 · C", 200000, 12),
        ]:
            await ins(
                """INSERT INTO bookings (org_id, property_id, guest_name, guest_phone, room_label,
                       kind, amount_paise, check_in_date, payment_mode, collected_at, collected_by)
                   VALUES (:org,:pid,:name,:phone,:room,'ADVANCE',:amt,:cin,'UPI',:col,:by)""",
                {"org": org_id, "pid": prop_id, "name": name, "phone": f"+9196000{40000 + days:05d}",
                 "room": room, "amt": amt, "cin": TODAY + timedelta(days=days),
                 "col": TODAY - timedelta(days=2), "by": mkt_id},
            )

        # ── 13. resident-portal logins for two demo tenants ────────────────────
        for t in (tenants[0], tenants[1]):
            iid = u()
            await ins(
                "INSERT INTO public.tenant_identity (id, phone, email) VALUES (:id,:ph,:em)",
                {"id": iid, "ph": t["phone"], "em": None},
            )
            await ins(
                """INSERT INTO public.tenant_identity_links
                       (identity_id, org_id, schema_name, tenant_id, status)
                   VALUES (:iid,:org,:schema,:tid,'ACTIVE')""",
                {"iid": iid, "org": org_id, "schema": schema, "tid": t["id"]},
            )

        await db.commit()

    print("✅ Demo org seeded.")
    print(f"   Staff app  → {OWNER_EMAIL} / {OWNER_PASSWORD}")
    print(f"   Resident   → {tenants[0]['phone']} (overdue)  ·  {tenants[1]['phone']} (paid up)")
    print("   Resident OTP shows on-screen (inline mode).")


if __name__ == "__main__":
    asyncio.run(main())
