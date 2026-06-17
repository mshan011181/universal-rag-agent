// Convert LaTeX math in an answer to readable Unicode for copy/download, so
// pasted/saved text shows ε₀, Σ, √, ², subscripts — not raw $$\frac{1}{4\pi...}$$.
// On-screen rendering still uses KaTeX; this is only for clipboard/file output.

const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'i': 'ᵢ', 'n': 'ₙ', 'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 't': 'ₜ',
  's': 'ₛ', 'm': 'ₘ', 'p': 'ₚ', 'k': 'ₖ', 'l': 'ₗ',
}
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', 'n': 'ⁿ', 'i': 'ⁱ',
}
const GREEK: Record<string, string> = {
  '\\varepsilon': 'ε', '\\epsilon': 'ε', '\\pi': 'π', '\\alpha': 'α',
  '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\Delta': 'Δ',
  '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ', '\\sigma': 'σ',
  '\\phi': 'φ', '\\omega': 'ω', '\\rho': 'ρ', '\\tau': 'τ',
}

const toUni = (s: string, map: Record<string, string>) =>
  s.split('').map((c) => map[c] ?? c).join('')

function convert(expr: string): string {
  let e = expr
  for (const [k, v] of Object.entries(GREEK)) e = e.split(k).join(v)
  e = e.replace(/\\(mathbf|mathrm|boldsymbol|mathit|text)\s*\{([^{}]*)\}/g, '$2')
  e = e.replace(/\\vec\s*\{([^{}]*)\}/g, '$1⃗').replace(/\\vec\s+(\w)/g, '$1⃗')
  e = e.replace(/\\hat\s*\{([^{}]*)\}/g, '$1̂').replace(/\\hat\s+(\w)/g, '$1̂')
  // Subscripts/superscripts FIRST — collapses inner braces (e.g. r_{21}^2)
  // so \frac's brace matching works on the denominator afterwards.
  e = e.replace(/_\{([^{}]*)\}/g, (_m, g) => toUni(g, SUB))
    .replace(/\^\{([^{}]*)\}/g, (_m, g) => toUni(g, SUP))
    .replace(/_(\w)/g, (_m, g) => toUni(g, SUB))
    .replace(/\^(\w)/g, (_m, g) => toUni(g, SUP))
  e = e.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
  e = e.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
  e = e.replace(/\\sum/g, 'Σ').replace(/\\prod/g, 'Π').replace(/\\int/g, '∫')
    .replace(/\\times/g, '×').replace(/\\cdot/g, '·').replace(/\\approx/g, '≈')
    .replace(/\\neq/g, '≠').replace(/\\leq/g, '≤').replace(/\\geq/g, '≥')
    .replace(/\\pm/g, '±').replace(/\\infty/g, '∞').replace(/\\partial/g, '∂')
    .replace(/\\nabla/g, '∇').replace(/\\rightarrow/g, '→').replace(/\\to/g, '→')
  e = e.replace(/\\left|\\right/g, '').replace(/\\[,;:!]/g, ' ')
  e = e.replace(/[{}]/g, '').replace(/\\\\/g, ' ').replace(/\\(\w+)/g, '$1')
  return e.replace(/[ \t]+/g, ' ').trim()
}

export function latexToReadable(md: string): string {
  if (!md) return md
  return md
    .replace(/\$\$([\s\S]*?)\$\$/g, (_m, expr) => convert(expr))
    .replace(/\$([^$\n]+?)\$/g, (_m, expr) => convert(expr))
}
