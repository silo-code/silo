import { useEffect, useState } from "react";
import { AsciiBackdrop } from "./AsciiBackdrop";
import { DemoWorkspace } from "./DemoWorkspace";
import { StoryVideo } from "./StoryVideo";
import { DOWNLOAD_FALLBACK_HREF, fetchLatestDownloadUrl } from "./download-url";
import {
  AGENTS,
  AGENTS_LINE,
  AGENTS_TITLE,
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
  type AgentIconId,
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

function ClaudeIcon() {
  // Anthropic's official Claude mark.
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
    >
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
    </svg>
  );
}

function CursorIcon() {
  // Cursor's official mark.
  return (
    <svg
      viewBox="0 0 466.73 532.09"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
    </svg>
  );
}

function CodexIcon() {
  // OpenAI's official mark (Codex runs on OpenAI's models).
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
    >
      <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z" />
    </svg>
  );
}

function CopilotIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      stroke="currentColor"
      strokeWidth="1.6"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 3.6 L12 8.4 M12 15.6 L12 20.4 M3.6 12 L8.4 12 M15.6 12 L20.4 12" />
    </svg>
  );
}

function GrokIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect
        x="10.9"
        y="1.5"
        width="2.2"
        height="21"
        rx="1.1"
        transform="rotate(24 12 12)"
      />
      <rect
        x="10.9"
        y="1.5"
        width="2.2"
        height="21"
        rx="1.1"
        transform="rotate(-24 12 12)"
      />
    </svg>
  );
}

function PiIcon() {
  // pi's official mark.
  return (
    <svg
      viewBox="0 0 800 800"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z"
        fillRule="evenodd"
      />
      <path d="M517.36 400 H634.72 V634.72 H517.36 Z" />
    </svg>
  );
}

function OpencodeIcon() {
  // OpenCode's official mark.
  return (
    <svg
      viewBox="96 64 288 384"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M320 224V352H192V224H320Z" opacity="0.4" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
      />
    </svg>
  );
}

function AgentIcon({ icon }: { icon: AgentIconId }) {
  if (icon === "claude") return <ClaudeIcon />;
  if (icon === "cursor") return <CursorIcon />;
  if (icon === "codex") return <CodexIcon />;
  if (icon === "copilot") return <CopilotIcon />;
  if (icon === "grok") return <GrokIcon />;
  if (icon === "pi") return <PiIcon />;
  return <OpencodeIcon />;
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

        <section className="home-agents" aria-labelledby="home-agents-title">
          <h2 id="home-agents-title">{AGENTS_TITLE}</h2>
          <p>{AGENTS_LINE}</p>
          <ul className="home-agents-row">
            {AGENTS.map((agent) => (
              <li key={agent.name} className="home-agents-chip">
                <AgentIcon icon={agent.icon} />
                {agent.name}
              </li>
            ))}
            <li className="home-agents-chip is-more">+ more</li>
          </ul>
        </section>

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
