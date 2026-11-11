import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { go, startMatch } from "./ui/store";

(window as unknown as { __ctl: unknown }).__ctl = { go, startMatch };

createRoot(document.getElementById("root")!).render(<App />);
