import * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { LoaderCircle, Plus, Github, Globe } from "lucide-react";
import { apiRequest } from "@/lib/utils";

interface AddRepositoryDialogProps {
  isDialogOpen: boolean;
  setIsDialogOpen: (isOpen: boolean) => void;
  onAddRepository: ({
    repo,
    owner,
    force,
  }: {
    repo: string;
    owner: string;
    force?: boolean;
  }) => Promise<void>;
  onCustomRepoAdded?: () => void;
}

type TabType = "github" | "custom";
type SourceType = "auto" | "gitlab" | "gitea" | "git";

export default function AddRepositoryDialog({
  isDialogOpen,
  setIsDialogOpen,
  onAddRepository,
  onCustomRepoAdded,
}: AddRepositoryDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>("github");
  
  // GitHub tab state
  const [repo, setRepo] = useState<string>("");
  const [owner, setOwner] = useState<string>("");
  
  // Custom tab state
  const [cloneUrl, setCloneUrl] = useState<string>("");
  const [customName, setCustomName] = useState<string>("");
  const [sourceType, setSourceType] = useState<SourceType>("auto");
  const [useStoredCreds, setUseStoredCreds] = useState<boolean>(true);
  const [username, setUsername] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!isDialogOpen) {
      setError("");
      setRepo("");
      setOwner("");
      setCloneUrl("");
      setCustomName("");
      setSourceType("auto");
      setUseStoredCreds(true);
      setUsername("");
      setToken("");
      setDescription("");
    }
  }, [isDialogOpen]);

  const handleGitHubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!repo || !owner || repo.trim() === "" || owner.trim() === "") {
      setError("Please enter a valid repository name and owner.");
      return;
    }

    try {
      setIsLoading(true);
      await onAddRepository({ repo, owner });
      setError("");
      setRepo("");
      setOwner("");
      setIsDialogOpen(false);
    } catch (err: any) {
      setError(err?.message || "Failed to add repository.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cloneUrl || cloneUrl.trim() === "") {
      setError("Please enter a valid clone URL.");
      return;
    }

    try {
      setIsLoading(true);
      
      const payload: Record<string, any> = {
        cloneUrl: cloneUrl.trim(),
        useStoredCredentials: useStoredCreds,
      };
      
      if (customName.trim()) payload.name = customName.trim();
      if (sourceType !== "auto") payload.sourceType = sourceType;
      if (!useStoredCreds && username.trim()) payload.username = username.trim();
      if (!useStoredCreds && token.trim()) payload.token = token.trim();
      if (description.trim()) payload.description = description.trim();

      const response = await apiRequest<{ success: boolean; error?: string; repository?: any }>(
        "/sync/custom-repo",
        { method: "POST", data: payload }
      );

      if (response.success) {
        setError("");
        setCloneUrl("");
        setCustomName("");
        setIsDialogOpen(false);
        onCustomRepoAdded?.();
      } else {
        setError(response.error || "Failed to add custom repository.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to add custom repository.");
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 rounded-full h-12 w-12 shadow-lg p-0 z-10">
          <Plus className="h-6 w-6" />
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[500px] gap-0 gap-y-4 mx-4 sm:mx-0">
        <DialogHeader>
          <DialogTitle>Add Repository</DialogTitle>
          <DialogDescription>
            Add a repository from GitHub or any Git URL
          </DialogDescription>
        </DialogHeader>

        {/* Tab buttons */}
        <div className="flex gap-2 border-b pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("github")}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === "github"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            <Github className="h-4 w-4" />
            GitHub
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("custom")}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === "custom"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            <Globe className="h-4 w-4" />
            Custom URL
          </button>
        </div>

        {/* GitHub Tab */}
        {activeTab === "github" && (
          <form onSubmit={handleGitHubSubmit} className="flex flex-col gap-y-4">
            <div className="space-y-3">
              <div>
                <label htmlFor="gh-owner" className="block text-sm font-medium mb-1.5">
                  Owner
                </label>
                <input
                  id="gh-owner"
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className={inputClass}
                  placeholder="e.g., vercel"
                  autoComplete="off"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label htmlFor="gh-repo" className="block text-sm font-medium mb-1.5">
                  Repository
                </label>
                <input
                  id="gh-repo"
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className={inputClass}
                  placeholder="e.g., next.js"
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Add Repository"}
              </Button>
            </div>
          </form>
        )}

        {/* Custom URL Tab */}
        {activeTab === "custom" && (
          <form onSubmit={handleCustomSubmit} className="flex flex-col gap-y-4">
            <div className="space-y-3">
              <div>
                <label htmlFor="clone-url" className="block text-sm font-medium mb-1.5">
                  Clone URL <span className="text-red-500">*</span>
                </label>
                <input
                  id="clone-url"
                  type="text"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  className={inputClass}
                  placeholder="https://gitlab.com/user/repo.git"
                  autoComplete="off"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="custom-name" className="block text-sm font-medium mb-1.5">
                    Name (optional)
                  </label>
                  <input
                    id="custom-name"
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className={inputClass}
                    placeholder="Auto-detect"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="source-type" className="block text-sm font-medium mb-1.5">
                    Source Type
                  </label>
                  <select
                    id="source-type"
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as SourceType)}
                    className={inputClass}
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="gitlab">GitLab</option>
                    <option value="gitea">Gitea/Forgejo</option>
                    <option value="git">Generic Git</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-1.5">
                  Description (optional)
                </label>
                <input
                  id="description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputClass}
                  placeholder="Repository description"
                  autoComplete="off"
                />
              </div>

              {/* Authentication section */}
              <div className="border rounded-md p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    id="use-stored"
                    type="checkbox"
                    checked={useStoredCreds}
                    onChange={(e) => setUseStoredCreds(e.target.checked)}
                    className="rounded border-input"
                  />
                  <label htmlFor="use-stored" className="text-sm">
                    Use saved credentials (if available)
                  </label>
                </div>

                {!useStoredCreds && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cred-user" className="block text-sm font-medium mb-1.5">
                        Username
                      </label>
                      <input
                        id="cred-user"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className={inputClass}
                        placeholder="Username"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label htmlFor="cred-token" className="block text-sm font-medium mb-1.5">
                        Token
                      </label>
                      <input
                        id="cred-token"
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className={inputClass}
                        placeholder="Access token"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Add Repository"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
