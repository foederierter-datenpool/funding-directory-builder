import { turtleToJsonLdObj } from "@foerderfunke/sem-ops-utils"
import mergedTtl from "../../data/pipeline/merged.ttl?raw"
import React from "react"

const ttlUrl = URL.createObjectURL(new Blob([mergedTtl], { type: "text/turtle" }))
const jsonldObj = await turtleToJsonLdObj(mergedTtl)
const jsonldUrl = URL.createObjectURL(new Blob([JSON.stringify(jsonldObj, null, 2)], { type: "application/ld+json" }))

export default function Export() {
    return (
        <div className="page" style={{ fontSize: 14 }}>
            Download directory as ...
            <ul style={{ lineHeight: 1.8 }}>
                <li><a href={ttlUrl} download="merged.ttl">Turtle</a></li>
                <li><a href={jsonldUrl} download="merged.jsonld">JSON-LD</a></li>
            </ul>
        </div>
    )
}
