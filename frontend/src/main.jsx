import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("TradeBuddy root render failed", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f7fb", color: "#182433" }}>
          <div style={{ width: "min(720px, 100%)", background: "#ffffff", border: "1px solid #d8dfeb", borderRadius: 20, padding: 24, boxShadow: "0 24px 60px rgba(20, 31, 48, 0.12)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5d87ff", marginBottom: 10 }}>
              TradeBuddy UI Error
            </div>
            <h1 style={{ margin: "0 0 8px", fontSize: 28, lineHeight: 1.2 }}>The app hit a client-side render error.</h1>
            <p style={{ margin: "0 0 16px", color: "#526277", lineHeight: 1.6 }}>
              The page did load, but React failed while rendering. The message below is the exact runtime error currently stopping the UI.
            </p>
            <pre style={{ margin: 0, padding: 16, borderRadius: 14, background: "#0f1720", color: "#e7edf7", overflowX: "auto", whiteSpace: "pre-wrap" }}>
              {this.state.error?.stack || this.state.error?.message || "Unknown client-side render error"}
            </pre>
            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ border: 0, borderRadius: 999, padding: "12px 18px", background: "#5d87ff", color: "#ffffff", fontWeight: 700, cursor: "pointer" }}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootContainer = document.getElementById("root");
const root = globalThis.__tradebuddyRoot || createRoot(rootContainer);
globalThis.__tradebuddyRoot = root;

root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>
);
