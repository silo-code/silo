import { useEffect, useState } from "react";
import type { Extension } from "@silo-code/sdk";
import { getAppService } from "@silo-code/extension-host/internal";
import siloIcon from "./silo-icon.png";
import "./AboutPage.css";

const app = getAppService();

function AboutPage() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    app
      .getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  return (
    <div className="about-page">
      <img className="about-icon" src={siloIcon} alt="Silo" />
      <div className="about-tagline">
        Run every workspace at once. Switch instantly, lose nothing.
      </div>
      {version && <div className="about-version">Version {version}</div>}
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
      component: AboutPage,
    });
  },
};
