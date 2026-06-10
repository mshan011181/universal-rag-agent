'use client'

import { useState, useEffect, FormEvent } from 'react'
import { Building2, Users, Mail, Trash2, Copy, CheckCircle, AlertCircle, Crown, User } from 'lucide-react'
import { getOrgInfo, listOrgMembers, inviteMember, removeMember, updateOrgName } from '@/lib/api'
import { getUserRole } from '@/lib/auth'

interface Member {
  user_id: string
  email: string
  role: string
  created_at: string
}

interface OrgInfo {
  org_id: string
  org_name: string
  plan: string
  member_count: number
}

export default function TeamPage() {
  const role = getUserRole()
  const isAdmin = role === 'admin'

  const [org, setOrg]               = useState<OrgInfo | null>(null)
  const [members, setMembers]       = useState<Member[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [orgNameEdit, setOrgNameEdit] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [copied, setCopied]         = useState(false)
  const [loading, setLoading]       = useState(true)
  const [inviting, setInviting]     = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [orgData, memberData] = await Promise.all([
        getOrgInfo(),
        isAdmin ? listOrgMembers() : Promise.resolve([]),
      ])
      setOrg(orgData)
      setOrgNameEdit(orgData.org_name)
      setMembers(memberData)
    } catch {
      setError('Failed to load organisation data.')
    } finally {
      setLoading(false)
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault(); setError(''); setSuccess(''); setInviteLink('')
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await inviteMember(inviteEmail.trim())
      setInviteLink(res.invite_link)
      setSuccess(res.email_sent
        ? `Invite sent to ${inviteEmail}.`
        : `Email not sent (Resend not configured). Copy the link below.`)
      setInviteEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from the organisation?`)) return
    setRemovingId(userId); setError(''); setSuccess('')
    try {
      await removeMember(userId)
      setMembers(prev => prev.filter(m => m.user_id !== userId))
      setSuccess(`${email} removed.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setRemovingId(null)
    }
  }

  async function handleSaveOrgName(e: FormEvent) {
    e.preventDefault(); setError(''); setSuccess('')
    try {
      await updateOrgName(orgNameEdit)
      setOrg(prev => prev ? { ...prev, org_name: orgNameEdit } : prev)
      setEditingName(false)
      setSuccess('Organisation name updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name')
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-brand-600" /> Team Management
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your organisation and team members.</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle className="w-4 h-4 shrink-0" />{success}
        </div>
      )}

      {/* Org info */}
      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              {editingName && isAdmin ? (
                <form onSubmit={handleSaveOrgName} className="flex items-center gap-2">
                  <input type="text" className="input py-1 text-sm w-44"
                    value={orgNameEdit} onChange={e => setOrgNameEdit(e.target.value)} autoFocus />
                  <button type="submit" className="btn-primary text-xs px-3 py-1">Save</button>
                  <button type="button" onClick={() => setEditingName(false)}
                    className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </form>
              ) : (
                <p className="font-semibold text-gray-900">{org?.org_name || 'Personal workspace'}</p>
              )}
              <p className="text-xs text-gray-500 mt-0.5">
                {org?.member_count} member{org?.member_count !== 1 ? 's' : ''} · {org?.plan || 'free'} plan
              </p>
            </div>
          </div>
          {isAdmin && !editingName && (
            <button onClick={() => setEditingName(true)}
              className="text-xs text-brand-600 hover:underline">Rename</button>
          )}
        </div>
      </div>

      {/* Invite (admin only) */}
      {isAdmin && (
        <div className="card p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-500" /> Invite a team member
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            They'll receive an email with a link to register and join your organisation.
          </p>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input type="email" className="input flex-1" placeholder="colleague@company.com"
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
            <button type="submit" disabled={inviting || !inviteEmail.trim()} className="btn-primary px-4">
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </form>

          {inviteLink && (
            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1.5 font-medium">Invite link (share manually if email not received):</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-gray-700 break-all flex-1">{inviteLink}</code>
                <button onClick={copyLink}
                  className="shrink-0 flex items-center gap-1 text-xs text-brand-600 hover:underline">
                  {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Members list (admin only) */}
      {isAdmin && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" /> Members ({members.length})
          </h2>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No members found.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {members.map(m => (
                <div key={m.user_id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      {m.role === 'admin'
                        ? <Crown className="w-4 h-4 text-amber-500" />
                        : <User className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.email}</p>
                      <p className="text-xs text-gray-400 capitalize">{m.role} · joined {new Date(m.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {m.role !== 'admin' && (
                    <button
                      onClick={() => handleRemove(m.user_id, m.email)}
                      disabled={removingId === m.user_id}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isAdmin && (
        <div className="card p-5 text-center text-sm text-gray-500">
          <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          You are a member of <strong>{org?.org_name || 'this organisation'}</strong>.
          Contact your admin to manage team members.
        </div>
      )}
    </div>
  )
}
