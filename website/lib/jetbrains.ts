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
  /** The IDEs it is made for, when not every JetBrains IDE. */
  ides?: string[];
  /** A real screenshot of what it does. */
  shot?: { src: string; width: number; height: number; alt: string; caption: string };
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
  {
    slug: 'device-lab',
    name: 'Device Lab Veyra',
    tagline: 'Test your Android app the way your users really use it.',
    summary: 'A control panel for your phone or emulator in Android Studio: dark theme, the largest font, Arabic and right-to-left, slow animations, airplane mode, permissions and deep links, each in one click.',
    version: '1.0.0',
    file: '/downloads/jetbrains/device-lab-veyra-1.0.0.zip',
    size: '97 KB',
    icon: '/device-lab-jetbrains.svg',
    since: '2024.3',
    marketplace: null,
    source: 'https://github.com/fcopensource/jetbrains-plugins/tree/main/device-lab-veyra',
    released: '2026-11-15',
    features: [
      { title: 'Worst case, in one click', copy: 'The largest font, the largest display size, right-to-left and dark theme at once: the hardest screen your layout will ever meet. Reset puts the phone back exactly as it was.' },
      { title: 'Every look your users have', copy: 'Light, dark or auto theme, font size up to 200 %, display size from Small to Largest. Find cut-off text and hard-coded colours in seconds.' },
      { title: 'Any language, right-to-left', copy: 'Switch only your app to Arabic, Hebrew, German, Thai, Japanese and more (Android 13+), or Android’s pseudolocales to spot text you forgot to translate.' },
      { title: 'Permissions with a checkbox', copy: 'Grant or revoke each runtime permission your app asks for, to test every “permission denied” path without reinstalling.' },
      { title: 'Your deep links, ready to open', copy: 'Reads the links in your AndroidManifest.xml and Navigation graphs. Open one and see which screen opened, cold or warm, and how fast.' },
      { title: 'Debug switches and screenshots', copy: 'Animations off to 10× slower, layout bounds, show taps, airplane mode, and a clean 12:00 status bar for store screenshots, saved straight into the editor.' },
    ],
    where: ['View → Tool Windows → Device Lab (right side)', 'Tools → Open Device Lab', 'Tools → Device Lab: Set adb Path… (only if your Android SDK is somewhere unusual)'],
    ides: ['Android Studio', 'IntelliJ IDEA'],
    shot: { src: '/device-lab-worst-case.png', width: 1080, height: 2400, alt: 'An Android emulator showing Settings in Arabic, right-to-left, dark theme, with the largest font and layout bounds', caption: 'One click on Worst case, then Layout bounds and a clean status bar: Settings on an Android 16 emulator in Arabic, right-to-left, dark, at 200 % font.' },
  },
];

export const jetbrainsPlugin = (slug: string) => JETBRAINS_PLUGINS.find(p => p.slug === slug);
