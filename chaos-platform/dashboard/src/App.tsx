import { NavLink, Route, Routes } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import NewRun from "./pages/NewRun";
import RepairLog from "./pages/RepairLog";
import RunDetail from "./pages/RunDetail";
import Targets from "./pages/Targets";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/targets", label: "Targets" },
  { to: "/runs/new", label: "New Run" },
  { to: "/repair-log", label: "Repair Log" },
];

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Chaos Engineering</p>
          <h1>Control Room</h1>
          <p className="sidebar-copy">
            Watch live signals, trigger controlled failures, and track repairs.
          </p>
        </div>

        <nav className="nav-links">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/targets" element={<Targets />} />
          <Route path="/runs/new" element={<NewRun />} />
          <Route path="/runs/:runId" element={<RunDetail />} />
          <Route path="/repair-log" element={<RepairLog />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
