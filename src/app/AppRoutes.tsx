import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageTitle } from "@/components/layout/PageTitle";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { AccountsPage } from "@/pages/AccountsPage";
import { BudgetsPage } from "@/pages/BudgetsPage";
import { GoalsPage } from "@/pages/GoalsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { AutomationPage } from "@/pages/AutomationPage";
import { SecurityPage } from "@/pages/SecurityPage";
import { CardsPage } from "@/routes/CardsPage";
import { InvestmentsPage } from "@/pages/InvestmentsPage";
import { FixedBillsPage } from "@/pages/FixedBillsPage";
import { EntriesPage } from "@/routes/EntriesPage";
import { SettingsPage } from "@/pages/SettingsPage";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <PageTitle />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="lancamentos" element={<TransactionsPage />} />
          <Route path="extrato" element={<EntriesPage />} />
          <Route path="contas" element={<AccountsPage />} />
          <Route path="cartoes" element={<CardsPage />} />
          <Route path="investimentos" element={<InvestmentsPage />} />
          <Route path="orcamentos" element={<BudgetsPage />} />
          <Route path="contas-fixas" element={<FixedBillsPage />} />
          <Route path="metas" element={<GoalsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="automacoes" element={<AutomationPage />} />
          <Route path="seguranca" element={<SecurityPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
