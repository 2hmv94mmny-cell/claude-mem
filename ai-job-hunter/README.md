# AI Job Hunter

A website that helps you find a job faster, and installs as an app on phones and desktops.

- **Find jobs**: search free job boards (Remotive, Arbeitnow), or let Claude search the whole web for openings that fit your profile. Claude can also score how well each result matches your CV.
- **Adapt your CV and cover letter**: generate a CV tailored to each posting, plus a cover letter in the tone you choose. You can edit, copy, download (.md) or print/save as PDF. The prompts forbid inventing experience the CV doesn't support.
- **Track applications**: a kanban board (Saved → Applied → Interview → Offer → Rejected) with drag and drop, notes and a history of status changes.
- **Prepare for interviews**: a prep guide with likely questions, STAR answer outlines drawn from your CV, and questions to ask them. A mock interviewer asks one question at a time and gives feedback on each answer.

It's plain HTML, CSS and JavaScript with no build step and no backend. All data (profile, jobs, documents) stays in the user's browser.

## Run it

```bash
cd ai-job-hunter
python3 -m http.server 8080      # or: npx serve .
# open http://localhost:8080
```

Then:

1. Go to **Profile** and paste your CV.
2. Go to **Settings** and add an Anthropic API key from [console.anthropic.com](https://console.anthropic.com). Job search and the tracker work without a key; the AI features need one.
3. Use **Find** to search, or **Add a job I found** to paste in a posting from anywhere else.

## Deploy

Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3. Upload the `ai-job-hunter/` folder. To be installable as an app it must be served over HTTPS (localhost is fine for testing).

## Turn it into an app

**Installable web app (already done).** The site ships a web app manifest and a service worker, so it can be installed as-is:

- Android / Chrome / Edge: use the **Install app** button or the browser menu → *Install app*.
- iPhone / iPad: in Safari, tap Share → *Add to Home Screen*.
- Desktop Chrome / Edge: click the install icon in the address bar.

Once installed it opens full-screen, works offline (searching and AI still need a connection), and has home-screen shortcuts.

**App Store / Google Play.** To publish to the stores, wrap the same files with [Capacitor](https://capacitorjs.com):

```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "AI Job Hunter" com.example.jobhunter --web-dir .
npx cap add android && npx cap add ios
npx cap open android   # or: npx cap open ios
```

Alternatively, [PWABuilder](https://www.pwabuilder.com) can generate store packages straight from the deployed URL.

## How the AI works

`js/ai.js` calls Claude through the official Anthropic JS SDK (loaded as an ES module from jsDelivr):

| Feature | What Claude does |
| --- | --- |
| AI web search | Uses the `web_search` server tool to find real, open postings and return them as JSON |
| Match scoring | Scores each search result 0–100 against your CV, with a one-line reason |
| Fit analysis | Lists strengths, gaps, keywords to include and how to close the gaps |
| Tailored CV / cover letter | Rewrites your CV for the posting and drafts a specific cover letter |
| Interview prep / mock interview | Writes a prep guide, then runs a turn-by-turn mock interview with feedback |

Responses stream in as they're written. The default model is Claude Opus 5.5; you can switch to Claude Sonnet 5.5 and change the effort level in Settings.

**About the API key:** the key is kept in `localStorage` and sent only to `api.anthropic.com`. That's fine for a personal app. For a public multi-user site, add a small backend that holds the key and calls the API, point `ai.js` at it, and remove `dangerouslyAllowBrowser`.

## Files

```
ai-job-hunter/
├── index.html             App shell and navigation
├── styles.css             Responsive styles (sidebar on desktop, bottom tabs on mobile, dark mode)
├── manifest.webmanifest   App manifest (name, icons, shortcuts)
├── sw.js                  Service worker for offline use
├── icons/                 App icons (SVG, 192, 512, maskable)
└── js/
    ├── app.js             Router and all screens
    ├── ai.js              Claude prompts and API calls
    ├── jobs.js            Job board search, plus demo listings used when offline
    ├── store.js           Local-first state (localStorage), export/import
    └── ui.js              DOM helpers, safe Markdown renderer, toast, print/download
```

## Live link (claude.ai)

The app is published as a claude.ai artifact: https://claude.ai/artifact/QKNv5QPa6ExDHzDRsJ35va

`artifact.html` is its entry page; it loads the same `styles.css` and `js/` files. Inside the claude.ai viewer the app adapts automatically (`js/runtime.js`):

- AI features run on the viewer's own Claude account (`sample` capability), so no API key is needed.
- Live job search uses the viewer's Exa web-search connector, because the viewer blocks direct calls to job boards.
- Files are saved through the viewer's download prompt. Printing isn't available there.

When you change the app, republish `artifact.html` with the same files so the link stays the same.
