import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Ответ ассистента: модели пишут в Markdown, с таблицами и списками
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown text-[15px] leading-relaxed text-stone-900">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
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
