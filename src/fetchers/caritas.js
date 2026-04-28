import { abs } from "../utils.js"
import path from "path"
import fs from "fs"

const OUT = abs("data/raw/caritas.json")
fs.mkdirSync(path.dirname(OUT), { recursive: true })

// https://www.caritas.de/adressen-ergebnisse
const URL = "https://www.caritas.de/Api/search/searchbyquery"

const result = await fetch(URL, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
    },
    body: JSON.stringify({
        WebsiteGuid: "52c60690-787a-40ac-965c-a087c020c5f5",
        ModuleGuid: "e38bf59d-2afb-4bc8-9d78-26618f6909af",
        Location: "10115"
    })
})
let json = await result.json()
fs.writeFileSync(OUT, JSON.stringify(json, null, 2))
console.log(`Wrote to ${OUT}`)
