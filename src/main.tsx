import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { CardsPage } from "./routes/CardsPage";
import { CardDetailPage } from "./routes/CardDetailPage";
import { CorrectionPage } from "./routes/CorrectionPage";
import { EntriesPage } from "./routes/EntriesPage";
import "./styles.css";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<Navigate to="/cartoes" replace />} />
            <Route path="cartoes" element={<CardsPage />} />
            <Route path="cartoes/:cardId" element={<CardDetailPage />} />
            <Route path="lancamentos" element={<EntriesPage />} />
            <Route path="correcao/open-finance" element={<CorrectionPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
