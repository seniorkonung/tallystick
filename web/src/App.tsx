import { Composer } from './Composer'
import { DateJump } from './DateJump'
import { Feed } from './Feed'
import { TopBar } from './TopBar'

export default function App() {
  return (
    <div className="fixed inset-0 mx-auto flex max-w-xl flex-col bg-stone-50">
      <Feed />
      <TopBar />
      <Composer />
      <DateJump />
    </div>
  )
}
