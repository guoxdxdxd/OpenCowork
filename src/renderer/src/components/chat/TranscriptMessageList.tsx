import * as React from 'react'
import type { ContentBlock, ToolResultContent, UnifiedMessage } from '@renderer/lib/api/types'
import { MessageItem } from './MessageItem'

interface TranscriptMessageListProps {
  messages: UnifiedMessage[]
  streamingMessageId?: string | null
}

function isToolResultOnlyUserMessage(message: UnifiedMessage): boolean {
  return (
    message.role === 'user' &&
    Array.isArray(message.content) &&
    message.content.every((block) => block.type === 'tool_result')
  )
}

function collectToolResults(
  blocks: ContentBlock[],
  target: Map<string, { content: ToolResultContent; isError?: boolean }>
): void {
  for (const block of blocks) {
    if (block.type === 'tool_result') {
      target.set(block.toolUseId, { content: block.content, isError: block.isError })
    }
  }
}

function getToolResultsLookup(
  messages: UnifiedMessage[]
): Map<string, Map<string, { content: ToolResultContent; isError?: boolean }>> {
  const lookup = new Map<string, Map<string, { content: ToolResultContent; isError?: boolean }>>()
  let currentAssistantMessageId: string | null = null

  for (const message of messages) {
    if (message.role === 'assistant') {
      currentAssistantMessageId = message.id
      continue
    }

    if (isToolResultOnlyUserMessage(message) && currentAssistantMessageId) {
      let results = lookup.get(currentAssistantMessageId)
      if (!results) {
        results = new Map()
        lookup.set(currentAssistantMessageId, results)
      }
      collectToolResults(message.content as ContentBlock[], results)
      continue
    }

    currentAssistantMessageId = null
  }

  return lookup
}

export function TranscriptMessageList({
  messages,
  streamingMessageId = null
}: TranscriptMessageListProps): React.JSX.Element {
  const toolResultsLookup = React.useMemo(() => getToolResultsLookup(messages), [messages])

  const visibleMessages = React.useMemo(
    () => messages.filter((message) => !isToolResultOnlyUserMessage(message)),
    [messages]
  )

  const lastUserId = React.useMemo(() => {
    for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
      if (visibleMessages[index].role === 'user') return visibleMessages[index].id
    }
    return null
  }, [visibleMessages])

  const lastAssistantId = React.useMemo(() => {
    for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
      if (visibleMessages[index].role === 'assistant') return visibleMessages[index].id
    }
    return null
  }, [visibleMessages])

  return (
    <div className="space-y-5">
      {visibleMessages.map((message) => (
        <div key={message.id} className="mx-auto max-w-3xl">
          <MessageItem
            message={message}
            messageId={message.id}
            isStreaming={streamingMessageId === message.id}
            isLastUserMessage={message.id === lastUserId}
            isLastAssistantMessage={message.id === lastAssistantId}
            disableAnimation
            toolResults={toolResultsLookup.get(message.id)}
            renderMode="transcript"
          />
        </div>
      ))}
    </div>
  )
}
