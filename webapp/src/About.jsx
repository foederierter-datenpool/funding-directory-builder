import readme from "../../README.md?raw"
import React from "react"

const intro = readme.slice(readme.indexOf("\n") + 1, readme.indexOf("\n## ")).trim()

export default function About() {
    return <div className="page" style={{ whiteSpace: "pre-wrap" }}>{intro}</div>
}
