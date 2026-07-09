import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageTitle } from "@/components/layout/PageTitle";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { AccountsPage } from "@/pages/AccountsPage";
import { CardsManualPage } from "@/pages/CardsManualPage";
import { BudgetsPage } from "@/pages/BudgetsPage";
import { GoalsPage } from "@/pages/GoalsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { AutomationPage } from "@/pages/AutomationPage";
import { SecurityPage } from "@/pages/SecurityPage";
import { OpenFinancePage } from "@/pages/OpenFinancePage";
import { CardsPage } from "@/routes/CardsPage";
import { CardDetailPage } from "@/routes/CardDetailPage";
import { CorrectionPage } from "@/routes/CorrectionPage";
import { EntriesPage } from "@/routes/EntriesPage";

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
          <Route path="cartoes" element={<CardsManualPage />} />
          <Route path="cartoes-of" element={<CardsPage />} />
          <Route path="cartoes-of/:cardId" element={<CardDetailPage />} />
          <Route path="orcamentos" element={<BudgetsPage />} />
          <Route path="metas" element={<GoalsPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="automacoes" element={<AutomationPage />} />
          <Route path="open-finance" element={<OpenFinancePage />} />
          <Route path="correcao/open-finance" element={<CorrectionPage />} />
          <Route path="seguranca" element={<SecurityPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
