"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { readJson } from "@/lib/read-json";

type Notification = { _id: string; title: string; message: string; websiteDomain?: string; href?: string; createdAt: string; readAt?: string };
export function WorkspaceNotifications({ scope }: { scope?: "influencer-marketing" } = {}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/notifications${scope ? `?scope=${scope}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await readJson(response);
        if (response.ok && active) {
          setItems(data.notifications || []);
          setUnread(data.unreadCount || 0);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [scope]);
  async function markAll() { const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true, ...(scope ? { scope } : {}) }) }); if (response.ok) { setItems((current) => current.map((item) => ({ ...item, readAt: new Date().toISOString() }))); setUnread(0); } }
  return <div className="workspace-notifications"><button className="workspace-notification-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Notifications, ${unread} unread`}><Bell size={16} />{unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}</button>{open && <div className="workspace-notification-popover"><div><strong>Notifications</strong>{unread > 0 && <button type="button" onClick={markAll}><Check size={12} /> Mark all read</button>}</div>{items.length ? items.map((item) => <article key={item._id} className={!item.readAt ? "is-unread" : ""}>{item.websiteDomain ? <Link href={`/dashboard/websites/${encodeURIComponent(item.websiteDomain)}`}>{item.title}</Link> : item.href?.startsWith("/") && !item.href.startsWith("//") ? <Link href={item.href}>{item.title}</Link> : <strong>{item.title}</strong>}<p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></article>) : <p className="workspace-notification-empty">No notifications yet.</p>}</div>}</div>;
}
