import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Public, unauthenticated shell for the Privacy Policy and Terms pages.
 * These URLs are referenced by Meta (WhatsApp business verification / App
 * Review) and the Play Store listing, so they must render without a session.
 */
export default function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight text-primary">
            PGManage
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-foreground/90 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_a]:text-accent [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground">
          {children}
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-6 text-sm text-muted-foreground">
          © 2026 LOOP Colving PG · PGManage ·{' '}
          <a href="mailto:thotaadityasaikumar@outlook.com" className="text-accent hover:underline">
            thotaadityasaikumar@outlook.com
          </a>
        </div>
      </footer>
    </div>
  );
}
