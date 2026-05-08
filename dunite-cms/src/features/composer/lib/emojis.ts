// ============================================================================
//  Emoji catalog
// ----------------------------------------------------------------------------
//  Curated, dependency-free set covering the most-used emojis across the
//  major social platforms. Grouped for the picker UI.
// ============================================================================

export interface EmojiCategory {
  id:    string;
  label: string;
  emojis: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    emojis: [
      '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😍','😘','😗','😎','🤩','🥳',
      '😏','🙂','🙃','😇','😌','😋','😜','🤪','🤓','🧐','😐','😑','😶','🙄','😬','🤔',
      '🤨','😴','😪','😵','🥱','🤐','🤫','🤥','😷','🤒','🤕','🤧','🥵','🥶','😱','😨',
    ],
  },
  {
    id: 'gestures',
    label: 'People',
    emojis: [
      '👋','🤚','✋','🖐️','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆',
      '👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾',
      '🧠','👀','👤','👥','💬','🗣️',
    ],
  },
  {
    id: 'hearts',
    label: 'Hearts',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖',
      '💘','💝','💟','♥️','✨','🌟','⭐','💫','💯','🔥','💥','🎉','🎊','🎁','🏆','🥇',
    ],
  },
  {
    id: 'objects',
    label: 'Objects',
    emojis: [
      '💼','📱','💻','⌨️','🖥️','🖱️','🖨️','📷','📸','📹','🎥','🎬','📺','📻','🎙️','🎚️',
      '⏰','⏱️','⏳','📅','📆','📊','📈','📉','📌','📍','🔍','🔎','🔒','🔓','🔑','💡',
      '🛒','💳','💰','💵','📚','📖','📝','✏️','🖊️','🖋️','✒️','📎','✂️','📐','📏','🗂️',
    ],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    emojis: [
      '✅','☑️','✔️','❌','❎','⚠️','🚫','⛔','📛','🔴','🟠','🟡','🟢','🔵','🟣','⚫',
      '⚪','🟤','💯','‼️','⁉️','❓','❔','❕','❗','〽️','♻️','💲','💱','🆗','🆕','🆒',
      '🆙','🆓','🆖','📢','📣','📯','🔔','🔊','🎯','🚀','🌍','🌎','🌏','🌐','📡','💎',
    ],
  },
];

export function emojiSearch(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  // Lightweight: search the category labels + return their emojis.
  // For real search we'd need keyword annotations per emoji.
  const hits = EMOJI_CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
  return hits.flatMap((c) => c.emojis);
}
