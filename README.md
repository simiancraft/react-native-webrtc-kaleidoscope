# Asset CDN — do not delete or rewrite

This branch is the project's permanent asset store: GIFs, screenshots, and media
embedded by `raw.githubusercontent.com` URL in the README, PRs, and issues. It is
**never merged to `main`** (that would bloat the npm tarball) and is **protected
from deletion and force-push** by the ruleset "Protect evidence asset CDN". Keep
adding assets with normal fast-forward commits; never delete the branch or rewrite
its history.

Git is our CDN.
