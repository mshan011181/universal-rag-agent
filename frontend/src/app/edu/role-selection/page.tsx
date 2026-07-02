'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { eduListProfiles, eduVerifyParentPin, eduVerifyProfilePin, eduCreateProfile } from '@/lib/api'
import type { EduProfile } from '@/lib/api'
import { getUserRole } from '@/lib/auth'
import { Trophy, Plus, Loader2, Lock } from 'lucide-react'

const GRADES = Array.from({ length: 12 }, (_, i) => String(i + 1))

export default function RoleSelectionPage() {
  const router = useRouter()
  const role = getUserRole()
  const [profiles, setProfiles] = useState<EduProfile[]>([])
  const [parentName, setParentName] = useState('Parent')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // PIN modal state
  const [pinFor, setPinFor] = useState<{ kind: 'parent' | 'profile'; profile?: EduProfile } | null>(null)
  const [pin, setPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)

  // Add student modal
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', grade: '8', pin: '', teaching_style: '' })
  const [adding, setAdding] = useState(false)

  const refresh = () => eduListProfiles().then(r => { setProfiles(r.profiles); setParentName(r.parent.name) }).catch(e => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => {
    if (role === 'student') { router.replace('/edu/student'); return }
    refresh()
  }, [role, router])

  async function submitPin(e: React.FormEvent) {
    e.preventDefault(); if (!pinFor) return; setPinBusy(true); setError('')
    try {
      if (pinFor.kind === 'parent') { await eduVerifyParentPin(pin); router.push('/edu/parent') }
      else if (pinFor.profile) {
        await eduVerifyProfilePin(pinFor.profile.id, pin)
        sessionStorage.setItem('edu_profile', JSON.stringify({ id: pinFor.profile.id, name: pinFor.profile.name, grade: pinFor.profile.grade }))
        router.push('/edu/learn')
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Incorrect PIN.') } finally { setPinBusy(false) }
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault(); setAdding(true); setError('')
    try {
      await eduCreateProfile({ name: form.name.trim(), grade: form.grade, pin: form.pin.trim(), teaching_style: form.teaching_style.trim() })
      setShowAdd(false); setForm({ name: '', grade: form.grade, pin: '', teaching_style: '' }); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create student.') } finally { setAdding(false) }
  }

  function openProfile(p: EduProfile) {
    if (p.has_pin) { setPin(''); setPinFor({ kind: 'profile', profile: p }) }
    else { sessionStorage.setItem('edu_profile', JSON.stringify({ id: p.id, name: p.name, grade: p.grade })); router.push('/edu/learn') }
  }
  function openParent() {
    setPin(''); setPinFor({ kind: 'parent' })
  }

  return (
    <EduShell>
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-3xl font-bold text-center text-gray-900">Choose <span className="text-indigo-600">Profile</span></h1>
          <p className="text-center text-gray-500 mt-1">Select who&apos;s using MaximAI Edu</p>
          <div className="w-10 h-1 bg-indigo-500 rounded mx-auto mt-3 mb-6" />
          {error && <p className="text-center text-sm text-red-600 mb-3">{error}</p>}

          {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div> : (
            <div className="space-y-4">
              <button onClick={openParent} className="w-full rounded-2xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all p-6 text-center">
                <Trophy className="w-9 h-9 mx-auto text-amber-500" />
                <p className="font-bold text-gray-900 mt-2">{parentName}</p>
                <p className="text-sm text-gray-500">Parent · Manage &amp; monitor</p>
              </button>

              {profiles.map(p => (
                <button key={p.id} onClick={() => openProfile(p)} className="w-full rounded-2xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all p-6 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-lg font-bold">{p.name.slice(0, 1).toUpperCase()}</div>
                  <p className="font-bold text-gray-900 mt-2">{p.name}</p>
                  <span className="inline-block mt-1 px-3 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">{p.belt} Belt</span>
                  <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1">{p.has_pin && <Lock className="w-3 h-3" />} Start learning</p>
                </button>
              ))}

              <button onClick={() => setShowAdd(true)} className="w-full rounded-2xl border border-dashed border-gray-300 hover:border-indigo-400 hover:shadow-md transition-all p-6 text-center">
                <Plus className="w-8 h-8 mx-auto text-indigo-500" />
                <p className="font-bold text-gray-900 mt-2">Create Student</p>
                <p className="text-sm text-gray-500">Add student profile</p>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* PIN modal */}
      {pinFor && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-30" onClick={() => setPinFor(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={submitPin} className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center">
            <p className="text-lg font-bold text-gray-900">{pinFor.kind === 'parent' ? '🔒 Parent Access' : `👋 Hello ${pinFor.profile?.name}!`}</p>
            <p className="text-sm text-gray-500 mt-1">Enter your 4-digit PIN to continue</p>
            <input autoFocus inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className="input text-center tracking-[0.5em] text-xl mt-4" placeholder="••••" />
            <div className="flex gap-2 justify-center mt-4">
              <button type="button" onClick={() => setPinFor(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600">Cancel</button>
              <button disabled={pinBusy} className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold disabled:opacity-60">{pinBusy ? '…' : 'Submit'}</button>
            </div>
            <p className="text-xs text-gray-400 mt-3">First time? The PIN you enter becomes this profile&apos;s PIN.</p>
          </form>
        </div>
      )}

      {/* Add student modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-30" onClick={() => setShowAdd(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={addStudent} className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <p className="text-lg font-bold text-gray-900 text-center">Add Student</p>
            <label className="label mt-4">Student Name *</label>
            <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="First name is good enough" />
            <label className="label mt-3">Grade *</label>
            <select className="input" value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}>
              {GRADES.map(g => <option key={g} value={g}>Class {g}</option>)}
            </select>
            <label className="label mt-3">Profile PIN</label>
            <input className="input" inputMode="numeric" maxLength={4} value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} placeholder="4-digit (optional)" />
            <label className="label mt-3">Teaching Style</label>
            <textarea className="input resize-none" rows={2} value={form.teaching_style} onChange={e => setForm({ ...form, teaching_style: e.target.value })} placeholder="Be friendly, explain in a simple & structured way" />
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600">Cancel</button>
              <button disabled={adding} className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold disabled:opacity-60">{adding ? '…' : 'Add Student'}</button>
            </div>
          </form>
        </div>
      )}
    </EduShell>
  )
}
