import { useEffect, useState } from "react";
import { AsciiBackdrop } from "./AsciiBackdrop";
import { DemoWorkspace } from "./DemoWorkspace";
import { StoryVideo } from "./StoryVideo";
import { DOWNLOAD_FALLBACK_HREF, fetchLatestDownloadUrl } from "./download-url";
import {
  EYEBROW,
  FOOTER_COLUMNS,
  FOOTER_COPYRIGHT,
  FOOTER_LICENSE,
  FOOTER_SOCIAL,
  HEADLINE_LINE1,
  HEADLINE_LINE2,
  HERO_ACTIONS,
  INTRO_COPY,
  NAV_DOWNLOAD,
  NAV_LINKS,
  SITE_NAME,
  STORY_SECTIONS,
  TRUST_LINE,
  TRUST_TITLE,
  FAQ_ITEMS,
} from "./homepage-copy";
import siloIcon from "./silo-icon.png";
import featureWorkspacesPoster from "./assets/feature-workspaces.png";
import featureWorkspacesWebm from "./assets/feature-workspaces.webm";
import featureGitPoster from "./assets/feature-git.png";
import featureGitWebm from "./assets/feature-git.webm";
import featureTerminalsPoster from "./assets/feature-terminals.png";
import featureTerminalsWebm from "./assets/feature-terminals.webm";
import featureExtensionsPoster from "./assets/feature-extensions.png";
import featureExtensionsWebm from "./assets/feature-extensions.webm";
import { detectDownloadPlatform, type DownloadPlatform } from "./platform";
import { heroScene } from "./demo-scenes";

const STORY_VISUALS: Partial<
  Record<
    (typeof STORY_SECTIONS)[number]["id"],
    | { kind: "image"; src: string }
    | { kind: "video"; webm: string; poster: string }
  >
> = {
  workspaces: {
    kind: "video",
    webm: featureWorkspacesWebm,
    poster: featureWorkspacesPoster,
  },
  git: { kind: "video", webm: featureGitWebm, poster: featureGitPoster },
  terminals: {
    kind: "video",
    webm: featureTerminalsWebm,
    poster: featureTerminalsPoster,
  },
  extensions: {
    kind: "video",
    webm: featureExtensionsWebm,
    poster: featureExtensionsPoster,
  },
};

function AppleIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.67 8.58c-.02-2.02 1.65-2.99 1.72-3.04-.94-1.37-2.4-1.56-2.92-1.58-1.24-.13-2.43.73-3.06.73-.63 0-1.61-.71-2.65-.69-1.36.02-2.62.79-3.32 2.01-1.42 2.46-.36 6.1 1.02 8.1.67.98 1.48 2.08 2.53 2.04 1.02-.04 1.4-.66 2.63-.66 1.23 0 1.57.66 2.65.64 1.1-.02 1.79-1 2.45-1.98.77-1.12 1.08-2.21 1.1-2.26-.02-.01-2.11-.81-2.15-3.21zM10.7 2.93c.56-.68.94-1.62.83-2.56-.81.03-1.78.54-2.36 1.22-.52.6-.97 1.56-.85 2.48.9.07 1.82-.46 2.38-1.14z" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1 2.5 7.2 1.7v6.1H1zm7.5-.9L15 1v6.8H8.5zM1 8.9h6.2V15L1 14.1zm7.5 0H15V15l-6.5-.9z" />
    </svg>
  );
}

function LinuxIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 1.2c-1.4 0-2.6 1.5-2.6 3.5 0 1.3.4 2.4 1 3.1-.7.4-1.5 1.2-1.8 2.2-.3 1 .1 1.9.9 2.3-.5.5-.8 1.2-.8 1.9 0 .7.4 1.2 1.1 1.2.5 0 1-.2 1.4-.6.4.4.9.6 1.4.6s1-.2 1.4-.6c.4.4.9.6 1.4.6.7 0 1.1-.5 1.1-1.2 0-.7-.3-1.4-.8-1.9.8-.4 1.2-1.3.9-2.3-.3-1-1.1-1.8-1.8-2.2.6-.7 1-1.8 1-3.1 0-2-1.2-3.5-2.6-3.5zm-1.5 4.2a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4zm3 0a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4zM6.7 10c.3-.6 1-.9 1.8-.9.7 0 1.3.2 1.7.6l-.5.6c-.3-.3-.7-.4-1.2-.4-.5 0-.9.2-1.1.5L6.7 10z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.58c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function PlatformIcon({ platform }: { platform: DownloadPlatform }) {
  if (platform === "windows") return <WindowsIcon />;
  if (platform === "linux") return <LinuxIcon />;
  return <AppleIcon />;
}

function ActionIcon({
  icon,
  platform,
}: {
  icon?: "platform" | "github";
  platform: DownloadPlatform;
}) {
  if (icon === "platform") return <PlatformIcon platform={platform} />;
  if (icon === "github") return <GitHubIcon />;
  return null;
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.6 1.5h2.2L9.9 7.1l5.7 7.4h-4.5L7.7 9.8l-4 4.7H1.5l5.1-6L1 1.5h4.6l3.2 4.4 3.8-4.4zm-.8 12.1h1.2L4.3 2.7H3L11.8 13.6z" />
    </svg>
  );
}

function FooterSocialIcon({ icon }: { icon: "github" | "x" }) {
  if (icon === "github") return <GitHubIcon />;
  return <XIcon />;
}

// Hero CTAs live in homepage-copy.ts (shared with the docs SSG SEO shell).

export function App() {
  const platform = detectDownloadPlatform();
  const [downloadHref, setDownloadHref] = useState(DOWNLOAD_FALLBACK_HREF);
  const [navOpen, setNavOpen] = useState(false);
  const [showAsciiBackdrop, setShowAsciiBackdrop] = useState(
    () => window.matchMedia("(min-width: 641px)").matches,
  );
  useEffect(() => {
    let cancelled = false;
    void fetchLatestDownloadUrl().then((url) => {
      if (!cancelled && url) setDownloadHref(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 641px)");
    const onChange = () => setShowAsciiBackdrop(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  return (
    <>
      <main className="page-shell">
        <div className="hero-visual">
          {showAsciiBackdrop ? <AsciiBackdrop variant="chat-typing" /> : null}

          <header
            className={navOpen ? "site-header is-nav-open" : "site-header"}
          >
            <a className="brand" href="/">
              <img
                className="brand-mark"
                src={siloIcon}
                alt=""
                width={44}
                height={44}
              />
              <span>{SITE_NAME}</span>
            </a>
            <button
              type="button"
              className="site-nav-toggle"
              aria-label={navOpen ? "Close menu" : "Open menu"}
              aria-expanded={navOpen}
              aria-controls="site-primary-nav"
              onClick={() => setNavOpen((open) => !open)}
            >
              <span className="site-nav-toggle-icon" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
            <nav
              id="site-primary-nav"
              className="site-nav"
              aria-label="Primary"
            >
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setNavOpen(false)}
                >
                  {link.text}
                </a>
              ))}
              <a
                className="site-nav-download"
                href={downloadHref}
                onClick={() => setNavOpen(false)}
              >
                <ActionIcon icon={NAV_DOWNLOAD.icon} platform={platform} />
                {NAV_DOWNLOAD.text}
              </a>
            </nav>
          </header>

          <section className="intro">
            <p className="eyebrow">{EYEBROW}</p>
            <h1>
              {HEADLINE_LINE1}
              <br />
              <em>{HEADLINE_LINE2}</em>
            </h1>
            <p className="intro-copy">{INTRO_COPY}</p>
            <div className="intro-actions">
              {HERO_ACTIONS.map((action) => (
                <a
                  key={action.href}
                  href={action.icon === "platform" ? downloadHref : action.href}
                  className={action.primary ? "is-primary" : "is-secondary"}
                >
                  <ActionIcon icon={action.icon} platform={platform} />
                  {action.text}
                </a>
              ))}
            </div>
          </section>
        </div>

        <div className="demo-scroll">
          <DemoWorkspace scene={heroScene} focusable />
        </div>

        <section className="home-stories" aria-label="Product">
          {STORY_SECTIONS.map((section, index) => {
            const visual = STORY_VISUALS[section.id];
            return (
              <article
                key={section.id}
                className={
                  index % 2 === 1 ? "home-story is-flip" : "home-story"
                }
              >
                <div className="home-story-copy">
                  <p className="home-story-label">{section.label}</p>
                  <h2>{section.title}</h2>
                  <p>{section.body}</p>
                  {section.proof ? (
                    <p className="home-story-proof">{section.proof}</p>
                  ) : null}
                </div>
                <div
                  className="home-story-visual"
                  aria-hidden={visual ? undefined : true}
                >
                  <div className="home-story-visual-frame">
                    {visual?.kind === "image" ? (
                      <img
                        src={visual.src}
                        alt={section.visualAlt ?? ""}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : visual?.kind === "video" ? (
                      <StoryVideo
                        webm={visual.webm}
                        poster={visual.poster}
                        label={section.visualAlt ?? section.title}
                      />
                    ) : (
                      <span className="home-story-visual-hint">
                        {section.visualHint}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="home-trust" aria-labelledby="home-trust-title">
          <h2 id="home-trust-title">{TRUST_TITLE}</h2>
          <p>{TRUST_LINE}</p>
        </section>

        <section className="home-faq" aria-labelledby="home-faq-title">
          <h2 id="home-faq-title">Common questions</h2>
          <div className="home-faq-list">
            {FAQ_ITEMS.map((item) => (
              <details key={item.question} className="home-faq-item">
                <summary>
                  <span>{item.question}</span>
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-footer-inner">
          <div className="home-footer-top">
            <a className="home-footer-brand" href="/">
              <img src={siloIcon} alt="" width={36} height={36} />
              <span>{SITE_NAME}</span>
            </a>
            <div className="home-footer-columns">
              {FOOTER_COLUMNS.map((column) => (
                <div className="home-footer-column" key={column.title}>
                  <h2>{column.title}</h2>
                  <ul>
                    {column.links.map((link) => (
                      <li key={link.text}>
                        <a
                          href={
                            link.text === "Download" ? downloadHref : link.href
                          }
                        >
                          {link.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="home-footer-bottom">
            <p className="home-footer-meta">
              {FOOTER_COPYRIGHT}
              <span aria-hidden="true"> · </span>
              <a href={FOOTER_LICENSE.href}>{FOOTER_LICENSE.text}</a>
            </p>
            <div className="home-footer-social">
              {FOOTER_SOCIAL.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  title={item.label}
                >
                  <FooterSocialIcon icon={item.icon} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
