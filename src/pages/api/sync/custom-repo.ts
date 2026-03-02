import type { APIRoute } from "astro";
import { db, repositories, configs, gitCredentials } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { jsonResponse, createSecureErrorResponse } from "@/lib/utils";
import { requireAuthenticatedUserId } from "@/lib/auth-guards";
import { decrypt } from "@/lib/utils/encryption";
import type { RepositoryVisibility } from "@/types/Repository";

interface AddCustomRepoRequest {
  cloneUrl: string;
  name?: string;
  sourceType?: "gitlab" | "gitea" | "git";
  username?: string;
  token?: string;
  useStoredCredentials?: boolean;
  description?: string;
}

// Detect source type from URL
function detectSourceType(url: string): "gitlab" | "gitea" | "git" {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes("gitlab.com") || lowerUrl.includes("gitlab")) {
    return "gitlab";
  }
  if (
    lowerUrl.includes("gitea") ||
    lowerUrl.includes("forgejo") ||
    lowerUrl.includes("codeberg.org")
  ) {
    return "gitea";
  }
  return "git";
}

// Extract host from URL
function extractHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host.toLowerCase();
  } catch {
    // Try to extract from git URL format
    const match = url.match(/@([^:\/]+)[:\/@]/);
    if (match) return match[1].toLowerCase();
    return "";
  }
}

// Extract owner and repo name from URL
function extractRepoInfo(url: string): { owner: string; name: string } {
  // Remove .git suffix
  let cleanUrl = url.replace(/\.git$/, "");

  // Handle HTTPS URLs
  try {
    const parsed = new URL(cleanUrl);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      return {
        owner: pathParts[pathParts.length - 2],
        name: pathParts[pathParts.length - 1],
      };
    }
  } catch {
    // Not a valid URL, try git@ format
  }

  // Handle git@host:owner/repo format
  const gitMatch = cleanUrl.match(/:([^\/]+)\/([^\/]+)$/);
  if (gitMatch) {
    return { owner: gitMatch[1], name: gitMatch[2] };
  }

  // Fallback: use last path segment as name
  const parts = cleanUrl.split("/").filter(Boolean);
  return {
    owner: parts[parts.length - 2] || "unknown",
    name: parts[parts.length - 1] || "unknown",
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const authResult = await requireAuthenticatedUserId({ request, locals });
    if ("response" in authResult) return authResult.response;
    const userId = authResult.userId;

    const body: AddCustomRepoRequest = await request.json();
    const {
      cloneUrl,
      name: customName,
      sourceType: providedSourceType,
      username: providedUsername,
      token: providedToken,
      useStoredCredentials = true,
      description,
    } = body;

    if (!cloneUrl) {
      return jsonResponse({
        data: { success: false, error: "Clone URL is required" },
        status: 400,
      });
    }

    // Extract info from URL
    const host = extractHost(cloneUrl);
    const { owner, name: extractedName } = extractRepoInfo(cloneUrl);
    const repoName = customName?.trim() || extractedName;
    const sourceType = providedSourceType || detectSourceType(cloneUrl);

    // Create full name for tracking
    const fullName = `${host}/${owner}/${repoName}`;
    const normalizedFullName = fullName.toLowerCase();

    // Check if already exists
    const [existing] = await db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.userId, userId),
          eq(repositories.normalizedFullName, normalizedFullName)
        )
      )
      .limit(1);

    if (existing) {
      return jsonResponse({
        data: {
          success: false,
          error: "Repository already exists",
          repository: existing,
        },
        status: 409,
      });
    }

    // Get user's config
    const [config] = await db
      .select()
      .from(configs)
      .where(eq(configs.userId, userId))
      .limit(1);

    if (!config) {
      return jsonResponse({
        data: { success: false, error: "No configuration found" },
        status: 404,
      });
    }

    // Get credentials if needed
    let username = providedUsername;
    let token = providedToken;

    if (useStoredCredentials && host && (!username || !token)) {
      const [storedCred] = await db
        .select()
        .from(gitCredentials)
        .where(
          and(
            eq(gitCredentials.userId, userId),
            eq(gitCredentials.host, host)
          )
        )
        .limit(1);

      if (storedCred) {
        if (!username && storedCred.username) {
          username = storedCred.username;
        }
        if (!token && storedCred.token) {
          token = decrypt(storedCred.token);
        }
      }
    }

    // Create repository entry
    const newRepo = {
      id: uuidv4(),
      userId,
      configId: config.id,
      name: repoName,
      fullName,
      normalizedFullName,
      url: cloneUrl.replace(/\.git$/, ""),
      cloneUrl,
      owner,
      organization: null,
      mirroredLocation: "",
      isPrivate: !!token, // Assume private if credentials provided
      isForked: false,
      forkedFrom: null,
      hasIssues: false,
      isStarred: false, // Custom repos go to starred org
      isArchived: false,
      size: 0,
      hasLFS: false,
      hasSubmodules: false,
      language: null,
      description: description || null,
      homepage: null,
      topics: null,
      defaultBranch: "main",
      visibility: "public" as RepositoryVisibility,
      status: "imported" as const,
      lastMirrored: null,
      errorMessage: null,
      retryCount: 0,
      lastRetryAt: null,
      destinationOrg: null,
      metadata: null,
      sourceType,
      sourceHost: host,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [inserted] = await db
      .insert(repositories)
      .values(newRepo)
      .returning();

    return jsonResponse({
      data: {
        success: true,
        message: "Custom repository added successfully",
        repository: inserted,
        credentials: {
          hasUsername: !!username,
          hasToken: !!token,
          fromStore: useStoredCredentials && !providedToken,
        },
      },
      status: 201,
    });
  } catch (error) {
    return createSecureErrorResponse(error, "custom repo add", 500);
  }
};
