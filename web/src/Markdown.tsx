import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { goToEntry } from './chatView'
import { db } from './db'
import { openFilterLink } from './filterLinks'

// Ассистент ссылается на записи ленты ссылками вида entry:<id>, на фильтры ленты — filter:<код>
const entryPrefix = 'entry:'
const filterPrefix = 'filter:'

async function openEntry(id: string) {
  if (await db.entries.get(id)) goToEntry(id)
  else window.alert('Запись удалена')
}

// Ответ ассистента: модели пишут в Markdown, с таблицами и списками
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown text-[15px] leading-relaxed text-stone-900">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Остальные нестандартные схемы по-прежнему вырезаются
        urlTransform={(url) => (url.startsWith(entryPrefix) || url.startsWith(filterPrefix) ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) =>
            href?.startsWith(entryPrefix) ? (
              <button type="button" className="entry-link" onClick={() => void openEntry(href.slice(entryPrefix.length))}>
                {children}
              </button>
            ) : href?.startsWith(filterPrefix) ? (
              <button type="button" className="entry-link" onClick={() => openFilterLink(href)}>
                {children}
              </button>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
