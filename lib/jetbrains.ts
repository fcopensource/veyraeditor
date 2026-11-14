/**
 * Veyra plugins for JetBrains IDEs: the /jetbrains page and each plugin's page are built from this list.
 *
 * To add a plugin: put its tested .zip in public/downloads/jetbrains/, its icon in public/, and add one entry here.
 * When JetBrains Marketplace approves it, set `marketplace` to its Marketplace URL: its page then sends people there
 * (installs and updates from Settings → Plugins) and keeps the .zip as a fallback.
 */
export type JetBrainsPlugin = {
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  version: string;
  /** The tested .zip in public/. */
  file: string;
  size: string;
  icon: string;
  /** Oldest supported IDE version. */
  since: string;
  /** Its JetBrains Marketplace page, once approved. */
  marketplace: string | null;
  source: string;
  released: string;
  features: { title: string; copy: string }[];
  /** Where to find it in the IDE. */
  where: string[];
};

export const JETBRAINS_IDES = ['IntelliJ IDEA', 'WebStorm', 'PyCharm', 'GoLand', 'PhpStorm', 'Rider', 'CLion', 'RubyMine', 'RustRover', 'DataGrip', 'Android Studio'];

export const JETBRAINS_PLUGINS: JetBrainsPlugin[] = [
  {
    slug: 'port-manager',
    name: 'Port Manager Veyra',
    tagline: 'Port 3000 is already in use? Not anymore.',
    summary: 'See every port in use, the program behind it and the project it belongs to, and stop it in one click.',
    version: '1.0.0',
    file: '/downloads/jetbrains/port-manager-veyra-1.0.0.zip',
    size: '120 KB',
    icon: '/port-manager-jetbrains.svg',
    since: '2024.3',
    marketplace: null,
    source: 'https://github.com/fcopensource/jetbrains-plugins/tree/main/port-manager-veyra',
    released: '2026-11-15',
    features: [
      { title: 'Every port, grouped', copy: 'A Ports tool window with This Project, Apps & Dev Servers, Editors & Tools and System, so what matters comes first.' },
      { title: 'Knows your servers', copy: 'Recognises 40+ dev servers and tools: Vite, Next.js, Django, Spring Boot, Rails, PostgreSQL, Docker and more.' },
      { title: 'Stop it in one click', copy: 'Open in Browser, Copy Address, Stop and Reveal Folder. Free a Port… stops whatever holds a port.' },
      { title: 'Tells you when it starts', copy: 'A notification when your project’s server starts, with Open in Browser and Stop, and a ports counter in the status bar.' },
      { title: 'Safe by design', copy: 'System services, other users’ programs and JetBrains IDEs are protected and can never be stopped.' },
      { title: 'Private and light', copy: 'Uses your system’s own tools (netstat, lsof, ss). Nothing is sent anywhere.' },
    ],
    where: ['View → Tool Windows → Ports', 'Tools → Show Ports in Use', 'Tools → Free a Port…', 'The “N ports” counter in the status bar'],
  },
];

export const jetbrainsPlugin = (slug: string) => JETBRAINS_PLUGINS.find(p => p.slug === slug);
