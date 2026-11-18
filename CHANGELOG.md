# Change Log

All notable changes to Open Reader are documented here.

## 0.2.1

### Changed

- Text size is a slider from 10 to 96 px (four times the old largest size). Old size names still load.
- A chapter is marked read when you open it. Continue returns to the chapter you last opened.
- Unread chapters show at full strength and read ones at 25%, in the Library and on the novel page. The tick, dot and bookmark icons are gone from the Library: fading alone shows what is read. Both colours can be changed with `openReader.unreadChapterForeground` and `openReader.readChapterForeground`.
- Clicking a book in the Library opens the chapter you last read. The eye button on a book opens its table of contents.
- Import from Link lives on the Browse Sources page only; the Library title bar button is gone.
- Chapters download three at a time by default, up to 12 with `openReader.downloadConcurrency`.

### Added

- Right-click a book for Open Table of Contents, Mark All Read or Unread, Rename and Delete. Local books add Reveal in File Explorer and Copy Path; online novels add Show in Browse Sources, Check for New Chapters and the download actions.
- A Bookmarks page, from the Library's ··· menu: every bookmarked chapter, grouped by book. Click one to open it in the Reader; the trash button removes it.
- In Between: with two chapters selected, select every chapter between them.

### Fixed

- A source that was installed before the extension was removed and reinstalled showed "not installed" until you reinstalled it. It is now downloaded again on its own.
- Browse Sources and Reader Settings no longer break, leaving empty space, when the editor area is narrow.
- Marking chapters read on a novel you had not opened yet left chapter 1 bright, because it counted as the chapter being read.
- In themes that dim the whole sidebar (such as Cursor Dark), read and unread chapters looked almost the same. Unread chapters now use the theme's full text colour.
- Deleting a novel while chapters were downloading could leave an empty folder behind; delete now waits for them. Deleting a book also clears its reading progress.
- Renaming a book updates the Library and the Bookmarks page straight away.
- Clicking a book you have never opened starts at its first unread chapter.

## 0.2.0

### Added

- **Browse Sources**: install LNReader sources and browse their novels (popular, latest, search, filters) in a page laid out like VS Code's Extensions view.
- **Web novels in the library**: add a novel from a source and read it in the editor reader or the sidebar Reader.
- **Read marks**: chapters are marked read when you reach their end or move on, and read chapters fade out on the novel page and in the Library sidebar. Continue resumes at the first unread chapter.
- **Selection actions**: select chapters on the novel page or in the Library sidebar and mark them read or unread, mark previous as read, bookmark, download or delete downloads.
- **Downloads**: next chapter, next 5 or 10, unread or all chapters, with progress on the page and in the status bar.
- **Filters**: unread, downloaded and bookmarked chapters.
- **Import from link**: a novel page from any site a source serves, or a direct EPUB or CBZ link.
- **Separate settings per reader**: Reader Settings has a Main Area tab and a Side Panel tab.
- **Credits** for LNReader, LNReader Plugins and the libraries Open Reader uses, on the About page and in the README.

## 0.0.13

- The last book reopens on start, and the chapter you are reading stays highlighted.
