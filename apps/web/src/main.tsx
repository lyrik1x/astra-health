import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "./App";
import { createAppI18n } from "./i18n";
import { normalizeRoleInUrl } from "./role/demo-role";
import "./styles.css";

normalizeRoleInUrl();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

const i18n = createAppI18n();
document.documentElement.lang = i18n.language;

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
);
