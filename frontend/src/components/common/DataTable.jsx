import { useState } from "react";

export default function DataTable({
  title,
  rows,
  emptyMessage = "No data available.",
  maxRows = 100,
  formatCell,
  classNames = {},
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const safeRows = rows || [];
  const columns = Object.keys(safeRows[0] ?? {});

  const cx = {
    root: classNames.root || "scan-data-table",
    empty: classNames.empty || "",
    head: classNames.head || "scan-dt-head",
    title: classNames.title || "dth-title",
    count: classNames.count || "dth-count",
    toolbar: classNames.toolbar || "scan-dt-toolbar",
    search: classNames.search || "scan-dt-search",
    wrap: classNames.wrap || "scan-dt-table-wrap",
    table: classNames.table || "scan-dt-table",
    sortedHeader: classNames.sortedHeader || "sorted",
    sortArrow: classNames.sortArrow || "sort-arrow",
  };

  if (safeRows.length === 0) {
    return (
      <div className={cx.root}>
        <div className={cx.empty} style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          {emptyMessage}
        </div>
      </div>
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const searched = normalizedQuery
    ? safeRows.filter((r) => columns.some((c) => String(r[c] ?? "").toLowerCase().includes(normalizedQuery)))
    : safeRows;

  const sorted = sortKey
    ? [...searched].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = Number(av);
      const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return sortDir === "asc" ? an - bn : bn - an;
      return sortDir === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    })
    : searched;

  const limited = sorted.slice(0, maxRows);

  function handleSort(col) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(col);
    setSortDir("desc");
  }

  return (
    <div className={cx.root}>
      <div className={cx.head}>
        <div>
          <div className={cx.title}>{title}</div>
          <div className={cx.count}>Showing {limited.length} of {searched.length} ({safeRows.length} total)</div>
        </div>
        <div className={cx.toolbar}>
          <input className={cx.search} placeholder="Search rows..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className={cx.wrap}>
        <table className={cx.table}>
          <thead>
            <tr>
              {columns.map((col) => {
                // Format column header: replace underscores with spaces
                const displayCol = col.replace(/_/g, " ");
                return (
                  <th key={col} className={sortKey === col ? cx.sortedHeader : ""} onClick={() => handleSort(col)}>
                    {displayCol}
                    <span className={cx.sortArrow}>{sortKey === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {limited.map((row, ri) => (
              <tr key={`${row.Ticker || "r"}-${ri}`}>
                {columns.map((col) => (
                  <td key={`${col}-${ri}`}>{formatCell ? formatCell(row[col], col) : String(row[col] ?? "-")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
