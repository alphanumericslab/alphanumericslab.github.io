# sameni.org

Source for [sameni.org](https://sameni.org), the website of the Alphanumerics Lab at Emory University and Georgia Tech. Built with Jekyll and served by GitHub Pages. This file is not published.

## Editing

| What | Where |
| --- | --- |
| Homepage text | `index.md` (Markdown below the front matter) |
| Homepage logo and tagline | `hero:` in the front matter of `index.md` |
| Projects | `projects.md` |
| Team members, alumni and photos | `_data/team.yml` (photos go in `Team/`) |
| Lab manual | `about.md` |
| Header menu | `header_pages:` in `_config.yml` (a page's `menu_title` overrides its title in the menu) |
| Footer links | `social_links:` in `_config.yml` |
| Colors, fonts, spacing | `assets/css/main.css` (tokens at the top, with a dark-mode block) |
| Interactive demos and papers | `resources/` (served as-is) |

To add someone to the team, copy an existing entry in `_data/team.yml`, change the fields, and add their photo to `Team/`. Moving a person from `members` to `alumni` moves them on the page.

On the Projects page, the contents list at the top is styled by the `{: .toc }` line directly under it. Section anchors (`<a name="...">`) are what the list links to, so keep them when editing headings.

Add `math: true` to a page's front matter to load MathJax.

## Domain

`CNAME` must contain exactly `sameni.org`. Don't add it to `exclude:` in `_config.yml`.

## Local preview

```sh
bundle install
bundle exec jekyll serve
```

Then open http://localhost:4000.

## Deployment

Pushing to `master` runs `.github/workflows/jekyll.yml`, which builds and deploys to GitHub Pages (Settings → Pages → Source: GitHub Actions).
