import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

async function bootstrap() {
  if (import.meta.env.MODE === "ui") {
    await import("./dev/setupMockTauri");
  }

  const { default: App } = await import("./App");

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
