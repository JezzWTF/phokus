# External CI

CI and release builds run on the GitHub mirror because they require Windows
runner capacity. The GitHub workflows report their state back to this Gitea
repository through the commit status API.

Keep this directory in the repository. Gitea checks `.gitea/workflows` before
falling back to `.github/workflows`; an existing directory with no workflow
files prevents the GitHub-only workflows from being queued by Gitea Actions.

## Setup

1. In Gitea, create an access token with `write:repository` permission for an
   account that can update `JezzWTF/phokus`.
2. In the GitHub repository, add that token as the Actions repository secret
   `GITEA_STATUS_TOKEN`.

The status steps are non-blocking. If Gitea is temporarily unavailable, the
GitHub build result is preserved and the failed status update remains visible
in the workflow log.
