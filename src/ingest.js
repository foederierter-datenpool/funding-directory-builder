import { ROOT, abs, stepNum, loadDefs, makeQ } from "./utils.js"
import { spawnSync } from "child_process"
import path from "path"
import fs from "fs"

const JAR = path.join(ROOT, "tools/sparql-anything.jar")

const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { stdio: "inherit" })
    if (r.status !== 0) throw new Error(`Exit ${r.status}: ${cmd} ${args.join(" ")}`)
}

const q = makeQ(loadDefs("config/pipeline.ttl"))

// ---- Read Fetch + Lift steps --------------------------------------------

const rows = await q(`
    SELECT ?step ?type ?script ?liftQuery ?inPath ?outPath ?paramName ?paramValue WHERE {
        ?step a ?type .
        FILTER(?type IN (:Fetch, :Lift))
        OPTIONAL { ?step :script    ?script    }
        OPTIONAL { ?step :liftQuery ?liftQuery }
        OPTIONAL { ?step :input     ?inPath    }
        OPTIONAL { ?step :output    ?outPath   }
        OPTIONAL { ?step :param [ :name ?paramName ; :value ?paramValue ] }
    }`)

const steps = new Map()
for (const r of rows) {
    if (!steps.has(r.step)) {
        steps.set(r.step, {
            type: r.type.split("#").pop(),
            script: r.script, liftQuery: r.liftQuery,
            inPath: r.inPath, outPath: r.outPath,
            params: [],
        })
    }
    if (r.paramName) steps.get(r.step).params.push([r.paramName, r.paramValue])
}

const sorted = [...steps.keys()].sort((a, b) => stepNum(a) - stepNum(b))

// ---- Ensure sparql-anything.jar ----------------------------------------

if (!fs.existsSync(JAR)) {
    run("bash", [path.join(ROOT, "tools/download-sparql-anything.sh")])
}

// ---- Run steps ----------------------------------------------------------

for (const iri of sorted) {
    const s = steps.get(iri)

    if (s.type === "Fetch") {
        if (fs.existsSync(abs(s.outPath))) {
            console.log(`skip  fetch  ${s.outPath} (exists)`)
            continue
        }
        console.log(`fetch  → ${s.outPath}`)
        run("node", [abs(s.script)])

    } else if (s.type === "Lift") {
        console.log(`lift   ${s.inPath} → ${s.outPath}`)
        const args = ["-jar", JAR, "-q", abs(s.liftQuery),
                      "-v", `location=${abs(s.inPath)}`,
                      "-f", "TTL", "-o", abs(s.outPath)]
        for (const [name, value] of s.params) args.push("-v", `${name}=${value}`)
        fs.mkdirSync(path.dirname(abs(s.outPath)), { recursive: true })
        run("java", args)
    }
}
