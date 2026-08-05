// Pattern: route-level code splitting (Performance section) — this view is
// imported via React.lazy() in App.tsx, so its code (and this file alone)
// ships in a separate chunk that's only fetched when the user navigates here.
//
// Pattern: withAuth HOC (Component patterns section) — this route is guarded
// with the HOC instead of wrapping it in <ProtectedRoute> at the router level,
// to demonstrate both auth-guarding approaches side by side in the same app.

import { useState } from "react";
import { withAuth } from "../hoc/withAuth";
import { useAuth } from "../hooks/useAuth";

// react-refresh/only-export-components can't verify HOC-wrapped default
// exports statically; disabled file-wide since this file intentionally
// exports withAuth(Settings) rather than Settings directly (see bottom).
/* eslint-disable react-refresh/only-export-components */

function Settings(): JSX.Element {
  const { user } = useAuth();
  const [emailNotifications, setEmailNotifications] = useState(true);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Account</h2>
        <dl className="text-sm">
          <div className="flex justify-between py-1">
            <dt className="text-gray-500">Email</dt>
            <dd className="text-gray-900">{user?.email}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-gray-500">Member since</dt>
            <dd className="text-gray-900">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Preferences</h2>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={emailNotifications}
            onChange={(event) => setEmailNotifications(event.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Email me when a task is assigned to me
        </label>
      </section>
    </div>
  );
}

export default withAuth(Settings);
