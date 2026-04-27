import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { ChatPage } from "./pages/ChatPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProviderEditPage } from "./pages/ProviderEditPage";
import { initTheme } from "./stores/themeStore";
import "./App.css";

initTheme();

export function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat/:id" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/provider/new" element={<ProviderEditPage />} />
            <Route path="/settings/provider/:id" element={<ProviderEditPage />} />
          </Routes>
        </Layout>
      </div>
    </BrowserRouter>
  );
}
