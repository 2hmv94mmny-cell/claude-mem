# Business website

Next.js landing page, exported as a static site.

- Edit the text in `content.ts` (business name, services, prices, hours, FAQ).
- Styles live in `app/globals.css`; page structure in `app/page.tsx`.

```bash
cd website
npm install
npm run dev      # http://localhost:3000
npm run build    # static site in out/
```

Deploy on Vercel or Netlify by setting the project's root directory to `website`.

To refresh the Claude artifact version: `npm run build && node scripts/export-artifact.mjs <file>`, then publish that file.
