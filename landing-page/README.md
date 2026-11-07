# Xarab landing page

Static landing page for [Xarab](https://github.com/lexmihaylov/xarab), designed for GitHub Pages. No build step or package dependencies are required.

## Local preview

From this directory, run a static server, for example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Publish on GitHub Pages

The repository-root workflow at `/.github/workflows/pages.yml` deploys the site on pushes to `main` and can also be run manually. In the repository's **Settings → Pages**, set the build and deployment source to **GitHub Actions**. The workflow uploads `landing-page/` as a static artifact; relative asset paths work for project pages.
