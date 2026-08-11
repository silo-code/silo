import { useTheme } from "./ThemeToggle";

export function Hero() {
  const { theme } = useTheme();

  return (
    <section className={`hero hero--${theme}`}>
      <h1>Build faster, ship sooner.</h1>
      <p>Everything your team needs, in one clean workspace.</p>
      <a className="hero-cta" href="/signup">
        Get started free
      </a>
    </section>
  );
}
