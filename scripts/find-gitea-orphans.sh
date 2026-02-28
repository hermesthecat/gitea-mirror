#!/bin/bash
# Gitea'daki starred org repoları ile DB'deki mirroredLocation'ları karşılaştır
# Orphan repoları (DB'de olmayan) bulur

DATABASE_PATH="${DATABASE_PATH:-./docker-data/gitea-mirror.db}"
GITEA_URL="${GITEA_URL:-https://git.example.uk}"
GITEA_TOKEN="${GITEA_TOKEN:-}"
ORG_NAME="${ORG_NAME:-starred}"
DRY_RUN="${DRY_RUN:-true}"

if [ -z "$GITEA_TOKEN" ]; then
  echo "Error: GITEA_TOKEN must be set"
  echo "Usage: GITEA_TOKEN=xxx ./scripts/find-gitea-orphans.sh"
  exit 1
fi

echo "=== Gitea Orphan Repository Finder ==="
echo "GITEA_URL: $GITEA_URL"
echo "ORG_NAME: $ORG_NAME"
echo "DRY_RUN: $DRY_RUN"
echo ""

# Get all repos from Gitea starred org (with pagination)
echo "Fetching repos from Gitea org '$ORG_NAME'..."
GITEA_REPOS=""
page=1
while true; do
  page_repos=$(curl -s -H "Authorization: token $GITEA_TOKEN" \
    "$GITEA_URL/api/v1/orgs/$ORG_NAME/repos?limit=50&page=$page" | \
    python3 -c "import sys,json; [print(r['name']) for r in json.load(sys.stdin)]" 2>/dev/null)
  
  if [ -z "$page_repos" ]; then
    break
  fi
  
  if [ -z "$GITEA_REPOS" ]; then
    GITEA_REPOS="$page_repos"
  else
    GITEA_REPOS="$GITEA_REPOS
$page_repos"
  fi
  
  count=$(echo "$page_repos" | wc -l | tr -d ' ')
  echo "  Page $page: $count repos"
  if [ "$count" -lt 50 ]; then
    break
  fi
  
  ((page++))
done

if [ -z "$GITEA_REPOS" ]; then
  echo "No repos found in Gitea org or error fetching"
  exit 1
fi

GITEA_COUNT=$(echo "$GITEA_REPOS" | wc -l | tr -d ' ')
echo "Found $GITEA_COUNT repos in Gitea org '$ORG_NAME'"
echo ""

# Get all mirroredLocations from DB for starred org
echo "Fetching mirrored locations from database..."
DB_LOCATIONS=$(sqlite3 "$DATABASE_PATH" "SELECT mirrored_location FROM repositories WHERE mirrored_location LIKE '$ORG_NAME/%'" 2>/dev/null | sed "s|$ORG_NAME/||g")

DB_COUNT=$(echo "$DB_LOCATIONS" | grep -v '^$' | wc -l | tr -d ' ')
echo "Found $DB_COUNT repos in database for org '$ORG_NAME'"
echo ""

# Find orphans (in Gitea but not in DB)
echo "=== Orphan Repos (in Gitea but not in DB) ==="
orphan_count=0

while IFS= read -r repo; do
  [ -z "$repo" ] && continue
  
  if ! echo "$DB_LOCATIONS" | grep -qx "$repo"; then
    echo "  ORPHAN: $ORG_NAME/$repo"
    ((orphan_count++))
    
    if [ "$DRY_RUN" = "false" ]; then
      echo "    Deleting $ORG_NAME/$repo..."
      response=$(curl -s -w "\n%{http_code}" -X DELETE \
        "$GITEA_URL/api/v1/repos/$ORG_NAME/$repo" \
        -H "Authorization: token $GITEA_TOKEN")
      http_code=$(echo "$response" | tail -n1)
      if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
        echo "    [OK] Deleted"
      else
        echo "    [ERROR] HTTP $http_code"
      fi
    fi
  fi
done <<< "$GITEA_REPOS"

echo ""
echo "=== Summary ==="
echo "Total in Gitea: $GITEA_COUNT"
echo "Total in DB: $DB_COUNT"
echo "Orphans found: $orphan_count"

if [ "$DRY_RUN" = "true" ] && [ $orphan_count -gt 0 ]; then
  echo ""
  echo "To delete orphans, run:"
  echo "  DRY_RUN=false GITEA_TOKEN=xxx ./scripts/find-gitea-orphans.sh"
fi
