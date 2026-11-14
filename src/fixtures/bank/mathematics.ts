import { fmt, frac, statements, type Template } from "./engine";

const M = { subject: "mathematics" as const, exams: ["jee-main", "jee-advanced"] as ("jee-main" | "jee-advanced")[] };

const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
const nCr = (n: number, r: number) => fact(n) / (fact(r) * fact(n - r));

export const mathematicsTemplates: Template[] = [
  {
    ...M, key: "ma_rel", chapter: "sets-relations-and-functions", topic: "relations", difficulty: "medium",
    make: (r) => {
      const n = r.pick([2, 3]);
      const kind = r.pick(["reflexive", "symmetric", "all"]);
      const exp = kind === "reflexive" ? n * n - n : kind === "symmetric" ? (n * (n + 1)) / 2 : n * n;
      const v = 2 ** exp;
      return {
        kind: "value",
        stem: `Let $A$ be a set with $${n}$ elements. The number of ${kind === "all" ? "" : kind + " "}relations on $A$ is`,
        value: v, wrong: [2 ** (exp + 1), 2 ** Math.max(1, exp - 1), n ** n],
        hint: "A relation is a subset of $A \\times A$; count which ordered pairs are free to include or exclude.",
        steps: [
          { body: `$|A \\times A| = ${n * n}$.` },
          {
            body:
              kind === "reflexive"
                ? `The ${n} diagonal pairs are forced in; the other $${n * n - n}$ pairs are free: $2^{${exp}} = ${v}$.`
                : kind === "symmetric"
                  ? `Choose diagonal pairs freely (${n}) and off-diagonal pairs in symmetric couples (${(n * n - n) / 2}): $2^{${exp}} = ${v}$.`
                  : `Every subset of $A\\times A$ is a relation: $2^{${exp}} = ${v}$.`,
          },
        ],
      };
    },
  },
  {
    ...M, key: "ma_roots", chapter: "complex-numbers-and-quadratic-equations", topic: "roots-of-quadratics", difficulty: "easy",
    make: (r) => {
      const a = r.int(1, 5), b = r.int(1, 6);
      const s = a + b, p = a * b;
      const v = s * s - 2 * p;
      return {
        kind: "value",
        stem: `If $\\alpha$ and $\\beta$ are the roots of $x^2 - ${s}x + ${p} = 0$, then $\\alpha^2 + \\beta^2$ is`,
        value: v, wrong: [s * s, s * s + 2 * p, v + p],
        hint: "Express $\\alpha^2 + \\beta^2$ through the sum and product of roots.",
        steps: [
          { body: `$\\alpha + \\beta = ${s}$, $\\alpha\\beta = ${p}$.` },
          { body: `$\\alpha^2 + \\beta^2 = (\\alpha + \\beta)^2 - 2\\alpha\\beta = ${s * s} - ${2 * p} = ${v}$.` },
        ],
      };
    },
  },
  {
    ...M, key: "ma_mod", chapter: "complex-numbers-and-quadratic-equations", topic: "argand-plane", difficulty: "easy",
    make: (r) => {
      const [a, b, m1] = r.pick([[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17]]);
      const [c, d, m2] = r.pick([[0, 2, 2], [3, 4, 5], [4, 3, 5], [0, 3, 3]]);
      const mod2 = m2;
      const v = m1 * mod2;
      return {
        kind: "value",
        stem: `The modulus of $(${a} + ${b}i)(${c === 0 ? "" : c + " + "}${d}i)$ is`,
        value: Number(fmt(v)), wrong: [m1 + mod2, a * c + b * d, Number(fmt(v * 2))],
        hint: "The modulus of a product is the product of the moduli.",
        steps: [{ body: `$|${a} + ${b}i| = ${m1}$, $|${c === 0 ? "" : c + " + "}${d}i| = ${m2 ? m2 : "\\sqrt2"}$.` }, { body: `Product $= ${m1} \\times ${m2 ? m2 : "\\sqrt 2"}${m2 ? ` = ${v}` : ""}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_adj", chapter: "matrices-and-determinants", topic: "determinants", difficulty: "medium",
    make: (r) => {
      const n = 3;
      const d = r.pick([2, 3, -2, 4]);
      const which = r.pick(["adj", "k"]);
      if (which === "adj") {
        const v = d ** (n - 1);
        return {
          kind: "value",
          stem: `$A$ is a $3 \\times 3$ matrix with $\\det A = ${d}$. The value of $\\det(\\operatorname{adj} A)$ is`,
          value: v, wrong: [d ** n, d, 3 * d],
          hint: "For an $n\\times n$ matrix, $\\det(\\operatorname{adj}A) = (\\det A)^{n-1}$.",
          steps: [{ body: `$\\det(\\operatorname{adj}A) = (\\det A)^{n-1} = (${d})^{2} = ${v}$.` }],
        };
      }
      const k = r.pick([2, 3]);
      const v = k ** n * d;
      return {
        kind: "value",
        stem: `$A$ is a $3 \\times 3$ matrix with $\\det A = ${d}$. The value of $\\det(${k}A)$ is`,
        value: v, wrong: [k * d, k * k * d, v * k],
        hint: "Multiplying a matrix by $k$ multiplies every row by $k$.",
        steps: [{ body: `$\\det(kA) = k^n \\det A = ${k}^3 \\times ${d} = ${v}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_words", chapter: "permutations-and-combinations", topic: "arrangements", difficulty: "medium",
    make: (r) => {
      const [w, counts] = r.pick([
        ["BANANA", [3, 2, 1]], ["LETTER", [2, 2, 1, 1]], ["APPLE", [2, 1, 1, 1]], ["SUCCESS", [3, 2, 1, 1]], ["ASSASSIN", [4, 2, 1, 1]], ["COMMITTEE", [2, 2, 2, 1, 1, 1]],
      ] as [string, number[]][]);
      const n = w.length;
      const v = fact(n) / counts.reduce((acc, c) => acc * fact(c), 1);
      return {
        kind: "value",
        stem: `The number of distinct arrangements of the letters of the word ${w} is`,
        value: v, wrong: [fact(n), v * 2, v / 2],
        hint: "Divide $n!$ by the factorial of each repeated letter's count.",
        steps: [{ body: `${n} letters with repetitions ${counts.filter((c) => c > 1).join(", ")}.` }, { body: `$\\dfrac{${n}!}{${counts.filter((c) => c > 1).map((c) => c + "!").join("\\,")}} = ${v}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_comm", chapter: "permutations-and-combinations", topic: "selections", difficulty: "medium",
    make: (r) => {
      const men = r.pick([5, 6, 7]), women = r.pick([4, 5]);
      const km = r.pick([2, 3]), kw = 2;
      const v = nCr(men, km) * nCr(women, kw);
      return {
        kind: "value",
        stem: `A committee of ${km} men and ${kw} women is to be chosen from ${men} men and ${women} women. The number of ways is`,
        value: v, wrong: [nCr(men + women, km + kw), nCr(men, km) + nCr(women, kw), v * 2],
        hint: "Choose the men and the women independently, then multiply.",
        steps: [{ body: `$\\binom{${men}}{${km}} \\times \\binom{${women}}{${kw}} = ${nCr(men, km)} \\times ${nCr(women, kw)} = ${v}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_binom", chapter: "binomial-theorem", topic: "general-term", difficulty: "medium",
    make: (r) => {
      const m = r.pick([2, 3, 4, 5]);
      const n = 2 * m;
      const v = nCr(n, m);
      return {
        kind: "value",
        stem: `The term independent of $x$ in the expansion of $\\left(x + \\dfrac1x\\right)^{${n}}$ is`,
        value: v, wrong: [nCr(n, m - 1), 2 ** n, v * 2],
        hint: "Write the general term and set the power of $x$ to zero.",
        steps: [
          { body: `$T_{r+1} = \\binom{${n}}{r} x^{${n} - 2r}$.` },
          { body: `$${n} - 2r = 0 \\Rightarrow r = ${m}$, giving $\\binom{${n}}{${m}} = ${v}$.` },
        ],
      };
    },
  },
  {
    ...M, key: "ma_ap", chapter: "sequences-and-series", topic: "arithmetic-progression", difficulty: "easy",
    make: (r) => {
      const a = r.int(1, 9), d = r.int(2, 5), n = r.pick([10, 15, 20]);
      const S = (n / 2) * (2 * a + (n - 1) * d);
      return {
        kind: "value",
        stem: `The sum of the first $${n}$ terms of the arithmetic progression $${a}, ${a + d}, ${a + 2 * d}, \\ldots$ is`,
        value: S, wrong: [(n / 2) * (2 * a + n * d), n * (a + (n - 1) * d), S - d],
        hint: "Use $S_n = \\tfrac n2[2a + (n-1)d]$.",
        steps: [{ body: `$a = ${a}$, $d = ${d}$.` }, { body: `$S_{${n}} = \\dfrac{${n}}{2}[2(${a}) + ${n - 1}(${d})] = ${S}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_lim", chapter: "limits-continuity-and-differentiability", topic: "limits", difficulty: "easy",
    make: (r) => {
      const a = r.int(2, 6), b = r.int(1, 5);
      const kind = r.pick(["sin", "exp", "cos"]);
      if (kind === "sin") {
        return {
          kind: "choice",
          stem: `$\\displaystyle\\lim_{x\\to 0} \\frac{\\sin ${a}x}{\\tan ${b}x}$ is equal to`,
          correct: `$${frac(a, b)}$`, wrong: [`$${frac(b, a)}$`, "$1$", `$${frac(a * a, b)}$`, "$0$"],
          hint: "Use $\\sin u \\approx u$ and $\\tan u \\approx u$ as $u \\to 0$.",
          steps: [{ body: `$\\dfrac{\\sin ${a}x}{\\tan ${b}x} = \\dfrac{\\sin ${a}x}{${a}x}\\cdot\\dfrac{${b}x}{\\tan ${b}x}\\cdot\\dfrac{${a}}{${b}} \\to ${frac(a, b)}$.` }],
        };
      }
      if (kind === "exp") {
        return {
          kind: "choice",
          stem: `$\\displaystyle\\lim_{x\\to 0} \\frac{e^{${a}x} - 1}{${b}x}$ is equal to`,
          correct: `$${frac(a, b)}$`, wrong: [`$${frac(b, a)}$`, `$${a * b}$`, "$1$", "$0$"],
          hint: "Recall the standard limit $\\lim_{u\\to0}(e^u - 1)/u = 1$.",
          steps: [{ body: `$\\dfrac{e^{${a}x} - 1}{${a}x} \\cdot \\dfrac{${a}}{${b}} \\to ${frac(a, b)}$.` }],
        };
      }
      return {
        kind: "choice",
        stem: `$\\displaystyle\\lim_{x\\to 0} \\frac{1 - \\cos ${a}x}{x^2}$ is equal to`,
        correct: `$${frac(a * a, 2)}$`, wrong: [`$${a * a}$`, `$${frac(a, 2)}$`, "$0$", `$${frac(1, 2)}$`],
        hint: "Use $1 - \\cos\\theta = 2\\sin^2(\\theta/2)$.",
        steps: [{ body: `$1 - \\cos ${a}x = 2\\sin^2 \\tfrac{${a}x}{2} \\approx \\tfrac{${a * a}x^2}{2}$, so the limit is $${frac(a * a, 2)}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_max", chapter: "limits-continuity-and-differentiability", topic: "applications-of-derivatives", difficulty: "easy",
    make: (r) => {
      const h = r.int(1, 5), k = r.int(2, 12);
      const b = 2 * h, c = k - h * h;
      return {
        kind: "value",
        stem: `The maximum value of $f(x) = -x^2 + ${b}x ${c >= 0 ? "+ " + c : "- " + -c}$ is`,
        value: k, wrong: [c, k + h, h],
        hint: "Set $f'(x) = 0$ and check the sign of $f''$.",
        steps: [{ body: `$f'(x) = -2x + ${b} = 0 \\Rightarrow x = ${h}$; $f'' = -2 < 0$ (maximum).` }, { body: `$f(${h}) = -${h * h} + ${b * h} ${c >= 0 ? "+ " + c : "- " + -c} = ${k}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_area", chapter: "integral-calculus", topic: "area-under-curves", difficulty: "medium",
    make: (r) => {
      const k = r.pick([1, 2, 3, 6]);
      const A = k ** 3 / 6;
      return {
        kind: "value", tolerance: 0.01,
        stem: `The area of the region enclosed between $y = x^2$ and $y = ${k === 1 ? "" : k}x$ is`,
        value: Number(A.toFixed(2)), wrong: [Number((k ** 3 / 3).toFixed(2)), Number((k ** 2 / 2).toFixed(2)), Number((A * 2).toFixed(2))],
        hint: "Find where the curves meet, then integrate the top curve minus the bottom one.",
        steps: [
          { body: `Intersections: $x^2 = ${k}x \\Rightarrow x = 0, ${k}$.` },
          { body: `$A = \\int_0^{${k}} (${k}x - x^2)\\,dx = \\dfrac{${k}^3}{2} - \\dfrac{${k}^3}{3} = \\dfrac{${k ** 3}}{6} = ${fmt(A, 2)}$.` },
        ],
      };
    },
  },
  {
    ...M, key: "ma_int", chapter: "integral-calculus", topic: "definite-integrals", difficulty: "easy",
    make: (r) => {
      const n = r.pick([1, 2, 3]);
      const a = r.pick([1, 2, 3]);
      const v = a ** (n + 1) / (n + 1);
      return {
        kind: "value", tolerance: 0.01,
        stem: `$\\displaystyle\\int_0^{${a}} x^{${n}}\\,dx$ equals`,
        value: Number(v.toFixed(2)), wrong: [a ** n, Number((a ** (n + 1) / n).toFixed(2)), Number((v * 2).toFixed(2))],
        hint: "Power rule: raise the power by one and divide by the new power.",
        steps: [{ body: `$\\left[\\dfrac{x^{${n + 1}}}{${n + 1}}\\right]_0^{${a}} = \\dfrac{${a ** (n + 1)}}{${n + 1}} = ${fmt(v, 2)}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_de", chapter: "differential-equations", topic: "variable-separable", difficulty: "easy",
    make: (r) => {
      const k = r.int(2, 6), m = r.int(2, 5);
      return {
        kind: "value",
        stem: `If $\\dfrac{dy}{dx} = \\dfrac{y}{x}$ and the solution curve passes through $(1, ${k})$, then $y$ at $x = ${m}$ is`,
        value: k * m, wrong: [k + m, k * m * m, k],
        hint: "Separate the variables and integrate both sides.",
        steps: [{ body: "$\\dfrac{dy}{y} = \\dfrac{dx}{x} \\Rightarrow \\ln y = \\ln x + c \\Rightarrow y = Cx$." }, { body: `$C = ${k}$, so $y(${m}) = ${k * m}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_dist", chapter: "coordinate-geometry", topic: "straight-lines", difficulty: "easy",
    make: (r) => {
      const [a, b, c] = r.pick([[3, 4, 5], [5, 12, 13], [4, 3, 5], [8, 15, 17]]);
      const x0 = r.int(1, 4), y0 = r.int(1, 4);
      const d = r.int(1, 4) * c;
      const k = d - a * x0 - b * y0;
      return {
        kind: "value",
        stem: `The perpendicular distance of the point $(${x0}, ${y0})$ from the line $${a}x + ${b}y ${k >= 0 ? "+ " + k : "- " + -k} = 0$ is`,
        value: d / c, wrong: [d, (d / c) * 2, Number(fmt(d / (a + b)))],
        hint: "Use $\\dfrac{|ax_0 + by_0 + c|}{\\sqrt{a^2 + b^2}}$.",
        steps: [{ body: `Numerator: $|${a}(${x0}) + ${b}(${y0}) ${k >= 0 ? "+ " + k : "- " + -k}| = ${d}$; denominator $\\sqrt{${a * a} + ${b * b}} = ${c}$.` }, { body: `Distance $= ${d}/${c} = ${fmt(d / c)}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_circle", chapter: "coordinate-geometry", topic: "circles", difficulty: "easy",
    make: (r) => {
      const g = r.int(1, 4), f = r.int(1, 4), rad = r.int(Math.max(g, f), 6);
      const c = g * g + f * f - rad * rad;
      return {
        kind: "value",
        stem: `The radius of the circle $x^2 + y^2 - ${2 * g}x - ${2 * f}y ${c >= 0 ? "+ " + c : "- " + -c} = 0$ is`,
        value: rad, wrong: [rad + 1, rad * 2, g + f],
        hint: "Complete the squares, or use $r = \\sqrt{g^2 + f^2 - c}$.",
        steps: [{ body: `Centre $(${g}, ${f})$; $r = \\sqrt{${g * g} + ${f * f} - (${c})} = \\sqrt{${rad * rad}} = ${rad}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_plane", chapter: "three-dimensional-geometry", topic: "planes", difficulty: "easy",
    make: (r) => {
      const [a, b, c, n] = r.pick([[2, 3, 6, 7], [1, 2, 2, 3], [2, 6, 9, 11], [1, 4, 8, 9], [4, 4, 7, 9]]);
      const d = r.int(1, 3) * n;
      return {
        kind: "value",
        stem: `The distance of the origin from the plane $${a}x + ${b}y + ${c}z = ${d}$ is`,
        value: d / n, wrong: [d, Number(fmt(d / (a + b + c))), (d / n) * 2],
        hint: "Distance from origin to $ax + by + cz = d$ is $|d|/\\sqrt{a^2 + b^2 + c^2}$.",
        steps: [{ body: `$\\sqrt{${a * a} + ${b * b} + ${c * c}} = ${n}$, so distance $= ${d}/${n} = ${d / n}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_dot", chapter: "vector-algebra", topic: "dot-product", difficulty: "easy",
    make: (r) => {
      const a = [r.int(-3, 4), r.int(1, 4), r.int(-2, 3)];
      const b = [r.int(1, 4), r.int(-3, 3), r.int(1, 4)];
      const v = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const vec = (x: number[]) => `${x[0]}\\hat i ${x[1] < 0 ? "-" : "+"} ${Math.abs(x[1])}\\hat j ${x[2] < 0 ? "-" : "+"} ${Math.abs(x[2])}\\hat k`;
      return {
        kind: "value",
        stem: `If $\\vec a = ${vec(a)}$ and $\\vec b = ${vec(b)}$, then $\\vec a \\cdot \\vec b$ is`,
        value: v, wrong: [v + 2, -v || 3, a[0] * b[0] + a[1] * b[1]],
        hint: "Multiply matching components and add.",
        steps: [{ body: `$(${a[0]})(${b[0]}) + (${a[1]})(${b[1]}) + (${a[2]})(${b[2]}) = ${v}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_dice", chapter: "statistics-and-probability", topic: "conditional-probability", difficulty: "easy", forms: ["single"],
    make: (r) => {
      const s = r.pick([5, 6, 7, 8, 9, 10]);
      const ways = 6 - Math.abs(7 - s);
      return {
        kind: "choice",
        stem: `Two fair dice are thrown. The probability that the sum of the numbers shown is $${s}$ is`,
        correct: `$${frac(ways, 36)}$`, wrong: [`$${frac(ways + 1, 36)}$`, `$${frac(ways, 6 * 7)}$`, `$${frac(Math.max(1, ways - 1), 36)}$`, `$${frac(1, 6)}$`],
        hint: "List the ordered pairs that give the sum; there are 36 equally likely outcomes.",
        steps: [{ body: `Favourable ordered pairs: ${ways}.` }, { body: `$P = ${frac(ways, 36)}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_var", chapter: "statistics-and-probability", topic: "measures-of-dispersion", difficulty: "medium",
    make: (r) => {
      const n = r.pick([5, 7, 9, 11]);
      const v = (n * n - 1) / 12;
      return {
        kind: "value",
        stem: `The variance of the first $${n}$ natural numbers is`,
        value: v, wrong: [(n * n + 1) / 12, (n + 1) / 2, (n * n - 1) / 6],
        hint: "Use $\\sigma^2 = \\overline{x^2} - \\bar x^2$, or the known result $(n^2 - 1)/12$.",
        steps: [{ body: "$\\sigma^2 = \\dfrac{n^2 - 1}{12}$ for $1, 2, \\ldots, n$." }, { body: `$= \\dfrac{${n * n} - 1}{12} = ${fmt(v)}$.` }],
      };
    },
  },
  {
    ...M, key: "ma_trig", chapter: "trigonometry", topic: "trigonometric-identities", difficulty: "easy",
    make: (r) => {
      const [a, b, c] = r.pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10], [7, 24, 25]]);
      return {
        kind: "value",
        stem: `The maximum value of $${a}\\sin x + ${b}\\cos x$ is`,
        value: c, wrong: [a + b, Math.max(a, b), c * 2],
        hint: "Write it as $R\\sin(x + \\alpha)$.",
        steps: [{ body: `$R = \\sqrt{${a}^2 + ${b}^2} = ${c}$, and $\\sin$ has maximum $1$.` }],
      };
    },
  },
  statements(
    { ...M, key: "ma_ms_skew", chapter: "matrices-and-determinants", topic: "determinants", difficulty: "hard" },
    "Let $A$ be a $3 \\times 3$ real skew-symmetric matrix. Which of the following are correct?",
    [
      ["$\\det A = 0$", "$\\det A = \\det A^T = \\det(-A) = -\\det A$ for odd order."],
      ["All diagonal entries of $A$ are zero", "$a_{ii} = -a_{ii}$."],
      ["$A^2$ is symmetric", "$(A^2)^T = (A^T)^2 = (-A)^2 = A^2$."],
      ["$\\operatorname{tr}(A) = 0$", "the diagonal is zero."],
    ],
    [
      ["$A$ is invertible", "its determinant is zero."],
      ["$A^2$ is skew-symmetric", "$A^2$ is symmetric."],
      ["$A + A^T = 2A$", "$A + A^T = O$."],
    ],
  ),
  statements(
    { ...M, key: "ma_ms_fn", chapter: "sets-relations-and-functions", topic: "types-of-functions", difficulty: "hard" },
    "Consider $f : \\mathbb R \\to \\mathbb R$. Which of the following functions are one-one?",
    [
      ["$f(x) = x^3$", "strictly increasing on $\\mathbb R$."],
      ["$f(x) = 2x + 5$", "a non-constant linear function is strictly monotonic."],
      ["$f(x) = e^x$", "strictly increasing."],
      ["$f(x) = x|x|$", "strictly increasing: $x^2$ for $x \\ge 0$ and $-x^2$ for $x < 0$."],
    ],
    [
      ["$f(x) = x^2$", "$f(-1) = f(1)$."],
      ["$f(x) = |x|$", "$f(-2) = f(2)$."],
      ["$f(x) = \\sin x$", "periodic, so not one-one on $\\mathbb R$."],
    ],
  ),
];
