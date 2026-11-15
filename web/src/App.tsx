import { ChatScreen } from './ChatScreen'
import { Composer } from './Composer'
import { DateJump } from './DateJump'
import { Feed } from './Feed'
import { SelectionBar } from './SelectionBar'
import { useSelection } from './selectionStore'
import { TopBar } from './TopBar'

export default function App() {
  const selecting = useSelection((s) => s.ids.length > 0)
  return (
    <div className="fixed inset-0 mx-auto flex max-w-xl flex-col bg-stone-50">
      <Feed />
      <TopBar />
      {selecting ? <SelectionBar /> : <Composer />}
      <DateJump />
      <ChatScreen />
    </div>
  )
}
