import OrgCard from "./OrgCard.jsx"
import { finalOrgs } from "./mergeOrgs.js"
import React from "react"

export default function Directory() {
    return (
        <div className="page" style={{ overflowY: "auto", height: "100%" }}>
            {finalOrgs.map((org) => <OrgCard key={org.iri} org={org} compact={true} highlight={false} />)}
        </div>
    )
}
