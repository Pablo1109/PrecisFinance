import { useFinance } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

export function SecurityPage() {
  const { syncStatus, exportJson, importJson, resetDemo } = useFinance();
  const { user, signOut } = useAuth();
  const toast = useToast();

  function importFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importJson(String(reader.result));
        toast("Backup importado.");
      } catch {
        toast("JSON inválido.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <section className="panel">
      <h2>Segurança e dados</h2>
      <p>Conta: <strong>{user?.email ?? "Local"}</strong></p>
      <p>Status sync: <strong>{syncStatus}</strong></p>
      <div className="actions-row" style={{ marginTop: 16 }}>
        <button type="button" className="secondary-action" onClick={() => {
          const blob = new Blob([exportJson()], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "precis-backup.json";
          a.click();
        }}>Exportar backup</button>
        <label className="secondary-action">
          Importar backup
          <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
        <button type="button" className="ghost-action" onClick={resetDemo}>Restaurar demo</button>
        {user && <button type="button" className="ghost-action" onClick={() => signOut()}>Sair</button>}
      </div>
    </section>
  );
}
