import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

function renderInlineMarkdown(text) {
    // Regex matching bold (**text**), inline code (`code`), and plain text chunks
    const parts = [];
    const regex = /(\*\*.*?\*\*|`.*?`)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }
        const str = match[0];
        if (str.startsWith('**') && str.endsWith('**')) {
            parts.push(
                <strong key={match.index} className="font-semibold text-white">
                    {str.slice(2, -2)}
                </strong>
            );
        } else if (str.startsWith('`') && str.endsWith('`')) {
            parts.push(
                <code key={match.index} className="px-1.5 py-0.5 rounded bg-white/10 text-mint font-mono text-[11px]">
                    {str.slice(1, -1)}
                </code>
            );
        }
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return parts;
}

function renderMarkdown(content) {
    if (!content) return null;

    const lines = content.split(/\r?\n/);
    const elements = [];
    let currentList = null; // { type: 'ul' | 'ol', items: [] }

    const flushList = (keyPrefix) => {
        if (!currentList) return;
        if (currentList.type === 'ul') {
            elements.push(
                <ul key={`${keyPrefix}-ul`} className="list-disc list-inside space-y-1 my-1.5 text-white/90">
                    {currentList.items.map((item, idx) => (
                        <li key={idx}>{renderInlineMarkdown(item)}</li>
                    ))}
                </ul>
            );
        } else if (currentList.type === 'ol') {
            elements.push(
                <ol key={`${keyPrefix}-ol`} className="list-decimal list-inside space-y-1 my-1.5 text-white/90">
                    {currentList.items.map((item, idx) => (
                        <li key={idx}>{renderInlineMarkdown(item)}</li>
                    ))}
                </ol>
            );
        }
        currentList = null;
    };

    lines.forEach((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
            flushList(idx);
            return;
        }

        // Horizontal Rule check (---, ***, ___ with optional spacing)
        if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushList(idx);
            elements.push(
                <hr key={idx} className="my-2.5 border-t border-white/15" />
            );
            return;
        }

        // Headings check (#, ##, ###, ####, etc.)
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            flushList(idx);
            const level = headingMatch[1].length;
            const text = headingMatch[2];

            let headingStyle = 'font-bold text-white my-1.5 first:mt-0';
            if (level === 1) {
                headingStyle += ' text-sm border-b border-white/10 pb-0.5';
            } else if (level === 2) {
                headingStyle += ' text-xs text-mint';
            } else {
                headingStyle += ' text-xs text-white/90';
            }

            elements.push(
                <div key={idx} className={headingStyle}>
                    {renderInlineMarkdown(text)}
                </div>
            );
            return;
        }

        const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
        const numMatch = line.match(/^\s*\d+\.\s+(.*)$/);

        if (bulletMatch) {
            if (currentList && currentList.type !== 'ul') {
                flushList(idx);
            }
            if (!currentList) {
                currentList = { type: 'ul', items: [] };
            }
            currentList.items.push(bulletMatch[1]);
        } else if (numMatch) {
            if (currentList && currentList.type !== 'ol') {
                flushList(idx);
            }
            if (!currentList) {
                currentList = { type: 'ol', items: [] };
            }
            currentList.items.push(numMatch[1]);
        } else {
            flushList(idx);
            elements.push(
                <p key={idx} className="my-1 first:mt-0 last:mb-0">
                    {renderInlineMarkdown(line)}
                </p>
            );
        }
    });

    flushList('end');

    return <div className="space-y-1">{elements}</div>;
}

export function CopilotDrawer({
    isOpen,
    onClose,
    session,
    sessionCode,
    activeCandidateName,
}) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const chatEndRef = useRef(null);

    const token = localStorage.getItem('token');
    const API = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    if (!isOpen) return null;

    const handleSend = async (e) => {
        e?.preventDefault();
        const text = input.trim();
        if (!text || loading) return;

        const userMsg = { role: 'user', content: text };
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInput('');
        setLoading(true);
        setError('');

        try {
            const res = await axios.post(`${API}/ai/copilot/chat`, {
                message: text,
                history: updatedMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
                context: {
                    session_id: sessionCode || '',
                    role: session?.title || 'Technical Interview',
                    job_description: session?.title || '',
                    candidate_profile: activeCandidateName || '',
                    topics: session?.title ? [session.title] : [],
                },
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const reply = res.data?.reply || res.data?.message || 'No response received.';
            setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reach AI Copilot.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/40 backdrop-blur-sm transition-opacity">
            <div className="w-full max-w-lg bg-ink border-l border-white/15 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
                {/* Drawer Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-mint shadow-[0_0_10px_#4ce5e8]" />
                        <h2 className="font-display font-semibold text-sm text-white">AI Copilot</h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 text-sm font-bold"
                    >
                        ✕
                    </button>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.length === 0 && (
                        <div className="text-center py-10 text-white/40 text-xs">
                            Ask AI Copilot anything about the interview, candidate response, or technical questions.
                        </div>
                    )}

                    {messages.map((m, index) => (
                        <div
                            key={`${m.role}-${index}`}
                            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                        >
                            <span className="text-[10px] text-white/40 mb-1 px-1">
                                {m.role === 'user' ? 'You' : 'Copilot'}
                            </span>
                            <div
                                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                                    m.role === 'user'
                                        ? 'bg-mint text-ink font-medium rounded-tr-none'
                                        : 'bg-white/10 text-white/90 border border-white/10 rounded-tl-none'
                                }`}
                            >
                                {m.role === 'user' ? m.content : renderMarkdown(m.content)}
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="flex flex-col items-start">
                            <span className="text-[10px] text-white/40 mb-1 px-1">Copilot</span>
                            <div className="flex items-center gap-2 text-xs text-white/70 bg-white/10 border border-white/10 px-3.5 py-2.5 rounded-2xl rounded-tl-none w-fit">
                                <span className="w-2 h-2 rounded-full bg-mint animate-ping" />
                                <span>Copilot is thinking...</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                            {error}
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSend} className="p-3 border-t border-white/10 bg-white/5 flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type message to AI Copilot..."
                        className="flex-1 px-3.5 py-2 bg-white/5 border border-white/15 rounded-xl text-white text-xs placeholder-white/30 focus:outline-none focus:border-mint"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || loading}
                        className="button-primary px-4 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
}
