import { PhokusMark } from "./components/PhokusMark";
// Screenshots are 2560×1600 masters; imagetools downscales + transcodes to
// AVIF/WebP at build (see the Shot helper). `as=picture` must be the last query
// param so the `*as=picture` module declaration matches.
import heroShot from "../assets/screenshots/phokus_galleryHero.jpg?w=1600&format=avif;webp&quality=50&as=picture";
import semanticShot from "../assets/screenshots/phokus_semanticSearch.jpg?w=1600&format=avif;webp&quality=50&as=picture";
import exploreShot from "../assets/screenshots/phokus_exploreClusters.png?w=1600&format=avif;webp&quality=50&as=picture";
import timelineShot from "../assets/screenshots/phokus_timeline.jpg?w=1600&format=avif;webp&quality=50&as=picture";
import lightboxShot from "../assets/screenshots/phokus_lightboxWithTags.jpg?w=1600&format=avif;webp&quality=50&as=picture";
import videoShot from "../assets/screenshots/phokus_videoPlayer.jpg?w=1600&format=avif;webp&quality=50&as=picture";
import duplicatesShot from "../assets/screenshots/phokus_duplicates.png?w=1600&format=avif;webp&quality=50&as=picture";

const REPO_URL = "https://github.com/JezzWTF/phokus";
const DOWNLOAD_URL = "https://github.com/JezzWTF/phokus/releases/latest";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

// Renders an imagetools `?as=picture` import: AVIF + WebP sources with the WebP
// fallback on the <img>. `display:contents` so the layout/rounding lives on the
// <img>, exactly as a bare <img> would. width/height come from the transcode to
// reserve space and avoid layout shift.
type PictureImport = { sources: Record<string, string>; img: { src: string; w: number; h: number } };

function Shot({
  pic,
  alt,
  className,
  ariaHidden,
}: {
  pic: PictureImport;
  alt: string;
  className?: string;
  ariaHidden?: boolean;
}) {
  return (
    <picture className="contents">
      {Object.entries(pic.sources).map(([type, srcSet]) => (
        <source key={type} type={type} srcSet={srcSet} />
      ))}
      <img
        src={pic.img.src}
        width={pic.img.w}
        height={pic.img.h}
        alt={alt}
        aria-hidden={ariaHidden}
        className={className}
      />
    </picture>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-edge bg-canvas/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2.5 text-ink">
          <PhokusMark className="h-6 w-6 text-amber" />
          <span className="font-display text-lg font-semibold tracking-tight">Phokus</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#search" className="transition-colors hover:text-ink">Search</a>
          <a href="#explore" className="transition-colors hover:text-ink">Explore</a>
          <a href="#privacy" className="transition-colors hover:text-ink">Privacy</a>
          <a href={REPO_URL} className="transition-colors hover:text-ink">Source</a>
        </nav>
        <a
          href={DOWNLOAD_URL}
          className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
        >
          Download
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden lg:flex lg:min-h-[86vh] lg:items-center">
      {/* Product leads: the gallery dominates the right and bleeds off the frame,
          cropped so the workspace appears to continue beyond the viewport. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] lg:block">
        <Shot
          pic={heroShot}
          alt=""
          ariaHidden
          className="h-full w-full object-cover object-left-top"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-canvas)_0%,transparent_46%)]" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-canvas to-transparent" />
      </div>
      <div className="pointer-events-none absolute -left-24 top-8 -z-10 h-96 w-96 rounded-full bg-amber/[0.06] blur-3xl" />

      <div className="relative mx-auto w-full max-w-7xl px-6 py-20 lg:py-24">
        <div className="max-w-2xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-edge bg-surface/80 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" />
            Local-first · Windows desktop
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.04] tracking-tight text-ink sm:text-6xl">
            Your local media library,
            <br />
            made searchable.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
            Browse, understand, and curate large image and video folders — semantic search, visual
            discovery, and duplicate cleanup over the files already on your computer.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={DOWNLOAD_URL}
              className="rounded-lg bg-amber px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-amber-soft"
            >
              Download for Windows
            </a>
            <a
              href={REPO_URL}
              className="inline-flex items-center gap-2 rounded-lg border border-edge-strong bg-canvas/60 px-5 py-2.5 text-sm font-medium text-ink backdrop-blur transition-colors hover:bg-surface"
            >
              <GitHubIcon className="h-4 w-4" />
              View source
            </a>
          </div>
          <p className="mt-5 text-sm text-faint">
            Windows 10/11 · Open source · On-device processing · No account
          </p>
        </div>
      </div>

      {/* Mobile/tablet: product sits below the copy, still bleeding off the right. */}
      <div className="-mr-6 mt-2 overflow-hidden rounded-l-xl border-y border-l border-edge lg:hidden">
        <Shot
          pic={heroShot}
          alt="The Phokus gallery: a virtualized grid of landscape photos with star ratings, a folder sidebar, filter tabs, and a search bar."
          className="block w-full"
        />
      </div>
    </section>
  );
}

function LocalFirst() {
  const points = [
    {
      title: "Your files stay put",
      body: "Phokus reads the folders you point it at. Media and everything it derives — thumbnails, embeddings, tags, ratings — never leave your machine.",
    },
    {
      title: "On-device intelligence",
      body: "Semantic search and AI tagging run locally. The models download once on first use; after that, search works offline.",
    },
    {
      title: "No account, no cloud",
      body: "No sign-up, no telemetry, no server. The only network traffic is the one-time model downloads and checking for updates.",
    },
  ];
  return (
    <section id="privacy" className="relative overflow-hidden border-y border-edge bg-surface">
      <EdgeMark side="left" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-28">
        <div className="max-w-2xl">
          <SectionEyebrow label="Local-first" />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            A library that stays on your machine.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Phokus runs entirely on your computer. Nothing is uploaded, and there's nothing to sign
            into — your photos and everything Phokus learns about them stay with you.
          </p>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-3">
          {points.map((p) => (
            <div key={p.title} className="bg-surface p-6">
              <h3 className="text-base font-medium text-ink">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionEyebrow({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-faint">
      <PhokusMark className="h-4 w-4 text-muted" dotClassName="fill-amber" />
      {label}
    </span>
  );
}

function SearchSection() {
  return (
    <section id="search" className="relative overflow-hidden">
      <EdgeMark side="right" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-28">
        <div className="max-w-2xl">
          <SectionEyebrow label="Search by meaning" />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Find it by what it looks like, not what it's named.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Type{" "}
            <code className="rounded-md border border-edge bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
              /s seaside
            </code>{" "}
            and Phokus returns coastlines, breaking waves, and shells — ranked by visual meaning with an
            on-device CLIP model. No tags required, and it keeps working offline.
          </p>
        </div>

        <figure className="relative mt-12 overflow-hidden rounded-xl border border-edge bg-surface shadow-2xl shadow-black/50">
          <Shot
            pic={semanticShot}
            alt="Phokus showing a semantic search for 'seaside': a grid of coastal photos — beaches, breaking waves, shells, and a jellyfish — matched by visual meaning rather than filename."
            className="block w-full"
          />
        </figure>
      </div>
    </section>
  );
}

// Recurring aperture motif. One mark per section, vertically centered and bleeding
// off the LEFT or RIGHT edge, sides alternating down the page — a clean zigzag that
// never lets two marks collide at a section boundary (corner placement did).
//
// The iris is the full mark, but with blades reconstructed to meet the rim
// *tangentially* — each blade is an arc internally tangent to the rim (radius 3.93,
// center on the line out to the tip), so it kisses the circle and peels inward to
// the opening instead of crossing it. The shipped logo's blades use radius 10
// (== rim), which reads fine at icon size but looks "broken" blown up huge; this is
// the same mark, geometrically clean at any scale.
const WM_BLADE = "M0,-4.18 A3.93,3.93 0 0 1 6.43,-7.66";

function EdgeMark({ side }: { side: "left" | "right" }) {
  const place = side === "left" ? "-left-[19rem]" : "-right-[19rem]";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none absolute top-1/2 h-[34rem] w-[34rem] -translate-y-1/2 text-ink opacity-[0.05] ${place}`}
    >
      <g
        transform="translate(12 12)"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle r="10" />
        <path d="M0,-4.18 A4.73,4.73 0 0 0 3.62,-2.09 A4.73,4.73 0 0 0 3.62,2.09 A4.73,4.73 0 0 0 0,4.18 A4.73,4.73 0 0 0 -3.62,2.09 A4.73,4.73 0 0 0 -3.62,-2.09 A4.73,4.73 0 0 0 0,-4.18 Z" />
        <path d={WM_BLADE} />
        <path d={WM_BLADE} transform="rotate(60)" />
        <path d={WM_BLADE} transform="rotate(120)" />
        <path d={WM_BLADE} transform="rotate(180)" />
        <path d={WM_BLADE} transform="rotate(240)" />
        <path d={WM_BLADE} transform="rotate(300)" />
      </g>
    </svg>
  );
}

function ExploreSection() {
  return (
    <section id="explore" className="relative overflow-hidden border-t border-edge bg-surface">
      <EdgeMark side="left" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionEyebrow label="Explore & timeline" />
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              See the shape of everything you've shot.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Explore groups your library into visual clusters — sets of similar shots you can open and
              wander, gathered by what they look like rather than where they're filed. A tag cloud
              surfaces recurring themes, and the Timeline walks everything by the date it was taken.
            </p>
          </div>
          <figure className="overflow-hidden rounded-xl border border-edge bg-canvas shadow-2xl shadow-black/50 lg:col-span-7">
            <Shot
              pic={exploreShot}
              alt="The Explore view: clusters of related photos scattered across a dark canvas, each labelled with a count."
              className="block w-full"
            />
          </figure>
        </div>
        <figure className="mt-6 overflow-hidden rounded-xl border border-edge bg-canvas shadow-xl shadow-black/40">
          <Shot
            pic={timelineShot}
            alt="The Timeline view: media grouped into month sections such as May 2024, June 2024, and July 2024."
            className="block max-h-80 w-full object-cover object-top"
          />
        </figure>
      </div>
    </section>
  );
}

function CurateSection() {
  return (
    <section id="curate" className="relative overflow-hidden">
      <EdgeMark side="right" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <figure className="order-2 overflow-hidden rounded-xl border border-edge bg-surface shadow-2xl shadow-black/50 lg:order-1 lg:col-span-7">
            <Shot
              pic={lightboxShot}
              alt="The Phokus lightbox: a waterfall photo with a details panel showing rating stars, dimensions, file size, embedding status, and AI tags."
              className="block w-full"
            />
          </figure>
          <div className="order-1 lg:order-2 lg:col-span-5">
            <SectionEyebrow label="Review & curate" />
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Rate, tag, and dig in — without losing your place.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Open anything full-screen with zoom and pan, set ratings and favourites, edit tags, or
              search within an image for look-alikes. Video gets a proper player too — scrubbing,
              volume, speed, and fullscreen.
            </p>
          </div>
        </div>
        <figure className="mt-6 overflow-hidden rounded-xl border border-edge bg-surface shadow-xl shadow-black/40">
          <Shot
            pic={videoShot}
            alt="The Phokus video player: a video open full-screen with playback controls and a details panel."
            className="block max-h-[26rem] w-full object-cover object-center"
          />
        </figure>
      </div>
    </section>
  );
}

function CleanupSection() {
  return (
    <section id="cleanup" className="relative overflow-hidden border-t border-edge bg-surface">
      <EdgeMark side="left" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-28">
        <div className="max-w-2xl">
          <SectionEyebrow label="Clean up safely" />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Find exact duplicates and reclaim the space.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            A three-pass scan — size, then a sample hash, then a full hash — groups byte-identical files
            so you can review each set and bulk-delete with confidence. Nothing is removed without your
            say-so.
          </p>
        </div>
        <figure className="mt-12 overflow-hidden rounded-xl border border-edge bg-canvas shadow-2xl shadow-black/50">
          <Shot
            pic={duplicatesShot}
            alt="The Duplicate Finder: groups of duplicate photos with per-group sizes, reclaimable space, and bulk-delete controls."
            className="block w-full"
          />
        </figure>
      </div>
    </section>
  );
}

function TechFactsSection() {
  const facts = [
    { k: "Platform", v: "Windows 10 / 11 (x64). The installer fetches the WebView2 runtime if it's missing." },
    { k: "Media", v: "Common image formats plus video — thumbnails and metadata come from a bundled FFmpeg." },
    { k: "On-device AI", v: "CLIP embeddings power semantic search (~580 MB); an optional WD tagger (~1.3 GB) adds tags." },
    { k: "Inference", v: "CPU / DirectML in the standard build; an optional CUDA build accelerates NVIDIA GPUs." },
    { k: "Storage", v: "A local SQLite database and thumbnail cache in your app-data folder. Nothing in the cloud." },
    { k: "License & build", v: "MIT, open source. The installer is currently unsigned — see the note below." },
  ];
  return (
    <section id="tech" className="relative mx-auto max-w-7xl px-6 py-24 sm:py-28">
      <div className="max-w-2xl">
        <SectionEyebrow label="The technical facts" />
        <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          What you're actually running.
        </h2>
      </div>
      <dl className="mt-12 grid gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.k} className="bg-canvas p-6">
            <dt className="text-sm font-medium text-ink">{f.k}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">{f.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DownloadSection() {
  return (
    <section id="download" className="relative overflow-hidden border-t border-edge bg-surface">
      <EdgeMark side="right" />
      <div className="relative mx-auto max-w-3xl px-6 py-24 text-center sm:py-28">
        <PhokusMark className="mx-auto h-12 w-12 text-ink" dotClassName="fill-amber" />
        <h2 className="mt-6 font-display text-4xl font-semibold tracking-tight text-ink">
          Point Phokus at a folder.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Free and open source. Your library is indexed on your machine — the download is just the app.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={DOWNLOAD_URL}
            className="rounded-lg bg-amber px-6 py-3 text-sm font-medium text-canvas transition-colors hover:bg-amber-soft"
          >
            Download for Windows
          </a>
          <a
            href={REPO_URL}
            className="inline-flex items-center gap-2 rounded-lg border border-edge-strong px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
          >
            <GitHubIcon className="h-4 w-4" />
            View source
          </a>
        </div>
        <p className="mx-auto mt-10 max-w-xl rounded-lg border border-edge bg-canvas/60 p-4 text-left text-sm leading-relaxed text-muted">
          <span className="font-medium text-ink">Heads up:</span> this build isn't code-signed yet, so
          Windows SmartScreen will warn that the publisher is unrecognised — choose{" "}
          <span className="text-ink">More info → Run anyway</span>. An NVIDIA CUDA build is on the
          releases page too.
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-10 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-muted">
          <PhokusMark className="h-5 w-5 text-amber" />
          <span className="font-display font-medium text-ink">Phokus</span>
          <span className="text-faint">· local-first media library</span>
        </div>
        <div className="flex items-center gap-6">
          <a href={REPO_URL} className="transition-colors hover:text-ink">GitHub</a>
          <a href="https://git.jezz.wtf/JezzWTF/phokus" className="transition-colors hover:text-ink">Gitea</a>
          <a href={`${REPO_URL}/blob/main/LICENSE`} className="transition-colors hover:text-ink">MIT</a>
          <span>JezzWTF</span>
        </div>
      </div>
    </footer>
  );
}

export function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <LocalFirst />
        <SearchSection />
        <ExploreSection />
        <CurateSection />
        <CleanupSection />
        <TechFactsSection />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  );
}
