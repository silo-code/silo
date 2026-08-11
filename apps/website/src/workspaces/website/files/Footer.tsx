export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <span>© {year} Acme, Inc.</span>
      <nav>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </nav>
    </footer>
  );
}
