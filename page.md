# Upload Voxel Frontier and Publish It with GitHub Pages

This guide explains how to upload the complete game to GitHub and publish it as a playable website. The project
already contains the Vite configuration and GitHub Actions workflow required for deployment.

## What GitHub Pages will do

When files are pushed to the `main` branch, GitHub Actions will:

1. Check out the repository.
2. Install the exact packages recorded in `package-lock.json`.
3. Run the strict TypeScript and Vite production build.
4. Upload the generated `dist/` directory as a GitHub Pages artifact.
5. Publish that artifact as the live website.

You do not need to upload a locally generated `dist/` directory. GitHub builds it automatically.

## Files that must be uploaded

Confirm these files and directories exist in the repository:

```text
.
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── src/
├── .gitignore
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
└── vite.config.ts
```

`README.md`, `page.md`, and the `.claude/` history files are documentation and may also be uploaded.

Do not upload these generated or machine-specific directories:

- `node_modules/`
- `dist/`
- `build/`
- `.env` files
- log files

The included `.gitignore` excludes these files when Git is used from the command line.

## Method 1: Upload with Git from the command line

This is the recommended method because it preserves every directory, including the hidden `.github/` workflow
directory.

### 1. Create an empty GitHub repository

1. Sign in at [github.com](https://github.com/).
2. Select the **+** menu in the upper-right corner.
3. Select **New repository**.
4. Enter a repository name, such as `voxel-frontier`.
5. Choose **Public** if you are using GitHub Free Pages.
6. Do not add a README, `.gitignore`, or license because this project already contains local files.
7. Select **Create repository**.

Keep the new repository page open. GitHub displays its HTTPS repository address, which resembles:

```text
https://github.com/YOUR-USERNAME/voxel-frontier.git
```

### 2. Open a terminal in the project directory

The terminal must be inside the directory containing `package.json`, `index.html`, and `vite.config.ts`.

### 3. Initialize and upload the repository

Replace `YOUR-USERNAME` and `voxel-frontier` with the values from the repository created above:

```bash
git init
git branch -M main
git add .
git commit -m "Publish Voxel Frontier"
git remote add origin https://github.com/YOUR-USERNAME/voxel-frontier.git
git push -u origin main
```

If the local project is already connected to the correct GitHub repository, do not run `git init` or
`git remote add origin` again. Upload the current changes with:

```bash
git add .
git commit -m "Configure GitHub Pages"
git push origin main
```

If Git reports that there is nothing to commit, the files are already committed. Run only `git push origin main`.

## Method 2: Upload with the GitHub website

Use this method if Git is not installed. The browser uploader must preserve the `src/` directory, and the hidden
workflow file must end up at the exact path `.github/workflows/deploy-pages.yml`.

### 1. Create the repository

Follow the repository creation steps in Method 1. After creation, remain on the repository's **Code** page.

### 2. Upload visible project files

1. Select **Add file**, then **Upload files**.
2. Drag the project files and the complete `src/` directory into the upload area.
3. Do not drag `node_modules/` or `dist/`.
4. Confirm that `package.json`, `package-lock.json`, `index.html`, `tsconfig.json`, and `vite.config.ts` appear in the
   upload list.
5. Enter a commit message such as `Upload Voxel Frontier`.
6. Commit the files directly to the `main` branch.

On macOS, folders beginning with a period may be hidden in Finder. Press `Command+Shift+.` to show hidden files if
you want to drag `.github/` into the browser.

### 3. Confirm the workflow file

After uploading, open the repository's **Code** page and confirm this exact path exists:

```text
.github/workflows/deploy-pages.yml
```

If `.github/` was not uploaded, create the workflow through GitHub:

1. Select **Add file**, then **Create new file**.
2. Enter `.github/workflows/deploy-pages.yml` in the filename field.
3. Open the local `.github/workflows/deploy-pages.yml` file in the editor.
4. Copy its entire contents into GitHub's file editor without changing the action hashes or indentation.
5. Select **Commit changes** and commit directly to `main`.

## Enable GitHub Pages

This repository setting is required once:

1. Open the GitHub repository.
2. Select **Settings** in the repository navigation bar.
3. Select **Pages** under **Code and automation** in the left sidebar.
4. Find **Build and deployment**.
5. Set **Source** to **GitHub Actions**.

Do not choose **Deploy from a branch**. This project must be built by Vite before it can be published.

## Start the first deployment

A commit to `main` normally starts deployment automatically. To start it manually:

1. Open the repository's **Actions** tab.
2. Select **Deploy Voxel Frontier to GitHub Pages**.
3. Select **Run workflow**.
4. Choose the `main` branch.
5. Select the green **Run workflow** button.

The workflow displays these major steps:

- Check out repository
- Set up Node.js
- Install locked dependencies
- Build production site
- Configure GitHub Pages
- Upload GitHub Pages artifact
- Deploy to GitHub Pages

Wait until the workflow and its deployment step display green check marks.

## Open the playable website

Open the completed workflow run and select the URL shown by the deployment job. GitHub Pages URLs normally use one
of these formats:

```text
https://YOUR-USERNAME.github.io/REPOSITORY-NAME/
https://YOUR-USERNAME.github.io/
```

The second form applies only when the repository itself is named `YOUR-USERNAME.github.io`.

The first deployment can take a few minutes to become available. Refresh the URL after the workflow succeeds if
GitHub initially displays a 404 page.

## Upload future changes

### With Git

After editing the game locally, run:

```bash
git add .
git commit -m "Describe the game update"
git push origin main
```

The push automatically starts a new build. GitHub keeps serving the previous successful version until the new
artifact is deployed.

### With the GitHub website

1. Open the file that needs to change and select the pencil icon, or use **Add file → Upload files**.
2. Commit the change to `main`.
3. Open **Actions** and watch the automatic deployment.

## Important security rules

- Never upload `.env` files, passwords, access tokens, API keys, or private credentials.
- Do not replace the full GitHub Action commit hashes with `main`, `master`, or other floating branch references.
- Do not paste a personal access token into the workflow. GitHub Pages uses its built-in OIDC permissions.
- Review dependency changes in both `package.json` and `package-lock.json` before uploading them.
- Keep the repository public unless the GitHub account plan supports Pages for private repositories.

## Troubleshooting

### The workflow does not appear in the Actions tab

Confirm the file exists at `.github/workflows/deploy-pages.yml` on the `main` branch. A similarly named file at the
repository root will not be recognized as a workflow.

### The workflow does not start after an upload

Confirm the commit was made to `main`. The workflow's automatic trigger listens specifically for pushes to `main`.
You can also start it with **Actions → Deploy Voxel Frontier to GitHub Pages → Run workflow**.

### Deployment says GitHub Pages is not enabled

Open **Settings → Pages** and change **Source** to **GitHub Actions**. Then rerun the failed workflow.

### The install step reports a package-lock mismatch

`package.json` and `package-lock.json` must be updated and uploaded together. Do not delete the lock file to bypass
the error; recreate it through the project's reviewed local dependency workflow.

### The website loads without scripts or styling

Confirm `vite.config.ts` was uploaded and still contains `base: "./"`. This setting makes compiled asset addresses
work below the repository's GitHub Pages path.

### GitHub Pages displays a 404 after a successful build

Wait several minutes and refresh. If the 404 remains, open the workflow run, confirm **Deploy to GitHub Pages**
succeeded, and use the exact URL displayed by that deployment step.

### The workflow is waiting for approval

Open **Settings → Environments → github-pages** and inspect its protection rules. Repository rules may require an
authorized reviewer before deployment can continue.

### The game works locally but not on Pages

Open the failed workflow step and read its error output. GitHub runs `npm ci` and `npm run build`, so TypeScript errors
or a lockfile mismatch must be corrected locally and uploaded before deployment can succeed.

