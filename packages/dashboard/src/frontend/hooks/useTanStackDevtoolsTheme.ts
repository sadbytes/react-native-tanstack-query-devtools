import { useEffect, useState } from "react";
import type { DevtoolsThemePreference, ResolvedTheme } from "../types";

const DEVTOOLS_THEME_STORAGE_KEY = "TanstackQueryDevtools.theme_preference";

function readDevtoolsThemePreference(): DevtoolsThemePreference {
  const value = window.localStorage.getItem(DEVTOOLS_THEME_STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function resolveDevtoolsTheme(preference: DevtoolsThemePreference): ResolvedTheme {
  if (preference !== "system") {
    return preference;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

let patchRefCount = 0;
let originalSetItem: Storage["setItem"] | null = null;
let originalRemoveItem: Storage["removeItem"] | null = null;

function emitLocalThemeChange() {
  window.dispatchEvent(new Event("tanstack-query-devtools-themechange"));
}

function installStoragePatch() {
  patchRefCount += 1;
  if (patchRefCount > 1) {
    return;
  }

  originalSetItem = Storage.prototype.setItem;
  originalRemoveItem = Storage.prototype.removeItem;
  const prevSetItem = originalSetItem;
  const prevRemoveItem = originalRemoveItem;

  Storage.prototype.setItem = function setItem(this: Storage, key: string, value: string) {
    prevSetItem.call(this, key, value);
    if (key === DEVTOOLS_THEME_STORAGE_KEY) {
      emitLocalThemeChange();
    }
  };
  Storage.prototype.removeItem = function removeItem(this: Storage, key: string) {
    prevRemoveItem.call(this, key);
    if (key === DEVTOOLS_THEME_STORAGE_KEY) {
      emitLocalThemeChange();
    }
  };
}

function uninstallStoragePatch() {
  patchRefCount -= 1;
  if (patchRefCount > 0) {
    return;
  }

  if (originalSetItem) {
    Storage.prototype.setItem = originalSetItem;
    originalSetItem = null;
  }
  if (originalRemoveItem) {
    Storage.prototype.removeItem = originalRemoveItem;
    originalRemoveItem = null;
  }
}

export function useTanStackDevtoolsTheme() {
  const [themePreference, setThemePreference] = useState<DevtoolsThemePreference>(() => readDevtoolsThemePreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveDevtoolsTheme(readDevtoolsThemePreference()));

  useEffect(() => {
    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      const nextPreference = readDevtoolsThemePreference();
      setThemePreference(nextPreference);
      setResolvedTheme(resolveDevtoolsTheme(nextPreference));
    };

    installStoragePatch();

    colorSchemeQuery.addEventListener("change", syncTheme);
    window.addEventListener("storage", syncTheme);
    window.addEventListener("tanstack-query-devtools-themechange", syncTheme);

    return () => {
      colorSchemeQuery.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("tanstack-query-devtools-themechange", syncTheme);
      uninstallStoragePatch();
    };
  }, []);

  return { resolvedTheme, themePreference };
}
