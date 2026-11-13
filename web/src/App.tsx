import { Composer } from './Composer'
import { Feed } from './Feed'

export default function App() {
  return (
    <div className="fixed inset-0 mx-auto flex max-w-xl flex-col bg-stone-50">
      <Feed />
      <Composer />
    </div>
  )
}
