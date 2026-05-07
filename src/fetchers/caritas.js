import path from "path"
import fs from "fs"

const OUT_DIR = process.argv[2]
const URL = process.argv[3]
const PLZS = process.argv[4].split(",")

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const plz of PLZS) {
    const result = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
            WebsiteGuid: "52c60690-787a-40ac-965c-a087c020c5f5",
            ModuleGuid:  "e38bf59d-2afb-4bc8-9d78-26618f6909af",
            Location:    plz,
        }),
    })
    const json = await result.json()
    const outPath = path.join(OUT_DIR, `${plz}.json`)
    fs.writeFileSync(outPath, JSON.stringify(json, null, 2))
    console.log(`  ${plz} → ${outPath}`)
}
