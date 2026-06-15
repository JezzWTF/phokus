import { useRef, useState } from "react";
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
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 lg:h-16 lg:px-6">
        <a href="#top" className="flex items-center gap-2.5 text-ink">
          <PhokusMark className="h-5 w-5 text-amber lg:h-6 lg:w-6" />
          <span className="font-display font-semibold tracking-tight lg:text-lg">Phokus</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#search" className="transition-colors hover:text-ink">Search</a>
          <a href="#explore" className="transition-colors hover:text-ink">Explore</a>
          <a href="#privacy" className="transition-colors hover:text-ink">Privacy</a>
          <a href={REPO_URL} className="transition-colors hover:text-ink">Source</a>
        </nav>
        <a
          href={DOWNLOAD_URL}
          className="hidden rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface md:block"
        >
          Download
        </a>
        <a
          href={REPO_URL}
          aria-label="View Phokus source on GitHub"
          className="grid h-9 w-9 place-items-center rounded-full border border-edge-strong text-muted transition-colors hover:bg-surface hover:text-ink md:hidden"
        >
          <GitHubIcon className="h-4 w-4" />
        </a>
      </div>
    </header>
  );
}

function MobileChapterNav() {
  return (
    <nav
      aria-label="Page sections"
      className="sticky top-14 z-40 flex gap-1 overflow-x-auto border-b border-edge bg-canvas/90 px-4 py-2 backdrop-blur-md lg:hidden"
    >
      {[
        ["Search", "#search"],
        ["Features", "#features"],
        ["Details", "#tech"],
        ["Download", "#download"],
      ].map(([label, href]) => (
        <a
          key={href}
          href={href}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

function MobileChapter({
  number,
  label,
  title,
  children,
}: {
  number: string;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lg:hidden">
      <div className="flex items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-faint">
        <span className="font-mono text-amber">{number}</span>
        <span className="h-px w-8 bg-edge-strong" />
        {label}
      </div>
      <h2 className="mt-3 max-w-[20rem] font-display text-[1.75rem] font-semibold leading-[1.08] tracking-tight text-ink">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="lg:hidden">
        <div className="relative h-[34svh] min-h-64 overflow-hidden border-b border-edge">
          <Shot
            pic={heroShot}
            alt="The Phokus gallery showing a dense library of landscape photos."
            className="absolute inset-0 h-full w-full object-cover object-[67%_top]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-canvas/20 via-transparent to-canvas" />
          <div className="absolute inset-x-5 top-5 flex items-center justify-between">
            <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[0.68rem] font-medium text-white/80 backdrop-blur">
              Your folders. Your machine.
            </span>
            <span className="flex items-center gap-1.5 text-[0.68rem] text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-amber" />
              Windows
            </span>
          </div>
        </div>

        <div className="relative -mt-7 px-5 pb-12">
          <h1 className="max-w-[21rem] font-display text-[2.45rem] font-semibold leading-[0.98] tracking-[-0.035em] text-ink">
            See everything.
            <br />
            Find anything.
          </h1>
          <p className="mt-4 max-w-[22rem] text-[0.95rem] leading-6 text-muted">
            Search and curate the images and videos already on your computer. Everything stays local.
          </p>
          <div className="mt-6">
            <a
              href={DOWNLOAD_URL}
              className="flex min-h-12 items-center justify-between rounded-xl bg-amber px-5 text-sm font-semibold text-canvas transition-colors hover:bg-amber-soft"
            >
              Download for Windows
              <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-edge border-y border-edge py-4 text-center">
            <span className="px-2 text-[0.68rem] leading-4 text-faint">
              <strong className="block font-medium text-ink">Local</strong>
              no uploads
            </span>
            <span className="px-2 text-[0.68rem] leading-4 text-faint">
              <strong className="block font-medium text-ink">Private</strong>
              no account
            </span>
            <span className="px-2 text-[0.68rem] leading-4 text-faint">
              <strong className="block font-medium text-ink">Offline</strong>
              after setup
            </span>
          </div>
        </div>
      </div>

      <div className="relative hidden min-h-[86vh] items-center lg:flex">
      {/* Product leads: the gallery dominates the right and bleeds off the frame,
          cropped so the workspace appears to continue beyond the viewport. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[62%]">
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

      <div className="relative mx-auto w-full max-w-7xl px-6 py-24">
        <div className="max-w-2xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-edge bg-surface/80 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" />
            Local-first · Windows desktop
          </p>
          <h1 className="font-display text-6xl font-semibold leading-[1.04] tracking-tight text-ink">
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
    <section id="privacy" className="relative hidden overflow-hidden border-y border-edge bg-surface lg:block">
      <EdgeMark side="left" />
      <div className="relative mx-auto max-w-7xl px-6 py-28">
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
      <div className="relative mx-auto max-w-7xl px-5 py-12 lg:px-6 lg:py-28">
        <MobileChapter number="02" label="Semantic search" title="Describe the image. Skip the filename.">
          <div className="mt-6 flex min-h-11 items-center gap-3 rounded-xl border border-edge-strong bg-surface px-4 shadow-lg shadow-black/20">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-amber">/s</span>
            <span className="text-sm text-ink">seaside</span>
            <span className="ml-auto text-xs text-faint">200 matches</span>
          </div>
          <div className="relative mt-3 h-80 overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl shadow-black/40">
            <Shot
              pic={semanticShot}
              alt="Coastal photos returned for a semantic search for seaside."
              className="h-full w-full object-cover object-[65%_center]"
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
            <p className="absolute bottom-4 left-4 right-4 text-xs leading-5 text-white/70">
              Coastlines, waves, shells and dunes, matched by visual meaning.
            </p>
          </div>
          <p className="mt-5 text-sm leading-6 text-muted">
            Search by mood, place, subject, or visual idea. CLIP runs on-device, so it still works
            offline and needs no manual tags.
          </p>
        </MobileChapter>

        <div className="hidden lg:block">
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
      </div>
    </section>
  );
}

function MobileFeatureDeck() {
  const [activeCard, setActiveCard] = useState(0);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);

  function updateActiveCard(event: React.UIEvent<HTMLDivElement>) {
    const deckCenter = event.currentTarget.scrollLeft + event.currentTarget.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((card, index) => {
      if (!card) return;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenter - deckCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActiveCard(nearestIndex);
  }

  function showCard(index: number) {
    cardRefs.current[index]?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }

  return (
    <section id="features" className="overflow-hidden border-y border-edge bg-surface py-12 lg:hidden">
      <div className="px-5">
        <MobileChapter number="03" label="More than search" title="Three ways to move through a library.">
          <p className="mt-4 text-sm leading-6 text-muted">
            Swipe through the core workflows. Each one stays focused on the media, not app chrome.
          </p>
        </MobileChapter>
      </div>

      <div
        onScroll={updateActiveCard}
        className="mt-7 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <article
          ref={(node) => { cardRefs.current[0] = node; }}
          className="w-[78vw] max-w-[19rem] shrink-0 snap-center overflow-hidden rounded-2xl border border-edge bg-canvas"
        >
          <div className="h-64 overflow-hidden">
            <Shot
              pic={exploreShot}
              alt="Visual clusters arranged across the Explore canvas."
              className="h-full w-full object-cover object-[54%_center]"
            />
          </div>
          <div className="p-4">
            <span className="font-mono text-[0.65rem] text-amber">EXPLORE</span>
            <h3 className="mt-2 font-display text-xl font-semibold text-ink">See visual clusters.</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Wander through related shots, then switch to a chronological timeline.
            </p>
          </div>
        </article>

        <article
          ref={(node) => { cardRefs.current[1] = node; }}
          className="w-[78vw] max-w-[19rem] shrink-0 snap-center overflow-hidden rounded-2xl border border-edge bg-canvas"
        >
          <div className="h-64 overflow-hidden">
            <Shot
              pic={lightboxShot}
              alt="A waterfall open in the Phokus lightbox."
              className="h-full w-full object-cover object-[37%_center]"
            />
          </div>
          <div className="p-4">
            <span className="font-mono text-[0.65rem] text-amber">CURATE</span>
            <h3 className="mt-2 font-display text-xl font-semibold text-ink">Review without leaving.</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Rate, favourite, tag, zoom, play video, and find similar images in place.
            </p>
          </div>
        </article>

        <article
          ref={(node) => { cardRefs.current[2] = node; }}
          className="w-[78vw] max-w-[19rem] shrink-0 snap-center overflow-hidden rounded-2xl border border-edge bg-canvas"
        >
          <div className="h-64 overflow-hidden">
            <Shot
              pic={duplicatesShot}
              alt="Duplicate image pairs selected for safe cleanup."
              className="h-full w-full object-cover object-[24%_top]"
            />
          </div>
          <div className="p-4">
            <span className="font-mono text-[0.65rem] text-amber">CLEANUP</span>
            <h3 className="mt-2 font-display text-xl font-semibold text-ink">Compare exact pairs.</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Confirm byte-identical files and choose what to remove. Nothing is automatic.
            </p>
          </div>
        </article>
      </div>

      <div className="flex items-center gap-2 px-5 text-[0.68rem] text-faint">
        {[0, 1, 2].map((index) => (
          <button
            key={index}
            type="button"
            aria-label={`Show feature ${index + 1}`}
            aria-current={activeCard === index ? "true" : undefined}
            onClick={() => showCard(index)}
            className={`h-1.5 rounded-full transition-[width,background-color] ${
              activeCard === index ? "w-8 bg-amber" : "w-1.5 bg-edge-strong"
            }`}
          />
        ))}
        <span className="ml-1">Swipe</span>
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
      className={`pointer-events-none absolute top-1/2 hidden h-[34rem] w-[34rem] -translate-y-1/2 text-ink opacity-[0.05] sm:block ${place}`}
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
    <section id="explore" className="relative hidden overflow-hidden border-t border-edge bg-surface lg:block">
      <EdgeMark side="left" />
      <div className="relative mx-auto max-w-7xl px-5 py-16 lg:px-6 lg:py-28">
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
    <section id="curate" className="relative hidden overflow-hidden lg:block">
      <EdgeMark side="right" />
      <div className="relative mx-auto max-w-7xl px-5 py-16 lg:px-6 lg:py-28">
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
    <section id="cleanup" className="relative hidden overflow-hidden border-t border-edge bg-surface lg:block">
      <EdgeMark side="left" />
      <div className="relative mx-auto max-w-7xl px-5 py-16 lg:px-6 lg:py-28">
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
    <section id="tech" className="relative mx-auto max-w-7xl px-5 py-12 lg:px-6 lg:py-28">
      <MobileChapter number="04" label="Technical details" title="The practical bits.">
        <div className="mt-6 divide-y divide-edge border-y border-edge">
          {facts.map((fact, index) => (
            <details key={fact.k} className="group py-1">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-2 text-sm font-medium text-ink">
                <span className="font-mono text-[0.68rem] text-faint">0{index + 1}</span>
                {fact.k}
                <span className="ml-auto text-lg font-light text-amber transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-5 pl-8 text-sm leading-6 text-muted">{fact.v}</p>
            </details>
          ))}
        </div>
      </MobileChapter>

      <div className="hidden lg:block">
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
      </div>
    </section>
  );
}

function DownloadSection() {
  return (
    <section id="download" className="relative overflow-hidden border-t border-edge bg-surface">
      <EdgeMark side="right" />
      <div className="relative mx-auto max-w-3xl px-5 py-12 text-left lg:px-6 lg:py-28 lg:text-center">
        <PhokusMark className="h-10 w-10 text-ink lg:mx-auto lg:h-12 lg:w-12" dotClassName="fill-amber" />
        <h2 className="mt-6 max-w-xs font-display text-[2rem] font-semibold leading-tight tracking-tight text-ink lg:mx-auto lg:max-w-none lg:text-4xl">
          Point Phokus at a folder.
        </h2>
        <p className="mt-4 max-w-md text-base leading-7 text-muted lg:mx-auto lg:text-lg lg:leading-relaxed">
          Turn a folder full of files into a library you can actually explore.
        </p>
        <div className="mt-8 grid gap-3 lg:flex lg:flex-wrap lg:justify-center">
          <a
            href={DOWNLOAD_URL}
            className="flex min-h-12 items-center justify-between rounded-xl bg-amber px-5 text-sm font-semibold text-canvas transition-colors hover:bg-amber-soft lg:min-h-0 lg:justify-center lg:rounded-lg lg:px-6 lg:py-3 lg:font-medium"
          >
            Download for Windows
            <span className="lg:hidden" aria-hidden="true">↓</span>
          </a>
          <a
            href={REPO_URL}
            className="flex min-h-12 items-center justify-between rounded-xl border border-edge-strong px-5 text-sm font-medium text-ink transition-colors hover:bg-surface-2 lg:min-h-0 lg:justify-center lg:gap-2 lg:rounded-lg lg:px-6 lg:py-3"
          >
            View source
            <GitHubIcon className="h-4 w-4" />
          </a>
        </div>
        <p className="mt-8 max-w-xl border-l border-amber/50 pl-4 text-left text-xs leading-5 text-muted lg:mx-auto lg:mt-10 lg:rounded-lg lg:border lg:border-edge lg:bg-canvas/60 lg:p-4 lg:text-sm lg:leading-relaxed">
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
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-xs text-faint lg:flex-row lg:items-center lg:justify-between lg:px-6 lg:py-10 lg:text-sm">
        <div className="flex items-center gap-2 text-muted">
          <PhokusMark className="h-5 w-5 text-amber" />
          <span className="font-display font-medium text-ink">Phokus</span>
          <span className="text-faint">· local-first media library</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
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
      <MobileChapterNav />
      <main>
        <Hero />
        <LocalFirst />
        <SearchSection />
        <MobileFeatureDeck />
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
