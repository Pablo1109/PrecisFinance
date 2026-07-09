import { NavLink, Outlet } from "react-router-dom";

export function App() {
  return (
    <div className="app">
      <aside className="side">
        <h1>Precis Finance</h1>
        <nav>
          <NavLink to="/cartoes" className={({ isActive }) => (isActive ? "active" : "")}>Cartões</NavLink>
          <NavLink to="/lancamentos" className={({ isActive }) => (isActive ? "active" : "")}>Lançamentos</NavLink>
          <NavLink to="/correcao/open-finance" className={({ isActive }) => (isActive ? "active" : "")}>Correção Open Finance</NavLink>
        </nav>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
