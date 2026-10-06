// Detects whether the app is running inside a claude.ai Artifact viewer and,
// if so, exposes the viewer's capabilities:
//   sample    - ask Claude on the viewer's own account (no API key needed)
//   mcp       - the viewer's web-search connector (Exa) for live job search
//   downloads - save generated files (CVs, letters, backups)
// Standalone (a normal website / installed PWA) none of these exist and the
// app falls back to the Anthropic SDK with the user's API key.

export const inArtifact = typeof window !== 'undefined' && typeof window.claude?.use === 'function';

export const SEARCH_SERVER = 'Exa';
export const SEARCH_TOOL = 'web_search_exa';

export const caps = { sample: null, mcp: null, downloads: null };

export const ready = inArtifact
  ? Promise.all([
      window.claude.use('sample').catch(() => null),
      window.claude.use('mcp').catch(() => null),
      window.claude.use('downloads').catch(() => null),
    ]).then(([sample, mcp, downloads]) => {
      caps.sample = sample;
      caps.mcp = mcp;
      caps.downloads = downloads;
      return caps;
    })
  : Promise.resolve(caps);

// A capability that was declined stays declined for the rest of the view.
export function disable(name) {
  caps[name] = null;
}
