# GitHub Pages Setup — Motorcycle MasterLink

## Important
GitHub Pages hosts static files for free, but it does not process Netlify Forms.

For appointment requests, use one of these:
1. Formspree free form endpoint
2. Google Forms embedded/linked
3. Netlify hosting instead
4. Later: custom backend/API

## Manual GitHub Pages deploy
1. Create a GitHub repo, for example: `motorcycle-masterlink-site`
2. Upload these files to the repo root:
   - index.html
   - thank-you.html
   - netlify.toml (harmless on GitHub)
   - .nojekyll
   - assets/logo.jpg
3. Go to repo Settings → Pages
4. Source: Deploy from branch
5. Branch: main / root
6. Save
7. GitHub will provide a URL like:
   `https://USERNAME.github.io/motorcycle-masterlink-site/`

## Better form option on GitHub
Replace the current form backend with Formspree or Google Forms before launch.
