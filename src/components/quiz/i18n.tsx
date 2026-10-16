"use client";

import { createContext, useContext, type ReactNode } from "react";
import { messagesFor, type Messages } from "@/lib/i18n";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

const MessagesContext = createContext<{ locale: Locale; m: Messages }>({ locale: DEFAULT_LOCALE, m: messagesFor(DEFAULT_LOCALE) });

/** The respondent's language for everything inside (English when there's no provider). */
export function MessagesProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <MessagesContext.Provider value={{ locale, m: messagesFor(locale) }}>{children}</MessagesContext.Provider>;
}

export const useMessages = () => useContext(MessagesContext).m;
export const useLocale = () => useContext(MessagesContext).locale;
