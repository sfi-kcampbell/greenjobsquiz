import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/create";
import { staffUsers } from "@/lib/db/schema";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { anyStaffPins, revokeAllStaffPins, revokeStaffPin, setStaffPin, staffPinMatches } from "./staff-pins-store";

describe.skipIf(!TEST_DATABASE_URL)("staff PINs (Postgres)", () => {
  let db: Database;
  let ann: number, bob: number;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);
  beforeEach(async () => {
    await resetTestDb();
    [{ id: ann }, { id: bob }] = await db
      .insert(staffUsers)
      .values([{ email: "ann@example.org" }, { email: "bob@example.org" }])
      .returning({ id: staffUsers.id });
  });

  const row = async (id: number) => (await db.select().from(staffUsers).where(eq(staffUsers.id, id)))[0];

  it("creates a PIN that only works for its Admin, stored as a hash", async () => {
    expect(await anyStaffPins(db)).toBe(false);
    const created = (await setStaffPin(db, ann))!;
    expect(created.email).toBe("ann@example.org");
    const stored = await row(ann);
    expect(stored.pinHash).toMatch(/^scrypt\$/);
    expect(stored.pinHash).not.toContain(created.pin.replace(/-/g, ""));
    expect(stored.pinSetAt).toBeInstanceOf(Date);
    expect(await anyStaffPins(db)).toBe(true);

    expect(await staffPinMatches(db, "ANN@example.org ", created.pin.toLowerCase())).toBe(true);
    expect(await staffPinMatches(db, "bob@example.org", created.pin)).toBe(false);
    expect(await staffPinMatches(db, "nobody@example.org", created.pin)).toBe(false);
    expect(await setStaffPin(db, 9999)).toBeNull();
  });

  it("reset replaces the PIN; revoke and disabling stop it", async () => {
    const first = (await setStaffPin(db, ann))!;
    const second = (await setStaffPin(db, ann))!;
    expect(await staffPinMatches(db, "ann@example.org", first.pin)).toBe(false);
    expect(await staffPinMatches(db, "ann@example.org", second.pin)).toBe(true);

    await db.update(staffUsers).set({ disabledAt: new Date() }).where(eq(staffUsers.id, ann));
    expect(await staffPinMatches(db, "ann@example.org", second.pin)).toBe(false);
    expect(await anyStaffPins(db)).toBe(false); // disabled Admins don't count
    await db.update(staffUsers).set({ disabledAt: null }).where(eq(staffUsers.id, ann));

    expect(await revokeStaffPin(db, ann)).toBe("ann@example.org");
    expect(await staffPinMatches(db, "ann@example.org", second.pin)).toBe(false);
    expect((await row(ann)).pinSetAt).toBeNull();
  });

  it("revoke all clears every PIN", async () => {
    await setStaffPin(db, ann);
    await setStaffPin(db, bob);
    expect((await revokeAllStaffPins(db)).sort()).toEqual(["ann@example.org", "bob@example.org"]);
    expect(await anyStaffPins(db)).toBe(false);
  });
});
