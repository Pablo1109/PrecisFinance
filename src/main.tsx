import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { FinanceProvider } from "@/context/FinanceContext";
import { ToastProvider } from "@/context/ToastContext";
import { AppRoutes } from "@/app/AppRoutes";
import "@/styles.css";

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <FinanceProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </FinanceProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
