import type { GitRepo } from "@/types/Repository";

/**
 * Check if a GitHub repository is eligible for mirroring
 * Disabled repositories (DMCA takedowns, ToS violations) should not be mirrored
 */
export function isMirrorableGitHubRepo(repo: Pick<GitRepo, "isDisabled">): boolean {
  return repo.isDisabled !== true;
}
