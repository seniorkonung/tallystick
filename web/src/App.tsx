import { Composer } from './Composer'
import { Feed } from './Feed'

export default function App() {
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col bg-stone-50">
      <Feed />
      <Composer />
    </div>
  )
}
