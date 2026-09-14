/**
 * Genres offered at onboarding (FR-1.3) and on storyboard creation (FR-2.1).
 * Slugs are permanent identifiers; rename `name` freely, never `slug`.
 */
export const GENRES: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: 'literary', name: 'Literary fiction' },
  { slug: 'fantasy', name: 'Fantasy' },
  { slug: 'science-fiction', name: 'Science fiction' },
  { slug: 'speculative', name: 'Speculative' },
  { slug: 'mystery', name: 'Mystery' },
  { slug: 'crime', name: 'Crime' },
  { slug: 'thriller', name: 'Thriller' },
  { slug: 'horror', name: 'Horror' },
  { slug: 'romance', name: 'Romance' },
  { slug: 'historical', name: 'Historical' },
  { slug: 'adventure', name: 'Adventure' },
  { slug: 'western', name: 'Western' },
  { slug: 'magical-realism', name: 'Magical realism' },
  { slug: 'dystopian', name: 'Dystopian' },
  { slug: 'satire', name: 'Satire' },
  { slug: 'comedy', name: 'Comedy' },
  { slug: 'drama', name: 'Drama' },
  { slug: 'young-adult', name: 'Young adult' },
  { slug: 'middle-grade', name: 'Middle grade' },
  { slug: 'childrens', name: "Children's" },
  { slug: 'poetry', name: 'Poetry' },
  { slug: 'memoir', name: 'Memoir' },
  { slug: 'essay', name: 'Essay' },
  { slug: 'true-crime', name: 'True crime' },
]
