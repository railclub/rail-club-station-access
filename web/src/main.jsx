import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../site/style.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);

// report.js (Supabase visitor reports) is a plain module shipped next to the app. It finishes a
// Google sign-in on return and fills #visitor-slot whenever a station page is shown.
import(/* @vite-ignore */ new URL("report.js", document.baseURI).href).catch(() => {});
