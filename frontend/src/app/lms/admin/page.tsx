'use client'

import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import {
  lmsListUsers, lmsCreateUser, lmsDeleteUser,
  lmsListParentLinks, lmsLinkParent, lmsUnlinkParent,
  lmsListTeacherSubjects, lmsAssignTeacher, lmsUnassignTeacher,
  lmsListMaterials, lmsAddMaterial, lmsDeleteMaterial, getIngestHistory,
} from '@/lib/api'
import type { LmsUser, ParentLink, TeacherSubject, CourseMaterial } from '@/lib/api'
import type { IngestedItem } from '@/types'
import { GraduationCap, UserPlus, Trash2, Link2, Loader2, AlertCircle, Users, BookOpen, Library } from 'lucide-react'
import clsx from 'clsx'

const GRADES = ['9', '10', '11', '12']
const ROLES = ['teacher', 'student', 'parent', 'admin']

export default function LmsAdminPage() {
  const [tab, setTab] = useState<'users' | 'parents' | 'teachers' | 'materials'>('users')
  const [users, setUsers] = useState<LmsUser[]>([])
  const [links, setLinks] = useState<ParentLink[]>([])
  const [tsubs, setTsubs] = useState<TeacherSubject[]>([])
  const [materials, setMaterials] = useState<CourseMaterial[]>([])
  const [docs, setDocs] = useState<{ name: string; chunks: number }[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const refresh = useCallback(() => {
    lmsListUsers().then(r => setUsers(r.users)).catch(e => setError(e.message))
    lmsListParentLinks().then(r => setLinks(r.links)).catch(() => {})
    lmsListTeacherSubjects().then(r => setTsubs(r.assignments)).catch(() => {})
    lmsListMaterials().then(r => setMaterials(r.materials)).catch(() => {})
    getIngestHistory().then(hist => {
      const list: { name: string; chunks: number }[] = []
      Object.values(hist.by_type || {}).forEach(items => {
        ;(items as IngestedItem[]).forEach(it => { if (it.chunks > 0) list.push({ name: it.name, chunks: it.chunks }) })
      })
      setDocs(list)
    }).catch(() => {})
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const students = users.filter(u => u.role === 'student')
  const parents = users.filter(u => u.role === 'parent')
  const teachers = users.filter(u => u.role === 'teacher')

  // ── Create user form ──
  const [form, setForm] = useState({ email: '', full_name: '', role: 'student', grade: '9', password: '' })
  const [creating, setCreating] = useState(false)
  async function createUser(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg(''); setCreating(true)
    try {
      const res = await lmsCreateUser({
        email: form.email.trim(), full_name: form.full_name.trim(), role: form.role,
        grade: form.role === 'student' ? form.grade : '', password: form.password.trim() || undefined,
      })
      setMsg(res.temp_password
        ? `Created ${res.email}. Temporary password: ${res.temp_password} (share it securely)`
        : `Created ${res.email}.`)
      setForm({ email: '', full_name: '', role: form.role, grade: form.grade, password: '' })
      refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create user.') }
    finally { setCreating(false) }
  }
  async function removeUser(id: string) {
    if (!confirm('Delete this user and their links? This cannot be undone.')) return
    try { await lmsDeleteUser(id); refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed.') }
  }

  // ── Parent linking ──
  const [pl, setPl] = useState({ parent_id: '', student_id: '' })
  async function link(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('')
    try { await lmsLinkParent(pl.parent_id, pl.student_id); setMsg('Linked.'); setPl({ parent_id: '', student_id: '' }); refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Link failed.') }
  }

  // ── Material tagging ──
  const [mat, setMat] = useState({ grade: '9', subject: '', source_name: '' })
  async function tagMaterial(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('')
    try { await lmsAddMaterial(mat.grade, mat.subject.trim(), mat.source_name); setMsg('Tagged.'); setMat({ grade: mat.grade, subject: mat.subject, source_name: '' }); refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Tag failed.') }
  }

  // ── Teacher assignment ──
  const [ta, setTa] = useState({ teacher_id: '', grade: '9', subject: '' })
  async function assign(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('')
    try { await lmsAssignTeacher(ta.teacher_id, ta.grade, ta.subject.trim()); setMsg('Assigned.'); setTa({ teacher_id: '', grade: ta.grade, subject: '' }); refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Assign failed.') }
  }

  const nameOf = (id: string) => {
    const u = users.find(x => x.user_id === id); return u ? (u.full_name || u.email) : id
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-brand-600" /> LMS Administration
          </h1>
          <p className="text-sm text-gray-500 mt-1">Create accounts, link parents to children, and assign teachers to subjects.</p>
        </div>

        <div className="flex gap-2">
          {([['users', 'Users', Users], ['parents', 'Parent links', Link2], ['teachers', 'Teacher subjects', BookOpen], ['materials', 'Content library', Library]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                tab === id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
        {msg && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">{msg}</div>}

        {tab === 'users' && (
          <>
            <form onSubmit={createUser} className="card p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-2"><UserPlus className="w-4 h-4 text-brand-600" /> Create account</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="label">Full name</label><input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
                <div><label className="label">Email</label><input className="input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div><label className="label">Role</label>
                  <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {form.role === 'student' && (
                  <div><label className="label">Grade</label>
                    <select className="input" value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}>
                      {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                    </select>
                  </div>
                )}
                <div><label className="label">Password (optional)</label><input className="input" placeholder="auto-generate if blank" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
              </div>
              <button className="btn-primary flex items-center gap-2" disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Create
              </button>
            </form>

            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2">Email</th><th className="text-left px-4 py-2">Role</th><th className="text-left px-4 py-2">Grade</th><th className="px-4 py-2"></th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.user_id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-800">{u.full_name || '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{u.email}</td>
                      <td className="px-4 py-2"><span className="capitalize px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">{u.role}</span></td>
                      <td className="px-4 py-2 text-gray-600">{u.grade || '—'}</td>
                      <td className="px-4 py-2 text-right"><button onClick={() => removeUser(u.user_id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No users yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'parents' && (
          <>
            <form onSubmit={link} className="card p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-900">Link a parent to a child</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="label">Parent</label>
                  <select className="input" required value={pl.parent_id} onChange={e => setPl({ ...pl, parent_id: e.target.value })}>
                    <option value="">Select parent…</option>
                    {parents.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}
                  </select>
                </div>
                <div><label className="label">Student</label>
                  <select className="input" required value={pl.student_id} onChange={e => setPl({ ...pl, student_id: e.target.value })}>
                    <option value="">Select student…</option>
                    {students.map(s => <option key={s.user_id} value={s.user_id}>{(s.full_name || s.email)} (Grade {s.grade})</option>)}
                  </select>
                </div>
              </div>
              <button className="btn-primary flex items-center gap-2"><Link2 className="w-4 h-4" /> Link</button>
            </form>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider"><tr><th className="text-left px-4 py-2">Parent</th><th className="text-left px-4 py-2">Student</th><th className="text-left px-4 py-2">Grade</th><th className="px-4 py-2"></th></tr></thead>
                <tbody>
                  {links.map(l => (
                    <tr key={l.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-800">{l.parent_name || l.parent_email}</td>
                      <td className="px-4 py-2 text-gray-800">{l.student_name || l.student_email}</td>
                      <td className="px-4 py-2 text-gray-600">{l.grade}</td>
                      <td className="px-4 py-2 text-right"><button onClick={() => lmsUnlinkParent(l.id).then(refresh)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                  {links.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No links yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'teachers' && (
          <>
            <form onSubmit={assign} className="card p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-900">Assign a teacher to a grade + subject</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="label">Teacher</label>
                  <select className="input" required value={ta.teacher_id} onChange={e => setTa({ ...ta, teacher_id: e.target.value })}>
                    <option value="">Select teacher…</option>
                    {teachers.map(t => <option key={t.user_id} value={t.user_id}>{t.full_name || t.email}</option>)}
                  </select>
                </div>
                <div><label className="label">Grade</label>
                  <select className="input" value={ta.grade} onChange={e => setTa({ ...ta, grade: e.target.value })}>
                    {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                  </select>
                </div>
                <div><label className="label">Subject</label><input className="input" required placeholder="e.g. Physics" value={ta.subject} onChange={e => setTa({ ...ta, subject: e.target.value })} /></div>
              </div>
              <button className="btn-primary flex items-center gap-2"><BookOpen className="w-4 h-4" /> Assign</button>
            </form>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider"><tr><th className="text-left px-4 py-2">Teacher</th><th className="text-left px-4 py-2">Grade</th><th className="text-left px-4 py-2">Subject</th><th className="px-4 py-2"></th></tr></thead>
                <tbody>
                  {tsubs.map(t => (
                    <tr key={t.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-800">{t.teacher_name || t.teacher_email || nameOf(t.teacher_id)}</td>
                      <td className="px-4 py-2 text-gray-600">{t.grade}</td>
                      <td className="px-4 py-2 text-gray-600">{t.subject}</td>
                      <td className="px-4 py-2 text-right"><button onClick={() => lmsUnassignTeacher(t.id).then(refresh)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                  {tsubs.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No assignments yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'materials' && (
          <>
            <form onSubmit={tagMaterial} className="card p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Library className="w-4 h-4 text-brand-600" /> Tag an ingested book to a grade + subject</p>
              <p className="text-xs text-gray-500">Upload NCERT books on the <a href="/ingest" className="text-brand-600 hover:underline">Ingest</a> page first, then tag each one here so students see it under the right subject.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="label">Grade</label>
                  <select className="input" value={mat.grade} onChange={e => setMat({ ...mat, grade: e.target.value })}>
                    {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                  </select>
                </div>
                <div><label className="label">Subject</label><input className="input" required placeholder="e.g. Physics" value={mat.subject} onChange={e => setMat({ ...mat, subject: e.target.value })} /></div>
                <div><label className="label">Document</label>
                  <select className="input" required value={mat.source_name} onChange={e => setMat({ ...mat, source_name: e.target.value })}>
                    <option value="">Select an ingested document…</option>
                    {docs.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn-primary flex items-center gap-2"><Library className="w-4 h-4" /> Tag material</button>
            </form>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider"><tr><th className="text-left px-4 py-2">Grade</th><th className="text-left px-4 py-2">Subject</th><th className="text-left px-4 py-2">Document</th><th className="px-4 py-2"></th></tr></thead>
                <tbody>
                  {materials.map(m => (
                    <tr key={m.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-600">{m.grade}</td>
                      <td className="px-4 py-2 text-gray-800">{m.subject}</td>
                      <td className="px-4 py-2 text-gray-600 truncate max-w-xs" title={m.source_name}>{m.source_name}</td>
                      <td className="px-4 py-2 text-right"><button onClick={() => lmsDeleteMaterial(m.id).then(refresh)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                  {materials.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No materials tagged yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
