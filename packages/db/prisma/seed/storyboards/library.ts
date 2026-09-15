/**
 * The seed library (FR-15.1 to FR-15.4).
 *
 * Twenty-five works, every one of them published in the United States before
 * 1929 and therefore in the public domain (FR-15.2). Each carries its source so
 * the claim can be checked, and each is seeded under the platform account and
 * labelled an example in the interface (FR-15.3).
 *
 * **On the excerpts.** These are openings, transcribed here rather than fetched
 * at seed time so that `pnpm db:seed` needs no network and is reproducible. They
 * are short on purpose: enough for a reader to feel the voice and for a request
 * to have something to point at.
 *
 * Every one of them is checked against the edition it cites by
 * `pnpm check-excerpts` (decision 0023). **Run it after adding or editing a
 * work.** The first run found thirteen of forty-five did not match — a wrong
 * ebook number, five sentences closed with a full stop the author did not
 * write, a dropped parenthetical, and a handful of moved words. A seeded
 * example that misquotes the text it names is a small dishonesty on a platform
 * whose pitch is trust.
 *
 * Several excerpts stop mid-sentence, with no closing punctuation. That is
 * deliberate and it is not a typo: some of them carry a request asking a
 * contributor to write what comes next, so the passage has to stop where the
 * author of the request stopped rather than where the novelist did.
 *
 * **On the stuck points.** Every `ask` and `preContext` below is written by hand
 * for this product. FR-15.2 is explicit that the *requests* are what is seeded,
 * not the helpers — a helper with nothing to answer leaves and does not come
 * back, an author waiting for an answer is a normal Tuesday. So the asks are the
 * part that had to be real, and they are the part that took the time.
 */

export type SeedRequest = {
  kind: 'REWRITE' | 'CONTINUE' | 'UNBLOCK'
  title: string
  ask: string
  /** FR-5.4 — needed for the two kinds that return prose. */
  preContext?: string
  /** Which section of the work it hangs on, by index. */
  section: number
  /** When set, the request is already answered and this was accepted (FR-15.4). */
  accepted?: {
    by: string
    note: string
    prose: string
  }
}

export type SeedWork = {
  /** Stable, so re-running the seed is idempotent (FR-15.6). */
  publicId: string
  title: string
  logline: string
  type: 'NOVEL' | 'NOVELLA' | 'SHORT_STORY' | 'POETRY' | 'NONFICTION' | 'SCREENPLAY' | 'STAGE_PLAY'
  genres: string[]
  source: { author: string; firstPublished: number; url: string }
  /** One chapter, split into sections. Short by design; these are examples. */
  chapter: { title: string; sections: string[] }
  requests: SeedRequest[]
}

/**
 * The people who wrote the accepted suggestions.
 *
 * Seeded accounts, and labelled as such on their profiles: FR-15.3 forbids
 * making seeded content look like a real community, and a credit line pointing
 * at an invented person would be exactly that. Each is owned by the platform
 * and cannot be signed into.
 */
export const SEED_HELPERS = [
  {
    username: 'example-helper-1',
    displayName: 'An example contributor',
    bio: 'A seeded account. The suggestions credited here were written to show how the product works, not by a member of the community.',
  },
  {
    username: 'example-helper-2',
    displayName: 'Another example contributor',
    bio: 'A seeded account. The suggestions credited here were written to show how the product works, not by a member of the community.',
  },
] as const

export const LIBRARY: SeedWork[] = [
  {
    publicId: 'seedfrank01',
    title: 'Frankenstein',
    logline:
      'A letter home from a ship going north, from a man who has not yet met the thing he will spend his life chasing.',
    type: 'NOVEL',
    genres: ['literary', 'horror', 'science-fiction'],
    source: {
      author: 'Mary Wollstonecraft Shelley',
      firstPublished: 1818,
      url: 'https://www.gutenberg.org/ebooks/84',
    },
    chapter: {
      title: 'Letter one',
      sections: [
        'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. I arrived here yesterday, and my first task is to assure my dear sister of my welfare and increasing confidence in the success of my undertaking.',
        'I am already far north of London, and as I walk in the streets of Petersburgh, I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight. Do you understand this feeling? This breeze, which has travelled from the regions towards which I am advancing, gives me a foretaste of those icy climes.',
      ],
    },
    requests: [
      {
        kind: 'UNBLOCK',
        title: 'How do I get Walton from delight to dread?',
        section: 1,
        ask: 'Walton is happy here, and he has to stop being happy without anything happening to him yet. I do not want a storm and I do not want a bad omen, because both are cheap. What is the smallest thing that could turn this, and can it be something he notices about himself rather than about the ice?',
      },
      {
        kind: 'REWRITE',
        title: 'The letter is too composed for a man this excited',
        section: 0,
        ask: 'Walton is writing to reassure his sister and cannot stop telling her how right he was. At the moment the sentences are even. I want the reassurance and the boasting to be visibly the same sentence, so she would put the letter down worried.',
        preContext:
          'Robert Walton is an Englishman in his late twenties who has spent his own money and six years of his life preparing to sail north in search of a passage over the pole. He failed as a poet first and has told nobody. His sister Margaret, married and in London, begged him not to go, and every letter he writes her is an argument he is having with her objections in her absence. He is in Petersburgh, has hired no crew yet, and has met nobody. He believes he is describing the weather.',
        accepted: {
          by: 'example-helper-2',
          note: 'Left the words and moved the reassurance to the end of the sentence, so it reads as an afterthought.',
          prose:
            'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. I arrived here yesterday. The cold is nothing, the town is full of men who have gone further north than I intend to and come back to talk about it, and I have already engaged a lodging from which I can see the ice going out — and my first task, as I promised it would be, is to assure my dear sister of my welfare.',
        },
      },
      {
        kind: 'UNBLOCK',
        title: 'Epistolary for four letters and then a different book — is that a bait and switch?',
        section: 0,
        ask: 'The letters are doing real work but a reader who settles into them is going to be moved twice: once into Victor’s narration and once into the creature’s. I can feel the first handover being a problem and I cannot tell whether that is a flaw or the shape of the thing.',
      },
    ],
  },
  {
    publicId: 'seedpride01',
    title: 'Pride and Prejudice',
    logline: 'A single man of large fortune takes a house nearby, and a mother begins.',
    type: 'NOVEL',
    genres: ['literary', 'romance'],
    source: {
      author: 'Jane Austen',
      firstPublished: 1813,
      url: 'https://www.gutenberg.org/ebooks/1342',
    },
    chapter: {
      title: 'Chapter one',
      sections: [
        'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.',
        'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.',
        '“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?” Mr. Bennet replied that he had not. “But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.” Mr. Bennet made no answer.',
      ],
    },
    requests: [
      {
        kind: 'REWRITE',
        title: 'The second paragraph is doing nothing',
        section: 1,
        ask: 'The first line is the whole book and the second paragraph just explains it, which is the worst thing a second paragraph can do. I want it to widen the joke rather than restate it — to put the neighbourhood in the room. Same length, same register, no new characters.',
        preContext:
          'The novel opens on a sentence everyone knows, and then has to survive it. The village is Longbourn, the family is the Bennets, and there are five unmarried daughters in a house entailed away from them. The mother wants them married and says so constantly. The father finds his wife tiresome and expresses this by agreeing with her in a way that means nothing. Netherfield Park has been let to a Mr. Bingley, who is single and rich, and the entire neighbourhood has already decided what that means. Nothing has happened yet and nothing needs to; the comedy is that everyone has drawn their conclusions from a fact and a vacancy.',
        accepted: {
          by: 'example-helper-1',
          note: 'Kept the aphorism and let the village be the one drawing the conclusion, so the joke lands on them rather than on the reader.',
          prose:
            'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families that he is considered the rightful property of some one or other of their daughters; and the gentleman himself, arriving with no opinion on the matter, finds one waiting for him at the gate, together with a list of the young ladies to whom he is already, in the general understanding of the parish, very nearly engaged.',
        },
      },
      {
        kind: 'CONTINUE',
        title: 'What does Mr Bennet say next?',
        section: 2,
        ask: 'He has just made no answer, which is his whole character. I need the next exchange: she pushes, he gives her nothing, and she takes his nothing as encouragement. It has to be funny without either of them making a joke, and it has to be over in four or five lines.',
        preContext:
          'Mr. and Mrs. Bennet have been married more than twenty years and have five unmarried daughters. She is a woman of mean understanding, little information, and uncertain temper; when she is discontented she fancies herself nervous. He is so odd a mixture of quick parts, sarcastic humour, reserve and caprice that the experience of three-and-twenty years has been insufficient to make his wife understand his character. Her business in life is to get her daughters married; its solace is visiting and news. He teases her because it is the only entertainment the house affords, and she never once notices that she is being teased. The news of Netherfield being let is, to her, the beginning of everything.',
      },
      {
        kind: 'UNBLOCK',
        title: 'Whose book is this, in chapter one?',
        section: 2,
        ask: 'The dialogue is between the parents and the novel belongs to their daughter, who is not in the room. I can introduce her next chapter or I can get her into this one somehow. Does delaying her cost me anything I will not be able to recover?',
      },
    ],
  },
  {
    publicId: 'seeddracu01',
    title: 'Dracula',
    logline:
      'A solicitor keeps a diary of a journey east, and the coach will not stop where he asked.',
    type: 'NOVEL',
    genres: ['horror', 'literary'],
    source: {
      author: 'Bram Stoker',
      firstPublished: 1897,
      url: 'https://www.gutenberg.org/ebooks/345',
    },
    chapter: {
      title: "Jonathan Harker's journal",
      sections: [
        'Left Munich at 8:35 P. M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late. Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets.',
        'I feared to go very far from the station, as we had arrived late and would start as near the correct time as possible. The impression I had was that we were leaving the West and entering the East; the most western of splendid bridges over the Danube, which is here of noble width and depth, took us among the traditions of Turkish rule.',
      ],
    },
    requests: [
      {
        kind: 'REWRITE',
        title: 'Make the timetable sound like a man reassuring himself',
        section: 0,
        ask: 'Harker records train times because he is a solicitor and it is what he does, but it should also read as somebody holding on to something orderly. At the moment it is only a timetable. Same facts, same dry voice, but let the precision start to look like a grip.',
        preContext:
          'Jonathan Harker is a newly qualified English solicitor sent east to complete a property purchase for a client he has never met. He is conscientious, unimaginative in the way he would describe as practical, and engaged to be married. He keeps this journal in shorthand, partly as a record for his firm and partly to have something to show his fiancée. He has never been out of England before. The journey has been long and the trains have been late, and he has noticed that the further east he goes the less the timetables mean, which he has decided to find interesting rather than troubling.',
        accepted: {
          by: 'example-helper-2',
          note: 'Left every number where it was and only changed what he does with them.',
          prose:
            'Left Munich at 8:35 P. M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late. I have written the correct time beside the actual one, as I have done each day, though I could not say now for whose benefit. Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets, and I set down what I saw while I can still be certain of the order in which I saw it.',
        },
      },
      {
        kind: 'CONTINUE',
        title: 'The coach is late and he has to decide whether to mind',
        section: 1,
        ask: 'Next beat: he arrives at the inn and the arrangements have been made for him by somebody he has never met, in a way that is perfectly correct and very slightly wrong. Keep it in the journal voice. Nothing supernatural, nothing ominous — just excessive care.',
        preContext:
          'Harker is travelling east by train and coach to complete a property purchase for a client he knows only by letter. Everything has been arranged in advance and paid for: the rooms, the meals, the seats. He finds this efficient. The people he meets become quieter the further east he goes and more insistent about small kindnesses he has not asked for. He has a letter in his bag instructing the innkeeper on exactly how he is to be looked after. He is flattered by the attention and has begun, without admitting it, to notice that nobody will discuss his destination.',
      },
      {
        kind: 'UNBLOCK',
        title: 'Everything is a document and nobody is lying — is that a waste?',
        section: 0,
        ask: 'Journals, letters, a ship’s log, newspaper clippings. The form invites an unreliable narrator and I have not used one; every account is honest and merely incomplete. Am I leaving the best thing about the structure on the table, or would a liar collapse it?',
      },
    ],
  },
  {
    publicId: 'seedgatsb01',
    title: 'The Great Gatsby',
    logline:
      'A young man from the Middle West rents a house next to a party he has not been invited to.',
    type: 'NOVEL',
    genres: ['literary', 'historical'],
    source: {
      author: 'F. Scott Fitzgerald',
      firstPublished: 1925,
      url: 'https://www.gutenberg.org/ebooks/64317',
    },
    chapter: {
      title: 'Chapter one',
      sections: [
        'In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since. “Whenever you feel like criticizing anyone,” he told me, “just remember that all the people in this world haven’t had the advantages that you’ve had.”',
        'He didn’t say any more, but we’ve always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that. In consequence, I’m inclined to reserve all judgements, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores.',
      ],
    },
    requests: [
      {
        kind: 'UNBLOCK',
        title: 'Nick claims he reserves judgement and then judges everyone',
        section: 1,
        ask: 'This is the contradiction the whole narration runs on, and I cannot decide how aware of it Nick is meant to be. If he knows, he is sly and the book is colder. If he does not, he is a snob and I am not sure the reader stays with him. Is there a third reading I am missing?',
      },
      {
        kind: 'REWRITE',
        title: 'The father’s advice should sound like a man who has said it before',
        section: 0,
        ask: 'It reads like an epigraph. I want it to sound like something a particular father said to a particular son, probably more than once, probably not looking at him. Same sentiment, same words if possible — the change is in how it is introduced.',
        preContext:
          'Nick Carraway is telling the reader about himself in the first paragraph of a book he is writing after the events, from the Middle West, having gone east and come back. His family is comfortable, established, and quietly pleased about it. The advice about not criticising people is the moral position he claims and does not hold; the whole narration is him judging everyone while insisting he does not. The father is a presence in exactly one line and never appears again.',
        accepted: {
          by: 'example-helper-1',
          note: 'Put it in the middle of doing something else, which is how advice is actually given.',
          prose:
            'In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since. “Whenever you feel like criticizing anyone,” he told me — we were walking out to the car, and he said it the way he said most things, as though I had already disagreed — “just remember that all the people in this world haven’t had the advantages that you’ve had.”',
        },
      },
      {
        kind: 'UNBLOCK',
        title: 'How much money should I actually name?',
        section: 0,
        ask: 'The book is about wealth and I keep flinching from figures — the shirts, the car, the house all described without a price. Naming one number would be vulgar in a way I think the narrator would avoid. But avoiding all of them might be its own kind of flinch.',
      },
    ],
  },
  {
    publicId: 'seedmoby001',
    title: 'Moby-Dick',
    logline:
      'A man with no money and nothing on shore to interest him goes to sea, as he does whenever it gets bad.',
    type: 'NOVEL',
    genres: ['literary', 'adventure'],
    source: {
      author: 'Herman Melville',
      firstPublished: 1851,
      url: 'https://www.gutenberg.org/ebooks/2701',
    },
    chapter: {
      title: 'Loomings',
      sections: [
        'Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.',
        'It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet;',
      ],
    },
    requests: [
      {
        kind: 'CONTINUE',
        title: 'The list needs a fourth item and I have written six bad ones',
        section: 1,
        ask: 'Grim about the mouth, damp drizzly November, coffin warehouses, funerals — the rhythm wants one more before the turn, and every one I write is either too funny or too heavy. It should be the smallest of the four and the most ordinary. Twenty words at most.',
        preContext:
          'The narrator is introducing himself by way of a habit rather than a history: when his mood turns, he goes to sea. He is not a romantic about it and says so; he ships as a simple sailor, before the mast, and is paid rather than paying. The voice is expansive, self-mocking, and entirely comfortable with the reader — he will digress for pages and knows it. This passage is the first list in a book largely made of lists, and it establishes that the narrator finds his own despair faintly ridiculous, which is what makes it bearable to read about.',
      },
      {
        kind: 'UNBLOCK',
        title: 'Can a narrator this funny be trusted with the ending?',
        section: 0,
        ask: 'Ishmael is charming and digressive for a hundred pages and then the book turns into something else entirely. I am worried the voice I am enjoying now is the wrong instrument later. Should I be planting something, or does the charm earn the turn by contrast?',
      },
    ],
  },
  {
    publicId: 'seedjekyl01',
    title: 'The Strange Case of Dr Jekyll and Mr Hyde',
    logline:
      'A lawyer who never smiles is nevertheless the last good influence in several ruined lives.',
    type: 'NOVELLA',
    genres: ['horror', 'mystery', 'literary'],
    source: {
      author: 'Robert Louis Stevenson',
      firstPublished: 1886,
      url: 'https://www.gutenberg.org/ebooks/43',
    },
    chapter: {
      title: 'Story of the door',
      sections: [
        'Mr. Utterson the lawyer was a man of a rugged countenance that was never lighted by a smile; cold, scanty and embarrassed in discourse; backward in sentiment; lean, long, dusty, dreary and yet somehow lovable.',
        'At friendly meetings, and when the wine was to his taste, something eminently human beaconed from his eye; something indeed which never found its way into his talk, but which spoke not only in these silent symbols of the after-dinner face, but more often and loudly in the acts of his life.',
      ],
    },
    requests: [
      {
        kind: 'REWRITE',
        title: '“Somehow lovable” is doing all the work and I have not earned it',
        section: 0,
        ask: 'The list of adjectives is good and then the last one asks the reader to take my word for it. I would like the sentence to demonstrate the lovable part instead of asserting it, in the same breath and without adding a scene.',
        preContext:
          'Utterson is the novella’s way in: everything strange is seen through a man with no imagination and an unshakable sense of duty. He is austere with himself — drinks gin when alone to mortify a taste for vintages, has not crossed the door of a theatre in twenty years — and is famously tolerant of everybody else. His friends are the people he has known longest rather than the people he most enjoys. The book needs the reader to trust him completely within a paragraph, because every horror in it arrives as something he has been told and half believes.',
        accepted: {
          by: 'example-helper-1',
          note: 'Made the last clause a fact about other people rather than a claim about him.',
          prose:
            'Mr. Utterson the lawyer was a man of a rugged countenance that was never lighted by a smile; cold, scanty and embarrassed in discourse; backward in sentiment; lean, long, dusty and dreary; and yet the last person to give up on any man in trouble, so that the ruined and the disreputable of his acquaintance found, at the end of every other door, that his was still open.',
        },
      },
      {
        kind: 'CONTINUE',
        title: 'Introduce Enfield without stopping the paragraph',
        section: 1,
        ask: 'Utterson has a cousin he walks with on Sundays and they famously say nothing to each other the whole way. I need that established in three or four sentences, in the same long-breathed register, and it has to sound like a friendship rather than an affliction.',
        preContext:
          'Mr. Utterson the lawyer is austere, tolerant, and loyal past reason. His one indulgence is a Sunday walk with Richard Enfield, a distant kinsman and well-known man about town who is his opposite in every respect. The walks are famous among their acquaintance for being entirely silent and for being the fixed point of both men’s week — they will refuse other engagements to keep them. On one of these walks Enfield will point out a door and tell a story about a man who trampled a child and paid to keep it quiet, and the novella will begin.',
      },
      {
        kind: 'UNBLOCK',
        title: 'The reader already knows the twist. What do I do about that?',
        section: 0,
        ask: 'Everybody alive knows Jekyll and Hyde are the same man. The novella is built as a mystery and its solution is a household phrase. Do I write it as if the reader does not know, or lean into the dread of watching Utterson fail to see it?',
      },
    ],
  },
  {
    publicId: 'seedwuthe01',
    title: 'Wuthering Heights',
    logline: 'A tenant calls on his landlord and is not made welcome, which he chooses to admire.',
    type: 'NOVEL',
    genres: ['literary', 'romance', 'historical'],
    source: {
      author: 'Emily Brontë',
      firstPublished: 1847,
      url: 'https://www.gutenberg.org/ebooks/768',
    },
    chapter: {
      title: 'Chapter one',
      sections: [
        'I have just returned from a visit to my landlord—the solitary neighbour that I shall be troubled with. This is certainly a beautiful country! In all England, I do not believe that I could have fixed on a situation so completely removed from the stir of society.',
        'A perfect misanthropist’s Heaven—and Mr. Heathcliff and I are such a suitable pair to divide the desolation between us. A capital fellow! He little imagined how my heart warmed towards him when I beheld his black eyes withdraw so suspiciously under their brows, as I rode up',
      ],
    },
    requests: [
      {
        kind: 'UNBLOCK',
        title: 'Lockwood is wrong about everything and I need the reader to see it immediately',
        section: 1,
        ask: 'He reads hostility as kinship. I want that visible on a first read without a wink to camera — no irony the narrator could not plausibly miss. Is there a way to do it with what Heathcliff does rather than with how Lockwood describes it?',
      },
      {
        kind: 'REWRITE',
        title: 'Lockwood calls it a misanthropist’s heaven and means it as a compliment',
        section: 1,
        ask: 'I want his enthusiasm to be more obviously misplaced without him becoming a fool. He should sound like a man who has read about solitude. Keep “capital fellow”.',
        preContext:
          'Mr. Lockwood is a wealthy young man from the south who has taken Thrushcross Grange for the season, having recently fled a seaside romance by being cold to a woman he liked. He thinks of himself as a natural solitary and has never spent a winter alone. He has just ridden four miles across the moor to introduce himself to his landlord, Heathcliff, who did not want him to come, did not invite him in, and set the dogs at a distance. Lockwood has interpreted all of this as a promising kinship between two men who value privacy.',
        accepted: {
          by: 'example-helper-1',
          note: 'Gave him one detail he has misread completely, and let him move straight past it.',
          prose:
            'A perfect misanthropist’s Heaven—and Mr. Heathcliff and I are such a suitable pair to divide the desolation between us. A capital fellow! He little imagined how my heart warmed towards him when I beheld his black eyes withdraw so suspiciously under their brows, as I rode up, and his fingers shelter themselves, with a jealous resolution, still further in his waistcoat, as I announced my name. I have not been so well received anywhere this twelvemonth.',
        },
      },
    ],
  },
  {
    publicId: 'seedmetam01',
    title: 'The Metamorphosis',
    logline: 'A travelling salesman wakes as something else and worries, first, about the train.',
    type: 'NOVELLA',
    genres: ['literary', 'horror'],
    source: {
      author: 'Franz Kafka',
      firstPublished: 1915,
      url: 'https://www.gutenberg.org/ebooks/5200',
    },
    chapter: {
      title: 'One',
      sections: [
        'One morning, when Gregor Samsa woke from troubled dreams, he found himself transformed in his bed into a horrible vermin. He lay on his armour-like back, and if he lifted his head a little he could see his brown belly, slightly domed and divided by arches into stiff sections.',
        'The bedding was hardly able to cover it and seemed ready to slide off any moment. His many legs, pitifully thin compared with the size of the rest of him, waved about helplessly as he looked. “What’s happened to me?” he thought. It wasn’t a dream.',
      ],
    },
    requests: [
      {
        kind: 'CONTINUE',
        title: 'What does he think about second?',
        section: 1,
        ask: 'The joke and the horror are both that he does not scream. After “it wasn’t a dream” he needs to think about something entirely mundane, and the more specific and boring it is the worse the whole thing gets. I have tried the weather and it is not right.',
        preContext:
          'Gregor Samsa is a travelling salesman in cloth, the sole earner for a family whose debts he is working off. He hates the job, the early trains, the irregular meals and the acquaintances who never become friends, and he has calculated that in five or six years he can pay off what his parents owe and quit. He is lying on his back, unable to turn over, and his first coherent thoughts are about work. The alarm clock is on the chest of drawers behind him. His mother, father and sister are all in the flat, none of them yet aware, and the office will send someone when he misses the five o’clock train.',
      },
      {
        kind: 'UNBLOCK',
        title: 'How much of the room should the reader be able to see?',
        section: 0,
        ask: 'I have described the ceiling, the bedding and the legs. If I describe the whole room the horror becomes a scene; if I keep it this close the reader cannot place him. What is the rule for how far the camera can pull back before the wrongness stops working?',
      },
    ],
  },
  {
    publicId: 'seedwalden1',
    title: 'Walden',
    logline:
      'A man builds a house by a pond and keeps accounts of what it cost him, in money and otherwise.',
    type: 'NONFICTION',
    genres: ['nonfiction', 'literary'],
    source: {
      author: 'Henry David Thoreau',
      firstPublished: 1854,
      url: 'https://www.gutenberg.org/ebooks/205',
    },
    chapter: {
      title: 'Economy',
      sections: [
        'When I wrote the following pages, or rather the bulk of them, I lived alone, in the woods, a mile from any neighbor, in a house which I had built myself, on the shore of Walden Pond, in Concord, Massachusetts, and earned my living by the labor of my hands only. I lived there two years and two months. At present I am a sojourner in civilized life again.',
      ],
    },
    requests: [
      {
        kind: 'UNBLOCK',
        title: 'How honest should the last line be?',
        section: 0,
        ask: '“At present I am a sojourner in civilized life again” is doing a lot of quiet work — it admits he left. I cannot decide whether to let that sit or to press on it. Pressing risks defensiveness; leaving it risks the reader deciding for me.',
      },
      {
        kind: 'CONTINUE',
        title: 'The accounts should come next, and they should be funny',
        section: 0,
        ask: 'He is about to itemise what the house cost, to the half-cent. That list is either insufferable or the best joke in the book depending on how it is introduced. Give me the sentence before the list.',
        preContext:
          'Thoreau is writing for the people of Concord, who have asked him — sometimes politely, often not — what he thought he was doing living in a hut by a pond for two years. He has decided to answer them literally: he will tell them what it cost. The list that follows includes boards at eight dollars and three-and-a-half cents, refuse shingles, two second-hand windows, and a thousand old brick. He is entirely serious and entirely aware that the seriousness is the joke, and he is arguing that most of his neighbours could not produce the same list for their own houses.',
      },
    ],
  },
  {
    publicId: 'seedtimem01',
    title: 'The Time Machine',
    logline:
      'A man explains, to guests who are not listening, that time is a direction like any other.',
    type: 'NOVELLA',
    genres: ['science-fiction', 'literary'],
    source: {
      author: 'H. G. Wells',
      firstPublished: 1895,
      url: 'https://www.gutenberg.org/ebooks/35',
    },
    chapter: {
      title: 'One',
      sections: [
        'The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us. His grey eyes shone and twinkled, and his usually pale face was flushed and animated. The fire burnt brightly, and the soft radiance of the incandescent lights in the lilies of silver caught the bubbles that flashed and passed in our glasses.',
        '“You must follow me carefully. I shall have to controvert one or two ideas that are almost universally accepted. The geometry, for instance, they taught you at school is founded on a misconception.” “Is not that rather a large thing to expect us to begin upon?” said Filby, an argumentative person with red hair.',
      ],
    },
    requests: [
      {
        kind: 'REWRITE',
        title: 'The guests are furniture and I need one of them to be a person',
        section: 1,
        ask: 'Filby has red hair and is argumentative, which is a label rather than a character. Give him one line that makes him a specific man in a specific chair, without slowing the lecture down. Nothing about his job.',
        preContext:
          'A Thursday-evening gathering in the Time Traveller’s house in Richmond: after dinner, in the smoking room, with the fire lit and the lamps on. The company is a Psychologist, a Medical Man, a Provincial Mayor, a Very Young Man, Filby, and the narrator, none of whom are named beyond that. The Time Traveller is about to argue that time is a fourth dimension and that one might move along it, and then to produce a small model that vanishes. The guests are sceptical in the comfortable way of men who have eaten well and expect to be entertained by their host rather than persuaded by him.',
        accepted: {
          by: 'example-helper-2',
          note: 'One gesture, no biography. He is arguing because he is comfortable, which is why nobody believes anything later.',
          prose:
            '“Is not that rather a large thing to expect us to begin upon?” said Filby, who had settled himself so far into the armchair that argument seemed to cost him nothing, and who had the red-haired man’s habit of disagreeing first and thinking about it after.',
        },
      },
      {
        kind: 'UNBLOCK',
        title: 'Should the model vanish in chapter one or chapter two?',
        section: 1,
        ask: 'The little machine disappearing is the proof, and once it is gone the argument is over. Doing it now is thrilling and costs me the lecture; doing it later is patient and risks the reader leaving. Which do I lose less by?',
      },
      {
        kind: 'UNBLOCK',
        title: 'None of the guests have names and one of them is the narrator',
        section: 0,
        ask: 'The Psychologist, the Medical Man, the Very Young Man. It gives the evening the feel of a fable, and it means my narrator is a job title too. Does the anonymity buy enough to be worth a narrator the reader cannot picture?',
      },
    ],
  },
  {
    publicId: 'seedsherl01',
    title: 'A Scandal in Bohemia',
    logline: 'To Sherlock Holmes she is always the woman, and he has not said her name since.',
    type: 'SHORT_STORY',
    genres: ['mystery', 'literary'],
    source: {
      author: 'Arthur Conan Doyle',
      firstPublished: 1891,
      url: 'https://www.gutenberg.org/ebooks/1661',
    },
    chapter: {
      title: 'One',
      sections: [
        'To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler.',
        'All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind. He was, I take it, the most perfect reasoning and observing machine that the world has seen, but as a lover he would have placed himself in a false position.',
      ],
    },
    requests: [
      {
        kind: 'UNBLOCK',
        title: 'Watson protests too much and I cannot tell if that is the point',
        section: 1,
        ask: 'Two paragraphs insisting Holmes felt nothing. Either Watson is being careful for his friend or he has not understood what he is describing. I do not know which I am writing, and the answer changes the last page of the story.',
      },
      {
        kind: 'REWRITE',
        title: 'Watson’s first sentence about her should ache slightly',
        section: 0,
        ask: '“To Sherlock Holmes she is always the woman” is the whole story in nine words, and my version of it is flat. I want the same nine words to sit inside a sentence that tells you Watson has noticed something Holmes has not admitted.',
        preContext:
          'Dr. Watson is writing up an old case some time after the fact. He has married and moved out of Baker Street; he sees Holmes less and misses him more than he would say. The woman is Irene Adler, who beat Holmes — the only person to do so — and who is now dead. Holmes keeps a photograph of her and has never explained why. Watson’s narration throughout the stories protects Holmes from the reader’s conclusions, and this opening is the one place he comes closest to drawing one himself before stepping back.',
        accepted: {
          by: 'example-helper-2',
          note: 'Kept the nine words and let the second clause be the ache.',
          prose:
            'To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name, and never heard him give a reason for not giving her one. In his eyes she eclipses and predominates the whole of her sex.',
        },
      },
      {
        kind: 'UNBLOCK',
        title: 'Holmes has to lose and stay Holmes',
        section: 0,
        ask: 'Irene Adler beats him, which is the point. But if she beats him by being cleverer, he stops being the cleverest man in the room for good and the other stories suffer. Is there a way for him to lose that is about character rather than intellect?',
      },
    ],
  },
  {
    publicId: 'seedjaneey01',
    title: 'Jane Eyre',
    logline:
      'There was no possibility of taking a walk that day, which suited everyone but the child in the window seat.',
    type: 'NOVEL',
    genres: ['literary', 'romance', 'historical'],
    source: {
      author: 'Charlotte Brontë',
      firstPublished: 1847,
      url: 'https://www.gutenberg.org/ebooks/1260',
    },
    chapter: {
      title: 'Chapter one',
      sections: [
        'There was no possibility of taking a walk that day. We had been wandering, indeed, in the leafless shrubbery an hour in the morning; but since dinner (Mrs. Reed, when there was no company, dined early) the cold winter wind had brought with it clouds so sombre, and a rain so penetrating, that further outdoor exercise was now out of the question.',
        'I was glad of it: I never liked long walks, especially on chilly afternoons: dreadful to me was the coming home in the raw twilight, with nipped fingers and toes, and a heart saddened by the chidings of Bessie, the nurse, and humbled by the consciousness of my physical inferiority to Eliza, John, and Georgiana Reed.',
      ],
    },
    requests: [
      {
        kind: 'CONTINUE',
        title: 'She is glad to be indoors — now give her the window seat',
        section: 1,
        ask: 'The next beat is her finding the small corner of the house that is hers for an hour. It needs to be physical and exact — where she sits, what she can see, what hides her — and it must not be cosy. She is not comfortable, she is concealed.',
        preContext:
          'Jane is ten, orphaned, and living at Gateshead Hall with her aunt Mrs. Reed and three cousins who dislike her, in a house where she is fed and clothed and told daily that she should be grateful. She is small for her age, plain, and clever in a way the household finds impertinent. Her cousin John, fourteen and large, hurts her when he can and is never contradicted. The nurse, Bessie, is kind when nobody is watching. Jane has learned that the safest place in any room is the one where she cannot be seen from the door, and that a book is both an escape and an excuse.',
      },
      {
        kind: 'UNBLOCK',
        title: 'First person from a child, written by the adult she became',
        section: 1,
        ask: 'The voice knows words the ten-year-old did not have. I cannot decide whether to let the grown woman’s vocabulary sit openly on the child’s experience or to keep the diction younger. One is honest about the telling, the other is immediate.',
      },
    ],
  },
  {
    publicId: 'seedhuckle01',
    title: 'Adventures of Huckleberry Finn',
    logline: 'You do not know about me without you have read a book by the name of another book.',
    type: 'NOVEL',
    genres: ['literary', 'adventure', 'historical'],
    source: {
      author: 'Mark Twain',
      firstPublished: 1884,
      url: 'https://www.gutenberg.org/ebooks/76',
    },
    chapter: {
      title: 'Chapter one',
      sections: [
        'You don’t know about me without you have read a book by the name of The Adventures of Tom Sawyer; but that ain’t no matter. That book was made by Mr. Mark Twain, and he told the truth, mainly. There was things which he stretched, but mainly he told the truth.',
        'That is nothing. I never seen anybody but lied one time or another, without it was Aunt Polly, or the widow, or maybe Mary. Aunt Polly—Tom’s Aunt Polly, she is—and Mary, and the Widow Douglas is all told about in that book, which is mostly a true book, with some stretchers, as I said before.',
      ],
    },
    requests: [
      {
        kind: 'UNBLOCK',
        title: 'The voice is right and I cannot get a plot started in it',
        section: 1,
        ask: 'Huck can talk forever and every time I try to make something happen the sentences go flat and start sounding like me. How do you begin an event in a voice this digressive without the voice noticing it has been put to work?',
      },
      {
        kind: 'CONTINUE',
        title: 'Get him to the widow’s house and the sivilizing',
        section: 1,
        ask: 'Next: the widow took him in and meant to civilise him, and he could not stand it. In his voice, with his spelling, and without me making fun of him. Four or five sentences and it should be affectionate about her.',
        preContext:
          'Huck is thirteen or fourteen, the son of the town drunk, and has recently come into six thousand dollars from a previous adventure. The Widow Douglas has taken him in to raise him properly: regular meals at regular times, clean clothes, prayers before eating, school. She is genuinely kind and he genuinely likes her, which is what makes it unbearable — he cannot even resent her honestly. Her sister Miss Watson is stricter and easier to dislike. Huck has already run away once and been fetched back, and is narrating all of this without the faintest idea that he is describing being loved.',
      },
    ],
  },
  {
    publicId: 'seedodyss01',
    title: 'The Odyssey',
    logline: 'Tell me, Muse, of the man of many turns, who wandered far after he sacked Troy.',
    type: 'POETRY',
    genres: ['poetry', 'literary', 'adventure'],
    source: {
      author: 'Homer, translated by Samuel Butler',
      firstPublished: 1900,
      url: 'https://www.gutenberg.org/ebooks/1727',
    },
    chapter: {
      title: 'Book one',
      sections: [
        'Tell me, O Muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy. Many cities did he visit, and many were the nations with whose manners and customs he was acquainted; moreover he suffered much by sea while trying to save his own life and bring his men safely home',
      ],
    },
    requests: [
      {
        kind: 'REWRITE',
        title: 'I want the invocation to sound spoken, not recited',
        section: 0,
        ask: 'This reads like a preface. I want it to sound like somebody beginning out loud to a room that has gone quiet — same content, same dignity, but the rhythm of a person rather than a page. Prose is fine; I am not attempting verse.',
        preContext:
          'The opening of a poem performed rather than read: an audience, a hall, a singer who has done this before and knows exactly how long the silence before the first line should be. The subject is a man famous for cleverness and for taking ten years to get home from a war that itself took ten years. Everyone listening already knows the story, which is the point — they are here for the telling, not the news. The Muse is being asked, formally and sincerely, to do the actual work; the singer is claiming to be a conduit, and the claim is part of the performance.',
        accepted: {
          by: 'example-helper-1',
          note: 'Broke the long sentence where a speaker would take breath, and let "many" land three times.',
          prose:
            'Sing to me, Muse, of the man of many turns — the one who wandered far, after he had brought down the holy towers of Troy. Many were the cities he saw. Many were the men whose minds he came to know. And many were the sorrows he suffered on the sea, in his own heart, struggling for his life and for the homecoming of his companions.',
        },
      },
      {
        kind: 'UNBLOCK',
        title: 'Do I name the man in the first line or not?',
        section: 0,
        ask: 'The Greek withholds Odysseus for a long while and calls him “the man” — which is either a magnificent delay or an obstacle for a reader who does not know the poem. Everyone in the original audience knew. Nobody in mine does.',
      },
    ],
  },
  {
    publicId: 'seedwaroft01',
    title: 'The War of the Worlds',
    logline:
      'No one would have believed, in the last years of the nineteenth century, that we were being watched.',
    type: 'NOVEL',
    genres: ['science-fiction', 'horror'],
    source: {
      author: 'H. G. Wells',
      firstPublished: 1898,
      url: 'https://www.gutenberg.org/ebooks/36',
    },
    chapter: {
      title: 'The eve of the war',
      sections: [
        'No one would have believed in the last years of the nineteenth century that this world was being watched keenly and closely by intelligences greater than man’s and yet as mortal as his own; that as men busied themselves about their various concerns they were scrutinised and studied, perhaps almost as narrowly as a man with a microscope might scrutinise the transient creatures that swarm and multiply in a drop of water.',
      ],
    },
    requests: [
      {
        kind: 'CONTINUE',
        title: 'After the microscope, I need the ordinary world',
        section: 0,
        ask: 'The opening is enormous and it has to come straight down to people doing small things — commuting, complaining, buying something. Two or three sentences, no names yet, and it must not be nostalgic. They are not innocent, they are just busy.',
        preContext:
          'The narrator is writing after the events, in a measured, scientific register, and he knows exactly how the story ends. The first paragraph has just compared humanity to organisms in a drop of water under a lens. What follows must place the reader in southern England in the late 1890s — Woking, Surrey, the commuter belt — among people entirely absorbed in their own affairs. The contrast is the whole engine of the chapter: vast patient intelligence above, and below it a man worrying about a train. Mars is already dying and its inhabitants have already decided what to do about it.',
      },
      {
        kind: 'REWRITE',
        title: 'The microscope image is doing two jobs and only one well',
        section: 0,
        ask: 'It establishes the scale and it establishes the contempt, and the contempt is landing harder than the scale. I want a reader to feel small before they feel insulted. Same image, same length.',
        preContext:
          'The narrator is a writer on philosophical subjects living in Woking, Surrey, recounting the Martian invasion some years after it ended. He is precise, unemotional, and permanently changed. This is the novel’s first paragraph, and it is doing the work of the whole book in one sentence: humanity observed by something older and more intelligent, entirely without malice, in the way a man observes bacteria before deciding what to do about them. The comparison must not be cruel, because the Martians are not cruel — they are simply not interested.',
        accepted: {
          by: 'example-helper-1',
          note: 'Moved the microscope to the end, so the scale arrives before the judgement does.',
          prose:
            'No one would have believed in the last years of the nineteenth century that this world was being watched keenly and closely by intelligences greater than man’s and yet as mortal as his own; that as men busied themselves about their various concerns they were scrutinised and studied, perhaps almost as narrowly as a man with a microscope might scrutinise the transient creatures that swarm and multiply in a drop of water — and with as little sense of doing anything remarkable.',
        },
      },
    ],
  },
  {
    publicId: 'seedmiddle1',
    title: 'Middlemarch',
    logline:
      'Miss Brooke had that kind of beauty which seems to be thrown into relief by poor dress.',
    type: 'NOVEL',
    genres: ['literary', 'historical'],
    source: {
      author: 'George Eliot',
      firstPublished: 1872,
      url: 'https://www.gutenberg.org/ebooks/145',
    },
    chapter: {
      title: 'Chapter one',
      sections: [
        'Miss Brooke had that kind of beauty which seems to be thrown into relief by poor dress.',
        'Her hand and wrist were so finely formed that she could wear sleeves not less bare of style than those in which the Blessed Virgin appeared to Italian painters; and her profile as well as her stature and bearing seemed to gain the more dignity from her plain garments, which by the side of provincial fashion gave her the impressiveness of a fine quotation from the Bible,—or from one of our elder poets,—in a paragraph of to-day’s newspaper.',
      ],
    },
    requests: [
      {
        kind: 'UNBLOCK',
        title: 'Is the simile too clever to open a novel with?',
        section: 1,
        ask: 'The fine quotation in a newspaper paragraph is the best sentence I have and I am not sure the reader has earned it yet — it asks them to admire the narrator before they care about the girl. Do I cut it, move it, or trust it?',
      },
      {
        kind: 'CONTINUE',
        title: 'Now the sister, and the two of them have to differ in one sentence',
        section: 1,
        ask: 'Celia is next and she is the ordinary one, which is much harder to write than the remarkable one. Introduce her so that the reader likes her immediately and understands, without being told, why she will never be the subject of this book.',
        preContext:
          'Dorothea Brooke is nineteen, orphaned, wealthy, and painfully in earnest: she gives up riding because she enjoys it, plans cottages for her uncle’s tenants, and wants a life of consequence in a county that has no use for one. Her younger sister Celia is pretty, sensible and kind, and finds Dorothea’s intensity tiring in the affectionate way of a sister who has lived with it always. They share a house with their uncle and are both, by the standards of Middlemarch, extremely eligible. The novel will be cruel to Dorothea’s ambitions and gentle with Celia’s smaller ones.',
      },
    ],
  },
  {
    publicId: 'seedhearto1',
    title: 'Heart of Darkness',
    logline: 'The Nellie swung to her anchor without a flutter of the sails, and was at rest.',
    type: 'NOVELLA',
    genres: ['literary', 'adventure'],
    source: {
      author: 'Joseph Conrad',
      firstPublished: 1899,
      url: 'https://www.gutenberg.org/ebooks/219',
    },
    chapter: {
      title: 'One',
      sections: [
        'The Nellie, a cruising yawl, swung to her anchor without a flutter of the sails, and was at rest. The flood had made, the wind was nearly calm, and being bound down the river, the only thing for it was to come to and wait for the turn of the tide.',
        'The sea-reach of the Thames stretched before us like the beginning of an interminable waterway. In the offing the sea and the sky were welded together without a joint, and in the luminous space the tanned sails of the barges drifting up with the tide seemed to stand still in red clusters of canvas sharply peaked, with gleams of varnished sprits.',
      ],
    },
    requests: [
      {
        kind: 'REWRITE',
        title: 'The river should already feel like the other river',
        section: 1,
        ask: 'This is the Thames and the whole book is about a different river. I want the description to carry that without any foreshadowing a reader could point at — no shadows, no omens. Just the Thames, described by someone who has seen the other one.',
        preContext:
          'Five men wait on a yawl at anchor in the Thames estuary for the tide to turn: a Director of Companies, a Lawyer, an Accountant, the unnamed narrator, and Marlow, who sits cross-legged and resembles an idol. They are old sea-companions, comfortable enough to be silent together. The light is going. In a few pages Marlow will say that this too has been one of the dark places of the earth and begin the story of a river in Africa, a company, and a man named Kurtz. Everything before that has to be London, and only London, described by men for whom the estuary is the way home.',
        accepted: {
          by: 'example-helper-2',
          note: 'Kept every image and changed only the verbs, so the stillness reads as waiting rather than peace.',
          prose:
            'The sea-reach of the Thames stretched before us like the beginning of an interminable waterway. In the offing the sea and the sky were welded together without a joint, and in the luminous space the tanned sails of the barges drifting up with the tide hung motionless, red clusters of canvas sharply peaked, with gleams of varnished sprits — going somewhere, all of them, and none of them appearing to move at all.',
        },
      },
      {
        kind: 'UNBLOCK',
        title: 'Marlow has not spoken yet and I am five paragraphs in',
        section: 1,
        ask: 'The frame is beautiful and it is stalling. I could bring him in now or hold him until the light has fully gone, which is better but longer. How long can a first chapter reasonably withhold the man who is going to tell the story?',
      },
    ],
  },
  {
    publicId: 'seedmrsdal1',
    title: 'Mrs Dalloway',
    logline:
      'Mrs Dalloway said she would buy the flowers herself, and the morning was fresh as if issued to children.',
    type: 'NOVEL',
    genres: ['literary'],
    source: {
      author: 'Virginia Woolf',
      firstPublished: 1925,
      url: 'https://www.gutenberg.org/ebooks/71865',
    },
    chapter: {
      title: 'One',
      sections: [
        'Mrs. Dalloway said she would buy the flowers herself. For Lucy had her work cut out for her. The doors would be taken off their hinges; Rumpelmayer’s men were coming. And then, thought Clarissa Dalloway, what a morning—fresh as if issued to children on a beach.',
      ],
    },
    requests: [
      {
        kind: 'CONTINUE',
        title: 'The morning opens onto a memory — which one?',
        section: 0,
        ask: 'The next movement drops her thirty years back without announcing it. I need the hinge: the thing about this particular morning that puts her at eighteen. It should be sensory and slightly absurd, and it must not be the flowers.',
        preContext:
          'Clarissa Dalloway is in her fifties, in Westminster, on a June morning in 1923. She is giving a party that evening and has decided to buy the flowers herself, partly because Lucy the maid is busy and partly because she wants to be out. Her interior voice moves without warning between what she is seeing now and what she saw as a girl at Bourton, where she was eighteen and everything was still possible, and where Peter Walsh was in love with her and she married Richard Dalloway instead. The prose follows her attention rather than the clock; a squeaking door hinge and a summer thirty years gone are the same distance away.',
      },
      {
        kind: 'REWRITE',
        title: 'The hinges are wrong and I cannot hear why',
        section: 0,
        ask: '“The doors would be taken off their hinges; Rumpelmayer’s men were coming.” It is meant to be a small domestic fact that opens a door in her, and it reads as a stage direction. Something about the rhythm. Same information.',
        preContext:
          'A June morning in Westminster, 1923. Clarissa Dalloway is giving a party this evening and has decided to buy the flowers herself. The prose follows her attention rather than events: a squeaking hinge will put her, without transition, on a terrace at Bourton thirty years ago, aged eighteen, on a morning that felt exactly like this one. The whole novel works this way. The sentence in question is the last ordinary thing before the first plunge backwards, so it has to be both completely mundane and slightly loose at the edges.',
        accepted: {
          by: 'example-helper-2',
          note: 'Put the hinges last and let the sentence stop on them.',
          prose:
            'Mrs. Dalloway said she would buy the flowers herself. For Lucy had her work cut out for her. Rumpelmayer’s men were coming, and the doors would be taken off their hinges.',
        },
      },
    ],
  },
  {
    publicId: 'seedtreasu1',
    title: 'Treasure Island',
    logline:
      'Squire Trelawney asked me to write down the whole particulars, keeping nothing back but the bearings.',
    type: 'NOVEL',
    genres: ['adventure', 'historical'],
    source: {
      author: 'Robert Louis Stevenson',
      firstPublished: 1883,
      url: 'https://www.gutenberg.org/ebooks/120',
    },
    chapter: {
      title: 'The old sea-dog at the Admiral Benbow',
      sections: [
        'Squire Trelawney, Dr. Livesey, and the rest of these gentlemen having asked me to write down the whole particulars about Treasure Island, from the beginning to the end, keeping nothing back but the bearings of the island, and that only because there is still treasure not yet lifted, I take up my pen in the year of grace 17—, and go back to the time when my father kept the Admiral Benbow inn',
      ],
    },
    requests: [
      {
        kind: 'UNBLOCK',
        title: 'Should the narrator be the boy or the man remembering?',
        section: 0,
        ask: 'This sentence is written by an adult and everything after it wants to be a boy’s. I keep sliding between them and the tension gets lost. Is there a rule I can hold to, or does the distance need to close gradually and I should stop fighting it?',
      },
      {
        kind: 'CONTINUE',
        title: 'The captain arrives at the inn',
        section: 0,
        ask: 'Next: the brown old seaman with the sabre cut turns up at the door with his sea-chest on a handbarrow. Physical, specific, seen by a boy. He should be frightening before he does anything frightening.',
        preContext:
          'The Admiral Benbow is a small inn on a west-country coast road, kept by Jim Hawkins’s parents; Jim is about twelve and helps. Business is poor and the family is struggling since his father fell ill. The man who arrives will pay four pence a week to stay, drink rum, sing, terrify the customers, and post Jim to watch for a seafaring man with one leg. He will die in the parlour within a few months and leave behind a sea-chest with a map in it. Jim is narrating as an adult but the seeing is the boy’s.',
      },
    ],
  },
  {
    publicId: 'seedgullive1',
    title: "Gulliver's Travels",
    logline: 'My father had a small estate in Nottinghamshire; I was the third of five sons.',
    type: 'NOVEL',
    genres: ['adventure', 'literary'],
    source: {
      author: 'Jonathan Swift',
      firstPublished: 1726,
      url: 'https://www.gutenberg.org/ebooks/829',
    },
    chapter: {
      title: 'A voyage to Lilliput',
      sections: [
        'My father had a small estate in Nottinghamshire; I was the third of five sons. He sent me to Emanuel College in Cambridge at fourteen years old, where I resided three years, and applied myself close to my studies; but the charge of maintaining me, although I had a very scanty allowance, being too great for a narrow fortune, I was bound apprentice to Mr. James Bates, an eminent surgeon in London',
      ],
    },
    requests: [
      {
        kind: 'REWRITE',
        title: 'Make the dullness deliberate',
        section: 0,
        ask: 'This has to be flat — a man with no imagination giving his credentials — but at the moment it is flat by accident rather than on purpose. I want the reader to feel the narrator is boring them and enjoy it. Same facts, same order.',
        preContext:
          'Lemuel Gulliver is a ship’s surgeon, sober, literal and entirely without wit, setting out the facts of his life before describing things no one will believe. The satire depends on him being a reliable, tedious witness: he reports the impossible in the same voice he uses for his apprenticeship and his marriage settlement. Everything he says about Lilliput will be measured, costed and given in inches. This opening paragraph is the reader’s only chance to learn what kind of man is telling them the rest, and it should be so ordinary as to be faintly funny.',
        accepted: {
          by: 'example-helper-1',
          note: 'Added the sums. A man who tells you the amount is a man who will tell you the height of an emperor.',
          prose:
            'My father had a small estate in Nottinghamshire, of about thirty pounds a year: I was the third of five sons. He sent me to Emanuel College in Cambridge at fourteen years old, where I resided three years and applied myself close to my studies; but the charge of maintaining me, though my allowance was forty shillings a year and I spent nothing upon pleasure, being too great for so narrow a fortune, I was bound apprentice to Mr. James Bates, an eminent surgeon in London, with whom I continued four years.',
        },
      },
      {
        kind: 'UNBLOCK',
        title: 'How long can I spend on his credentials?',
        section: 0,
        ask: 'The flatness is the joke, and a joke that goes on too long stops being one. Two paragraphs of apprenticeships and marriage settlements, or four? I cannot tell from inside it where the reader’s patience actually runs out.',
      },
    ],
  },
  {
    publicId: 'seedimport1',
    title: 'The Importance of Being Earnest',
    logline:
      'Did you hear what I was playing, Lane? I don’t play accurately, but I play with wonderful expression.',
    type: 'STAGE_PLAY',
    genres: ['literary', 'romance'],
    source: {
      author: 'Oscar Wilde',
      firstPublished: 1895,
      url: 'https://www.gutenberg.org/ebooks/844',
    },
    chapter: {
      title: 'Act one',
      sections: [
        'ALGERNON. Did you hear what I was playing, Lane?',
        'LANE. I didn’t think it polite to listen, sir.',
        'ALGERNON. I’m sorry for that, for your sake. I don’t play accurately—any one can play accurately—but I play with wonderful expression. As far as the piano is concerned, sentiment is my forte. I keep science for Life.',
      ],
    },
    requests: [
      {
        kind: 'CONTINUE',
        title: "Lane's next line has to be funnier by saying less",
        section: 2,
        ask: 'Algernon has just been very pleased with himself. Lane should puncture it without appearing to try, and without a joke of his own — the comedy is that he is correct and uninterested. One line. Two at the outside.',
        preContext:
          'Algernon Moncrieff’s flat in Half-Moon Street, London, on an afternoon in the 1890s. Algernon is young, idle, charming and entirely without scruple; he has just finished playing the piano badly in the next room and has come in for the cucumber sandwiches he has ordered for his aunt and will shortly eat himself. Lane is his manservant: impassive, perfectly correct, and in possession of a private opinion about everything he is asked. The comedy of their exchanges is that Algernon performs and Lane declines to be an audience, agreeing with him in terms that are technically deferential and entirely unencouraging.',
      },
      {
        kind: 'REWRITE',
        title: 'Algernon’s speech is a paragraph and should be a rhythm',
        section: 2,
        ask: 'It needs to be said aloud by an actor and land three times. At the moment it lands once, at the end. Keep every idea; break it so a performer knows where the laughs are.',
        preContext:
          'Algernon Moncrieff’s flat, London, the 1890s. Algernon has just played the piano badly in the next room and come in pleased with himself; his manservant Lane has declined to have heard it. The exchange is the first in the play and sets its whole method: a young man of enormous charm and no character, making epigrams to a servant who neither agrees nor disagrees. Everything Algernon says is designed to be overheard and admired. Lane is the only person in the play who is never impressed, and he is impassive rather than rude.',
        accepted: {
          by: 'example-helper-1',
          note: 'Three beats, each one shorter than the last.',
          prose:
            'ALGERNON. I’m sorry for that, for your sake. I don’t play accurately — any one can play accurately — but I play with wonderful expression. As far as the piano is concerned, sentiment is my forte. I keep science for Life.',
        },
      },
    ],
  },
  {
    publicId: 'seedcallof1',
    title: 'The Call of the Wild',
    logline: 'Buck did not read the newspapers, or he would have known trouble was brewing.',
    type: 'NOVEL',
    genres: ['adventure', 'literary'],
    source: {
      author: 'Jack London',
      firstPublished: 1903,
      url: 'https://www.gutenberg.org/ebooks/215',
    },
    chapter: {
      title: 'Into the primitive',
      sections: [
        'Buck did not read the newspapers, or he would have known that trouble was brewing, not alone for himself, but for every tide-water dog, strong of muscle and with warm, long hair, from Puget Sound to San Diego.',
        'Because men, groping in the Arctic darkness, had found a yellow metal, and because steamship and transportation companies were booming the find, thousands of men were rushing into the Northland. These men wanted dogs, and the dogs they wanted were heavy dogs, with strong muscles by which to toil, and furry coats to protect them from the frost.',
      ],
    },
    requests: [
      {
        kind: 'UNBLOCK',
        title: 'How far inside the dog am I allowed to go?',
        section: 1,
        ask: 'The opening joke depends on Buck being a dog who obviously cannot read. But the book needs his interior life to carry three hundred pages. Where is the line between a dog who thinks and a man in a dog suit, and how do I know when I have crossed it?',
      },
      {
        kind: 'CONTINUE',
        title: 'Buck’s life before, in one paragraph',
        section: 1,
        ask: 'Judge Miller’s place in the sun-kissed Santa Clara Valley, and Buck as king of it. It has to be genuinely good — a life worth losing — without becoming sentimental. One paragraph, and no foreshadowing.',
        preContext:
          'Buck is a hundred-and-forty-pound cross between a St. Bernard and a Scotch shepherd dog, four years old, living on Judge Miller’s estate in the Santa Clara Valley where he was born. He is not a kennel dog and not a house dog: he goes where he likes, swims with the Judge’s sons, escorts his daughters on walks, and lies at the Judge’s feet in the library. He is neither pampered nor working; he is, in his own understanding, the proprietor. In a few pages a gardener with a gambling debt will sell him for money, and everything here will be taken from him at once.',
      },
    ],
  },
  {
    publicId: 'seedawaken1',
    title: 'The Awakening',
    logline:
      'A green and yellow parrot repeats one phrase all day, and nobody in the house is listening.',
    type: 'NOVEL',
    genres: ['literary', 'romance'],
    source: {
      author: 'Kate Chopin',
      firstPublished: 1899,
      url: 'https://www.gutenberg.org/ebooks/160',
    },
    chapter: {
      title: 'One',
      sections: [
        'A green and yellow parrot, which hung in a cage outside the door, kept repeating over and over: “Allez vous-en! Allez vous-en! Sapristi! That’s all right!” He could speak a little Spanish, and also a language which nobody understood, unless it was the mocking-bird that hung on the other side of the door, whistling his fluty notes out upon the breeze with maddening persistence.',
        'Mr. Pontellier, unable to read his newspaper with any degree of comfort, arose with an expression and an exclamation of disgust. He walked down the gallery and across the narrow “bridges” which connected the Lebrun cottages one with the other.',
      ],
    },
    requests: [
      {
        kind: 'REWRITE',
        title: 'The parrot is the whole novel and reads as scenery',
        section: 0,
        ask: 'A creature in a cage saying go away all day, in a language nobody bothers to understand. I want that to sit slightly wrong with the reader on a first pass without becoming a symbol they can name. Lighter, not heavier.',
        preContext:
          'Grand Isle, a Creole summer resort off the Louisiana coast, on a Sunday morning in the 1890s. The Pontellier family is staying in one of the Lebrun cottages; Léonce Pontellier is a New Orleans businessman of forty, reading a day-old newspaper, and his wife Edna is twenty-eight and on the beach with a friend. The household is comfortable, conventional, and entirely settled about what a wife is for. Over the summer Edna will begin to want something she cannot name and will not be able to unwant. The parrot and the mocking-bird are the first two things in the novel, and they are both in cages.',
        accepted: {
          by: 'example-helper-2',
          note: 'Took out the translation and let the phrase stay foreign, so the reader is also someone the bird is talking past.',
          prose:
            'A green and yellow parrot, which hung in a cage outside the door, kept repeating over and over: “Allez vous-en! Allez vous-en! Sapristi! That’s all right!” He could speak a little Spanish, and also a language which nobody understood, unless it was the mocking-bird that hung on the other side of the door, whistling his fluty notes out upon the breeze with maddening persistence. Nobody in the house had troubled to learn what either of them was saying.',
        },
      },
      {
        kind: 'UNBLOCK',
        title: 'Whose consciousness is chapter one in?',
        section: 1,
        ask: 'It opens on the parrot, moves to Mr Pontellier reading his paper, and the book belongs to his wife, who is not here yet. Starting with him is a good joke about whose story people assume this is. Is the joke worth a chapter?',
      },
      {
        kind: 'UNBLOCK',
        title: 'Léonce is not a villain and I need the reader to resent him anyway',
        section: 0,
        ask: 'He is attentive, generous, and entirely conventional, and he is the weather Edna cannot get out of. Every time I make him unkind the book gets smaller. How do I make a decent man unbearable without making him a bad one?',
      },
    ],
  },
  {
    publicId: 'seedsecret1',
    title: 'The Secret Garden',
    logline:
      'When Mary Lennox was sent to Misselthwaite Manor, everybody said she was the most disagreeable child ever seen.',
    type: 'NOVEL',
    genres: ['literary', 'historical'],
    source: {
      author: 'Frances Hodgson Burnett',
      firstPublished: 1911,
      url: 'https://www.gutenberg.org/ebooks/113',
    },
    chapter: {
      title: 'There is no one left',
      sections: [
        'When Mary Lennox was sent to Misselthwaite Manor to live with her uncle everybody said she was the most disagreeable-looking child ever seen. It was true, too. She had a little thin face and a little thin body, thin light hair and a sour expression.',
        'Her hair was yellow, and her face was yellow because she had been born in India and had always been ill in one way or another. Her father had held a position under the English Government and had always been busy and ill himself, and her mother had been a great beauty who cared only to go to parties and amuse herself with gay people.',
      ],
    },
    requests: [
      {
        kind: 'CONTINUE',
        title: 'I need the reader to pity her without her becoming sympathetic',
        section: 1,
        ask: 'She is unpleasant and it is not her fault, and both halves have to stay true. The next paragraph should make the second half plain while keeping the first. No softening, and nobody is allowed to be kind to her yet.',
        preContext:
          'Mary Lennox is nine, born in India to English parents who did not want her: her mother handed her to an Ayah at birth with instructions to keep her out of sight, and her father was ill and occupied. She has been raised by servants who obeyed her in everything to keep her quiet, and has consequently never been told no, never been played with, and never been held. She is tyrannical, incurious, and entirely alone. Cholera is about to go through the household and leave her the only survivor, forgotten in an empty bungalow for two days before anyone remembers she exists.',
      },
      {
        kind: 'REWRITE',
        title: '“Everybody said” is hiding who actually said it',
        section: 0,
        ask: 'The passive is protecting me. Somebody in that house said it out loud where she could hear. I want the sentence to keep its fairy-tale opening cadence and stop being anonymous.',
        preContext:
          'Mary Lennox is nine and has just arrived in Yorkshire from India, where cholera killed her parents and the servants and left her alone in an empty bungalow for two days. Nobody has ever wanted her. She is sallow, thin, cross, and has been waited on hand and foot by people who were paid to keep her quiet. The house she is going to is enormous, half shut up, and owned by an uncle who is never there. The narration is a storyteller’s — plain, slightly arch, addressed to a child — and it is entirely unsentimental about how unpleasant Mary is.',
        accepted: {
          by: 'example-helper-2',
          note: 'Named one of them and left the rest general, which is worse.',
          prose:
            'When Mary Lennox was sent to Misselthwaite Manor to live with her uncle everybody said she was the most disagreeable-looking child ever seen — the servants who packed for her said it, and the officer’s wife who took her as far as London said it in front of her, twice. It was true, too.',
        },
      },
      {
        kind: 'UNBLOCK',
        title: 'When does the reader get to start liking her?',
        section: 0,
        ask: 'Mary is genuinely horrible for several chapters and that is the whole arc. But a child reading this has to want to keep going. What is the earliest moment I can give them something to hold on to that is not a softening?',
      },
    ],
  },
  {
    publicId: 'seedturnof1',
    title: 'The Turn of the Screw',
    logline:
      'The story had held us, round the fire, sufficiently breathless — but it was not the first story of its kind.',
    type: 'NOVELLA',
    genres: ['horror', 'mystery', 'literary'],
    source: {
      author: 'Henry James',
      firstPublished: 1898,
      url: 'https://www.gutenberg.org/ebooks/209',
    },
    chapter: {
      title: 'Prologue',
      sections: [
        'The story had held us, round the fire, sufficiently breathless, but except the obvious remark that it was gruesome, as, on Christmas Eve in an old house, a strange tale should essentially be, I remember no comment uttered till somebody happened to say that it was the only case he had met in which such a visitation had fallen on a child.',
      ],
    },
    requests: [
      {
        kind: 'UNBLOCK',
        title: 'Three frames before the story starts — is that two too many?',
        section: 0,
        ask: 'A narrator recalling an evening at which a man read a manuscript written by a woman who is dead. Every frame buys deniability for what is coming, and every frame costs the reader patience. Which of them is load-bearing?',
      },
      {
        kind: 'CONTINUE',
        title: 'Somebody has to ask the obvious question',
        section: 0,
        ask: 'After “such a visitation had fallen on a child”, the room needs to respond. Someone should say the thing everyone is thinking — if one child is terrible, what about two — and it should be said lightly, by a person enjoying themselves.',
        preContext:
          'Christmas Eve in an old house; a party sitting up late round the fire after a ghost story. The company is comfortable, well fed and pleasantly frightened, the way people are when they are safe. Douglas, who has said nothing so far, is about to mention a manuscript locked in a drawer at home — written by his sister’s governess, who has been dead twenty years — and to make everyone wait three days while it is sent for. The talk before that has to be light enough that nobody notices the story is being framed, and framed, and framed again.',
      },
    ],
  },
]
