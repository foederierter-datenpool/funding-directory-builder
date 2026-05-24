import { existsSync, readdirSync } from "fs"
import react from "@vitejs/plugin-react"
import { execSync } from "child_process"
import { defineConfig } from "vite"
import path from "path"

const REPO_ROOT = path.resolve(import.meta.dirname, "..")

// Static-file sources have no live harvest. Freeze the commit time of each
// static-sources/<name> folder at build time (reflects the committed git state)
function staticSourceCommits() {
    const dir = path.join(REPO_ROOT, "static-sources")
    if (!existsSync(dir)) return {}
    const out = {}
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue
        const rel = `static-sources/${e.name}`
        try {
            const iso = execSync(`git log -1 --format=%cI -- "${rel}"`, { cwd: REPO_ROOT, encoding: "utf8" }).trim()
            if (iso) out[rel] = iso
        } catch { /* not committed yet → omit */ }
    }
    return out
}

export default defineConfig({
    base: "/directory-builder/",
    plugins: [react()],
    define: {
        __STATIC_SOURCE_COMMITS__: JSON.stringify(staticSourceCommits()),
    },
})
