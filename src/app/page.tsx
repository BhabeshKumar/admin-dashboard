"use client";

import { useEffect, useState } from "react";
import { assertSupabaseEnv, getSupabaseClient } from "@/lib/supabaseClient";

type View = "login" | "timesheets";

export default function HomePage() {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        assertSupabaseEnv();
      } catch (e: unknown) {
        const message =
          e && typeof e === "object" && "message" in e
            ? String((e as { message?: unknown }).message ?? "Config error")
            : "Config error";
        setError(message);
        return;
      }
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      if (data.session) setView("timesheets");
    };
    void init();
  }, []);

  const signIn = async () => {
    setError(null);
    setLoading(true);
    try {
      assertSupabaseEnv();
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      setView("timesheets");
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: unknown }).message ?? "Login failed")
          : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    setView("login");
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            Site Management Admin
          </div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>
            Timesheets (clock in / clock out)
          </div>
        </div>
        {view === "timesheets" ? (
          <button
            onClick={signOut}
            style={{
              background: "#1b2450",
              color: "white",
              border: "1px solid #2d3a7a",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        ) : null}
      </header>

      {view === "login" ? (
        <div
          style={{
            background: "#10183a",
            border: "1px solid #22306a",
            borderRadius: 16,
            padding: 20,
            maxWidth: 520,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            Admin login
          </div>
          <div style={{ opacity: 0.85, marginBottom: 16, fontSize: 13 }}>
            Login with your Supabase Auth email/password. Access is enforced by
            database permissions (users with project creation/admin access).
          </div>

          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@company.com"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #2b3a78",
              background: "#0b1020",
              color: "white",
              marginBottom: 12,
            }}
          />

          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #2b3a78",
              background: "#0b1020",
              color: "white",
              marginBottom: 12,
            }}
          />

          {error ? (
            <div
              style={{
                background: "#3a1010",
                border: "1px solid #6a2222",
                padding: 10,
                borderRadius: 10,
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          ) : null}

          <button
            onClick={signIn}
            disabled={loading || !email || !password}
            style={{
              width: "100%",
              background: loading ? "#2b3a78" : "#2d6cff",
              color: "white",
              border: "none",
              padding: "12px 12px",
              borderRadius: 12,
              cursor: loading ? "default" : "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      ) : (
        <Timesheets />
      )}
    </div>
  );
}

type TimesheetRow = {
  id: string;
  project_id: string;
  profile_id: string;
  clock_in_time: string;
  clock_out_time: string | null;
  status: string | null;
  break_minutes: number | null;
  recorded_distance_meters: number | null;
  is_flagged_location: boolean | null;
  is_flagged_device_time: boolean | null;

  clock_in_photo_url: string | null;
  clock_out_photo_url: string | null;

  clock_in_location_lat: number | null;
  clock_in_location_lng: number | null;
  clock_out_location_lat: number | null;
  clock_out_location_lng: number | null;

  clock_in_location_address: string | null;
  clock_out_location_address: string | null;

  project: { name: string | null; code: string | null } | null;
  profile: { full_name: string | null; email: string | null } | null;
};

function Timesheets() {
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<{
    title: string;
    url: string;
  } | null>(null);

  const [filters, setFilters] = useState({
    query: "",
    status: "all" as "all" | "completed",
    from: "",
    to: "",
  });

  const [addressCache, setAddressCache] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load cached reverse-geocoded addresses (best-effort).
    try {
      const raw = localStorage.getItem("sm_admin_addr_cache");
      if (raw) setAddressCache(JSON.parse(raw) as Record<string, string>);
    } catch {
      // ignore
    }
  }, []);

  const persistAddressCache = (next: Record<string, string>) => {
    setAddressCache(next);
    try {
      localStorage.setItem("sm_admin_addr_cache", JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const load = async () => {
    setError(null);
    setLoading(true);

    // Optional UX gate: check "admin / project creation access" early.
    const supabase = getSupabaseClient();
    const adminCheck = await supabase.rpc("is_current_user_super_admin");
    if (adminCheck.error) {
      setError(
        `Access check failed: ${adminCheck.error.message}.`,
      );
      setLoading(false);
      return;
    }
    if (adminCheck.data !== true) {
      setError(
        "Access denied. You don't have permission to view the admin dashboard.",
      );
      setLoading(false);
      return;
    }

    let query = supabase
      .from("timesheets")
      .select(
        [
          "id",
          "project_id",
          "profile_id",
          "clock_in_time",
          "clock_out_time",
          "status",
          "break_minutes",
          "recorded_distance_meters",
          "is_flagged_location",
          "is_flagged_device_time",
          "clock_in_photo_url",
          "clock_out_photo_url",
          "clock_in_location_lat",
          "clock_in_location_lng",
          "clock_out_location_lat",
          "clock_out_location_lng",
          "clock_in_location_address",
          "clock_out_location_address",
          "project:projects(name, code)",
          "profile:profiles(full_name, email)",
        ].join(", "),
      )
      .order("clock_in_time", { ascending: false });

    if (filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
    if (filters.from) {
      query = query.gte("clock_in_time", new Date(filters.from).toISOString());
    }
    if (filters.to) {
      // include full day: add 1 day
      const to = new Date(filters.to);
      to.setDate(to.getDate() + 1);
      query = query.lt("clock_in_time", to.toISOString());
    }

    const { data, error } = await query.limit(300);

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const baseRows = (data ?? []) as unknown as TimesheetRow[];
    setRows(baseRows);
    setLoading(false);

    // Kick off best-effort reverse geocoding for rows missing an address.
    void hydrateAddresses(baseRows);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.from, filters.to]);

  const hydrateAddresses = async (baseRows: TimesheetRow[]) => {
    const toLookup: Array<{ key: string; lat: number; lng: number }> = [];

    for (const r of baseRows) {
      if (!r.clock_in_location_address && r.clock_in_location_lat && r.clock_in_location_lng) {
        const key = addrKey(r.clock_in_location_lat, r.clock_in_location_lng);
        if (!addressCache[key]) {
          toLookup.push({ key, lat: r.clock_in_location_lat, lng: r.clock_in_location_lng });
        }
      }
      if (!r.clock_out_location_address && r.clock_out_location_lat && r.clock_out_location_lng) {
        const key = addrKey(r.clock_out_location_lat, r.clock_out_location_lng);
        if (!addressCache[key]) {
          toLookup.push({ key, lat: r.clock_out_location_lat, lng: r.clock_out_location_lng });
        }
      }
      if (toLookup.length >= 20) break; // be polite (rate limits)
    }

    if (toLookup.length === 0) return;

    const next = { ...addressCache };
    for (const item of toLookup) {
      try {
        const label = await reverseGeocode(item.lat, item.lng);
        if (label) {
          next[item.key] = label;
          persistAddressCache(next);
        }
      } catch {
        // ignore
      }
    }
  };

  const filtered = applySearch(rows, filters.query);
  const stats = computeStats(filtered);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Timesheets</div>
            <div style={{ opacity: 0.85, fontSize: 13 }}>
              Clock-in/out events from Supabase ({filtered.length} shown)
            </div>
          </div>
          <button
            onClick={load}
            style={{
              background: "#1b2450",
              color: "white",
              border: "1px solid #2d3a7a",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <StatCard label="Total" value={stats.total} accent="#2d6cff" />
          <StatCard label="Completed" value={stats.completed} accent="#16a34a" />
          <StatCard label="Flagged" value={stats.flagged} accent="#f59e0b" />
          <StatCard label="With photos" value={stats.withPhotos} accent="#a855f7" />
        </div>

        <div
          style={{
            background: "#10183a",
            border: "1px solid #22306a",
            borderRadius: 16,
            padding: 12,
            display: "grid",
            gridTemplateColumns: "1.5fr 0.8fr 0.8fr 0.8fr auto",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            value={filters.query}
            onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
            placeholder="Search by user email/name, project name/code, status…"
            style={inputStyle}
          />
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((p) => ({
                ...p,
                status: e.target.value as "all" | "completed",
              }))
            }
            style={inputStyle}
          >
            <option value="all">All status</option>
            <option value="completed">Completed</option>
          </select>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
            style={inputStyle}
            title="From date"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
            style={inputStyle}
            title="To date"
          />
          <button
            onClick={() =>
              setFilters({ query: "", status: "all", from: "", to: "" })
            }
            style={{
              background: "transparent",
              color: "#c7cbe0",
              border: "1px solid #2d3a7a",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            background: "#3a1010",
            border: "1px solid #6a2222",
            padding: 12,
            borderRadius: 12,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          background: "#10183a",
          border: "1px solid #22306a",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#0f1736" }}>
                {[
                  "Project",
                  "User",
                  "Status",
                  "Clock-in",
                  "Clock-out",
                  "Photos",
                  "Clock-in address",
                  "Clock-out address",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      borderBottom: "1px solid #22306a",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: 12, opacity: 0.85, fontSize: 13 }}
                  >
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: 12, opacity: 0.85, fontSize: 13 }}
                  >
                    No rows.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 700 }}>
                        {r.project?.name ?? "—"}
                      </div>
                      <div style={{ opacity: 0.8, fontSize: 12 }}>
                        {r.project?.code ? `Code: ${r.project.code}` : shortId(r.project_id)}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 700 }}>
                        {r.profile?.full_name?.trim() ? r.profile.full_name : "—"}
                      </div>
                      <div style={{ opacity: 0.8, fontSize: 12 }}>
                        {r.profile?.email ?? shortId(r.profile_id)}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <StatusPill
                        status={r.status ?? "—"}
                        flagged={Boolean(r.is_flagged_location || r.is_flagged_device_time)}
                      />
                      {r.break_minutes ? (
                        <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
                          Break: {r.break_minutes} min
                        </div>
                      ) : null}
                    </td>
                    <td style={cellStyle}>{fmt(r.clock_in_time)}</td>
                    <td style={cellStyle}>{r.clock_out_time ? fmt(r.clock_out_time) : "—"}</td>
                    <td style={cellStyle}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <PhotoThumb
                          label="In"
                          url={r.clock_in_photo_url}
                          onOpen={(url) => setPhotoModal({ title: "Clock-in photo", url })}
                        />
                        <PhotoThumb
                          label="Out"
                          url={r.clock_out_photo_url}
                          onOpen={(url) => setPhotoModal({ title: "Clock-out photo", url })}
                        />
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <LocationCell
                        address={r.clock_in_location_address}
                        lat={r.clock_in_location_lat}
                        lng={r.clock_in_location_lng}
                        cached={addressCache}
                      />
                    </td>
                    <td style={cellStyle}>
                      <LocationCell
                        address={r.clock_out_location_address}
                        lat={r.clock_out_location_lat}
                        lng={r.clock_out_location_lng}
                        cached={addressCache}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {photoModal ? (
        <Modal onClose={() => setPhotoModal(null)}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontWeight: 800 }}>{photoModal.title}</div>
            <button
              onClick={() => setPhotoModal(null)}
              style={{
                background: "transparent",
                border: "1px solid #2d3a7a",
                color: "#c7cbe0",
                padding: "8px 10px",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
          <div style={{ height: 12 }} />
          <a
            href={photoModal.url}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#93c5fd", textDecoration: "none", fontSize: 13 }}
          >
            Open original
          </a>
          <div style={{ height: 12 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoModal.url}
            alt={photoModal.title}
            style={{
              width: "100%",
              maxHeight: "70vh",
              objectFit: "contain",
              borderRadius: 12,
              border: "1px solid #22306a",
              background: "#0b1020",
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #1c2a60",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #2b3a78",
  background: "#0b1020",
  color: "white",
};

function shortId(id: string) {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function StatusPill({
  status,
  flagged,
}: {
  status: string;
  flagged: boolean;
}) {
  const base =
    status === "active"
      ? { bg: "rgba(45, 108, 255, 0.18)", bd: "#2d6cff", fg: "#bcd2ff" }
      : status === "completed"
        ? { bg: "rgba(22, 163, 74, 0.18)", bd: "#16a34a", fg: "#b7f7c6" }
        : { bg: "rgba(148, 163, 184, 0.14)", bd: "#334155", fg: "#d8dde9" };
  const badge = flagged ? " • flagged" : "";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        background: base.bg,
        border: `1px solid ${base.bd}`,
        color: base.fg,
        fontSize: 12,
        fontWeight: 800,
        textTransform: "lowercase",
      }}
      title={flagged ? "Flagged by device time or location checks" : undefined}
    >
      {status}
      {badge}
    </span>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "#10183a",
        border: "1px solid #22306a",
        borderRadius: 16,
        padding: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "auto -20px -20px auto",
          width: 90,
          height: 90,
          background: accent,
          opacity: 0.12,
          borderRadius: 999,
          filter: "blur(0px)",
        }}
      />
      <div style={{ opacity: 0.85, fontSize: 12, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>
        {value}
      </div>
    </div>
  );
}

function PhotoThumb({
  label,
  url,
  onOpen,
}: {
  label: string;
  url: string | null;
  onOpen: (url: string) => void;
}) {
  if (!url) {
    return (
      <div
        title={`${label} photo not available`}
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          border: "1px dashed #2b3a78",
          display: "grid",
          placeItems: "center",
          opacity: 0.6,
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {label}
      </div>
    );
  }
  return (
    <button
      onClick={() => onOpen(url)}
      title={`Open ${label} photo`}
      style={{
        padding: 0,
        border: "1px solid #22306a",
        borderRadius: 12,
        width: 44,
        height: 44,
        overflow: "hidden",
        cursor: "pointer",
        background: "#0b1020",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${label} photo`}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </button>
  );
}

function LocationCell({
  address,
  lat,
  lng,
  cached,
}: {
  address: string | null;
  lat: number | null;
  lng: number | null;
  cached: Record<string, string>;
}) {
  const key =
    lat != null && lng != null ? addrKey(lat, lng) : null;
  const label = address ?? (key ? cached[key] : null);
  const mapUrl = lat != null && lng != null ? googleMapsUrl(lat, lng) : null;

  return (
    <div style={{ maxWidth: 360, whiteSpace: "normal" }}>
      <div style={{ fontSize: 13, fontWeight: 650 }}>
        {label ?? "—"}
      </div>
      <div style={{ opacity: 0.85, fontSize: 12, marginTop: 4 }}>
        {lat != null && lng != null ? (
          <>
            {lat.toFixed(5)}, {lng.toFixed(5)}
            {mapUrl ? (
              <>
                {" "}
                ·{" "}
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#93c5fd", textDecoration: "none" }}
                >
                  Map
                </a>
              </>
            ) : null}
          </>
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        padding: 18,
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(920px, 100%)",
          background: "#0f1736",
          border: "1px solid #22306a",
          borderRadius: 16,
          padding: 14,
          boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function applySearch(rows: TimesheetRow[], q: string) {
  const query = q.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((r) => {
    const hay = [
      r.status ?? "",
      r.project?.name ?? "",
      r.project?.code ?? "",
      r.profile?.full_name ?? "",
      r.profile?.email ?? "",
      r.project_id,
      r.profile_id,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(query);
  });
}

function computeStats(rows: TimesheetRow[]) {
  let completed = 0;
  let flagged = 0;
  let withPhotos = 0;
  for (const r of rows) {
    if (r.status === "completed") completed++;
    if (r.is_flagged_device_time || r.is_flagged_location) flagged++;
    if (r.clock_in_photo_url || r.clock_out_photo_url) withPhotos++;
  }
  return { total: rows.length, completed, flagged, withPhotos };
}

function addrKey(lat: number, lng: number) {
  // Round to reduce cardinality
  const a = Math.round(lat * 10000) / 10000;
  const b = Math.round(lng * 10000) / 10000;
  return `${a},${b}`;
}

function googleMapsUrl(lat: number, lng: number) {
  const q = `${lat},${lng}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}`;
}

async function reverseGeocode(lat: number, lng: number) {
  // OpenStreetMap Nominatim (best-effort). This is only to improve UX.
  // We keep requests limited and cache results in localStorage.
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
    lat,
  )}&lon=${encodeURIComponent(lng)}`;
  const res = await fetch(url, {
    headers: {
      // Some deployments may strip this; still fine.
      "Accept": "application/json",
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { display_name?: string };
  return json.display_name ?? null;
}

