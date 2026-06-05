import { redirect } from 'next/navigation'

// Root → redirect to query page (guarded by AuthGuard inside the shell)
export default function Root() {
  redirect('/query')
}
