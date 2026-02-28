#!/usr/bin/env bun
/**
 * Cleanup Duplicate Starred Repositories
 * 
 * This script identifies and helps clean up duplicate starred repositories
 * that were created due to timeout errors during mirroring.
 * 
 * Usage:
 *   bun scripts/cleanup-duplicate-starred-repos.ts --analyze     # Analyze duplicates (dry run)
 *   bun scripts/cleanup-duplicate-starred-repos.ts --fix-db      # Fix database mirroredLocation values
 *   bun scripts/cleanup-duplicate-starred-repos.ts --list-gitea  # List repos to delete from Gitea
 * 
 * Note: Set DATABASE_PATH environment variable to use a specific database file.
 *   DATABASE_PATH=./gitea-mirror.db bun scripts/cleanup-duplicate-starred-repos.ts --analyze
 */

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';

// Get database path from environment or use default
const dbPath = process.env.DATABASE_PATH || './data/gitea-mirror.db';
console.log(`Using database: ${dbPath}\n`);

// Create database connection
const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });
const { repositories } = schema;

interface DuplicateInfo {
  fullName: string;
  name: string;
  mirroredLocation: string;
  status: string;
  suggestedLocation: string;
  duplicateSuffix: number | null;
}

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0] || '--analyze';

async function main() {
  console.log('=== Duplicate Starred Repository Cleanup Tool ===\n');

  if (mode === '--analyze') {
    await analyzeMode();
  } else if (mode === '--fix-db') {
    await fixDbMode();
  } else if (mode === '--list-gitea') {
    await listGiteaMode();
  } else {
    console.log('Usage:');
    console.log('  bun scripts/cleanup-duplicate-starred-repos.ts --analyze     # Analyze duplicates');
    console.log('  bun scripts/cleanup-duplicate-starred-repos.ts --fix-db      # Fix database');
    console.log('  bun scripts/cleanup-duplicate-starred-repos.ts --list-gitea  # List Gitea repos to delete');
  }
}

async function analyzeMode() {
  console.log('Mode: ANALYZE (dry run)\n');

  // Find all starred repos with numeric suffixes in mirroredLocation
  const starredRepos = await db
    .select()
    .from(repositories)
    .where(eq(repositories.isStarred, true));

  console.log(`Total starred repositories: ${starredRepos.length}\n`);

  // Identify duplicates (repos with -N suffix where N is a number)
  const duplicates: DuplicateInfo[] = [];
  const suffixPattern = /-(\d+)$/;

  for (const repo of starredRepos) {
    if (!repo.mirroredLocation) continue;

    const match = repo.mirroredLocation.match(suffixPattern);
    if (match) {
      const suffix = parseInt(match[1], 10);
      // Calculate what the correct location should be
      const baseMirroredLocation = repo.mirroredLocation.replace(suffixPattern, '');
      
      duplicates.push({
        fullName: repo.fullName,
        name: repo.name,
        mirroredLocation: repo.mirroredLocation,
        status: repo.status,
        suggestedLocation: baseMirroredLocation,
        duplicateSuffix: suffix,
      });
    }
  }

  console.log(`Repositories with numeric suffixes: ${duplicates.length}\n`);

  if (duplicates.length === 0) {
    console.log('No duplicate repositories found!');
    return;
  }

  // Group by suggested location to see conflicts
  const groupedByBase = new Map<string, DuplicateInfo[]>();
  for (const dup of duplicates) {
    const existing = groupedByBase.get(dup.suggestedLocation) || [];
    existing.push(dup);
    groupedByBase.set(dup.suggestedLocation, existing);
  }

  console.log('=== Duplicate Analysis ===\n');

  // Show summary by suffix number
  const suffixCounts = new Map<number, number>();
  for (const dup of duplicates) {
    if (dup.duplicateSuffix !== null) {
      const count = suffixCounts.get(dup.duplicateSuffix) || 0;
      suffixCounts.set(dup.duplicateSuffix, count + 1);
    }
  }

  console.log('Suffix distribution:');
  for (const [suffix, count] of Array.from(suffixCounts.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`  -${suffix}: ${count} repos`);
  }
  console.log('');

  // Show status distribution
  const statusCounts = new Map<string, number>();
  for (const dup of duplicates) {
    const count = statusCounts.get(dup.status) || 0;
    statusCounts.set(dup.status, count + 1);
  }

  console.log('Status distribution:');
  for (const [status, count] of statusCounts.entries()) {
    console.log(`  ${status}: ${count} repos`);
  }
  console.log('');

  // Show first 20 examples
  console.log('=== Sample Duplicates (first 20) ===\n');
  for (const dup of duplicates.slice(0, 20)) {
    console.log(`${dup.fullName}`);
    console.log(`  Current:   ${dup.mirroredLocation}`);
    console.log(`  Suggested: ${dup.suggestedLocation}`);
    console.log(`  Status:    ${dup.status}`);
    console.log('');
  }

  console.log('=== Recommendations ===\n');
  console.log('1. Run with --fix-db to update database mirroredLocation values');
  console.log('2. Run with --list-gitea to get list of repos to delete from Gitea');
  console.log('3. Manually delete duplicate repos from Gitea using the list');
}

async function fixDbMode() {
  console.log('Mode: FIX DATABASE\n');
  console.log('This will update mirroredLocation values to remove numeric suffixes.\n');

  const starredRepos = await db
    .select()
    .from(repositories)
    .where(eq(repositories.isStarred, true));

  const suffixPattern = /-(\d+)$/;
  let updatedCount = 0;

  for (const repo of starredRepos) {
    if (!repo.mirroredLocation) continue;

    const match = repo.mirroredLocation.match(suffixPattern);
    if (match) {
      const newLocation = repo.mirroredLocation.replace(suffixPattern, '');
      
      console.log(`Updating ${repo.fullName}:`);
      console.log(`  From: ${repo.mirroredLocation}`);
      console.log(`  To:   ${newLocation}`);

      await db
        .update(repositories)
        .set({
          mirroredLocation: newLocation,
          updatedAt: new Date(),
        })
        .where(eq(repositories.id, repo.id));

      updatedCount++;
    }
  }

  console.log(`\nUpdated ${updatedCount} repositories.`);
  console.log('\nNote: You still need to manually delete duplicate repos from Gitea.');
  console.log('Run with --list-gitea to get the list of repos to delete.');
}

async function listGiteaMode() {
  console.log('Mode: LIST GITEA REPOS TO DELETE\n');
  console.log('These repositories should be deleted from Gitea:\n');

  const starredRepos = await db
    .select()
    .from(repositories)
    .where(eq(repositories.isStarred, true));

  const suffixPattern = /-(\d+)$/;
  const toDelete: string[] = [];

  for (const repo of starredRepos) {
    if (!repo.mirroredLocation) continue;

    const match = repo.mirroredLocation.match(suffixPattern);
    if (match) {
      // The current mirroredLocation with suffix should be deleted
      toDelete.push(repo.mirroredLocation);
    }
  }

  if (toDelete.length === 0) {
    console.log('No duplicate repositories found to delete.');
    return;
  }

  console.log('=== Repositories to delete from Gitea ===\n');
  for (const location of toDelete.sort()) {
    console.log(location);
  }

  console.log(`\nTotal: ${toDelete.length} repositories`);
  console.log('\n=== Gitea API Commands ===\n');
  console.log('You can delete these using the Gitea API or web interface.');
  console.log('Example API call (replace TOKEN and URL):');
  console.log('');
  console.log('for repo in \\');
  for (const location of toDelete.slice(0, 5)) {
    console.log(`  "${location}" \\`);
  }
  console.log('  ; do');
  console.log('  curl -X DELETE "https://your-gitea-url/api/v1/repos/$repo" \\');
  console.log('    -H "Authorization: token YOUR_TOKEN"');
  console.log('done');
}

main().catch(console.error);
