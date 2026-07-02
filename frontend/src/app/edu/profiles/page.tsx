'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { eduListProfiles, eduCreateProfile, eduUpdateProfile, eduDeleteProfile } from '@/lib/api'
import type { EduProfile } from '@/lib/api'
import { ArrowLeft, Plus, Pencil, Trash2, Trophy, Loader2, GraduationCap } from 'lucide-react'

const GRADES = Array.from({ length: 12 }, (_, i) => String(i + 1))

export default function ProfilesPage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<EduProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<EduProfile | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', grade: '8', pin: '', teaching_style: '' })
  const [busy, setBusy] = useState(false)

  const refresh = () => eduListProfiles().then(r => setProfiles(r.profiles)).catch(e => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => { refresh() }, [])

  function openAdd() { setEditing(null); setForm({ name: '', grade: '8', pin: '', teaching_style: '' }); setShowForm(true) }
  function openEdit(p: EduProfile) { setEditing(p); setForm({ name: p.name, grade: p.grade, pin: '', teaching_style: p.teaching_style }); setShowForm(true) }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      if (editing) await eduUpdateProfile(editing.id, { name: form.name.trim(), grade: form.grade, pin: form.pin.trim(), teaching_style: form.teaching_style.trim() })
      else await eduCreateProfile({ name: form.name.trim(), grade: form.grade, pin: form.pin.trim(), teaching_style: form.teaching_style.trim() })
      setShowForm(false); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed.') } finally { setBusy(false) }
  }
  async function remove(p: EduProfile) {
    if (!confirm(`Delete ${p.name}'s profile? This cannot be undone.`)) return
    try { await eduDeleteProfile(p.id); refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed.') }
  }
  function select(p: EduProfile) {
    sessionStorage.setItem('edu_profile', JSON.stringify({ id: p.id, name: p.name, grade: p.grade })); router.push('/edu/learn')
  }

  return (
    <EduShell>
      <div className="max-w-2xl mx-auto">
        <button onClick={() => router.push('/edu/parent')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4" /> Back to Dashboard</button>
        <h1 className="text-2xl font-bold text-center text-gray-900">Student <span className="text-indigo-600">Profiles</span></h1>
        {error && <p className="text-center text-sm text-red-600 mt-3">{error}</p>}

        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          : <div className="mt-6 space-y-4">
              {profiles.map(p => (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">{p.name.slice(0,1).toUpperCase()}</div>
                      <div><p className="font-semibold text-gray-900">{p.name}</p><p className="text-xs text-gray-500 uppercase">Class {p.grade}</p></div>
                    </div>
                    <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-600"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-4 text-gray-600">
                    <span>Plan: <span className="font-semibold text-gray-900 capitalize">{p.plan}</span></span>
                    <span className="inline-flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-amber-500" />{p.belt} Belt</span>
                  </div>
                  {p.valid_till && <p className="text-xs text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-1 mt-3">Valid till {p.valid_till}</p>}
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => select(p)} className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white py-2 text-sm font-semibold inline-flex items-center justify-center gap-1.5"><GraduationCap className="w-4 h-4" /> Select</button>
                    <button onClick={() => remove(p)} className="rounded-xl border border-red-200 text-red-500 px-3 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              {profiles.length === 0 && <p className="text-center text-gray-400 text-sm py-6">No student profiles yet.</p>}
            </div>}

        <div className="flex justify-center mt-6">
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-full bg-gray-900 text-white px-6 py-3 text-sm font-semibold"><Plus className="w-4 h-4" /> Add Student</button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-30" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={save} className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <p className="text-lg font-bold text-gray-900 text-center">{editing ? 'Edit Student' : 'Add Student'}</p>
            <label className="label mt-4">Student Name *</label>
            <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <label className="label mt-3">Grade *</label>
            <select className="input" value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}>{GRADES.map(g => <option key={g} value={g}>Class {g}</option>)}</select>
            <label className="label mt-3">Profile PIN {editing && <span className="text-gray-400 font-normal">(leave blank to keep)</span>}</label>
            <input className="input" inputMode="numeric" maxLength={4} value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} placeholder="4-digit (optional)" />
            <label className="label mt-3">Teaching Style</label>
            <textarea className="input resize-none" rows={2} value={form.teaching_style} onChange={e => setForm({ ...form, teaching_style: e.target.value })} placeholder="Be friendly, explain simply & structured" />
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600">Cancel</button>
              <button disabled={busy} className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold disabled:opacity-60">{busy ? '…' : editing ? 'Save' : 'Add Student'}</button>
            </div>
          </form>
        </div>
      )}
    </EduShell>
  )
}
