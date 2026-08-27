import { useEffect, useState } from "react";
import type { Extension, SystemInfo, SystemService } from "@silo-code/sdk";
import siloIcon from "./silo-icon.png";
import "./AboutPage.css";

/** Keep in sync with `apps/website/src/homepage-copy.ts` (HEADLINE + INTRO_COPY). */
const HEADLINE = "One window — every project, every agent";
const INTRO =
  "Terminals, agents, and layout stay intact — switch between them instantly. 100% open source, free forever.";

function AboutPage({ system }: { system: SystemService }) {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    system
      .getInfo()
      .then(setInfo)
      .catch(() => {});
  }, [system]);

  return (
    <div className="about-page">
      <img
        className="about-icon"
        src={siloIcon}
        alt=""
        width={64}
        height={64}
      />
      <div className="about-copy">
        <p className="about-headline">{HEADLINE}</p>
        <p className="about-intro">{INTRO}</p>
      </div>
      {info && (
        <div className="about-meta">
          <div className="about-version">Version {info.siloVersion}</div>
          <div className="about-platform">
            {info.os} · {info.arch}
          </div>
        </div>
      )}
    </div>
  );
}

export const extension: Extension = {
  id: "core.about",
  activate(ctx) {
    ctx.registerSettingsPage({
      id: "about",
      title: "About Silo",
      // Late group keeps it last in the rail regardless of other pages.
      group: "9_about",
      order: 1,
      component: () => <AboutPage system={ctx.system} />,
    });
  },
};
