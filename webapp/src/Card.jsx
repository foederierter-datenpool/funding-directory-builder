import React from "react"

export default function Card({ title, children }) {
    return (
        <div className="org-card">
            <div className="org-card-header">
                <code>{title}</code>
            </div>
            {children}
        </div>
    )
}

export function KeyValueTable({ rows }) {
    return (
        <table>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={r.key ?? i}>
                        <td>{r.label}</td>
                        <td>{r.value}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}
