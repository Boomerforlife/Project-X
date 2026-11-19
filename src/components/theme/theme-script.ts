/**
 * Theme constants shared by the server layout and the client Theme module. Kept OUT of the "use client" Theme.tsx: a
 * server component importing a value from a client module receives a client-reference stub, not the string, so the
 * inline <head> script used to render as a throwing function and never applied the saved theme before first paint.
 */
export const THEME_KEY = "tabby-theme";

/** Runs before first paint (inlined in <head>) so there is no flash of the wrong theme. Dark is the product default. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"dark";var t=p==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):p;document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;
