'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Copy } from 'lucide-react';

type Member = {
  id: string;
  user_id: string;
  role: string;
  email?: string | null;
  name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
];

export default function TeamManagement() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteMode, setInviteMode] = useState<'invite' | 'magiclink' | 'added' | null>(null);

  const sortedMembers = useMemo(() => {
    const order = { owner: 0, admin: 1, member: 2 } as Record<string, number>;
    return [...members].sort((a, b) => (order[a.role] ?? 99) - (order[b.role] ?? 99));
  }, [members]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/organization/members');
      if (!res.ok) throw new Error('Failed to load members');
      const data = await res.json();
      setMembers(data.members || []);
    } catch (e) {
      console.error(e);
      alert('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch('/api/organization/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const j: { error?: string; success?: boolean; link?: string | null; mode?: 'invite' | 'magiclink' | 'added' } = await res
        .json()
        .catch(() => ({} as { error?: string }));
      if (!res.ok || !j.success) {
        throw new Error(j.error || 'Failed to invite');
      }
      setInviteEmail('');
      setInviteRole('member');
      setInviteLink(j.link ?? null);
      setInviteMode(j.mode ?? null);
      await load();
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Failed to invite member';
      alert(message);
    } finally {
      setInviting(false);
    }
  };

  const updateRole = async (userId: string, role: string) => {
    try {
      const res = await fetch(`/api/organization/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      await load();
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Failed to update role';
      alert(message);
    }
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Remove this member from your organization?')) return;
    try {
      const res = await fetch(`/api/organization/members/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove member');
      await load();
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Failed to remove member';
      alert(message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-2">
            <Label className="text-gray-300">Email</Label>
            <Input
              placeholder="name@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="bg-gray-800 border-gray-700"
              type="email"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-gray-300">Role</Label>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:text-right">
            <Button onClick={invite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? 'Inviting…' : 'Invite Member'}
            </Button>
          </div>
        </div>
        {inviteLink && (
          <div className="mt-4 space-y-2">
            <div className="text-sm text-gray-300">
              {inviteMode === 'invite' && 'Share this invitation link with the user:'}
              {inviteMode === 'magiclink' && 'Share this sign-in link with the user:'}
              {inviteMode === 'added' && 'User added. Share this link to sign in:'}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 font-mono"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteLink);
                  } catch (err) {
                    console.error('clipboard error', err);
                  }
                }}
                title="Copy to clipboard"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Members list */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-lg">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h4 className="text-white font-medium">Team Members</h4>
          <Button variant="ghost" onClick={load}>
            Refresh
          </Button>
        </div>
        <div className="divide-y divide-gray-800">
          {loading ? (
            <div className="p-4 text-gray-400">Loading…</div>
          ) : sortedMembers.length === 0 ? (
            <div className="p-4 text-gray-400">No members yet.</div>
          ) : (
            sortedMembers.map((m) => (
              <div key={m.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                <div className="flex-1 min-w-0">
                  <div className="text-white truncate">{m.name || m.email || m.user_id}</div>
                  <div className="text-xs text-gray-500 truncate">{m.email}</div>
                </div>
                <div className="w-full md:w-48">
                  <Select value={m.role} onValueChange={(v) => updateRole(m.user_id, v)}>
                    <SelectTrigger className="bg-gray-800 border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:w-32">
                  <Button variant="outline" onClick={() => removeMember(m.user_id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
