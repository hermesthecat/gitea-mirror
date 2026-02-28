# Starred Repository Duplicate Issue - Detailed Analysis and Solution Plan

## Problem Summary

When mirroring starred repositories to the `starred/` organization, many duplicate repos were created:
- Repos with suffixes like `reponame-owner-1`, `reponame-owner-2`, ..., `reponame-owner-7`
- Out of ~700 starred repos, ~100 had numeric suffixes (%-N format)
- Some repos were retried up to 292 times

## Root Causes

### 1. Same-Named Repos from Different GitHub Owners

The database contains starred repos with the same name from different GitHub owners:

| Repo Name | Different Owners | Example Pattern |
|-----------|------------------|-----------------|
| common-lib | 4 | userA, userB, userC, userD |
| utils | 4 | org1, org2, user1, user2 |
| api-client | 4 | company1, company2, dev1, dev2 |
| toolkit | 2 | projectA, projectB |
| helper | 2 | author1, author2 |

In this case, the system calls `generateUniqueRepoName` and produces names in `reponame-owner` format.

### 2. 504 Gateway Timeout Errors

During mirror operations, the Gitea server returns 504 Gateway Timeout:

```
HTTP 504: Gateway Time-out - <html>
<head><title>504 Gateway Time-out</title></head>
<body>
<center><h1>504 Gateway Time-out</h1></center>
</body>
</html>
```

**Critical Issue**: On timeout:
1. The repo may have actually been created in Gitea (migrate API was called, Gitea started the operation)
2. However, the response couldn't be received due to timeout
3. The system marks this as "failed"
4. On the next retry, `isRepoPresentInGitea` check may also timeout
5. The system tries a new name (`reponame-owner-1`, `-2`, `-3`...)

### 3. Insufficient Idempotency Control

The current idempotency check (`isRepoCurrentlyMirroring`) only checks the DB status:

```typescript
// src/lib/gitea.ts - isRepoCurrentlyMirroring function
const inProgressRepos = await db
  .select()
  .from(repositories)
  .where(
    and(
      eq(repositories.userId, config.userId),
      eq(repositories.name, repoName),
      or(
        eq(repositories.status, "mirroring"),
        eq(repositories.status, "syncing")
      )
    )
  );
```

**Gap**: After `mirroredLocation` is set in DB, even if Gitea API times out, the retry should use the same location. However, the existing code generates a new name on each retry.

### 4. generateUniqueRepoName Function Behavior

```typescript
// src/lib/gitea.ts - generateUniqueRepoName function
async function generateUniqueRepoName({...}): Promise<string> {
  // First check if base name is available
  const baseExists = await isRepoPresentInGitea({...});
  if (!baseExists) return baseName;

  // If not available, try suffixed names
  while (attempt < maxAttempts) {
    candidateName = `${baseName}-${githubOwner}-${attempt}`;
    const exists = await isRepoPresentInGitea({...});
    if (!exists) return candidateName;
    attempt++;
  }
  
  // After 10 attempts, throw error
  throw new Error(`Unable to generate unique repository name...`);
}
```

**Problem**: Each `isRepoPresentInGitea` call makes a request to Gitea API. On timeout:
- `exists = false` is returned (error not caught)
- System thinks "repo doesn't exist" and uses the same name
- Or if the previous name already exists, tries a new suffix

## Affected Repositories

### Repos with Numeric Suffixes (~100 items)

```sql
SELECT mirrored_location FROM repositories 
WHERE is_starred = 1 
AND (mirrored_location LIKE '%-1' OR mirrored_location LIKE '%-2' ...)
```

Examples:
- `starred/toolkit-userA-5` (tried 5 times)
- `starred/config-orgB-7` (tried 7 times)
- `starred/devtools-*-4` (all repos from one user tried 4 times)

### Multiple Repos at Same Location (3 items)

```sql
SELECT mirrored_location, COUNT(*) FROM repositories 
WHERE is_starred = 1 GROUP BY mirrored_location HAVING COUNT(*) > 1
```

- `starred/common-lib` -> 2 different repos
- `starred/mail-config` -> 2 different repos
- `starred/api-wrapper` -> 2 different repos

## Solution Plan

### Phase 1: Immediate Fixes (Prevent New Duplicates)

#### 1.1 Preserve mirroredLocation on Retries

**File**: `src/lib/gitea.ts`

**Change**: In `mirrorGithubRepoToGitea` function, if `repository.mirroredLocation` is already set, don't generate a new name:

```typescript
// BEFORE (current code)
let targetRepoName = repository.name;
if (repository.isStarred && ...) {
  targetRepoName = await generateUniqueRepoName({...});
}

// AFTER (proposed)
let targetRepoName = repository.name;

// If mirroredLocation already exists, get repo name from it
if (repository.mirroredLocation && repository.mirroredLocation.includes('/')) {
  const existingRepoName = repository.mirroredLocation.split('/').pop();
  if (existingRepoName) {
    console.log(`[Idempotency] Using existing mirrored location: ${repository.mirroredLocation}`);
    targetRepoName = existingRepoName;
  }
} else if (repository.isStarred && ...) {
  targetRepoName = await generateUniqueRepoName({...});
}
```

#### 1.2 Timeout Handling in Repo Existence Check

**File**: `src/lib/gitea.ts`

**Change**: Handle timeout error separately in `isRepoPresentInGitea`:

```typescript
// BEFORE
export const isRepoPresentInGitea = async ({...}): Promise<boolean> => {
  try {
    const response = await fetch(...);
    return response.ok;
  } catch (error) {
    console.error("Error checking if repo exists in Gitea:", error);
    return false; // PROBLEM: Returns false on timeout
  }
};

// AFTER
export const isRepoPresentInGitea = async ({...}): Promise<boolean | 'timeout'> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(url, {
      headers: {...},
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      console.warn(`[Gitea] Timeout checking repo ${repoName} at ${owner}`);
      return 'timeout'; // Distinguish timeout state
    }
    console.error("Error checking if repo exists in Gitea:", error);
    return false;
  }
};
```

#### 1.3 Timeout Handling in generateUniqueRepoName

**File**: `src/lib/gitea.ts`

**Change**: On timeout, don't generate new name, throw error:

```typescript
async function generateUniqueRepoName({...}): Promise<string> {
  const baseExists = await isRepoPresentInGitea({...});
  
  // Don't generate new name on timeout
  if (baseExists === 'timeout') {
    throw new Error(
      `Cannot determine if repository "${baseName}" exists due to timeout. ` +
      `Please retry later or check Gitea server status.`
    );
  }
  
  if (!baseExists) return baseName;
  
  // ... rest of the code
}
```

### Phase 2: Clean Up Existing Duplicates

#### 2.1 Detect Duplicate Repos in Gitea

A script will be written:

```typescript
// scripts/find-duplicate-repos.ts
async function findDuplicateRepos() {
  // 1. List all repos in starred org in Gitea
  // 2. Find those with -1, -2, -3 suffixes
  // 3. Compare with base name
  // 4. Determine which is the real mirror
}
```

#### 2.2 Fix mirroredLocation in DB

```sql
-- Example: reponame-owner-5 -> reponame-owner should be correct
UPDATE repositories 
SET mirrored_location = 'starred/reponame-owner'
WHERE full_name = 'owner/reponame' 
AND mirrored_location = 'starred/reponame-owner-5';
```

#### 2.3 Delete Extra Repos in Gitea

```typescript
// scripts/cleanup-duplicate-repos.ts
async function cleanupDuplicates() {
  // 1. For each duplicate group, keep the oldest/correct one
  // 2. Delete others with -1, -2, -3 suffixes
  // 3. Update DB
}
```

### Phase 3: Long-term Improvements

#### 3.1 Change Retry Strategy

**File**: `src/lib/scheduler-service.ts`

- Add maximum retry count for the same repo (e.g., 3)
- Apply exponential backoff between retries
- Don't retry for certain error types (e.g., "All naming attempts resulted in conflicts")

#### 3.2 Better Logging

- Log `mirroredLocation` changes in each mirror operation
- Log timeout errors in a separate category
- Warn when duplicate is detected

#### 3.3 Health Check Endpoint

Add an endpoint to check Gitea server status:
- Verify Gitea is responsive before mirror operation
- Dynamically adjust timeout threshold

## Implementation Order

1. **Immediate**: Phase 1.1 - Preserve mirroredLocation on retries (most critical)
2. **Immediate**: Phase 1.3 - Don't generate new name on timeout
3. **Next**: Phase 1.2 - Timeout handling improvement
4. **Next**: Phase 2 - Clean up existing duplicates
5. **Long-term**: Phase 3 - Retry strategy and logging

## Test Plan

1. Unit test: `generateUniqueRepoName` should throw error on timeout
2. Unit test: `mirrorGithubRepoToGitea` should use existing mirroredLocation
3. Integration test: Multiple mirror calls for same repo should use same location
4. Manual test: Simulate 504 timeout and verify no duplicate is created

## Notes

- This issue is largely caused by slow Gitea server responses
- nginx reverse proxy timeout settings should also be checked
- There may be conflicts with Gitea's own mirror_interval setting (default 8h)
