import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { type Plugin } from "@opencode-ai/plugin"

import workIssueCommandContent from "../command/work-issue.md" with { type: "text" }
import workPrCommandContent from "../command/work-pr.md" with { type: "text" }
import mergePrCommandContent from "../command/merge-pr.md" with { type: "text" }
import auditCommandContent from "../command/audit.md" with { type: "text" }
import debugCommandContent from "../command/debug.md" with { type: "text" }
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
import memoryCommandContent from "../command/memory.md" with { type: "text" }
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

export const HivrrPlugin: Plugin = async ({ client }) => {
  await install(client)

  return {
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
