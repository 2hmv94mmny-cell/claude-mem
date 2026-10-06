# AI Job Hunter design system

How the app looks and behaves, and why. Change the tokens in `styles.css`, not individual components.

## What the research says job seekers need

| Finding | Source | What we did |
| --- | --- | --- |
| Relevant results and good filters explain the largest share of a job site's UX score; irrelevant matches are the top complaint on Indeed, Glassdoor, Monster and ZipRecruiter. | MeasuringU benchmark of four job sites | Every search is ranked against the user's CV, with a match % and a one-line reason. Site filters are inline chips, not hidden in a modal. |
| Salary is the information users want most. | MeasuringU | Salary gets its own green chip on cards and job pages whenever we have it. |
| Opening a job beside the results (split view) made people open and compare more jobs; Reed measured +8.2% applications, +14.8% job clicks, +31.5% saves when jobs stopped opening on a new page. | Workday career site redesign; Reed.co.uk A/B test | Find uses a list/detail split view on desktop. On phones a job opens full screen. |
| Users mostly look at the first 3–4 results. | Indeed usability study (scroll maps) | Compact cards: title, company, key facts, one line of reasoning. Best match first. |
| About half of users find it hard to track applications. | MeasuringU | Applications tracker in the main navigation, pipeline counts on Home. |
| One clear primary action per screen; inconsistent apply buttons confuse people. | LinkedIn Jobs heuristic audit | One filled button per area: "Search", "Tailor my CV", "Apply on company site". Everything else is secondary. |

## Foundations

- **Colour**: one brand blue (`--accent`, #2051d6 light / #7ea3ff dark), cool neutrals with a slight blue bias, and separate success, warning and danger colours. No gradients on controls. Every component uses semantic tokens (`--surface`, `--text`, `--border`…), so light and dark mode are a token swap.
- **Type**: Figtree for the interface. 16px body text, scale 12 / 14 / 16 / 18 / 20 / 24 / 30 and a fluid display size for the Home headline. Line length capped around 65–75 characters for reading text.
- **Spacing**: 4px grid (`--sp-1` 4px through `--sp-12` 48px). Layouts use `gap`, not margins.
- **Shape and depth**: radius 6px for controls, 10px for cards, 16px for sheets. Cards are flat with a 1px border; shadows only for raised things (search bar, sticky panels, dialogs).
- **Controls**: buttons 40px high (44px on touch screens), small buttons 32px (36px touch). Inputs 44px. Visible 2px focus ring on everything keyboard-reachable.
- **Accessibility**: WCAG 2.2 AA text contrast (4.5:1), target sizes above the 24px minimum and 44px on touch, reduced-motion support, landmarks (header, main, nav) and a skip link.

## Layout

- Desktop: sticky top app bar (logo, Home, Find jobs, Applications, Profile & CV, settings) and content centred at 1200px.
- Phones: compact top bar with settings, and a bottom tab bar with the four main destinations.
- Home: what/where search first, then "Jobs for you" ranked against the CV, with a side column for the application pipeline, profile strength and next steps.
- Find: sticky search bar and filter chips, results list on the left, job details on the right.
- Job page: a summary header with key facts and "Apply on company site", then tabs for overview, CV & cover letter, and the interview game.
