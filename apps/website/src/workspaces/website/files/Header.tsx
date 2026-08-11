import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="site-header">
      <a className="brand" href="/">
        Acme
      </a>
      <nav>
        <a href="/pricing">Pricing</a>
        <a href="/docs">Docs</a>
        <a href="/blog">Blog</a>
      </nav>
      <ThemeToggle />
    </header>
  );
}
