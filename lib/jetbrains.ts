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
  shot?: {
    src: string; width: number; height: number; alt: string; caption: string;
    /** The heading and second line next to it (default: Device Lab's). */
    heading?: string; note?: string;
    /** A landscape screenshot (an IDE window): shown full width above its story. */
    wide?: boolean;
  };
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
    marketplace: 'https://plugins.jetbrains.com/plugin/36142-port-manager-veyra',
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
    marketplace: 'https://plugins.jetbrains.com/plugin/36156-device-lab-veyra',
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
  {
    slug: 'veyra-theme',
    name: 'Veyra Theme',
    tagline: 'Your IDE, in coral, amber and violet.',
    summary: 'A warm, modern dark and light theme in the FlightCoders colours: coral, amber and violet on deep ink. Themes the whole IDE and every language in the editor.',
    version: '1.0.0',
    file: '/downloads/jetbrains/veyra-theme-1.0.0.zip',
    size: '36 KB',
    icon: '/veyra-theme-jetbrains.svg',
    since: '2024.3',
    marketplace: 'https://plugins.jetbrains.com/plugin/36164-veyra-theme',
    source: 'https://github.com/fcopensource/jetbrains-plugins/tree/main/veyra-theme',
    released: '2026-11-15',
    features: [
      { title: 'Veyra Dark and Veyra Light', copy: 'A deep ink-violet dark theme that is easy on the eyes for long sessions, and a soft lavender-paper light theme with crisp, high-contrast code.' },
      { title: 'The whole IDE, not just the editor', copy: 'Toolbars, tool windows, tabs, popups, Search Everywhere, dialogs, the Run widget and notifications: 600+ parts of the IDE, all in one palette.' },
      { title: 'The new Islands look', copy: 'On 2025.3 and newer you get JetBrains’ rounded Islands layout in Veyra colours. Older IDEs get the classic New UI, just as polished.' },
      { title: 'Every language matches', copy: 'Coral keywords, amber strings, violet types, lavender functions and mint annotations in Java, Kotlin, Python, JavaScript, TypeScript, Go, Rust, PHP, SQL and the rest.' },
      { title: 'Signature details', copy: 'Coral-to-violet buttons, a coral caret and tab underline, an amber current line number and an amber-to-violet progress bar.' },
      { title: 'Easy to read', copy: 'Every syntax colour clears WCAG AA contrast on its background, and the debugger, diffs, VCS, search results and terminal are themed too.' },
    ],
    where: ['Settings → Appearance & Behavior → Appearance → Theme → Veyra Dark or Veyra Light', 'The editor colour scheme switches with the theme (Settings → Editor → Color Scheme)', 'Quick switch: View → Quick Switch Scheme → Theme'],
    shot: {
      src: '/veyra-theme-dark.png', width: 1238, height: 1165, wide: true,
      alt: 'IntelliJ IDEA 2026.3 with Veyra Dark: rounded ink-violet panels, coral keywords, lavender types and a coral tab border',
      caption: 'IntelliJ IDEA 2026.3 with Veyra Dark and the Islands look. Coral keywords, violet and lavender types, mint annotations and an amber line number, on deep ink.',
      heading: 'Every pixel, on brand.',
      note: 'Veyra Light is in the same plugin: switch between them in Settings → Appearance.',
    },
  },
  {
    slug: 'hotspots',
    name: 'Hotspots Veyra',
    tagline: 'A living heat map of your codebase.',
    summary: 'Find the files where bugs live: complex code that changes all the time. A heat map of your codebase from its own git history, with files that change together and code only one person knows.',
    version: '1.0.0',
    file: '/downloads/jetbrains/hotspots-veyra-1.0.0.zip',
    size: '189 KB',
    icon: '/hotspots-jetbrains.svg',
    since: '2024.3',
    marketplace: null,
    source: 'https://github.com/fcopensource/jetbrains-plugins/tree/main/hotspots-veyra',
    released: '2026-11-20',
    features: [
      { title: 'Your whole codebase, at a glance', copy: 'Every file is a tile, sized by its code and coloured by risk. Hover for details, click a file for its full story, double-click to open it, click a folder to zoom in.' },
      { title: 'Top hotspots, ranked', copy: 'The files to refactor first: complex code that changes all the time, with the reason spelled out for each one.' },
      { title: 'Files that change together', copy: 'Pairs that keep landing in the same commits, often across folders. A hidden dependency, made visible, with lines on the map.' },
      { title: 'Knowledge risks', copy: 'Files only one person has ever changed, and code whose only author has left. One person with several names or emails counts once.' },
      { title: 'Where you already work', copy: 'A flame and rank on the hottest files in the Project view, the open file’s rank in the status bar, and Why Is This a Hotspot? on right-click.' },
      { title: 'Five ways to look, 100% local', copy: 'Hotspots, change frequency, complexity, code age and knowledge risk. It reads your git history and files on your computer, and nothing else.' },
    ],
    where: ['View → Tool Windows → Hotspots (bottom)', 'Click “Hotspot #N” in the status bar', 'Right-click a file or an editor tab → Why Is This a Hotspot?', 'Settings → Tools → Hotspots Veyra'],
    shot: {
      src: '/hotspots-jetbrains-map.png', width: 1880, height: 1170, wide: true,
      alt: 'The Hotspots tool window in IntelliJ IDEA: every file of a real project as a tile coloured from calm to hot, with the top hotspots ranked on the right',
      caption: 'IntelliJ IDEA with Hotspots Veyra on the Veyra Studio repository: 171 commits and 525 files in one view. Its #1 hotspot, App.tsx, glows coral, and the files to refactor first are ranked on the right.',
      heading: 'Know where the bugs live.',
      note: 'Also for VS Code, as Veyra Hotspots.',
    },
  },
  {
    slug: 'aura',
    name: 'Aura Veyra',
    tagline: 'Your coding aura. Farm it, flex it, share it.',
    summary: 'Earn aura for clearing errors, commits and green tests; lose a little for “wip” commits and leftover debuggers. Rank up from NPC to Final Boss, keep your streak and share your aura card.',
    version: '1.0.0',
    file: '/downloads/jetbrains/aura-veyra-1.0.0.zip',
    size: '102 KB',
    icon: '/aura-jetbrains.svg',
    since: '2024.3',
    marketplace: null,
    source: 'https://github.com/fcopensource/jetbrains-plugins/tree/main/aura-veyra',
    released: '2026-11-22',
    features: [
      { title: 'Aura for real wins', copy: 'Clear every error in a file, ship a commit, get your tests green in the IDE’s test runner, pass a build, delete dead code. Real wins, real aura.' },
      { title: 'Roast mode 💀', copy: 'A “wip” commit message, failing tests or a leftover debugger costs you a little. Turn it off if you only want the W’s.' },
      { title: 'NPC to Final Boss', copy: 'Eight ranks: NPC, Side Character, Main Character, Locked In, Sigma, Aura Farmer, Goated and Final Boss, with a notification when you rank up.' },
      { title: 'Your 🔥 streak', copy: 'Code every day to keep it alive. Each streak day adds a bonus, and every move has a daily limit so aura can’t be farmed.' },
      { title: 'The Aura tool window', copy: 'A glowing ring with your aura, your rank and progress, the week as a chart, your best moves and every move. Your aura sits in the status bar too.' },
      { title: 'Share your aura card', copy: 'One click makes a 1200 × 630 card for X, Instagram and LinkedIn, with the caption copied. 100% local: no account, no telemetry.' },
    ],
    where: ['Your aura in the status bar (click it)', 'View → Tool Windows → Aura', 'Tools → Aura → Share My Aura Card…', 'Settings → Tools → Aura Veyra'],
    shot: {
      src: '/aura-jetbrains-card.png', width: 1200, height: 630, wide: true,
      alt: 'An aura card made by Aura Veyra: 1,150 aura, Locked In, a 7-day streak and +590 this week, with a glowing ring',
      caption: 'Your aura card, made in the Aura tool window: your aura, rank, streak and week, ready to post.',
      heading: 'Main character energy.',
      note: 'Also for VS Code, as Veyra Aura.',
    },
  },
  {
    slug: 'aurora',
    name: 'Veyra Aurora',
    tagline: 'The northern lights, in your IDE.',
    summary: 'A midnight-blue theme lit by the aurora: ice-blue keywords, aurora-green strings, teal functions and soft-violet types, plus a crisp light version. Every syntax colour meets WCAG AA.',
    version: '1.0.0',
    file: '/downloads/jetbrains/veyra-aurora-1.0.0.zip',
    size: '37 KB',
    icon: '/aurora-jetbrains.svg',
    since: '2024.3',
    marketplace: null,
    source: 'https://github.com/fcopensource/jetbrains-plugins/tree/main/veyra-aurora',
    released: '2026-11-22',
    features: [
      { title: 'Veyra Aurora and Aurora Light', copy: 'A deep midnight-blue sky with glowing aurora colours for long sessions, and a crisp white light theme in the same palette, deepened for contrast.' },
      { title: 'The whole IDE, not just the editor', copy: 'Toolbars, tool windows, tabs, popups, Search Everywhere, dialogs, the Run widget and notifications: 1,200+ UI keys, all in one palette.' },
      { title: 'The new Islands look', copy: 'On 2025.3 and newer you get JetBrains’ rounded Islands layout in aurora colours. Older IDEs get the classic New UI, just as polished.' },
      { title: 'Every language matches', copy: 'Ice-blue keywords, aurora-green strings, teal functions, violet types, pink fields and starlight-gold numbers in Java, Kotlin, Python, JS/TS, Go, Rust, PHP, SQL and the rest.' },
      { title: 'Signature details', copy: 'An aurora green-to-violet default button, an aurora-green caret and tab underline, a gold current line number and a green-to-violet progress bar.' },
      { title: 'Easy to read', copy: 'Every syntax colour meets WCAG AA contrast on its background, comments included. The debugger, diffs, VCS, search results and terminal are themed too.' },
    ],
    where: ['Settings → Appearance & Behavior → Appearance → Theme → Veyra Aurora or Veyra Aurora Light', 'The editor colour scheme switches with the theme (Settings → Editor → Color Scheme)', 'Quick switch: View → Quick Switch Scheme → Theme'],
    shot: {
      src: '/aurora-jetbrains-hero.png', width: 1600, height: 900, wide: true,
      alt: 'Veyra Aurora: an IDE window in midnight blue with ice-blue keywords, aurora-green strings, teal functions and violet types, under an aurora sky',
      caption: 'Veyra Aurora, drawn from its own colours: midnight blue with ice-blue keywords, aurora-green strings, teal functions, violet types and starlight-gold numbers.',
      heading: 'Code under the northern lights.',
      note: 'Veyra Aurora Light is in the same plugin: switch between them in Settings → Appearance.',
    },
  },
];

export const jetbrainsPlugin = (slug: string) => JETBRAINS_PLUGINS.find(p => p.slug === slug);
