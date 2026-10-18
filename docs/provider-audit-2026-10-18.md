# Provider audit (2026-10-18)

This is a point-in-time check from the development environment. HTTP 200 means
only that a page responded; it does not establish that an embedded source is
playable or that a download target is a video file. We do not bypass challenges,
invalid TLS, or site-published automation restrictions.

| Initial priority | Source | Observed response / structure | Nanime status |
| ---: | --- | --- | --- |
| 1 | Animasu | Search page returned HTTP 200 and an actual `.bs` result linking to `/anime/tenki-no-ko-indonesia/`. The supplied watch page also returned HTTP 200, but its player is a `short.ink` iframe; the public WP REST post returned empty rendered content. The anime detail result had no episode list. | Search and catalog detail adapter enabled; no stream or download claimed validated. The supplied one-off watch page is not used as a universal ID. |
| 2 | Anitoki | Supplied episode URL returned HTTP 200 and a Next.js page. Initial HTML had no iframe or video source; no public media API was established. | Not registered as a working stream adapter. |
| 3 | Moeclip | Supplied episode URL returned HTTP 200; WordPress page had `iframe.anime-video` with an empty `src`. | Not registered as a working stream adapter. |
| 4 | Sokuja (`x6.sokuja.uk`) | Response included `x-security-testing-policy: deny`. Automated inspection stopped. | Blocked from adapter scraping. |
| 5 | Kuronime | Homepage returned HTTP 502 from Cloudflare. | Blocked/unavailable at audit time. |
| 6 | Gomunime | Search page returned HTTP 200 with `.card-netflix` anchors. `/one-piece` returned a detail page and `a.ept[data-n]` episode references. `/one-piece-episode-1180` returned three third-party iframe server pages, no `<video>` or manifest in the page itself. | Search, detail, episode list, and external embed adapter enabled. Embed pages remain explicitly `external-embed`; no download adapter and no direct media is claimed. |
| 7 | Moenime | Homepage and WordPress REST discovery responded HTTP 200. Live cards use `article.meownime`, root-level post URLs, `tag-movie`, and `tag-ongoing`; a Movie section is present. Search redirected to `/search/<query>`. | Custom search/home/detail/download-page adapter enabled. Extracted download links are marked `unverified`; no file reachability is claimed. It is last in the download fallback order. |
| 8 | Nontonanime | Homepage returned HTTP 200 with server-rendered cards and visible genre labels including Ecchi/Hentong. Search UI showed a loading placeholder; no search or media API was verified. | Not registered as a working search/media adapter. |
| Special | Nekopoi | TLS validation failed because the certificate subject did not match `nekopoi.care`. | Not registered; certificate checks were not bypassed. |
| Special | CijaNepoi | Blogger page returned HTTP 200. Its current home cards expose episode images with `72x72` dimensions and episode-specific alt text, not reliable landscape hero artwork. | Not used for weekly hero art; matching those thumbnails to ranked anime would be unsafe. |

Representative measured response times from one curl sample: Animasu search
4.0 s, Moeclip search 3.6 s, Moenime search 8.4 s, Gomunime search 8.4 s,
Nontonanime search-path request 10.5 s. These are single-run environment
measurements, not service-level benchmarks. Some large pages completed body
transfer after the 15 s command timeout; those are not counted as successful
full-page fetches.

The two retired API hosts requested for removal were searched across tracked
and hidden repository files (excluding generated `node_modules` and `dist`) and
were not present. No replacement or fallback references were added.
