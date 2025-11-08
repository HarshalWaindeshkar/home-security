// index.js
import React from "react";
import ReactDOM from "react-dom/client";
import "./App.css";
import App from "./App.js";

// Standard React 18 entry point
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
