-- chat_sessions에 session_type 추가: 'query'(단발 질의) | 'chat'(챗봇 대화)
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'chat';

CREATE INDEX IF NOT EXISTS idx_chat_sessions_type ON chat_sessions(session_type);
