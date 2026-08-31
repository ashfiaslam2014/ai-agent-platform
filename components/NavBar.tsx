"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function NavBar() {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const willBeDark = !isDark;
    document.documentElement.classList.toggle("dark", willBeDark);
    localStorage.setItem("theme", willBeDark ? "dark" : "light");
    setIsDark(willBeDark);
  }

  const links = [
    { name: "Chat", href: "/chat" },
    { name: "Businesses", href: "/dashboard/businesses" },
    { name: "Documents", href: "/dashboard/documents" },
    { name: "Conversations", href: "/dashboard/conversations" },
    { name: "Skills", href: "/dashboard/skills" },
    { name: "Traces", href: "/dashboard/traces" },
    { name: "Prompts", href: "/dashboard/prompts" },
    { name: "Analytics", href: "/dashboard/analytics" },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md transition-all">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center">
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-300">
                AI Agent Platform
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              {links.map((link) => {
                const isActive =
                  pathname === link.href ||
                  (link.href === "/chat" && pathname === "/");

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative py-1.5 text-sm font-medium transition-colors hover:text-zinc-900 dark:hover:text-zinc-50 ${
                      isActive
                        ? "text-zinc-900 dark:text-white"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {link.name}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex items-center justify-center w-9 h-9 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {isDark ? "☀️" : "🌙"}
            </button>

          {/* Mobile links */}
          <div className="flex md:hidden items-center gap-4">
            {links.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href === "/chat" && pathname === "/");

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-xs font-semibold px-2 py-1 rounded-md transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
