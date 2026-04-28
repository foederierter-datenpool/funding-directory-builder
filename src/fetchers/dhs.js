import { abs } from "../utils.js"
import path from "path"
import fs from "fs"

const OUT = abs("data/raw/dhs.html")
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const URL = "https://www.dhs.de/service/suchthilfeverzeichnis/"

const params = new URLSearchParams({
    "tx_wwdhseinrichtung2_fe1[action]": "search",
    "tx_wwdhseinrichtung2_fe1[entrys][currentPage]": "1",
    "tx_wwdhseinrichtung2_fe1[plzort]": "10115"
})
const url = `https://www.dhs.de/service/suchthilfeverzeichnis/?${params.toString()}`
console.log(`Fetching ${url}`)
const response = await fetch(url)
const html = await response.text()
fs.writeFileSync(OUT, html)
