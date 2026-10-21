// Shared colours (gdd/02_art_spec.md §1). CSS mirrors these in index.html :root.
export const PAL = Object.freeze({
  ink: '#2b1d14', paper: '#f6ecd6', wood: '#c98b4f', woodDark: '#9a5f32', tatami: '#c9cf94',
  tabby: '#f29a3c', tabbyDark: '#c96a1c', cream: '#fff1dc', dogi: '#fff6e6', belt: '#d6453d', pink: '#f4a7a3',
  mouse: '#9aa7b8', mouseDark: '#6d7a8c', squirrel: '#c9a27a', squirrelDark: '#a37c55', cape: '#7b6cc4',
  tanuki: '#7a5638', tanukiDark: '#4f3622', leaf: '#e8623a', catnip: '#7fd36b', sky: '#7fd7ff', star: '#ffd34a',
});

export const hex = css => parseInt(css.slice(1), 16);
