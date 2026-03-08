import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { type Plugin } from "@opencode-ai/plugin"

import workIssueCommandContent from "../command/work-issue.md" with { type: "text" }
import workPrCommandContent from "../command/work-pr.md" with { type: "text" }
import mergePrCommandContent from "../command/merge-pr.md" with { type: "text" }
import auditCommandContent from "../command/audit.md" with { type: "text" }
import debugCommandContent from "../command/debug.md" with { type: "text" }
import memoryCommandContent from "../command/memory.md" with { type: "text" }
import coreSkillContent from "../skill/core/SKILL.md" with { type: "text" }
import workIssueSkillContent from "../skill/work-issue/SKILL.md" with { type: "text" }
import workPrSkillContent from "../skill/work-pr/SKILL.md" with { type: "text" }
import mergePrSkillContent from "../skill/merge-pr/SKILL.md" with { type: "text" }
import auditSkillContent from "../skill/audit/SKILL.md" with { type: "text" }
import auditSecuritySkillContent from "../skill/audit-security/SKILL.md" with { type: "text" }
import auditAccessibilitySkillContent from "../skill/audit-accessibility/SKILL.md" with { type: "text" }
import auditTechDebtSkillContent from "../skill/audit-tech-debt/SKILL.md" with { type: "text" }
import auditPerformanceSkillContent from "../skill/audit-performance/SKILL.md" with { type: "text" }
import debugSkillContent from "../skill/debug/SKILL.md" with { type: "text" }
import waveSkillContent from "../skill/wave/SKILL.md" with { type: "text" }
import memorySkillContent from "../skill/memory/SKILL.md" with { type: "text" }

const CONFIG_DIR = path.join(os.homedir(), ".config", "opencode")

/**
 * Write a file only when content has changed, to avoid unnecessary disk writes.
 */
async function writeIfChanged(filePath: string, content: string): Promise<boolean> {
  try {
    const existing = await fs.readFile(filePath, "utf8")
    if (existing === content) return false
  } catch {
    // File does not exist yet - write it
  }
  await fs.writeFile(filePath, content, "utf8")
  return true
}

/**
 * Install the bundled command and skill files into ~/.config/opencode/.
 * Idempotent: only writes when content has changed.
 */
async function install(client: Parameters<Plugin>[0]["client"]): Promise<void> {
  const targets = [
    // Commands
    { dir: path.join(CONFIG_DIR, "commands"), name: "work-issue.md", content: workIssueCommandContent },
    { dir: path.join(CONFIG_DIR, "commands"), name: "work-pr.md", content: workPrCommandContent },
    { dir: path.join(CONFIG_DIR, "commands"), name: "merge-pr.md", content: mergePrCommandContent },
    { dir: path.join(CONFIG_DIR, "commands"), name: "audit.md", content: auditCommandContent },
    { dir: path.join(CONFIG_DIR, "commands"), name: "debug.md", content: debugCommandContent },
    { dir: path.join(CONFIG_DIR, "commands"), name: "memory.md", content: memoryCommandContent },
    // Skills
    { dir: path.join(CONFIG_DIR, "skills", "core"), name: "SKILL.md", content: coreSkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "work-issue"), name: "SKILL.md", content: workIssueSkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "work-pr"), name: "SKILL.md", content: workPrSkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "merge-pr"), name: "SKILL.md", content: mergePrSkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "audit"), name: "SKILL.md", content: auditSkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "audit-security"), name: "SKILL.md", content: auditSecuritySkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "audit-accessibility"), name: "SKILL.md", content: auditAccessibilitySkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "audit-tech-debt"), name: "SKILL.md", content: auditTechDebtSkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "audit-performance"), name: "SKILL.md", content: auditPerformanceSkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "debug"), name: "SKILL.md", content: debugSkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "wave"), name: "SKILL.md", content: waveSkillContent },
    { dir: path.join(CONFIG_DIR, "skills", "memory"), name: "SKILL.md", content: memorySkillContent },
  ]

  for (const { dir, name, content } of targets) {
    await fs.mkdir(dir, { recursive: true })
    const changed = await writeIfChanged(path.join(dir, name), content)
    if (changed) {
      await client.app.log({
        body: { service: "hivrr-plugin", level: "info", message: `Installed ${name} → ${dir}` },
      })
    }
  }
}

/**
 * Read .ai/memory/MANIFEST.md from the worktree root if it exists.
 * Returns null if the file doesn't exist or can't be read.
 */
async function readManifest(worktree: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(worktree, ".ai", "memory", "MANIFEST.md"), "utf8")
  } catch {
    return null
  }
}

/**
 * Read all .md files from .ai/session/ in the worktree.
 * Returns an array of { name, content } for each active session file.
 */
async function readSessionFiles(worktree: string): Promise<Array<{ name: string; content: string }>> {
  const sessionDir = path.join(worktree, ".ai", "session")
  try {
    const files = await fs.readdir(sessionDir)
    const results: Array<{ name: string; content: string }> = []
    for (const file of files) {
      if (!file.endsWith(".md")) continue
      try {
        const content = await fs.readFile(path.join(sessionDir, file), "utf8")
        results.push({ name: file, content })
      } catch {
        // Skip unreadable files
      }
    }
    return results
  } catch {
    return []
  }
}

export const HivrrPlugin: Plugin = async ({ client, worktree }) => {
  await install(client)

  return {
    /**
     * Compaction hook — fires before OpenCode compacts the context window.
     *
     * Injects project memory and active workflow sessions so they survive
     * compaction. Also sets a workflow-aware compaction prompt so the model
     * knows to preserve phase state, plan progress, and implementation context.
     */
    "experimental.session.compacting": async (_input: unknown, output: any) => {
      if (!worktree) return

      const manifest = await readManifest(worktree)
      const sessions = await readSessionFiles(worktree)

      // Inject memory MANIFEST so it survives the compaction
      if (manifest) {
        output.context.push(`## Project Memory\n\n${manifest}`)
      }

      // Inject active session files — these are workflow crash-recovery checkpoints
      for (const { name, content } of sessions) {
        output.context.push(`## Active Workflow Session (${name})\n\n${content}`)
      }

      // Set a compaction prompt tuned to our workflow context
      if (sessions.length > 0) {
        // Mid-workflow compaction — preserve phase state and plan progress precisely
        output.prompt = `You are compacting an active hivrr workflow session. The context above includes the current workflow state. Produce a continuation summary that preserves:

1. The workflow name and current phase (e.g. "work-issue, Phase 8 — Implement")
2. The full implementation plan with each item's exact [ ] or [x] state
3. Every file changed so far and what each change does
4. Test and lint status at the last check
5. Branch name, issue/PR numbers, and any linked issues
6. Architectural decisions or patterns discovered during this session
7. The immediate next action — be specific

Be complete. This summary is the only memory the resumed session will have.`
      } else {
        // General compaction — preserve task state and memory context
        output.prompt = `You are compacting an opencode session. Produce a continuation summary that preserves:

1. The current task and its exact status
2. Files modified and the purpose of each change
3. Test and lint status
4. Decisions made and why
5. The immediate next action

The context above includes project memory (decisions, patterns, context). Ensure any memory entries referenced during this session remain accessible after compaction.`
      }
    },

    event: async ({ event }) => {
      if (event.type === "session.created") {
        await client.app.log({
          body: { service: "hivrr-plugin", level: "info", message: "Session started" },
        })
      }
    },
  }
}

export default HivrrPlugin
