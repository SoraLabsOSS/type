import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react", "@wxt-dev/i18n/module"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: "Sora Type",
    description: "Identify and inspect fonts on any web page.",
    default_locale: "en",
    permissions: [
      "storage",
      "tabs",
      ...(browser === "chrome" ? ["sidePanel"] : []),
    ],
    // Lets the background fetch cross-origin stylesheets/font files that the
    // content script can't read due to CORS (e.g. Google Fonts CSS).
    host_permissions: ["<all_urls>"],
    // Chrome/Edge only for now — Firefox uses sidebar_action, which needs
    // its own entrypoint and manifest shape; add when the extension
    // supports Firefox.
    ...(browser === "chrome" && {
      side_panel: { default_path: "sidepanel.html" },
    }),
    commands: {
      "toggle-picker": {
        suggested_key: { default: "Alt+Shift+F" },
        description: "Toggle the font picker",
      },
    },
  }),
});
