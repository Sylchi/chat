export const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    items: [
      '😀 grinning happy face', '😃 grinning eyes happy', '😄 smile happy laugh', '😁 beam grin happy',
      '😆 laughing silly squint', '😅 sweat smile relief', '😂 tears of joy laugh', '🤣 rofl laugh',
      '😊 blush smile happy', '😇 angel innocent halo', '🙂 slight smile', '🙃 upside down silly',
      '😉 wink', '😍 heart eyes love crush', '🥰 smiling hearts love adore', '😘 kiss love',
      '😋 yum delicious silly', '😛 tongue out playful', '😝 tongue out silly', '🤪 zany wild crazy',
      '😎 cool sunglasses', '🤩 star struck amazed wow', '🥳 party celebrate hooray', '😏 smirk smug',
      '😒 unamused annoyed', '😔 pensive sad down', '😟 worried anxious', '😕 confused puzzled',
      '🙁 slight frown sad', '😢 cry sad tear', '😭 sob crying sad', '😤 frustrated steam triumph',
      '😠 angry mad', '🤯 mind blown exploding head', '😳 flushed surprised embarrassed', '🥺 pleading eyes please',
      '😴 sleeping tired nap', '🤒 sick ill', '🥵 hot sweating', '🥶 cold freezing',
      '😷 mask sick', '🤗 hugs welcome',
    ],
  },
  {
    name: 'Gestures',
    items: [
      '👍 thumbs up yes like approve', '👎 thumbs down no dislike', '👏 clap bravo applause', '🙌 raised hands celebrate hooray',
      '🤝 handshake deal agreement', '🙏 please thanks pray grateful', '✊ fist bump solidarity power', '✋ stop high five hand',
      '🤞 crossed fingers luck hope', '🤙 call me shaka', '👌 perfect ok okay', '🤌 pinch chef kiss',
      '🖐️ raised hand five', '✌️ peace victory two', '🤘 rock horns', '💪 strong flex muscle',
      '🫶 heart hands love appreciation', '👋 wave hello goodbye hi', '🤏 pinch small little', '🫡 salute respect yes sir',
    ],
  },
  {
    name: 'Hearts',
    items: [
      '❤️ red heart love', '🧡 orange heart', '💛 yellow heart', '💚 green heart',
      '💙 blue heart', '💜 purple heart', '🖤 black heart', '🤍 white heart',
      '💔 broken heart sad breakup', '❤️‍🔥 burning heart passion', '💯 hundred perfect score', '✨ sparkles magic shiny',
      '🔥 fire hot lit flame', '⭐ star favorite', '🌟 glowing star', '💫 dizzy star',
      '🎉 party popper celebrate', '🎈 balloon party', '🎁 gift present surprise', '🏆 trophy win champion',
      '🥇 gold medal first', '💖 sparkling heart love',
    ],
  },
  {
    name: 'Animals & nature',
    items: [
      '🐶 dog puppy', '🐱 cat kitten', '🐭 mouse', '🐹 hamster',
      '🐰 rabbit bunny', '🦊 fox', '🐻 bear', '🐼 panda',
      '🐨 koala', '🐯 tiger', '🦁 lion', '🐮 cow',
      '🐷 pig', '🐸 frog', '🐵 monkey monkey face', '🐔 chicken',
      '🐦 bird', '🦋 butterfly', '🐝 bee', '🐢 turtle',
      '🐙 octopus', '🐬 dolphin', '🌸 cherry blossom flower', '🌻 sunflower',
      '🌈 rainbow', '☀️ sun sunny', '🌙 moon night', '⛄ snowman winter',
      '🌊 wave water ocean', '🍀 four leaf clover luck', '🌵 cactus', '🌴 palm tree tropical',
    ],
  },
  {
    name: 'Food & drink',
    items: [
      '🍎 apple fruit', '🍌 banana', '🍇 grapes', '🍓 strawberry',
      '🍒 cherries', '🍑 peach', '🍍 pineapple', '🥝 kiwi',
      '🍅 tomato', '🥑 avocado', '🍞 bread', '🧀 cheese',
      '🍕 pizza', '🍔 burger', '🍟 fries', '🌮 taco',
      '🍜 noodles ramen', '🍣 sushi', '🍰 cake slice', '🧁 cupcake',
      '🍪 cookie', '🍫 chocolate', '☕ coffee hot drink', '🍵 tea',
      '🍺 beer', '🥂 cheers champagne', '🍷 wine', '🍦 ice cream',
      '🥞 pancakes breakfast', '🌯 burrito',
    ],
  },
  {
    name: 'Objects',
    items: [
      '⚡ lightning fast zap', '💡 idea light bulb', '🎯 target goal bullseye', '📌 pin pushpin',
      '✅ check done yes', '❌ cross no error wrong', '⏰ alarm clock time', '🎧 headphones music',
      '📷 camera photo', '📱 phone mobile', '💻 laptop computer', '🔒 lock secure private',
      '🔑 key password', '🚀 rocket launch ship fast', '📚 books reading study', '✍️ writing pen signature',
      '🤔 thinking hmm question', '💬 speech bubble message chat', '🔔 bell notification alert', '🛡️ shield privacy safe',
      '🧠 brain smart think', '🔋 battery power', '🧩 puzzle piece', '🎵 music note song',
      '🎬 clapperboard movie film', '📝 memo note list', '🗓️ calendar date schedule', '📍 location pin place',
      '🔍 search magnifier find', '🤖 robot ai assistant', '🖥️ desktop monitor computer', '📦 package box delivery',
    ],
  },
]

const FLAT = EMOJI_CATEGORIES.flatMap((category) =>
  category.items.map((item) => {
    const index = item.indexOf(' ')
    return { char: item.slice(0, index), keywords: item.slice(index + 1).toLowerCase(), category: category.name }
  }),
)

export function searchEmoji(query) {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return FLAT.filter((entry) => entry.keywords.includes(q) || entry.char === q || entry.category.toLowerCase().includes(q))
}

export function splitEntry(item) {
  const index = item.indexOf(' ')
  return { char: item.slice(0, index), keywords: item.slice(index + 1) }
}

export function readRecentEmoji() {
  try {
    const list = JSON.parse(localStorage.getItem('s:recent-emoji') ?? '[]')
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string').slice(0, 12) : []
  } catch {
    return []
  }
}

export function pushRecentEmoji(char) {
  const list = [char, ...readRecentEmoji().filter((item) => item !== char)].slice(0, 12)
  try {
    localStorage.setItem('s:recent-emoji', JSON.stringify(list))
  } catch {
    /* ignore */
  }
  return list
}
