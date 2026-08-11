import { nav } from "./docs.config";

export function Sidebar() {
  return (
    <nav className="docs-sidebar">
      {nav.map((section) => (
        <div key={section.title} className="sidebar-section">
          <h3>{section.title}</h3>
          <ul>
            {section.pages.map((page) => (
              <li key={page.href}>
                <a href={page.href}>{page.label}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
