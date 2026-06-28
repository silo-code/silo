import { useEffect, useState } from "react";
import type { Extension, SystemInfo, SystemService } from "@silo-code/sdk";
import siloIcon from "./silo-icon.png";
import "./AboutPage.css";

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
      <img className="about-icon" src={siloIcon} alt="Silo" />
      <div className="about-tagline">
        Run every workspace at once. Switch instantly, lose nothing.
      </div>
      {info && (
        <>
          <div className="about-version">Version {info.siloVersion}</div>
          <div className="about-platform">
            {info.os} · {info.arch}
          </div>
        </>
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
