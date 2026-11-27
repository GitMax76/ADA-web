# Release and rollback

Before deploying a release, identify the last successful Pages deployment and
push an annotated `rollback/pre-VERSION-DATE` tag pointing to its exact commit.
Never replace an existing rollback tag. Keep personal documents and OCR outputs
outside this repository.

## Restore the previous production release

The 0.3.4-beta revision immediately before 0.3.8-beta is commit
`fe3ca6f2c918754bc63f9e4a0fdbecbc95226e78`.
The recovery branch is `rollback/pre-0.3.8-20261127`.

In GitHub Actions, select **Deploy GitHub Pages**, **Run workflow**, branch
**main**, and set **release_ref** to that recovery branch. The workflow checks out the saved
source and lockfile, builds, tests and deploys it without rewriting main history.

Equivalent command:

```sh
gh workflow run deploy.yml --repo GitMax76/ADA-web --ref main -f release_ref=rollback/pre-0.3.8-20261127
```

Wait for the deploy job to succeed and check the live page. A rollback does not
change the main branch: a subsequent push to main deploys main again. Resolve or
revert the faulty change before resuming normal deployments.

The PWA does not force reloads during active sessions. Users must export their
work, close all ADA tabs and reopen the site to activate an update or rollback.
Refreshing a document session can discard its in-memory work.

## Scope of 0.3.4-beta

Includes document selection, OCR orientation/high-resolution processing, complete
addresses, spaced email detection and signature-area suggestions requiring human
confirmation. Suggestions are not handwriting recognition. Manual review of all
pages remains necessary, including indirect identifiers and missed handwriting.
