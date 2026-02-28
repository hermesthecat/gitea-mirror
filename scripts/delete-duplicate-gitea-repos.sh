#!/bin/bash
# Gitea'dan silinmesi gereken duplicate starred repolar
# DB'den numeric suffix'li (-1, -2, -3, etc.) repolari bulur ve siler
# 
# Kullanim:
#   1. DATABASE_PATH, GITEA_URL ve GITEA_TOKEN ayarla
#   2. chmod +x scripts/delete-duplicate-gitea-repos.sh
#   3. ./scripts/delete-duplicate-gitea-repos.sh
#
# NOT: Silmeden once DRY_RUN=true ile kontrol et!

DATABASE_PATH="${DATABASE_PATH:-./gitea-mirror.db}"
GITEA_URL="${GITEA_URL:-}"
GITEA_TOKEN="${GITEA_TOKEN:-}"
DRY_RUN="${DRY_RUN:-true}"

# Check requirements
if [ -z "$GITEA_URL" ] || [ -z "$GITEA_TOKEN" ]; then
  echo "Error: GITEA_URL and GITEA_TOKEN must be set"
  echo ""
  echo "Usage:"
  echo "  DATABASE_PATH=./gitea-mirror.db GITEA_URL=https://your-gitea GITEA_TOKEN=xxx DRY_RUN=true $0"
  exit 1
fi

if [ ! -f "$DATABASE_PATH" ]; then
  echo "Error: Database not found at $DATABASE_PATH"
  exit 1
fi

# Get duplicate repos from database (those with -N suffix where N is a number)
echo "=== Gitea Duplicate Repository Deletion Script ==="
echo ""
echo "DATABASE_PATH: $DATABASE_PATH"
echo "GITEA_URL: $GITEA_URL"
echo "DRY_RUN: $DRY_RUN"
echo ""

# Query DB for repos with numeric suffixes in mirrored_location
REPOS_TO_DELETE=$(sqlite3 "$DATABASE_PATH" "
  SELECT mirrored_location 
  FROM repositories 
  WHERE is_starred = 1 
  AND mirrored_location REGEXP '-[0-9]+$'
" 2>/dev/null)

# If REGEXP not supported, use LIKE pattern
if [ -z "$REPOS_TO_DELETE" ]; then
  REPOS_TO_DELETE=$(sqlite3 "$DATABASE_PATH" "
    SELECT mirrored_location 
    FROM repositories 
    WHERE is_starred = 1 
    AND (
      mirrored_location LIKE '%-1' OR
      mirrored_location LIKE '%-2' OR
      mirrored_location LIKE '%-3' OR
      mirrored_location LIKE '%-4' OR
      mirrored_location LIKE '%-5' OR
      mirrored_location LIKE '%-6' OR
      mirrored_location LIKE '%-7' OR
      mirrored_location LIKE '%-8' OR
      mirrored_location LIKE '%-9'
    )
  ")
fi

if [ -z "$REPOS_TO_DELETE" ]; then
  echo "No duplicate repositories found in database."
  exit 0
fi

# Count repos
REPO_COUNT=$(echo "$REPOS_TO_DELETE" | wc -l | tr -d ' ')
echo "Found $REPO_COUNT duplicate repositories to delete"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo "*** DRY RUN MODE - No actual deletions will be made ***"
  echo ""
fi

deleted=0
failed=0
skipped=0

while IFS= read -r repo; do
  [ -z "$repo" ] && continue
  
  echo "Processing: $repo"
  
  if [ "$DRY_RUN" = "true" ]; then
    echo "  [DRY RUN] Would delete: $GITEA_URL/api/v1/repos/$repo"
  else
    response=$(curl -s -w "\n%{http_code}" -X DELETE \
      "$GITEA_URL/api/v1/repos/$repo" \
      -H "Authorization: token $GITEA_TOKEN")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
      echo "  [OK] Deleted successfully"
      ((deleted++))
    elif [ "$http_code" = "404" ]; then
      echo "  [SKIP] Repository not found (already deleted?)"
      ((skipped++))
    else
      echo "  [ERROR] HTTP $http_code: $body"
      ((failed++))
    fi
  fi
done <<< "$REPOS_TO_DELETE"

echo ""
echo "=== Summary ==="
if [ "$DRY_RUN" = "true" ]; then
  echo "DRY RUN completed. $REPO_COUNT repos would be deleted."
  echo ""
  echo "To actually delete, run:"
  echo "  DRY_RUN=false DATABASE_PATH=$DATABASE_PATH GITEA_URL=$GITEA_URL GITEA_TOKEN=xxx $0"
else
  echo "Deleted: $deleted"
  echo "Failed: $failed"
  echo "Skipped (not found): $skipped"
fi
