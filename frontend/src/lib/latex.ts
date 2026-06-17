import { marked } from 'marked'

// Convert LaTeX math in an answer to readable Unicode for copy/download, so
// pasted/saved text matches what's shown on screen (ε₀, Σ, √, …, subscripts)
// instead of raw $$\frac{1}{4\pi\varepsilon_0}...$$. On-screen rendering uses
// KaTeX (true 2-D); plain text can't stack fractions, so those linearise to
// a/b — everything else maps to proper Unicode. The goal is faithful, clean,
// complete text with NO leftover \commands.

const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ',
  o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
}
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ',
  j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ',
  t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
}

// No-argument commands → Unicode. Applied longest-key-first so e.g. \cdots is
// matched before \cdot. Extend freely; unknown commands are stripped at the end.
const SYMBOLS: Record<string, string> = {
  // dots
  '\\ldots': '…', '\\dots': '…', '\\cdots': '…', '\\vdots': '⋮', '\\ddots': '⋱',
  // operators / relations
  '\\times': '×', '\\div': '÷', '\\cdot': '·', '\\ast': '∗', '\\star': '⋆',
  '\\pm': '±', '\\mp': '∓', '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥',
  '\\neq': '≠', '\\ne': '≠', '\\equiv': '≡', '\\approx': '≈', '\\sim': '∼',
  '\\simeq': '≃', '\\cong': '≅', '\\propto': '∝', '\\ll': '≪', '\\gg': '≫',
  '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇', '\\sum': 'Σ', '\\prod': 'Π',
  '\\int': '∫', '\\oint': '∮', '\\sqrt': '√', '\\angle': '∠', '\\perp': '⊥',
  '\\parallel': '∥', '\\degree': '°', '\\circ': '∘', '\\bullet': '•',
  '\\prime': '′', '\\hbar': 'ℏ', '\\ell': 'ℓ', '\\Re': 'ℜ', '\\Im': 'ℑ',
  // set / logic
  '\\forall': '∀', '\\exists': '∃', '\\nexists': '∄', '\\in': '∈', '\\notin': '∉',
  '\\subset': '⊂', '\\subseteq': '⊆', '\\supset': '⊃', '\\supseteq': '⊇',
  '\\cup': '∪', '\\cap': '∩', '\\emptyset': '∅', '\\varnothing': '∅',
  '\\wedge': '∧', '\\vee': '∨', '\\neg': '¬', '\\land': '∧', '\\lor': '∨',
  // arrows
  '\\rightarrow': '→', '\\to': '→', '\\leftarrow': '←', '\\Rightarrow': '⇒',
  '\\Leftarrow': '⇐', '\\leftrightarrow': '↔', '\\Leftrightarrow': '⇔',
  '\\mapsto': '↦', '\\uparrow': '↑', '\\downarrow': '↓',
  // greek (lower)
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε',
  '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ',
  '\\vartheta': 'ϑ', '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ',
  '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\varpi': 'ϖ', '\\rho': 'ρ',
  '\\varrho': 'ϱ', '\\sigma': 'σ', '\\varsigma': 'ς', '\\tau': 'τ',
  '\\upsilon': 'υ', '\\phi': 'φ', '\\varphi': 'φ', '\\chi': 'χ', '\\psi': 'ψ',
  '\\omega': 'ω',
  // greek (upper)
  '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ', '\\Xi': 'Ξ',
  '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Upsilon': 'Υ', '\\Phi': 'Φ', '\\Psi': 'Ψ',
  '\\Omega': 'Ω',
  // spacing → single space
  '\\quad': ' ', '\\qquad': ' ', '\\,': ' ', '\\;': ' ', '\\:': ' ',
  '\\!': '', '\\ ': ' ',
}
// One boundary-aware regex (longest keys first). Alpha commands (e.g. \le)
// require a non-letter after them so they don't match inside longer commands
// (e.g. \left). Built once at module load.
const SYMBOL_RE = new RegExp(
  Object.keys(SYMBOLS)
    .sort((a, b) => b.length - a.length)
    .map((k) => {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return /[A-Za-z]$/.test(k) ? `${esc}(?![A-Za-z])` : esc
    })
    .join('|'),
  'g',
)

// Combining accents (applied to the preceding extracted token)
const ACCENTS: Record<string, string> = {
  vec: '⃗', hat: '̂', bar: '̄', overline: '̄',
  tilde: '̃', dot: '̇', ddot: '̈', underline: '̲',
}

const toUni = (s: string, map: Record<string, string>) =>
  s.split('').map((c) => map[c] ?? c).join('')

// Wrap a fraction part in parens only when it contains a top-level operator/space.
const wrapPart = (s: string) => (/[\s+\-=·×/]/.test(s.trim()) ? `(${s.trim()})` : s.trim())

function convert(input: string): string {
  let e = input

  // Environments (matrix/align/cases/etc): drop \begin{}/\end{}, linearise rows.
  e = e.replace(/\\begin\{[^}]*\}/g, '').replace(/\\end\{[^}]*\}/g, '')
  e = e.replace(/\\\\/g, '; ').replace(/&/g, ' ')

  // Text/operator wrappers — keep the inner content.
  e = e.replace(/\\(?:text|operatorname|mathrm|mathbf|mathbb|mathcal|mathfrak|mathsf|mathtt|mathit|boldsymbol|bm|rm|bf|it)\s*\{([^{}]*)\}/g, '$1')

  // Accents: \vec{x}/\vec x → x + combining mark (run a few passes for nesting).
  for (let pass = 0; pass < 3; pass++) {
    e = e.replace(/\\(vec|hat|bar|overline|tilde|dot|ddot|underline)\s*\{([^{}]*)\}/g,
      (_m, a, g) => g + ACCENTS[a])
    e = e.replace(/\\(vec|hat|bar|tilde|dot|ddot)\s+([A-Za-z0-9])/g,
      (_m, a, g) => g + ACCENTS[a])
  }

  // Subscripts / superscripts BEFORE \frac so inner braces collapse first.
  for (let pass = 0; pass < 4; pass++) {
    e = e.replace(/_\{([^{}]*)\}/g, (_m, g) => toUni(g, SUB))
      .replace(/\^\{([^{}]*)\}/g, (_m, g) => toUni(g, SUP))
      .replace(/_([A-Za-z0-9])/g, (_m, g) => toUni(g, SUB))
      .replace(/\^([A-Za-z0-9])/g, (_m, g) => toUni(g, SUP))
  }

  // Fractions / roots / binomials (a few passes for nesting).
  for (let pass = 0; pass < 4; pass++) {
    e = e.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
      (_m, a, b) => `${wrapPart(a)}/${wrapPart(b)}`)
    e = e.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, (_m, n, x) => `${toUni(n, SUP)}√(${x})`)
    e = e.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
    e = e.replace(/\\binom\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, 'C($1, $2)')
  }

  // Delimiters first (so \left/\right can't collide with symbol keys).
  e = e.replace(/\\left|\\right/g, '')

  // No-arg symbols (boundary-aware, longest key first).
  e = e.replace(SYMBOL_RE, (m) => SYMBOLS[m] ?? '')

  // Leftovers.
  e = e.replace(/[{}]/g, '')
  // Any remaining unknown \command → drop entirely (prevents stray words like "ldots").
  e = e.replace(/\\[A-Za-z]+/g, '').replace(/\\(.)/g, '$1')
  return e.replace(/[ \t]{2,}/g, ' ').trim()
}

export function latexToReadable(md: string): string {
  if (!md) return md
  return md
    .replace(/\$\$([\s\S]*?)\$\$/g, (_m, expr) => convert(expr))
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, expr) => convert(expr))
    .replace(/\$([^$\n]+?)\$/g, (_m, expr) => convert(expr))
    .replace(/\\\(([^\n]*?)\\\)/g, (_m, expr) => convert(expr))
}

// Build both clipboard representations for an answer:
//  - plain: readable Unicode markdown (good for text files / plain paste)
//  - html: formatted HTML (headings, tables, lists) with Unicode math, so
//          pasting into Word renders structure correctly and formulas read
//          cleanly (no raw LaTeX, no duplication).
export function answerToClipboard(question: string, answerMd: string): { plain: string; html: string } {
  const readable = latexToReadable(answerMd)
  const plain = `Q: ${question}\n\nA: ${readable}`
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = marked.parse(readable, { gfm: true, async: false }) as string
  const html = `<p><strong>Q:</strong> ${esc(question)}</p>\n${body}`
  return { plain, html }
}
