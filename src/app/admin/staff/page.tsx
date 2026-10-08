import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { requireSuperAdmin } from "@/lib/auth/access";
import { listSuperAdmins } from "@/lib/auth/super-admins";
import { db } from "@/lib/db/client";
import { staffUsers } from "@/lib/db/schema";
import { removeAdmin, revokeAllPins, setAdminDisabled } from "./actions";
import { InviteForm } from "./invite-form";
import { PinControl } from "./pin-control";

export const metadata: Metadata = { title: "Staff" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function StaffPage() {
  await requireSuperAdmin();
  const superAdmins = listSuperAdmins();
  const admins = await db.select().from(staffUsers).orderBy(asc(staffUsers.email));

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-semibold">Staff</h1>

      <section aria-labelledby="super-admins" className="flex flex-col gap-3">
        <h2 id="super-admins" className="text-lg font-semibold">
          Super Admins
        </h2>
        <p className="text-sm text-muted">
          Set by the <code>SUPER_ADMINS</code> environment variable. To change this list, update the
          variable in Vercel and redeploy.
        </p>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {superAdmins.map((email) => (
            <li key={email} className="flex items-center justify-between px-4 py-3">
              <span>{email}</span>
              <span className="text-sm text-muted">from SUPER_ADMINS</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="admins" className="flex flex-col gap-4">
        <h2 id="admins" className="text-lg font-semibold">
          Admins
        </h2>
        <p className="text-sm text-muted">Admins can create, edit and publish quizzes.</p>
        <p className="max-w-2xl text-sm text-muted">
          Until email sign-in is set up, give each Admin a sign-in PIN (Create PIN). It&apos;s shown once; only a
          hash is stored. Super Admins sign in with the shared <code>SECRET_PIN</code>.
        </p>
        <InviteForm />

        {admins.length === 0 ? (
          <p className="text-muted">No Admins yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Email</th>
                  <th scope="col" className="px-4 py-2 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 font-medium">Invited</th>
                  <th scope="col" className="px-4 py-2 font-medium">Sign-in PIN</th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {admins.map((admin) => {
                  const disabled = admin.disabledAt !== null;
                  return (
                    <tr key={admin.id}>
                      <td className="px-4 py-3">{admin.email}</td>
                      <td className="px-4 py-3">{admin.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        {disabled ? (
                          <span className="font-medium text-danger">Disabled</span>
                        ) : (
                          <span className="font-medium text-brand">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {dateFormat.format(admin.createdAt)}
                        {admin.invitedBy ? ` by ${admin.invitedBy}` : ""}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="mb-1 text-muted">{admin.pinSetAt ? `Set ${dateFormat.format(admin.pinSetAt)}` : "None"}</p>
                        <PinControl id={admin.id} email={admin.email} hasPin={admin.pinHash !== null} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-3">
                          <form action={setAdminDisabled}>
                            <input type="hidden" name="id" value={admin.id} />
                            <input type="hidden" name="disable" value={String(!disabled)} />
                            <button type="submit" className="text-brand underline underline-offset-4">
                              {disabled ? "Re-enable" : "Disable"}
                            </button>
                          </form>
                          <form action={removeAdmin}>
                            <input type="hidden" name="id" value={admin.id} />
                            <ConfirmSubmit
                              confirmMessage={`Remove ${admin.email}? They'll be signed out and lose access.`}
                              className="text-danger underline underline-offset-4"
                              aria-label={`Remove ${admin.email}`}
                            >
                              Remove
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {admins.some((a) => a.pinHash !== null) && (
          <form action={revokeAllPins}>
            <ConfirmSubmit
              confirmMessage="Revoke every Admin's PIN? They're all signed out and can only sign in by email until you create new PINs."
              className="rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10"
            >
              Revoke all PINs
            </ConfirmSubmit>
          </form>
        )}
      </section>
    </div>
  );
}
