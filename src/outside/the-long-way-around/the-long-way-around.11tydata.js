// A book in Outside Work. In this folder:
//   index.md       the book page (title, author's note, list of chapters)
//   chapter-N.md   one file per chapter; front matter needs `chapter` (a number), `chapterTitle`, `date`, `summary`
//   images/        pictures used by the chapters
// To add a chapter, copy the front matter of the latest chapter-N.md into chapter-(N+1).md and write.
// "To be continued" moves to the newest chapter by itself; set `finished: true` in index.md when the book is done.
const BOOK = "the-long-way-around";
const BOOK_TITLE = "The Long Way Around";

export default {
  book: BOOK,
  bookTitle: BOOK_TITLE,
  layout: "chapter.njk",
  eleventyComputed: {
    title: (d) => (d.chapter ? `${BOOK_TITLE}, Chapter ${d.chapter}: ${d.chapterTitle}` : BOOK_TITLE),
    permalink: (d) => (d.chapter ? `/outside/${BOOK}/chapter-${d.chapter}/` : `/outside/${BOOK}/`),
  },
};
