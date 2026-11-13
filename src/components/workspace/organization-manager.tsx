"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, RefreshCw, Users } from "lucide-react";
import { WorkspaceActionDialog } from "./workspace-action-dialog";
import { readJson } from "@/lib/read-json";

type Organization = { id: string; name: string; role: string };
type Member = { userId: string; name?: string; email?: string; role: string };
type Invitation = { email: string; role: string; expiresAt: string };
type MemberAction = { kind: "remove" | "transfer"; member: Member; organizationId: string; organizationName: string };
const roles = ["administrator", "seo_manager", "seo_specialist", "content_editor", "analyst", "viewer"];

export function OrganizationManager() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("seo_specialist");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [busy, setBusy] = useState(false);
  const [memberAction, setMemberAction] = useState<MemberAction | null>(null);
  function notify(text: string, tone: "info" | "success" | "error" = "info") { setMessage(text); setMessageTone(tone); }

  async function loadOrganizations() {
    const response = await fetch("/api/organizations", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load organizations.");
    const result = await readJson(response);
    const next = result.organizations as Organization[];
    setOrganizations(next);
    setSelected((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || "");
  }
  async function loadMembers(id: string) {
    if (!id) return;
    const response = await fetch(`/api/organizations/${id}/members`, { cache: "no-store" });
    if (!response.ok) { setMembers([]); setInvitations([]); return; }
    const result = await readJson(response);
    setMembers(result.members || []);
    setInvitations(result.invitations || []);
  }
  useEffect(() => { void Promise.resolve().then(loadOrganizations).catch((error) => notify(error.message, "error")); }, []);
  useEffect(() => { void Promise.resolve().then(() => loadMembers(selected)).catch((error) => notify(error.message, "error")); }, [selected]);

  async function createOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const result = await readJson(response);
      if (!response.ok) throw new Error(result.error || "Could not create organization.");
      setName(""); await loadOrganizations(); setSelected(result.organization.id); notify("Organization created.", "success");
    } catch (error) { notify(error instanceof Error ? error.message : "Request failed.", "error"); } finally { setBusy(false); }
  }
  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setBusy(true); setMessage(""); setLink("");
    try {
      const response = await fetch(`/api/organizations/${selected}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
      const result = await readJson(response);
      if (!response.ok) throw new Error(result.error || "Could not create invitation.");
      setEmail(""); setLink(result.invitationUrl || ""); notify(result.delivery === "email" ? "Invitation email sent." : "Invitation created. Copy the link and send it to the invitee.", "success"); await loadMembers(selected);
    } catch (error) { notify(error instanceof Error ? error.message : "Request failed.", "error"); } finally { setBusy(false); }
  }
  async function updateMember(userId: string, newRole: string) {
    const response = await fetch(`/api/organizations/${selected}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role: newRole }) });
    const result = await readJson(response); if (!response.ok) { notify(result.error || "Could not update role.", "error"); return; } await loadMembers(selected); notify("Member role updated.", "success");
  }
  function removeMember(userId: string) {
    const member = members.find((item) => item.userId === userId);
    if (!member || !current) return;
    setMessage("");
    setMemberAction({ kind: "remove", member, organizationId: selected, organizationName: current.name });
  }
  function transferOwnership(userId: string) {
    const member = members.find((item) => item.userId === userId);
    if (!member || !current) return;
    setMessage("");
    setMemberAction({ kind: "transfer", member, organizationId: selected, organizationName: current.name });
  }
  async function confirmMemberAction() {
    if (!memberAction) return;
    setBusy(true); setMessage("");
    try {
      const transfer = memberAction.kind === "transfer";
      const response = await fetch(`/api/organizations/${memberAction.organizationId}/members`, {
        method: transfer ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transfer ? { action: "transfer_owner", userId: memberAction.member.userId } : { userId: memberAction.member.userId }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(result.error || (transfer ? "Could not transfer ownership." : "Could not remove member."));

      if (transfer) {
        try { await loadOrganizations(); await loadMembers(memberAction.organizationId); }
        catch { notify("Ownership transferred. Refresh the organization to confirm the updated roles."); return; }
        notify("Organization ownership transferred.", "success");
      } else {
        setMembers((currentMembers) => currentMembers.filter((item) => item.userId !== memberAction.member.userId));
        notify("Member removed from the organization.", "success");
      }
    } finally { setBusy(false); }
  }

  const current = organizations.find((item) => item.id === selected);
  const canManage = current && ["owner", "administrator"].includes(current.role);
  return <section className="workspace-section org-manager" aria-labelledby="org-manager-title">
    <div className="workspace-section-heading"><div><p className="workspace-eyebrow">ACCESS CONTROL</p><h2 id="org-manager-title">Organizations & team</h2><p>Manage workspace membership and least privilege roles.</p></div><button className="org-refresh" type="button" onClick={() => { void loadOrganizations().then(async () => { if (selected) await loadMembers(selected); }).catch((error) => notify(error.message, "error")); }} aria-label="Refresh organizations"><RefreshCw size={14} /></button></div>
    <div className="org-manager-grid">
      <div className="org-team-panel">
        <label className="org-field">Organization<select value={selected} onChange={(event) => setSelected(event.target.value)}>{organizations.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.role.replaceAll("_", " ")}</option>)}</select></label>
        <div className="org-member-list"><div className="org-subheading"><Users size={15} /><strong>Members</strong><span>{members.length}</span></div>
          {members.map((member) => <article key={member.userId} className="org-member"><div><strong>{member.name || member.email || "Member"}</strong><small>{member.email || member.userId}</small></div>{member.role === "owner" || !canManage ? <span className="org-role-label">{member.role.replaceAll("_", " ")}</span> : <div className="org-member-actions"><select aria-label={`Role for ${member.email || member.userId}`} value={member.role} onChange={(event) => updateMember(member.userId, event.target.value)}>{roles.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select>{current?.role === "owner" && <button type="button" disabled={busy} onClick={() => transferOwnership(member.userId)}>Transfer ownership</button>}<button type="button" disabled={busy} onClick={() => removeMember(member.userId)}>Remove</button></div>}</article>)}
          {!members.length && <p className="org-empty">No members found or you do not have permission to view them.</p>}
        </div>
        {!!invitations.length && <div className="org-invites"><strong>Pending invitations</strong>{invitations.map((item) => <p key={item.email}>{item.email} · {item.role.replaceAll("_", " ")} · expires {new Date(item.expiresAt).toLocaleDateString()}</p>)}</div>}
        {canManage && <form className="org-invite-form" onSubmit={invite}><label className="org-field">Invite by email<input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" /></label><label className="org-field">Role<select value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select></label><button type="submit" disabled={busy}>Create invite link</button></form>}
        {link && <div className="org-invite-link"><input readOnly value={link} aria-label="Invitation link" /><button type="button" onClick={() => navigator.clipboard.writeText(link).then(() => notify("Invitation link copied.", "success")).catch(() => notify("Could not copy the invitation link. Copy it from the field instead.", "error"))}><Copy size={14} /> Copy</button></div>}
      </div>
      <div className="org-create-panel"><p className="workspace-eyebrow">NEW TEAM</p><h3>Create an organization</h3><p>Use a shared organization for sites and work managed by multiple people.</p><form onSubmit={createOrganization}><label className="org-field">Organization name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required placeholder="Acme SEO team" /></label><button type="submit" disabled={busy}><Plus size={14} /> Create organization</button></form></div>
    </div>
    {message && <p className={`org-message workspace-feedback${messageTone === "info" ? "" : ` is-${messageTone}`}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p>}
    <p className="org-note">Invitation links are single use and expire after seven days. Send the link yourself to the invited address.</p>
    <WorkspaceActionDialog
      open={!!memberAction}
      eyebrow={memberAction?.kind === "transfer" ? "ORGANIZATION OWNERSHIP" : "TEAM ACCESS"}
      title={memberAction?.kind === "transfer" ? "Transfer organization ownership?" : "Remove this team member?"}
      description={memberAction?.kind === "transfer"
        ? `${memberAction.member.name || memberAction.member.email || "This member"} will become the owner of ${memberAction.organizationName}. Your role will change to administrator.`
        : `${memberAction?.member.name || memberAction?.member.email || "This member"} will lose access to ${memberAction?.organizationName || "this organization"} and its shared workspace.`}
      confirmLabel={memberAction?.kind === "transfer" ? "Transfer ownership" : "Remove member"}
      destructive={memberAction?.kind === "remove"}
      onCancel={() => setMemberAction(null)}
      onConfirm={confirmMemberAction}
    />
  </section>;
}
