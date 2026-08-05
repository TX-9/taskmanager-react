// App navigation shell. Reads the current user from useAuth (Custom hooks
// section) and exposes logout.

import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const NAV_LINK_BASE = "block rounded-md px-3 py-2 text-sm font-medium";
const NAV_LINK_ACTIVE = "bg-brand-50 text-brand-700";
const NAV_LINK_INACTIVE = "text-gray-600 hover:bg-gray-100";

function Sidebar(): JSX.Element {
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-full w-56 flex-col justify-between border-r border-gray-200 bg-white p-4">
      <div>
        <div className="mb-6 px-3 text-lg font-bold text-gray-900">TaskManager</div>
        <nav className="flex flex-col gap-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}`
            }
          >
            Analytics
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}`
            }
          >
            Settings
          </NavLink>
        </nav>
      </div>
      <div className="border-t border-gray-100 pt-4">
        {user && <p className="truncate px-3 text-xs text-gray-500">{user.email}</p>}
        <button
          type="button"
          onClick={logout}
          className="mt-2 w-full rounded-md px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
